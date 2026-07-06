import express from "express";
import { authenticateToken } from "../auth.js";
import { config } from "../config.js";
import type { ArticleChartEmbed } from "../contentChartPlanner.js";
import { cache, CACHE_KEYS } from "../cache.js";
import {
  writeAtfxArticleDraft,
  readAtfxArticleDraft,
  deleteAtfxArticleDraft,
  getAtfxArticleDraftMeta,
  listAtfxArticleDrafts,
} from "../atfxArticleDraft.js";
import { appendUserActivity, beginBackgroundJob, endBackgroundJob } from "../userActivityLog.js";
import {
  generateRetailArticle,
  generateInstitutionalArticle,
  createAtfxArticleAirtableRow,
  airtableErrorMessage,
  callRequestyImageGeneration,
} from "./atfxArticleGenerateCore.js";

type RegisterAtfxArticleGenerateRouteDeps = {
  airtable: any | null;
  supabase: any | null;
};

const ARTICLE_IMAGES_BUCKET = "article-images";

function isBucketAlreadyExistsError(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message ?? "").toLowerCase();
  const code = (err as { statusCode?: string })?.statusCode;
  return msg.includes("already") || msg.includes("exists") || msg.includes("duplicate") || code === "409" || code === "Duplicate";
}

async function ensureArticleImagesBucket(supabase: any): Promise<void> {
  const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
  if (listErr) console.warn("[article-images] listBuckets:", listErr.message);
  const exists = buckets?.some((b: { name: string }) => b.name === ARTICLE_IMAGES_BUCKET);
  if (exists) return;
  const { error: createErr } = await supabase.storage.createBucket(ARTICLE_IMAGES_BUCKET, { public: true });
  if (!createErr) return;
  if (isBucketAlreadyExistsError(createErr)) return;
  throw createErr;
}

async function uploadAtfxThumbnailToSupabase(
  supabase: any,
  file: { buffer: Buffer; mime: string }
): Promise<string> {
  await ensureArticleImagesBucket(supabase);
  const ext = file.mime === "image/jpeg" ? ".jpg" : file.mime === "image/webp" ? ".webp" : ".png";
  const name = `atfx-thumb-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
  const { data, error } = await supabase.storage.from(ARTICLE_IMAGES_BUCKET).upload(name, file.buffer, {
    contentType: file.mime,
    upsert: false,
  });
  if (error) throw error;
  const { data: urlData } = supabase.storage.from(ARTICLE_IMAGES_BUCKET).getPublicUrl(data.path);
  return urlData.publicUrl as string;
}

export function registerAtfxArticleGenerateRoute(
  apiRouter: express.Router,
  deps: RegisterAtfxArticleGenerateRouteDeps
): void {
  const { airtable, supabase } = deps;

  apiRouter.get("/capitalkeywords/article-drafts", authenticateToken, async (_req, res) => {
    try {
      const drafts = await listAtfxArticleDrafts();
      res.json({ drafts });
    } catch (err: unknown) {
      console.error("ATFX list article drafts error:", err);
      res.status(500).json({ error: "Failed to list saved drafts" });
    }
  });

  apiRouter.get("/capitalkeywords/:id/article-draft", authenticateToken, async (req, res) => {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing record id" });
    try {
      const meta = await getAtfxArticleDraftMeta(id);
      if (!meta) return res.json({ exists: false });
      res.json({
        exists: true,
        savedAt: meta.savedAt,
        articleType: meta.articleType,
        topicTitle: meta.topicTitle,
      });
    } catch (err: unknown) {
      console.error("ATFX article draft meta error:", err);
      res.status(500).json({ error: "Failed to read draft status" });
    }
  });

  apiRouter.post("/capitalkeywords/:id/publish-article-draft", authenticateToken, async (req, res) => {
    if (!airtable) {
      return res.status(503).json({ error: "Airtable not configured." });
    }
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing record id" });
    const uid = (req as express.Request & { uid?: string }).uid;
    beginBackgroundJob(uid);
    appendUserActivity(uid, "Publishing your saved article (no new writing)…");
    try {
      const draft = await readAtfxArticleDraft(id);
      if (!draft) {
        appendUserActivity(uid, "No saved draft was found to publish.");
        return res.status(404).json({
          error:
            "No saved article draft for this topic. Drafts are created only after the AI run finishes; if generation failed earlier, run Approve again or check server .cache/atfx-article-drafts.",
        });
      }
      const articleTypeLabel = draft.articleType === "Institutional" ? "Institutional" : "Retail";
      let newRecord: { id?: string };
      try {
        newRecord = await createAtfxArticleAirtableRow(airtable, id, draft.article, articleTypeLabel);
      } catch (airErr: unknown) {
        const msg = airtableErrorMessage(airErr);
        console.error("ATFX publish draft Airtable create failed:", airErr);
        appendUserActivity(uid, `Could not publish draft — ${msg}`);
        return res.status(500).json({ error: `Could not save article: ${msg}` });
      }
      await deleteAtfxArticleDraft(id);
      cache.invalidate(CACHE_KEYS.ATFX_ARTICLES);
      cache.invalidate(CACHE_KEYS.ATFX_ARTICLES_DATA);
      appendUserActivity(uid, "Saved article published.");
      res.json({
        ok: true,
        articleId: newRecord?.id ?? null,
        titleEn: draft.article.titleEn,
        titleTc: draft.article.titleTc,
        articleType: draft.articleType === "Institutional" ? "institutional" : "retail",
        reusedDraft: true,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : airtableErrorMessage(err);
      console.error("ATFX publish article draft error:", err);
      appendUserActivity(uid, `Could not publish draft — ${message}`);
      res.status(500).json({ error: message || "Publish draft failed" });
    } finally {
      endBackgroundJob(uid);
    }
  });

  apiRouter.post("/capitalkeywords/:id/generate-article", authenticateToken, async (req, res) => {
    if (!airtable) {
      return res.status(503).json({ error: "Airtable not configured." });
    }

    if (!config.requesty.apiKey) {
      return res.status(503).json({ error: "Article writing is not configured on the server." });
    }

    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing record id" });

    const { title, summary, source, articleLength, articleStyle } = req.body || {};
    const topicTitle = typeof title === "string" ? title.trim() : "";
    const topicSummary = typeof summary === "string" ? summary.trim() : "";
    const topicSource = typeof source === "string" ? source.trim().toLowerCase() : "";
    const lengthOpt = articleLength === "1400-1500" ? "1400-1500" : "700-800";
    const styleOpt = articleStyle === "bullet" ? "bullet" : "paragraph";

    if (!topicTitle) {
      return res.status(400).json({ error: "Missing topic title" });
    }

    const isRetail = topicSource === "retail" || topicSource.includes("retail");
    const isInstitutional = topicSource === "institutional" || topicSource.includes("institutional");
    const audience: "institutional" | "retail" = isInstitutional ? "institutional" : "retail";

    const uid = (req as express.Request & { uid?: string }).uid;
    beginBackgroundJob(uid);
    const kindLabel = isInstitutional ? "Institutional" : "Retail";
    appendUserActivity(
      uid,
      `Started writing your ${kindLabel.toLowerCase()} article (${lengthOpt} words, ${
        styleOpt === "bullet" ? "bullet style" : "paragraph style"
      })…`
    );

    try {
      const log = (m: string) => appendUserActivity(uid, m);

      let article: {
        titleEn: string;
        titleTc: string;
        excerptEn: string;
        excerptTc: string;
        contentEn: string;
        contentTc: string;
        charts: ArticleChartEmbed[];
        imagePrompt?: string;
        thumbnail?: { mime: string; buffer: Buffer } | null;
      };

      const genOpts = { length: lengthOpt as "700-800" | "1400-1500", style: styleOpt as "paragraph" | "bullet" };
      if (isInstitutional) {
        article = await generateInstitutionalArticle(topicTitle, topicSummary, topicSource, genOpts, log);
      } else {
        article = await generateRetailArticle(topicTitle, topicSummary, topicSource, genOpts, log);
      }

      if (!(article.titleEn ?? "").trim() || !(article.contentEn ?? "").trim()) {
        throw new Error("The article came back without a title or main text. Please try again.");
      }

      const articleTypeLabel = isInstitutional ? "Institutional" : "Retail";

      let thumbnailUrl: string | undefined = undefined;
      const thumbnailField = config.airtable.atfxArticleFieldThumbnailUrl?.trim();
      const imagePromptForThumb = (article.imagePrompt || "").trim();
      let thumbBuf = article.thumbnail;

      if (!thumbBuf?.buffer?.length && imagePromptForThumb && config.requesty.apiKey) {
        try {
          appendUserActivity(uid, "Thumbnail was missing after writing; generating it now…");
          thumbBuf = await callRequestyImageGeneration(imagePromptForThumb);
          article.thumbnail = thumbBuf;
        } catch (e) {
          console.warn("[atfx-thumbnail] late generation failed:", e);
          appendUserActivity(uid, "Late thumbnail generation failed (article will still be saved).");
        }
      }

      if (thumbBuf?.buffer?.length) {
        if (!supabase) {
          appendUserActivity(
            uid,
            "Thumbnail bytes were generated, but Supabase is not configured — skipping public upload (set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)."
          );
        } else {
          try {
            appendUserActivity(uid, "Uploading thumbnail…");
            thumbnailUrl = await uploadAtfxThumbnailToSupabase(supabase, {
              buffer: thumbBuf.buffer,
              mime: thumbBuf.mime || "image/png",
            });
            appendUserActivity(uid, "Thumbnail uploaded.");
          } catch (e) {
            console.warn("[atfx-thumbnail] upload failed:", e);
            appendUserActivity(uid, "Thumbnail upload failed (article will still be saved).");
          }
        }
      }

      if (thumbnailUrl && !thumbnailField) {
        appendUserActivity(
          uid,
          "Tip: set AIRTABLE_ATFX_ARTICLE_THUMBNAIL_FIELD so the thumbnail URL is saved onto the Airtable article record (otherwise the app may not discover it)."
        );
      }

      const articleForSave = {
        titleEn: article.titleEn,
        titleTc: article.titleTc,
        excerptEn: article.excerptEn,
        excerptTc: article.excerptTc,
        contentEn: article.contentEn,
        contentTc: article.contentTc,
        charts: article.charts,
      };

      appendUserActivity(uid, "Saving a working copy of the article…");
      await writeAtfxArticleDraft({
        v: 1,
        sourceTopicRecordId: id,
        topicTitle,
        articleType: articleTypeLabel,
        article: articleForSave,
        savedAt: new Date().toISOString(),
      });

      appendUserActivity(uid, "Saving the new article to your library…");
      let newRecord: { id?: string };
      try {
        newRecord = await createAtfxArticleAirtableRow(airtable, id, articleForSave, articleTypeLabel, thumbnailUrl);
      } catch (airErr: unknown) {
        const msg = airtableErrorMessage(airErr);
        console.error("ATFX Airtable create failed:", airErr);
        throw new Error(`Could not save article: ${msg}`);
      }

      await deleteAtfxArticleDraft(id);

      cache.invalidate(CACHE_KEYS.ATFX_ARTICLES);
      cache.invalidate(CACHE_KEYS.ATFX_ARTICLES_DATA);

      appendUserActivity(uid, "Article saved.");
      res.json({
        ok: true,
        articleId: newRecord?.id ?? null,
        titleEn: article.titleEn,
        titleTc: article.titleTc,
        articleType: isInstitutional ? "institutional" : "retail",
        thumbnailImagePrompt: imagePromptForThumb || undefined,
        thumbnailImageModel: config.requesty.atfxThumbnailImageModel,
        thumbnailUrl: thumbnailUrl || undefined,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : airtableErrorMessage(err);
      console.error("ATFX article generation error:", err);
      appendUserActivity(uid, `Article writing stopped — ${message}`);
      res.status(500).json({ error: message || "Article generation failed" });
    } finally {
      endBackgroundJob(uid);
    }
  });
}


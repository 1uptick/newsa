import express from "express";
import { cache, CACHE_KEYS, CACHE_TTL } from "../cache.js";
import { config } from "../config.js";
import { authenticateToken, requireAdmin } from "../auth.js";

type SendResult = { sent: boolean; error?: string };

type RegisterAtfxArticlesRoutesDeps = {
  airtable: any | null;
  supabase: any | null;
  sendAtfxArticlesNotificationEmail: (to: string, articleTitle?: string) => Promise<SendResult>;
};

const ATFX_COMMENT_FIELD_CANDIDATES = ["Comments", "Comment", "Portal_comment", "Custome", "Revise notes", "Revision notes"];

/** Generated ATFX articles (default tblL840we8dgnW9vZ): Title_TC, Excerpt_TC, Content_TC, Title_EN, Content_EN, Category, Company (ATFX), … */
function atfxGeneratedArticlesTableId(): string {
  const id = config.airtable.atfxGeneratedArticleTableId?.trim();
  return id || "tblL840we8dgnW9vZ";
}

function strField(v: unknown): string {
  if (v == null) return "";
  return typeof v === "string" ? v : String(v);
}

/**
 * Airtable URL / attachment fields may return a plain string, `{ url }`, or `[{ url }]`.
 * Older code only handled strings, so thumbnails stored as attachments looked "empty" in the API
 * while the same URL still appeared when appended into HTML.
 */
function extractHttpUrlFromAirtableValue(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") {
    const t = v.trim();
    return t.startsWith("http") ? t : "";
  }
  if (Array.isArray(v)) {
    for (const item of v) {
      if (item && typeof item === "object" && item !== null && "url" in item) {
        const u = String((item as { url?: unknown }).url ?? "").trim();
        if (u.startsWith("http")) return u;
      }
    }
  }
  if (typeof v === "object" && v !== null && "url" in v) {
    const u = String((v as { url?: unknown }).url ?? "").trim();
    if (u.startsWith("http")) return u;
  }
  return "";
}

/** First absolute http(s) image URL in HTML (stored article body). */
function firstHttpImageSrcFromHtml(html: string): string {
  const h = html || "";
  const re = /<img[^>]*\ssrc=["'](https?:\/\/[^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(h)) !== null) {
    const u = (m[1] || "").trim();
    if (u.startsWith("http")) return u;
  }
  return "";
}

const ATFX_IMAGE_FIELD_KEYS = ["image 1", "image 2", "image A", "image B"] as const;

function appendAirtableImagesToContent(content: string, record: any, excludeUrl?: string): string {
  const imgUrls: string[] = [];
  for (const key of ATFX_IMAGE_FIELD_KEYS) {
    try {
      const v = record.get(key);
      const url = extractHttpUrlFromAirtableValue(v);
      if (url) imgUrls.push(url);
    } catch {
      /* ignore */
    }
  }
  const seen = new Set<string>();
  if (excludeUrl) seen.add(excludeUrl);
  for (const url of imgUrls) {
    if (seen.has(url)) continue;
    seen.add(url);
    content += `<img src="${url.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}" alt="" style="max-width:100%;height:auto;display:block;margin:1rem 0;" />`;
  }
  return content;
}

/** Canonical thumbnail URL from Airtable columns only (used for prepend + exclude in append). */
function resolveAtfxThumbnailUrl(record: any): string {
  const configured = config.airtable.atfxArticleFieldThumbnailUrl?.trim();
  const keys = [...new Set([configured, ...ATFX_IMAGE_FIELD_KEYS].filter(Boolean) as string[])];
  for (const key of keys) {
    try {
      const v = record.get(key);
      const url = extractHttpUrlFromAirtableValue(v);
      if (url) return url;
    } catch {
      /* ignore */
    }
  }
  return "";
}

/**
 * URL to show in the portal "Thumbnail URL" editor: same as {@link resolveAtfxThumbnailUrl}, or if
 * those fields are empty, the first embedded image in stored HTML (matches what readers often see).
 */
function resolveThumbnailUrlForEditor(record: any): string {
  const fromColumns = resolveAtfxThumbnailUrl(record);
  if (fromColumns) return fromColumns;
  const a = config.airtable;
  const rawTc = strField(record.get(a.atfxArticleFieldContentTc));
  const rawEn = strField(record.get(a.atfxArticleFieldContentEn));
  return firstHttpImageSrcFromHtml(rawTc) || firstHttpImageSrcFromHtml(rawEn);
}

function prependThumbnailToContent(content: string, thumbUrl: string): string {
  const url = (thumbUrl || "").trim();
  if (!url) return content;
  const safe = url.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const figure = `<figure class="atfx-thumbnail" style="margin:0 0 1.25rem 0;"><img src="${safe}" alt="" style="width:100%;max-width:100%;height:auto;display:block;border-radius:12px;" /></figure>`;
  return `${figure}${content || ""}`;
}

function readGeneratedArticleFields(record: any): {
  titleTC: string;
  titleEN: string;
  excerptTC: string;
  excerptEN: string;
  contentTC: string;
  contentEN: string;
} {
  const a = config.airtable;
  let contentTC = strField(record.get(a.atfxArticleFieldContentTc));
  let contentEN = strField(record.get(a.atfxArticleFieldContentEn));
  const thumbUrl = resolveAtfxThumbnailUrl(record);
  contentTC = appendAirtableImagesToContent(contentTC, record, thumbUrl);
  contentEN = appendAirtableImagesToContent(contentEN, record, thumbUrl);
  contentTC = prependThumbnailToContent(contentTC, thumbUrl);
  contentEN = prependThumbnailToContent(contentEN, thumbUrl);
  return {
    titleTC: strField(record.get(a.atfxArticleFieldTitleTc)),
    titleEN: strField(record.get(a.atfxArticleFieldTitleEn)),
    excerptTC: strField(record.get(a.atfxArticleFieldExcerptTc)),
    excerptEN: strField(record.get(a.atfxArticleFieldExcerptEn)),
    contentTC,
    contentEN,
  };
}

function createdDateFromRecord(record: any): string {
  const genField = config.airtable.atfxArticleFieldGeneratedAt?.trim();
  if (genField) {
    const v = record.get(genField);
    if (v != null && v !== "") return strField(v);
  }
  const legacy = record.get("Create date") ?? record.get("Created") ?? record.get("created date");
  if (legacy != null && legacy !== "") return strField(legacy);
  const raw = record._rawJson?.createdTime;
  return raw ? String(raw) : "";
}

function atfxCommentsFieldForRecord(record: any): string | null {
  const configured = config.airtable.atfxArticleFieldComments?.trim();
  const fields = record?.fields as Record<string, unknown> | undefined;
  if (configured) {
    if (fields && Object.prototype.hasOwnProperty.call(fields, configured)) return configured;
    return configured;
  }
  if (!fields) return null;
  for (const name of ATFX_COMMENT_FIELD_CANDIDATES) {
    if (Object.prototype.hasOwnProperty.call(fields, name)) return name;
  }
  return null;
}

function readAtfxCommentsFromRecord(record: any): string {
  const field = atfxCommentsFieldForRecord(record);
  if (!field) return "";
  try {
    return strField(record.get(field));
  } catch {
    return "";
  }
}

function readCategoryFromRecord(record: any): string {
  const name = config.airtable.atfxArticleFieldCategory?.trim();
  if (!name) return "";
  try {
    return strField(record.get(name));
  } catch {
    return "";
  }
}

async function resolveAtfxCommentsFieldName(airtable: any, tableId: string, recordId: string): Promise<string> {
  const configured = config.airtable.atfxArticleFieldComments?.trim();
  if (configured) return configured;
  const record: any = await airtable(tableId).find(recordId);
  const found = atfxCommentsFieldForRecord(record);
  if (!found) {
    throw new Error(
      "No comments field on this Airtable table. Add a long-text field (e.g. Comments or Custome) or set AIRTABLE_ATFX_ARTICLE_COMMENTS_FIELD."
    );
  }
  return found;
}

async function getGeneratedArticleFromAirtable(airtable: any, tableId: string, recordId: string) {
  try {
    const record: any = await airtable(tableId).find(recordId);
    const fields = readGeneratedArticleFields(record);
    return {
      createdDate: createdDateFromRecord(record),
      ...fields,
      thumbnailUrl: resolveThumbnailUrlForEditor(record),
    };
  } catch {
    return null;
  }
}

export function registerAtfxArticlesRoutes(apiRouter: express.Router, deps: RegisterAtfxArticlesRoutesDeps): void {
  const { airtable } = deps;

  apiRouter.get("/atfx/email-recipients", authenticateToken, requireAdmin, (_req, res) => {
    res.status(403).json({ error: "ATFX article notification emails are disabled.", code: "ATFX_NOTIFY_DISABLED" });
  });

  apiRouter.post("/atfx/notify-articles", authenticateToken, requireAdmin, (_req, res) => {
    res.status(403).json({ error: "ATFX article notification emails are disabled.", code: "ATFX_NOTIFY_DISABLED" });
  });

  apiRouter.get("/atfx", authenticateToken, async (req, res) => {
    const tableId = atfxGeneratedArticlesTableId();
    if (!airtable) {
      return res.status(503).json({ error: "Airtable not configured." });
    }

    try {
      const records = await airtable(tableId).select({ maxRecords: 200 }).firstPage();

      const items = records.map((record: any) => {
        const f = readGeneratedArticleFields(record);
        return {
          id: record.id,
          createdDate: createdDateFromRecord(record),
          titleTC: f.titleTC,
          excerptTC: f.excerptTC,
          titleEN: f.titleEN,
          excerptEN: f.excerptEN,
          category: readCategoryFromRecord(record),
          comments: readAtfxCommentsFromRecord(record),
        };
      });

      items.sort((a: any, b: any) => {
        if (!a.createdDate || !b.createdDate) return 0;
        return new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime();
      });

      if (!cache.get(CACHE_KEYS.ATFX_ARTICLES_STRUCTURE)) {
        cache.set(
          CACHE_KEYS.ATFX_ARTICLES_STRUCTURE,
          { fields: ["Title_TC", "Excerpt_TC", "Title_EN", "Content_TC", "Content_EN"] },
          CACHE_TTL.CAPITAL_STRUCTURE
        );
      }
      // NOTE: Do not memoize ATFX articles list in memory.
      // In serverless deployments (Firebase Functions) requests can hit different instances,
      // so an in-memory cache would cause "new article not showing" for up to TTL seconds.
      res.setHeader("Cache-Control", "private, no-store");
      res.json(items);
    } catch (err: any) {
      console.error("Airtable ATFX articles error:", err);
      const message = err?.message ?? err?.error ?? "Failed to fetch ATFX articles";
      res.status(500).json({ error: message });
    }
  });

  apiRouter.get("/atfx/:id/content", authenticateToken, async (req, res) => {
    const tableId = atfxGeneratedArticlesTableId();
    if (!airtable) {
      return res.status(503).json({ error: "Airtable not configured." });
    }
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing article id" });
    try {
      const fromAirtable = await getGeneratedArticleFromAirtable(airtable, tableId, id);
      if (!fromAirtable) {
        res.status(404).json({ error: "Article not found" });
        return;
      }

      res.json({
        titleTC: fromAirtable.titleTC,
        titleEN: fromAirtable.titleEN,
        excerptTC: fromAirtable.excerptTC,
        excerptEN: fromAirtable.excerptEN,
        contentTC: fromAirtable.contentTC,
        contentEN: fromAirtable.contentEN,
        thumbnailUrl: fromAirtable.thumbnailUrl ?? "",
        fromSupabase: false,
      });
    } catch (err: any) {
      console.error("ATFX content error:", err);
      res.status(500).json({ error: err?.message ?? "Failed to get content" });
    }
  });

  /** Bust caches so the next list/detail read fresh data from Airtable (ATFX articles are not mirrored to Supabase). */
  apiRouter.post("/atfx/sync", authenticateToken, requireAdmin, async (_req, res) => {
    if (!airtable) return res.status(503).json({ error: "Airtable not configured" });
    try {
      cache.invalidate(CACHE_KEYS.ATFX_ARTICLES);
      cache.invalidate(CACHE_KEYS.ATFX_ARTICLES_DATA);
      cache.invalidatePrefix("atfx:article:");
      res.json({ ok: true, source: "airtable" });
    } catch (err: any) {
      console.error("ATFX sync error:", err);
      res.status(500).json({ error: err?.message ?? "Sync failed" });
    }
  });

  apiRouter.patch("/atfx/:id/content", authenticateToken, async (req, res) => {
    const tableId = atfxGeneratedArticlesTableId();
    if (!airtable) return res.status(503).json({ error: "Airtable not configured." });
    const { id } = req.params;
    const { content, lang } = req.body;
    if (!id) return res.status(400).json({ error: "Missing article id" });
    if (typeof content !== "string") return res.status(400).json({ error: "Missing or invalid content" });
    const langNorm = lang === "tc" ? "tc" : "en";
    const a = config.airtable;
    const field = langNorm === "tc" ? a.atfxArticleFieldContentTc : a.atfxArticleFieldContentEn;
    try {
      await airtable(tableId).update(id, { [field]: content });
      cache.invalidate(CACHE_KEYS.ATFX_ARTICLE(id));
      cache.invalidate(CACHE_KEYS.ATFX_ARTICLES_DATA);
      res.json({ ok: true });
    } catch (err: any) {
      console.error("ATFX update content error:", err);
      res.status(500).json({ error: err?.message ?? "Update failed" });
    }
  });

  apiRouter.patch("/atfx/:id/comments", authenticateToken, async (req, res) => {
    const tableId = atfxGeneratedArticlesTableId();
    if (!airtable) return res.status(503).json({ error: "Airtable not configured." });
    const { id } = req.params;
    const { comments } = req.body;
    if (!id) return res.status(400).json({ error: "Missing article id" });
    if (typeof comments !== "string") return res.status(400).json({ error: "Missing or invalid comments" });
    try {
      const fieldName = await resolveAtfxCommentsFieldName(airtable, tableId, id);
      await airtable(tableId).update(id, { [fieldName]: comments });
      cache.invalidate(CACHE_KEYS.ATFX_ARTICLES);
      cache.invalidate(CACHE_KEYS.ATFX_ARTICLES_DATA);
      res.json({ ok: true });
    } catch (err: any) {
      console.error("ATFX update comments error:", err);
      res.status(500).json({ error: err?.message ?? "Update failed" });
    }
  });

  /** Update thumbnail image URL (Airtable field from AIRTABLE_ATFX_ARTICLE_THUMBNAIL_FIELD or "image 1"). */
  apiRouter.patch("/atfx/:id/thumbnail", authenticateToken, async (req, res) => {
    const tableId = atfxGeneratedArticlesTableId();
    if (!airtable) return res.status(503).json({ error: "Airtable not configured." });
    const { id } = req.params;
    const { thumbnailUrl } = req.body;
    if (!id) return res.status(400).json({ error: "Missing article id" });
    if (typeof thumbnailUrl !== "string") return res.status(400).json({ error: "Missing or invalid thumbnailUrl" });
    const trimmed = thumbnailUrl.trim();
    if (trimmed && !/^https?:\/\//i.test(trimmed)) {
      return res.status(400).json({ error: "Thumbnail URL must start with http:// or https://" });
    }
    const field = config.airtable.atfxArticleFieldThumbnailUrl?.trim() || "image 1";
    try {
      await airtable(tableId).update(id, { [field]: trimmed });
      cache.invalidate(CACHE_KEYS.ATFX_ARTICLE(id));
      cache.invalidate(CACHE_KEYS.ATFX_ARTICLES_DATA);
      res.json({ ok: true, thumbnailUrl: trimmed });
    } catch (err: any) {
      console.error("ATFX update thumbnail error:", err);
      res.status(500).json({ error: err?.message ?? "Update failed" });
    }
  });

  apiRouter.patch("/atfx/:id", authenticateToken, async (req, res) => {
    const tableId = atfxGeneratedArticlesTableId();
    if (!airtable) return res.status(503).json({ error: "Airtable not configured." });
    const { id } = req.params;
    const { title, lang } = req.body;
    if (!id) return res.status(400).json({ error: "Missing article id" });
    if (typeof title !== "string") return res.status(400).json({ error: "Missing or invalid title" });
    const langNorm = lang === "en" ? "en" : "tc";
    const a = config.airtable;
    const t = title.trim();
    try {
      const fields: Record<string, string> = {};
      if (langNorm === "en") {
        fields[a.atfxArticleFieldTitleEn] = t;
        if (a.atfxArticleFieldName) fields[a.atfxArticleFieldName] = t;
      } else {
        fields[a.atfxArticleFieldTitleTc] = t;
      }
      await airtable(tableId).update(id, fields);
      cache.invalidate(CACHE_KEYS.ATFX_ARTICLES);
      cache.invalidate(CACHE_KEYS.ATFX_ARTICLES_DATA);
      res.json({ ok: true });
    } catch (err: any) {
      console.error("ATFX update title error:", err);
      res.status(500).json({ error: err?.message ?? "Update failed" });
    }
  });
}

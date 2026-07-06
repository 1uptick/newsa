import path from "path";
import express from "express";
import admin from "firebase-admin";
import { cache, CACHE_KEYS, CACHE_TTL } from "../cache.js";
import { config } from "../config.js";
import { authenticateToken } from "../auth.js";

type RegisterOneuptickArticlesRoutesDeps = {
  airtable: any | null;
  uploadLimiter: any;
  imageUpload: any;
};

function appendAirtableImagesToContent(content: string, record: any): string {
  const imgUrls: string[] = [];
  for (const key of ["image 1", "image 2", "image A", "image B"]) {
    const v = record.get(key);
    if (v && typeof v === "string" && v.startsWith("http")) imgUrls.push(v);
  }
  const seen = new Set<string>();
  for (const url of imgUrls) {
    if (seen.has(url)) continue;
    seen.add(url);
    content += `<img src="${url.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}" alt="" style="max-width:100%;height:auto;display:block;margin:1rem 0;" />`;
  }
  return content;
}

function getOneuptickArticlesTableId(): string {
  const id = (config.airtable.oneuptickArticlesTableId || "tblFjxMEFtJvsyLZh").trim();
  return id || "tblFjxMEFtJvsyLZh";
}

/** Airtable single line, single select, multi-select, etc. → safe plain string (cache + JSON). */
function normalizeOneuptickStatusRaw(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw.trim();
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  if (Array.isArray(raw)) {
    const parts = raw.map((x) => normalizeOneuptickStatusRaw(x)).filter(Boolean);
    return parts.join(", ");
  }
  if (typeof raw === "object" && "name" in (raw as object)) {
    return normalizeOneuptickStatusRaw((raw as { name?: unknown }).name);
  }
  return "";
}

/** TC body + English fields (Airtable: Article_tc; Title_en, Excerpt_EN, Article_en). */
async function getOneuptickArticleContentBundleFromAirtable(
  airtable: any,
  recordId: string
): Promise<{
  content: string;
  titleEn: string;
  excerptEn: string;
  contentEn: string;
} | null> {
  try {
    const record: any = await airtable(getOneuptickArticlesTableId()).find(recordId);
    let content = record.get("Article_tc");
    content = typeof content === "string" ? content : String(content ?? "");
    content = appendAirtableImagesToContent(content, record);
    let articleEn = record.get("Article_en");
    articleEn = typeof articleEn === "string" ? articleEn : String(articleEn ?? "");
    articleEn = appendAirtableImagesToContent(articleEn, record);
    const titleEn = record.get("Title_en");
    const excerptEn = record.get("Excerpt_EN");
    return {
      content,
      titleEn: typeof titleEn === "string" ? titleEn : String(titleEn ?? ""),
      excerptEn: typeof excerptEn === "string" ? excerptEn : String(excerptEn ?? ""),
      contentEn: articleEn,
    };
  } catch {
    return null;
  }
}

/** Public HTTPS URL for a Firebase/GCS object after makePublic (path segments encoded). */
function firebaseStoragePublicObjectUrl(bucketName: string, objectPath: string): string {
  const encoded = objectPath.split("/").map((s) => encodeURIComponent(s)).join("/");
  return `https://storage.googleapis.com/${bucketName}/${encoded}`;
}

/** Upload image to Firebase Storage; returns a URL suitable for <img src> in Article_tc HTML. */
async function uploadOneuptickArticleImageToFirebase(
  buffer: Buffer,
  contentType: string,
  originalName: string,
  articleId: string
): Promise<string> {
  if (!admin.apps?.length) throw new Error("Firebase Admin not configured");
  const bucket = admin.storage().bucket();
  const ext = path.extname(originalName) || ".jpg";
  const objectPath = `oneuptick-articles/${articleId}/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
  const f = bucket.file(objectPath);
  await f.save(buffer, {
    metadata: {
      contentType,
      cacheControl: "public, max-age=31536000",
    },
    resumable: false,
  });
  try {
    await f.makePublic();
    return firebaseStoragePublicObjectUrl(bucket.name, objectPath);
  } catch (e) {
    console.warn("Firebase Storage makePublic failed, using signed URL:", (e as Error)?.message);
    const [signedUrl] = await f.getSignedUrl({
      action: "read",
      expires: new Date(2100, 0, 1),
    });
    return signedUrl;
  }
}

export function registerOneuptickArticlesRoutes(apiRouter: express.Router, deps: RegisterOneuptickArticlesRoutesDeps): void {
  const { airtable, uploadLimiter, imageUpload } = deps;

  apiRouter.get("/oneuptick/articles", authenticateToken, async (req, res) => {
    if (!airtable) {
      return res.status(503).json({ error: "Airtable not configured." });
    }
    const forceRefresh = req.headers["cache-control"]?.includes("no-cache");
    if (!forceRefresh) {
      const cachedData = cache.get<any[]>(CACHE_KEYS.ONEUPTICK_ARTICLES_DATA);
      if (cachedData) {
        res.setHeader("Cache-Control", "private, max-age=120");
        res.setHeader("ETag", cachedData.etag);
        return res.json(cachedData.data);
      }
    }
    const tableId = getOneuptickArticlesTableId();
    try {
      const records = await airtable(tableId).select({ maxRecords: 200 }).firstPage();
      const statusField = config.airtable.oneuptickArticlesStatusField;
      const publishField = config.airtable.oneuptickArticlesPublishStatusField;
      const items = records.map((record: any) => {
        const createdTime = record._rawJson?.createdTime;
        const title = record.get("Title_tc");
        const excerpt = record.get("Excerpt_tc");
        const thumbUrl = record.get("thumb_url");
        const status = normalizeOneuptickStatusRaw(record.get(statusField));
        return {
          id: record.id,
          createdDate: typeof createdTime === "string" ? createdTime : "",
          title: typeof title === "string" ? title : String(title ?? ""),
          excerpt: typeof excerpt === "string" ? excerpt : String(excerpt ?? ""),
          thumb_url: typeof thumbUrl === "string" ? thumbUrl : String(thumbUrl ?? ""),
          status,
          ...(publishField
            ? { publish_status: normalizeOneuptickStatusRaw(record.get(publishField)) }
            : {}),
          calculation: "",
          comments: "",
        };
      });
      items.sort((a: any, b: any) => {
        const ta = a.createdDate ? new Date(a.createdDate).getTime() : 0;
        const tb = b.createdDate ? new Date(b.createdDate).getTime() : 0;
        return tb - ta;
      });
      const etag = cache.set(CACHE_KEYS.ONEUPTICK_ARTICLES_DATA, items, CACHE_TTL.CAPITAL);
      res.setHeader("Cache-Control", "private, max-age=120");
      res.setHeader("ETag", etag);
      res.json(items);
    } catch (err: any) {
      const atType = typeof err?.error === "string" ? err.error : undefined;
      const msg =
        typeof err?.message === "string"
          ? err.message
          : typeof err?.error === "string"
            ? err.error
            : "Failed to fetch 1uptick articles";
      console.error("Airtable oneuptick articles error:", atType ?? msg, err?.statusCode ?? "");
      res.status(500).json({
        error: msg,
        ...(atType && atType !== msg ? { airtableError: atType } : {}),
      });
    }
  });

  apiRouter.get("/oneuptick/articles/:id/content", authenticateToken, async (req, res) => {
    if (!airtable) return res.status(503).json({ error: "Airtable not configured" });
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing article id" });
    try {
      const bundle = await getOneuptickArticleContentBundleFromAirtable(airtable, id);
      if (bundle != null) {
        return res.json({
          content: bundle.content,
          titleEn: bundle.titleEn,
          excerptEn: bundle.excerptEn,
          contentEn: bundle.contentEn,
          fromSupabase: false,
        });
      }
      res.status(404).json({ error: "Article not found" });
    } catch (err: any) {
      console.error("Oneuptick article content error:", err);
      res.status(500).json({ error: err?.message ?? "Failed to get content" });
    }
  });

  apiRouter.patch("/oneuptick/articles/:id/content", authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { content, locale } = req.body as { content?: unknown; locale?: unknown };
    if (!id) return res.status(400).json({ error: "Missing article id" });
    if (typeof content !== "string") return res.status(400).json({ error: "Missing or invalid content" });
    if (!airtable) return res.status(503).json({ error: "Airtable not configured" });
    const field = locale === "en" ? "Article_en" : "Article_tc";
    try {
      await airtable(getOneuptickArticlesTableId()).update(id, { [field]: content });
      cache.invalidate(CACHE_KEYS.ONEUPTICK_ARTICLES_DATA);
      res.json({ ok: true });
    } catch (err: any) {
      console.error("Oneuptick update content error:", err);
      res.status(500).json({ error: err?.message ?? "Update failed" });
    }
  });

  apiRouter.patch("/oneuptick/articles/:id", authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { title, thumb_url, titleEn, excerptEn } = req.body as {
      title?: unknown;
      thumb_url?: unknown;
      titleEn?: unknown;
      excerptEn?: unknown;
    };
    if (!id) return res.status(400).json({ error: "Missing article id" });
    const hasTitle = typeof title === "string";
    const hasThumb = typeof thumb_url === "string";
    const hasTitleEn = typeof titleEn === "string";
    const hasExcerptEn = typeof excerptEn === "string";
    if (!hasTitle && !hasThumb && !hasTitleEn && !hasExcerptEn) {
      return res.status(400).json({ error: "Missing or invalid fields to update" });
    }
    if (!airtable) return res.status(503).json({ error: "Airtable not configured" });
    try {
      const fields: Record<string, string> = {};
      if (hasTitle) fields.Title_tc = title as string;
      if (hasThumb) fields.thumb_url = thumb_url as string;
      if (hasTitleEn) fields.Title_en = titleEn as string;
      if (hasExcerptEn) fields.Excerpt_EN = excerptEn as string;
      await airtable(getOneuptickArticlesTableId()).update(id, fields);
      cache.invalidate(CACHE_KEYS.ONEUPTICK_ARTICLES_DATA);
      res.json({ ok: true });
    } catch (err: any) {
      console.error("Oneuptick update record error:", err);
      res.status(500).json({ error: err?.message ?? "Update failed" });
    }
  });

  /** Upload image to Firebase Storage; client inserts returned URL into Article_tc via existing HTML patch. */
  apiRouter.post(
    "/oneuptick/articles/:articleId/upload-image",
    uploadLimiter,
    authenticateToken,
    (req, res, next) => {
      imageUpload.single("file")(req, res, (err: unknown) => {
        if (err) {
          if ((err as { code?: string }).code === "LIMIT_FILE_SIZE") {
            return res.status(413).json({ error: "Image must be 5MB or smaller" });
          }
          return next(err as Error);
        }
        next();
      });
    },
    async (req, res) => {
      if (!admin.apps?.length) {
        return res.status(503).json({ error: "Firebase Admin not configured (set FIREBASE_SERVICE_ACCOUNT in .env)" });
      }
      const { articleId } = req.params;
      if (!articleId) return res.status(400).json({ error: "Missing article id" });
      const file = (req as any).file;
      if (!file) return res.status(400).json({ error: "No file uploaded" });
      const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
      if (!allowedTypes.includes(file.mimetype)) {
        return res.status(400).json({ error: "Only image files (JPEG, PNG, GIF, WebP) are allowed" });
      }
      try {
        const publicUrl = await uploadOneuptickArticleImageToFirebase(
          file.buffer,
          file.mimetype,
          file.originalname || "image.jpg",
          articleId
        );
        res.json({ url: publicUrl });
      } catch (err: unknown) {
        console.error("1uptick Firebase upload error:", err);
        res.status(500).json({ error: (err as Error)?.message ?? "Upload failed" });
      }
    }
  );
}

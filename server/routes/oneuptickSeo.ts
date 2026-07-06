import path from "path";
import express from "express";
import admin from "firebase-admin";
import { cache, CACHE_KEYS, CACHE_TTL } from "../cache.js";
import { config } from "../config.js";
import { authenticateToken } from "../auth.js";
import { appendN8nCredentialHeaders } from "../n8nWebhookHeaders.js";
import { appendUserActivity } from "../userActivityLog.js";

type RegisterOneuptickSeoRoutesDeps = {
  airtable: any | null;
  supabase: any | null;
  uploadLimiter: any;
  imageUpload: any;
};

const DEFAULT_SEO_TABLE_ID = "tblbZ9qSOcnlxewSA";
const ARTICLE_IMAGES_BUCKET = "article-images";

/** Escape a value for use inside an Airtable formula single-quoted string. */
function escapeAirtableStringLiteral(s: string): string {
  return s.replace(/'/g, "''");
}

function buildSeoListFilterFormula(): string {
  const postField = config.airtable.oneuptickSeoPostField || "Post";
  const siteField = config.airtable.oneuptickSeoSiteField || "site";
  const readyRaw = (config.airtable.oneuptickSeoPostReadyValue || "Ready").trim();
  const ready = escapeAirtableStringLiteral(readyRaw);
  // Post = Ready; site must have non-whitespace text.
  return `AND({${postField}}='${ready}', LEN(TRIM({${siteField}}&''))>0)`;
}

/** Read SEO thumbnail URL from Airtable text, URL, or attachment field values. */
function seoImageUrlFromRaw(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw.trim();
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw).trim();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string" && item.trim().startsWith("http")) return item.trim();
      if (typeof item === "object" && item !== null) {
        const url = (item as { url?: unknown }).url;
        if (typeof url === "string" && url.trim()) return url.trim();
      }
    }
    return "";
  }
  if (typeof raw === "object" && raw !== null && "url" in raw) {
    const url = (raw as { url?: unknown }).url;
    if (typeof url === "string" && url.trim()) return url.trim();
  }
  const s = String(raw).trim();
  return s.startsWith("http") ? s : "";
}

const SEO_THUMBNAIL_FALLBACK_FIELDS = ["image_url", "Image_url", "image 1", "Image 1", "image A", "thumbnail", "Thumbnail"];

function seoThumbnailFromRecord(record: { get: (field: string) => unknown }): string {
  const primary = (config.airtable.oneuptickSeoImageUrlField || "image_url").trim();
  const fields = [primary, ...SEO_THUMBNAIL_FALLBACK_FIELDS.filter((f) => f !== primary)];
  for (const field of fields) {
    const url = seoImageUrlFromRaw(record.get(field));
    if (url) return url;
  }
  return "";
}

function airtableErrMessage(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as { message?: string; error?: string };
    if (typeof e.message === "string" && e.message) return e.message;
    if (typeof e.error === "string" && e.error) return e.error;
  }
  return err instanceof Error ? err.message : String(err ?? "Airtable update failed");
}

/** Write thumbnail URL; tries configured field then common column names. Returns field written. */
async function writeSeoImageUrlToAirtable(airtable: any, recordId: string, url: string): Promise<string> {
  const trimmed = url.trim();
  if (!trimmed) throw new Error("Thumbnail URL is empty.");
  const primary = (config.airtable.oneuptickSeoImageUrlField || "image_url").trim();
  const fieldCandidates = [primary, ...SEO_THUMBNAIL_FALLBACK_FIELDS.filter((f) => f !== primary)];
  let lastErr: unknown;
  for (const fieldName of fieldCandidates) {
    const asAttachment: Record<string, { url: string }[]> = { [fieldName]: [{ url: trimmed }] };
    const asPlainUrl: Record<string, string> = { [fieldName]: trimmed };
    try {
      await airtable(getOneuptickSeoTableId()).update(recordId, asAttachment, { typecast: true });
      return fieldName;
    } catch (attachmentErr: unknown) {
      try {
        await airtable(getOneuptickSeoTableId()).update(recordId, asPlainUrl, { typecast: true });
        return fieldName;
      } catch (plainErr: unknown) {
        lastErr = plainErr;
        console.warn(
          `Airtable SEO thumbnail: could not write field "${fieldName}":`,
          airtableErrMessage(plainErr)
        );
      }
    }
  }
  throw new Error(
    `Could not save thumbnail to Airtable (tried: ${fieldCandidates.join(", ")}). ${airtableErrMessage(lastErr)}`
  );
}

async function ensureArticleImagesBucket(supabase: any): Promise<void> {
  const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
  if (listErr) console.warn("[article-images] listBuckets:", listErr.message);
  const exists = buckets?.some((b: { name: string }) => b.name === ARTICLE_IMAGES_BUCKET);
  if (exists) return;
  const { error: createErr } = await supabase.storage.createBucket(ARTICLE_IMAGES_BUCKET, { public: true });
  if (!createErr) return;
  const msg = String(createErr.message ?? "").toLowerCase();
  if (msg.includes("already") || msg.includes("exists") || msg.includes("duplicate")) return;
  throw createErr;
}

async function uploadSeoThumbnailBuffer(
  supabase: any | null,
  buffer: Buffer,
  contentType: string,
  originalName: string,
  articleId: string
): Promise<string> {
  const ext = path.extname(originalName) || ".jpg";
  if (supabase) {
    await ensureArticleImagesBucket(supabase);
    const objectPath = `oneuptick-seo-articles/${articleId}/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    const { data, error } = await supabase.storage.from(ARTICLE_IMAGES_BUCKET).upload(objectPath, buffer, {
      contentType,
      upsert: false,
    });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from(ARTICLE_IMAGES_BUCKET).getPublicUrl(data.path);
    const publicUrl = urlData?.publicUrl?.trim();
    if (publicUrl) return publicUrl;
    throw new Error("Upload succeeded but no public URL was returned from storage.");
  }
  if (admin.apps?.length) {
    return uploadOneuptickSeoImageToFirebase(buffer, contentType, originalName, articleId);
  }
  throw new Error("Image storage not configured (set Supabase or FIREBASE_SERVICE_ACCOUNT in .env).");
}

function sendSeoUploadMulterError(res: express.Response, err: unknown): void {
  const code = (err as { code?: string })?.code;
  const message = (err as Error)?.message ?? String(err);
  if (code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: "Image must be 5MB or smaller" });
    return;
  }
  if (code === "LIMIT_UNEXPECTED_FILE") {
    res.status(400).json({ error: "Unexpected file field. The form must use field name \"file\"." });
    return;
  }
  res.status(400).json({ error: message || "Could not read uploaded file" });
}

/** Normalize {site} (text, URL, single select, etc.) to a trimmed string for filter checks. */
function siteFieldToTrimmedString(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw.trim();
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw).trim();
  if (Array.isArray(raw)) {
    const parts = raw.map((x) => siteFieldToTrimmedString(x)).filter(Boolean);
    return parts.join(", ").trim();
  }
  if (typeof raw === "object" && raw !== null && "name" in raw) {
    return siteFieldToTrimmedString((raw as { name?: unknown }).name);
  }
  return String(raw).trim();
}

/** Same rules as filterByFormula; applied in Node so the API never returns out-of-filter rows. */
function seoRecordMatchesListFilter(record: any): boolean {
  const postField = config.airtable.oneuptickSeoPostField || "Post";
  const siteField = config.airtable.oneuptickSeoSiteField || "site";
  const readyVal = (config.airtable.oneuptickSeoPostReadyValue || "Ready").trim();
  const post = normalizeStatusRaw(record.get(postField));
  if (post !== readyVal) return false;
  return siteFieldToTrimmedString(record.get(siteField)).length > 0;
}

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

function getOneuptickSeoTableId(): string {
  const id = (config.airtable.oneuptickSeoTableId || DEFAULT_SEO_TABLE_ID).trim();
  return id || DEFAULT_SEO_TABLE_ID;
}

function normalizeStatusRaw(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw.trim();
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  if (Array.isArray(raw)) {
    const parts = raw.map((x) => normalizeStatusRaw(x)).filter(Boolean);
    return parts.join(", ");
  }
  if (typeof raw === "object" && "name" in (raw as object)) {
    return normalizeStatusRaw((raw as { name?: unknown }).name);
  }
  return "";
}

async function getOneuptickSeoContentBundleFromAirtable(
  airtable: any,
  recordId: string
): Promise<{
  content: string;
  titleTc: string;
  excerptTc: string;
  titleEn: string;
  excerptEn: string;
  contentEn: string;
} | null> {
  try {
    const record: any = await airtable(getOneuptickSeoTableId()).find(recordId);
    let content = record.get("Content_TC");
    content = typeof content === "string" ? content : String(content ?? "");
    content = appendAirtableImagesToContent(content, record);
    let contentEn = record.get("Content_EN");
    contentEn = typeof contentEn === "string" ? contentEn : String(contentEn ?? "");
    contentEn = appendAirtableImagesToContent(contentEn, record);
    const titleTcRaw = record.get("Title_TC");
    const excerptTcRaw = record.get("Excerpt_TC");
    const titleEn = record.get("Title_EN");
    const excerptEn = record.get("Excerpt_EN");
    return {
      content,
      titleTc: typeof titleTcRaw === "string" ? titleTcRaw : String(titleTcRaw ?? ""),
      excerptTc: typeof excerptTcRaw === "string" ? excerptTcRaw : String(excerptTcRaw ?? ""),
      titleEn: typeof titleEn === "string" ? titleEn : String(titleEn ?? ""),
      excerptEn: typeof excerptEn === "string" ? excerptEn : String(excerptEn ?? ""),
      contentEn,
    };
  } catch {
    return null;
  }
}

function firebaseStoragePublicObjectUrl(bucketName: string, objectPath: string): string {
  const encoded = objectPath.split("/").map((s) => encodeURIComponent(s)).join("/");
  return `https://storage.googleapis.com/${bucketName}/${encoded}`;
}

async function uploadOneuptickSeoImageToFirebase(
  buffer: Buffer,
  contentType: string,
  originalName: string,
  articleId: string
): Promise<string> {
  if (!admin.apps?.length) throw new Error("Firebase Admin not configured");
  const bucket = admin.storage().bucket();
  const ext = path.extname(originalName) || ".jpg";
  const objectPath = `oneuptick-seo-articles/${articleId}/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
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

export function registerOneuptickSeoRoutes(apiRouter: express.Router, deps: RegisterOneuptickSeoRoutesDeps): void {
  const { airtable, supabase, uploadLimiter, imageUpload } = deps;

  apiRouter.get("/oneuptick/seo/articles", authenticateToken, async (req, res) => {
    if (!airtable) {
      return res.status(503).json({ error: "Airtable not configured." });
    }
    const forceRefresh = req.headers["cache-control"]?.includes("no-cache");
    if (!forceRefresh) {
      const cachedData = cache.get<any[]>(CACHE_KEYS.ONEUPTICK_SEO_ARTICLES_DATA);
      if (cachedData) {
        // no-store: Post/site change in Airtable (e.g. n8n → Posted) must not stick in the browser.
        res.setHeader("Cache-Control", "private, no-store");
        res.setHeader("ETag", cachedData.etag);
        return res.json(cachedData.data);
      }
    }
    const tableId = getOneuptickSeoTableId();
    const filterByFormula = buildSeoListFilterFormula();
    try {
      const records = await airtable(tableId)
        .select({
          filterByFormula,
          maxRecords: 200,
        })
        .firstPage();
      const filteredRecords = (records as any[]).filter(seoRecordMatchesListFilter);
      const postField = config.airtable.oneuptickSeoPostField || "Post";
      const siteField = config.airtable.oneuptickSeoSiteField || "site";
      const listTitleField = config.airtable.oneuptickSeoListTitleField || "Title_EN";
      const listExcerptField = config.airtable.oneuptickSeoListExcerptField || "Excerpt_EN";
      const imageUrlField = config.airtable.oneuptickSeoImageUrlField || "image_url";
      const items = filteredRecords.map((record: any) => {
        const createdTime = record._rawJson?.createdTime;
        const title = record.get(listTitleField);
        const excerpt = record.get(listExcerptField);
        const post = normalizeStatusRaw(record.get(postField));
        const site = siteFieldToTrimmedString(record.get(siteField));
        return {
          id: record.id,
          createdDate: typeof createdTime === "string" ? createdTime : "",
          title: typeof title === "string" ? title : String(title ?? ""),
          excerpt: typeof excerpt === "string" ? excerpt : String(excerpt ?? ""),
          image_url: seoThumbnailFromRecord(record),
          status: post,
          site,
          calculation: "",
          comments: "",
        };
      });
      items.sort((a: any, b: any) => {
        const ta = a.createdDate ? new Date(a.createdDate).getTime() : 0;
        const tb = b.createdDate ? new Date(b.createdDate).getTime() : 0;
        return tb - ta;
      });
      const etag = cache.set(CACHE_KEYS.ONEUPTICK_SEO_ARTICLES_DATA, items, CACHE_TTL.CAPITAL);
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("ETag", etag);
      res.json(items);
    } catch (err: any) {
      const atType = typeof err?.error === "string" ? err.error : undefined;
      const msg =
        typeof err?.message === "string"
          ? err.message
          : typeof err?.error === "string"
            ? err.error
            : "Failed to fetch 1uptick SEO articles";
      console.error("Airtable oneuptick SEO error:", atType ?? msg, err?.statusCode ?? "");
      res.status(500).json({
        error: msg,
        ...(atType && atType !== msg ? { airtableError: atType } : {}),
      });
    }
  });

  /** Fresh thumbnail URL for one row (bypasses list cache). */
  apiRouter.get("/oneuptick/seo/articles/:id/meta", authenticateToken, async (req, res) => {
    if (!airtable) return res.status(503).json({ error: "Airtable not configured" });
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing article id" });
    try {
      const record = await airtable(getOneuptickSeoTableId()).find(id);
      const image_url = seoThumbnailFromRecord(record);
      res.json({ id, image_url });
    } catch (err: any) {
      const status = err?.statusCode === 404 || err?.error === "NOT_FOUND" ? 404 : 500;
      res.status(status).json({
        error: status === 404 ? "Article not found" : err?.message ?? "Failed to load article",
      });
    }
  });

  apiRouter.get("/oneuptick/seo/articles/:id/content", authenticateToken, async (req, res) => {
    if (!airtable) return res.status(503).json({ error: "Airtable not configured" });
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing article id" });
    try {
      const bundle = await getOneuptickSeoContentBundleFromAirtable(airtable, id);
      if (bundle != null) {
        return res.json({
          content: bundle.content,
          titleTc: bundle.titleTc,
          excerptTc: bundle.excerptTc,
          titleEn: bundle.titleEn,
          excerptEn: bundle.excerptEn,
          contentEn: bundle.contentEn,
          fromSupabase: false,
        });
      }
      res.status(404).json({ error: "Article not found" });
    } catch (err: any) {
      console.error("Oneuptick SEO content error:", err);
      res.status(500).json({ error: err?.message ?? "Failed to get content" });
    }
  });

  apiRouter.patch("/oneuptick/seo/articles/:id/content", authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { content, locale } = req.body as { content?: unknown; locale?: unknown };
    if (!id) return res.status(400).json({ error: "Missing article id" });
    if (typeof content !== "string") return res.status(400).json({ error: "Missing or invalid content" });
    if (!airtable) return res.status(503).json({ error: "Airtable not configured" });
    const field = locale === "en" ? "Content_EN" : "Content_TC";
    try {
      await airtable(getOneuptickSeoTableId()).update(id, { [field]: content });
      cache.invalidate(CACHE_KEYS.ONEUPTICK_SEO_ARTICLES_DATA);
      res.json({ ok: true });
    } catch (err: any) {
      console.error("Oneuptick SEO update content error:", err);
      res.status(500).json({ error: err?.message ?? "Update failed" });
    }
  });

  apiRouter.patch("/oneuptick/seo/articles/:id", authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { title, image_url, titleEn, excerptEn, excerptTc } = req.body as {
      title?: unknown;
      image_url?: unknown;
      titleEn?: unknown;
      excerptEn?: unknown;
      excerptTc?: unknown;
    };
    if (!id) return res.status(400).json({ error: "Missing article id" });
    const hasTitle = typeof title === "string";
    const hasImageUrl = typeof image_url === "string";
    const hasTitleEn = typeof titleEn === "string";
    const hasExcerptEn = typeof excerptEn === "string";
    const hasExcerptTc = typeof excerptTc === "string";
    if (!hasTitle && !hasImageUrl && !hasTitleEn && !hasExcerptEn && !hasExcerptTc) {
      return res.status(400).json({ error: "Missing or invalid fields to update" });
    }
    if (!airtable) return res.status(503).json({ error: "Airtable not configured" });
    const imageUrlFieldName = config.airtable.oneuptickSeoImageUrlField || "image_url";
    try {
      const fields: Record<string, string> = {};
      if (hasTitle) fields.Title_TC = title as string;
      if (hasTitleEn) fields.Title_EN = titleEn as string;
      if (hasExcerptEn) fields.Excerpt_EN = excerptEn as string;
      if (hasExcerptTc) fields.Excerpt_TC = excerptTc as string;
      if (Object.keys(fields).length > 0) {
        await airtable(getOneuptickSeoTableId()).update(id, fields);
      }
      let savedField: string | undefined;
      if (hasImageUrl) {
        savedField = await writeSeoImageUrlToAirtable(airtable, id, image_url as string);
      }
      cache.invalidate(CACHE_KEYS.ONEUPTICK_SEO_ARTICLES_DATA);
      res.json({
        ok: true,
        ...(hasImageUrl
          ? { image_url: (image_url as string).trim(), airtableField: savedField }
          : {}),
      });
    } catch (err: any) {
      console.error("Oneuptick SEO update record error:", err);
      res.status(500).json({ error: err?.message ?? "Update failed" });
    }
  });

  /** SEO article → n8n publish webhook (Record_ID header, Basic + Credential when USER/PASS set). */
  apiRouter.post("/oneuptick/seo/articles/:id/publish", authenticateToken, async (req, res) => {
    const { id } = req.params;
    const uid = (req as express.Request & { uid?: string }).uid;
    if (!id) return res.status(400).json({ error: "Missing article id" });
    const whUrl = config.oneuptickSeoPublishWebhook.url;
    const cred = config.oneuptickPublishWebhook;
    if (!whUrl) {
      return res.status(503).json({
        error: "Publish webhook URL not configured (set N8N_ONEUPTICK_SEO_PUBLISH_WEBHOOK_URL or N8N_ONEUPTICK_PUBLISH_WEBHOOK_URL).",
      });
    }
    if (!airtable) {
      return res.status(503).json({ error: "Airtable not configured." });
    }
    const imageUrlField = config.airtable.oneuptickSeoImageUrlField || "image_url";
    try {
      const record = await airtable(getOneuptickSeoTableId()).find(id);
      const imgStr = seoThumbnailFromRecord(record);
      if (!imgStr) {
        return res.status(400).json({
          error: `Set a thumbnail URL (${imageUrlField}) before publishing.`,
        });
      }
    } catch (e: any) {
      const status = e?.statusCode === 404 || e?.error === "NOT_FOUND" ? 404 : 500;
      return res.status(status).json({
        error: status === 404 ? "Article not found" : e?.message ?? "Failed to load article",
      });
    }
    try {
      appendUserActivity(uid, "SEO article: calling n8n publish webhook…");
      const headers: Record<string, string> = {
        Record_ID: id,
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      appendN8nCredentialHeaders(headers, cred.user, cred.password);
      const webhookRes = await fetch(whUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ Record_ID: id }),
      });
      if (!webhookRes.ok) {
        const detail = await webhookRes.text().catch(() => "");
        console.error("n8n oneuptick SEO publish webhook error:", webhookRes.status, detail);
        appendUserActivity(uid, `SEO article: publish webhook failed (HTTP ${webhookRes.status}).`);
        const is404 = webhookRes.status === 404;
        const is401 = webhookRes.status === 401;
        const hint = is404
          ? "Use the production Webhook URL (/webhook/ not /webhook-test/) and ensure the workflow is active."
          : is401
            ? "n8n rejected auth. Set N8N_ONEUPTICK_PUBLISH_WEBHOOK_USER/PASSWORD (or N8N_APPROVE_WEBHOOK_*). Same credentials as Articles publish. Server sends Authorization: Basic … and Credential: login:password."
            : undefined;
        return res.status(502).json({
          error: `Publish webhook failed (${webhookRes.status})`,
          detail: detail.slice(0, 500),
          ...(hint ? { hint } : {}),
        });
      }
      appendUserActivity(uid, "SEO article: n8n publish webhook completed successfully.");
      cache.invalidate(CACHE_KEYS.ONEUPTICK_SEO_ARTICLES_DATA);
      res.setHeader("Content-Type", "application/json").json({ ok: true });
    } catch (err: any) {
      console.error("oneuptick SEO publish route error:", err);
      appendUserActivity(uid, `SEO article: publish failed — ${(err?.message ?? "error").toString().slice(0, 120)}`);
      res.status(500).json({ error: err?.message ?? "Publish failed" });
    }
  });

  apiRouter.post(
    "/oneuptick/seo/articles/:articleId/upload-image",
    uploadLimiter,
    authenticateToken,
    (req, res, next) => {
      imageUpload.single("file")(req, res, (err: unknown) => {
        if (err) {
          sendSeoUploadMulterError(res, err);
          return;
        }
        next();
      });
    },
    async (req, res) => {
      if (!airtable) return res.status(503).json({ error: "Airtable not configured" });
      if (!supabase && !admin.apps?.length) {
        return res.status(503).json({
          error: "Image storage not configured (need Supabase or FIREBASE_SERVICE_ACCOUNT in .env).",
        });
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
        const publicUrl = await uploadSeoThumbnailBuffer(
          supabase,
          file.buffer,
          file.mimetype,
          file.originalname || "image.jpg",
          articleId
        );
        const airtableField = await writeSeoImageUrlToAirtable(airtable, articleId, publicUrl);
        cache.invalidate(CACHE_KEYS.ONEUPTICK_SEO_ARTICLES_DATA);
        res.json({ url: publicUrl, image_url: publicUrl, airtableField });
      } catch (err: unknown) {
        console.error("1uptick SEO thumbnail upload error:", err);
        const atType =
          err && typeof err === "object" && "error" in err && typeof (err as { error?: string }).error === "string"
            ? (err as { error: string }).error
            : undefined;
        const msg = (err as Error)?.message ?? "Upload failed";
        res.status(500).json({
          error: msg,
          ...(atType && atType !== msg ? { airtableError: atType } : {}),
        });
      }
    }
  );
}

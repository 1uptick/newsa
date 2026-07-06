import path from "path";
import express from "express";
import { cache, CACHE_KEYS, CACHE_TTL } from "../cache.js";
import { config } from "../config.js";
import { authenticateToken, requireAdmin } from "../auth.js";

type RegisterOneuptickTradingViewRoutesDeps = {
  airtable: any | null;
  supabase: any | null;
  uploadLimiter: any;
};

/** Same Supabase Storage bucket used by Capital/ATFX article images. */
const ARTICLE_IMAGES_BUCKET = "article-images";

function isBucketAlreadyExistsError(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message ?? "").toLowerCase();
  const code = (err as { statusCode?: string })?.statusCode;
  return msg.includes("already") || msg.includes("exists") || msg.includes("duplicate") || code === "409" || code === "Duplicate";
}

async function ensureArticleImagesBucket(supabase: any): Promise<void> {
  const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
  if (listErr) console.warn("[article-images] listBuckets:", listErr.message);
  if (buckets?.some((b: { name: string }) => b.name === ARTICLE_IMAGES_BUCKET)) return;
  const { error: createErr } = await supabase.storage.createBucket(ARTICLE_IMAGES_BUCKET, { public: true });
  if (!createErr) return;
  if (isBucketAlreadyExistsError(createErr)) return;
  throw createErr;
}

const MAX_CHART_UPLOAD_BYTES = 5 * 1024 * 1024;
const CHART_ALLOWED_MIMES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;

function chartExtFromMimeAndName(mime: string, filename: string): string {
  const fromName = path.extname(filename || "").toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(fromName)) {
    return fromName === ".jpeg" ? ".jpg" : fromName;
  }
  switch (mime) {
    case "image/png":
      return ".png";
    case "image/gif":
      return ".gif";
    case "image/webp":
      return ".webp";
    default:
      return ".jpg";
  }
}

function chartPathPrefixForRecord(id: string): string {
  return `oneuptick-trading-view/${id}/`;
}

const DEFAULT_TRADING_VIEW_TABLE_ID = "tblJFseDd1tvhShLy";
const DEFAULT_TRADING_VIEW_LIST_VIEW_ID = "viwoMDpQ0Yw0855bc";

/** When env field is unset, try common Airtable spellings (field names are case-sensitive). */
const TITLE_FIELD_FALLBACKS = ["Title_tc", "title_tc", "Title_TC", "title_TC", "Name", "name"];
const CONTENT_FIELD_FALLBACKS = ["Content_tc", "content_tc", "Content_TC", "Article_tc", "article_tc", "Article_TC"];

function getTradingViewTableId(): string {
  const id = (config.airtable.oneuptickTradingViewTableId || DEFAULT_TRADING_VIEW_TABLE_ID).trim();
  return id || DEFAULT_TRADING_VIEW_TABLE_ID;
}

function getTradingViewListViewId(): string {
  const id = (config.airtable.oneuptickTradingViewListViewId || DEFAULT_TRADING_VIEW_LIST_VIEW_ID).trim();
  return id || DEFAULT_TRADING_VIEW_LIST_VIEW_ID;
}

function strField(record: any, field: string): string {
  const v = record.get(field);
  return typeof v === "string" ? v : String(v ?? "");
}

function pickTitle(record: any): string {
  const explicit = config.airtable.oneuptickTradingViewTitleField?.trim();
  if (explicit) return strField(record, explicit).trim();
  for (const name of TITLE_FIELD_FALLBACKS) {
    const s = strField(record, name).trim();
    if (s) return s;
  }
  return "";
}

function pickContent(record: any): string {
  const explicit = config.airtable.oneuptickTradingViewContentField?.trim();
  if (explicit) return strField(record, explicit);
  for (const name of CONTENT_FIELD_FALLBACKS) {
    const s = strField(record, name).trim();
    if (s) return strField(record, name);
  }
  return "";
}

/**
 * Same mounting pattern as `GET /api/oneuptick/articles`: paths are on `apiRouter` as `/oneuptick/trading-view`.
 */
export function registerOneuptickTradingViewRoutes(
  apiRouter: express.Router,
  deps: RegisterOneuptickTradingViewRoutesDeps
): void {
  const { airtable, supabase, uploadLimiter } = deps;

  apiRouter.get("/oneuptick/trading-view", authenticateToken, requireAdmin, async (req, res) => {
    if (!airtable) {
      return res.status(503).json({ error: "Airtable not configured." });
    }
    const forceRefresh = req.headers["cache-control"]?.includes("no-cache");
    if (!forceRefresh) {
      const cachedData = cache.get<any[]>(CACHE_KEYS.ONEUPTICK_TRADING_VIEW_DATA);
      if (cachedData) {
        res.setHeader("Cache-Control", "private, no-store");
        res.setHeader("ETag", cachedData.etag);
        return res.json(cachedData.data);
      }
    }
    const tableId = getTradingViewTableId();
    const viewId = getTradingViewListViewId();
    try {
      const records = await airtable(tableId)
        .select({
          view: viewId,
          maxRecords: 200,
        })
        .firstPage();
      const chartField = config.airtable.oneuptickTradingViewChartField || "chart";
      const sortField = config.airtable.oneuptickTradingViewSortField?.trim() || "Date-Time";
      const items = (records as any[]).map((record: any) => {
        const createdTime = record._rawJson?.createdTime;
        const title = pickTitle(record);
        const excerpt = pickContent(record);
        const chartRaw = record.get(chartField);
        let chartUrl = "";
        if (typeof chartRaw === "string") chartUrl = chartRaw.trim();
        else if (Array.isArray(chartRaw) && chartRaw.length > 0) {
          const first = chartRaw[0] as { url?: string } | string;
          chartUrl = typeof first === "string" ? first : typeof first?.url === "string" ? first.url : "";
        }
        const sortRaw = record.get(sortField);
        const sortMs = (() => {
          if (typeof sortRaw === "string" && sortRaw.trim()) {
            const t = new Date(sortRaw).getTime();
            if (!Number.isNaN(t)) return t;
          }
          if (typeof sortRaw === "number" && Number.isFinite(sortRaw)) return sortRaw;
          return typeof createdTime === "string" ? new Date(createdTime).getTime() || 0 : 0;
        })();
        return {
          id: record.id,
          createdDate: typeof createdTime === "string" ? createdTime : "",
          title,
          excerpt,
          chartUrl,
          calculation: "",
          comments: "",
          _sortMs: sortMs,
        };
      });
      items.sort((a: any, b: any) => (b._sortMs ?? 0) - (a._sortMs ?? 0));
      for (const it of items) delete (it as any)._sortMs;
      const etag = cache.set(CACHE_KEYS.ONEUPTICK_TRADING_VIEW_DATA, items, CACHE_TTL.CAPITAL);
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
            : "Failed to fetch TradingView rows";
      console.error("Airtable oneuptick trading-view error:", atType ?? msg, err?.statusCode ?? "");
      res.status(500).json({
        error: msg,
        ...(atType && atType !== msg ? { airtableError: atType } : {}),
      });
    }
  });

  /** Create a new TradingView row with title_tc + content_tc. */
  apiRouter.post("/oneuptick/trading-view", authenticateToken, requireAdmin, async (req, res) => {
    if (!airtable) return res.status(503).json({ error: "Airtable not configured" });
    const body = (req.body ?? {}) as { title?: unknown; content?: unknown };
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const content = typeof body.content === "string" ? body.content : "";
    if (!title && !content.trim()) {
      return res.status(400).json({ error: "Provide a title or content." });
    }
    const tableId = getTradingViewTableId();
    const titleField =
      config.airtable.oneuptickTradingViewTitleField?.trim() || TITLE_FIELD_FALLBACKS[1];
    const contentField =
      config.airtable.oneuptickTradingViewContentField?.trim() || CONTENT_FIELD_FALLBACKS[1];
    const fields: Record<string, string> = {};
    if (title) fields[titleField] = title;
    if (content.trim()) fields[contentField] = content;
    try {
      const created: any = await airtable(tableId).create(fields, { typecast: true });
      cache.invalidate(CACHE_KEYS.ONEUPTICK_TRADING_VIEW_DATA);
      res.status(201).json({ ok: true, id: created.id });
    } catch (err: any) {
      const atType = typeof err?.error === "string" ? err.error : undefined;
      const msg = err?.message ?? "Failed to create row";
      console.error("Airtable trading-view create error:", atType ?? msg, err?.statusCode ?? "");
      res.status(500).json({
        error: msg,
        ...(atType && atType !== msg ? { airtableError: atType } : {}),
      });
    }
  });

  apiRouter.get("/oneuptick/trading-view/:id", authenticateToken, requireAdmin, async (req, res) => {
    if (!airtable) return res.status(503).json({ error: "Airtable not configured" });
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing record id" });
    const tableId = getTradingViewTableId();
    try {
      const record: any = await airtable(tableId).find(id);
      const cfg = config.airtable;
      const lang = (titleField: string, contentField: string) => ({
        title: strField(record, titleField).trim(),
        content: strField(record, contentField),
      });
      const chartRaw = record.get(cfg.oneuptickTradingViewChartField || "chart");
      let chartUrl = "";
      if (typeof chartRaw === "string") chartUrl = chartRaw.trim();
      else if (Array.isArray(chartRaw) && chartRaw.length > 0) {
        const first = chartRaw[0] as { url?: string } | string;
        chartUrl = typeof first === "string" ? first : typeof first?.url === "string" ? first.url : "";
      }
      res.setHeader("Cache-Control", "private, no-store");
      res.json({
        title: pickTitle(record),
        content: pickContent(record),
        languages: {
          en: lang(cfg.oneuptickTradingViewTitleEnField, cfg.oneuptickTradingViewContentEnField),
          jp: lang(cfg.oneuptickTradingViewTitleJpField, cfg.oneuptickTradingViewContentJpField),
          vi: lang(cfg.oneuptickTradingViewTitleViField, cfg.oneuptickTradingViewContentViField),
          ms: lang(cfg.oneuptickTradingViewTitleMsField, cfg.oneuptickTradingViewContentMsField),
          th: lang(cfg.oneuptickTradingViewTitleThField, cfg.oneuptickTradingViewContentThField),
        },
        hashtags: {
          en: strField(record, cfg.oneuptickTradingViewHashtagEnField).trim(),
          jp: strField(record, cfg.oneuptickTradingViewHashtagJpField).trim(),
        },
        chartUrl,
      });
    } catch (err: any) {
      const status = err?.statusCode === 404 ? 404 : 500;
      res.status(status).json({ error: status === 404 ? "Record not found" : err?.message ?? "Failed to load record" });
    }
  });

  apiRouter.post("/oneuptick/trading-view/:id/translate", authenticateToken, requireAdmin, async (req, res) => {
    if (!airtable) return res.status(503).json({ error: "Airtable not configured" });
    if (!config.requesty.apiKey) {
      return res
        .status(503)
        .json({ error: "Translation is not available (Requesty / LLM not configured on the server)." });
    }
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing record id" });
    const tableId = getTradingViewTableId();

    let titleTc = "";
    let contentTc = "";
    try {
      const record: any = await airtable(tableId).find(id);
      titleTc = pickTitle(record).trim();
      contentTc = pickContent(record).trim();
    } catch (err: any) {
      const status = err?.statusCode === 404 ? 404 : 500;
      return res
        .status(status)
        .json({ error: status === 404 ? "Record not found" : err?.message ?? "Failed to load record" });
    }
    if (!titleTc && !contentTc) {
      return res.status(400).json({ error: "Record has no Chinese title or content to translate." });
    }

    const systemMsg =
      "You are a professional financial-markets translator and social-media copywriter for an investor-facing trading desk. " +
      "Source text is a Traditional Chinese financial market analysis covering technical analysis, price action, levels, indicators, macro and trading bias. " +
      "Translate the title and the content into English, Japanese, Vietnamese, Malay, and Thai. " +
      "Also generate short social-post hashtag strings in English and Japanese. " +
      "Translation rules: keep tickers/instrument codes, numeric values, percentages, prices, dates and currency symbols verbatim. " +
      "Preserve original HTML/markdown formatting (paragraphs, line breaks, lists) exactly. " +
      "Use natural financial terminology native to each target language; do not transliterate ticker symbols. " +
      "Hashtag rules: 4–8 hashtags per language, space-separated single line, each starting with #, no commas, no quotes, no trailing punctuation. " +
      "Include the main instrument/ticker, asset class, key macro/event tags, and the trading-bias direction (bullish/bearish/breakout/支撐/etc., in the target language). " +
      "Japanese hashtags must be in Japanese (e.g. #金価格 #ドル円 #テクニカル分析), English hashtags in English (e.g. #Gold #XAUUSD #Forex #Breakout). " +
      "Do not add commentary, citations, disclaimers, or new content. Output ONLY a valid JSON object with the exact keys defined in the user message. No markdown fences.";

    const schemaHint = `{
  "title_en": "...", "content_en": "...",
  "title_jp": "...", "content_jp": "...",
  "title_vi": "...", "content_vi": "...",
  "title_ms": "...", "content_ms": "...",
  "title_th": "...", "content_th": "...",
  "hashtag_en": "#Tag1 #Tag2 #Tag3 ...",
  "hashtag_jp": "#タグ1 #タグ2 #タグ3 ..."
}`;

    const userMsg =
      `Translate the following financial analysis. Return ONLY a JSON object that matches this schema exactly (all keys required, plain strings, no extra keys):\n\n${schemaHint}\n\n` +
      `SOURCE TITLE (zh-Hant):\n${titleTc}\n\n` +
      `SOURCE CONTENT (zh-Hant, may contain HTML — preserve tags as-is, translate visible text only):\n${contentTc}`;

    let parsed: Record<string, unknown> | null = null;
    try {
      const llmRes = await fetch(config.requesty.chatCompletionsUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.requesty.apiKey}`,
        },
        body: JSON.stringify({
          model: config.airtable.oneuptickTradingViewTranslateModel,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemMsg },
            { role: "user", content: userMsg },
          ],
        }),
      });
      if (!llmRes.ok) {
        const errBody = await llmRes.text().catch(() => "");
        console.error("Requesty translate error:", llmRes.status, errBody.slice(0, 500));
        return res
          .status(502)
          .json({ error: "Upstream LLM request failed.", upstreamStatus: llmRes.status });
      }
      const llmJson: any = await llmRes.json().catch(() => ({}));
      const text: string = llmJson?.choices?.[0]?.message?.content ?? "";
      const trimmed = text.trim();
      const jsonStr = trimmed.startsWith("{") ? trimmed : (trimmed.match(/\{[\s\S]*\}/)?.[0] ?? "");
      if (!jsonStr) return res.status(502).json({ error: "LLM returned non-JSON output." });
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        return res.status(502).json({ error: "LLM returned invalid JSON." });
      }
    } catch (e: any) {
      console.error("Requesty translate fetch error:", e?.message ?? e);
      return res.status(502).json({ error: "Could not reach the translation service." });
    }

    const get = (k: string): string => {
      const v = parsed?.[k];
      return typeof v === "string" ? v : "";
    };

    /** Normalize hashtag string from various LLM shapes (string or array). Joins with spaces; prefixes # if missing. */
    const pickHashtags = (...keys: string[]): string => {
      for (const k of keys) {
        const v = parsed?.[k];
        if (Array.isArray(v)) {
          const tags = v
            .filter((t): t is string => typeof t === "string")
            .map((t) => t.trim())
            .filter(Boolean)
            .map((t) => (t.startsWith("#") ? t : `#${t.replace(/^#+/, "")}`));
          if (tags.length) return tags.join(" ");
        } else if (typeof v === "string") {
          const s = v.trim();
          if (s) return s;
        }
      }
      return "";
    };

    const fieldMap: Record<string, string> = {
      [config.airtable.oneuptickTradingViewTitleEnField]: get("title_en"),
      [config.airtable.oneuptickTradingViewContentEnField]: get("content_en"),
      [config.airtable.oneuptickTradingViewTitleJpField]: get("title_jp") || get("title_ja"),
      [config.airtable.oneuptickTradingViewContentJpField]: get("content_jp") || get("content_ja"),
      [config.airtable.oneuptickTradingViewTitleViField]: get("title_vi") || get("title_vn"),
      [config.airtable.oneuptickTradingViewContentViField]: get("content_vi") || get("content_vn"),
      [config.airtable.oneuptickTradingViewTitleMsField]: get("title_ms") || get("title_my"),
      [config.airtable.oneuptickTradingViewContentMsField]: get("content_ms") || get("content_my"),
      [config.airtable.oneuptickTradingViewTitleThField]: get("title_th"),
      [config.airtable.oneuptickTradingViewContentThField]: get("content_th"),
      [config.airtable.oneuptickTradingViewHashtagEnField]: pickHashtags(
        "hashtag_en",
        "hashtags_en",
        "hashtag_english"
      ),
      [config.airtable.oneuptickTradingViewHashtagJpField]: pickHashtags(
        "hashtag_jp",
        "hashtag_ja",
        "hashtags_jp",
        "hashtags_ja",
        "hashtag_japanese"
      ),
    };

    const writePayload: Record<string, string> = {};
    for (const [field, value] of Object.entries(fieldMap)) {
      if (value && value.trim()) writePayload[field] = value;
    }
    if (Object.keys(writePayload).length === 0) {
      return res.status(502).json({ error: "Translation returned no usable fields." });
    }

    try {
      await airtable(tableId).update(id, writePayload, { typecast: true });
    } catch (err: any) {
      const atType = typeof err?.error === "string" ? err.error : undefined;
      const msg = err?.message ?? "Failed to write translations to Airtable";
      console.error("Airtable trading-view translate write error:", atType ?? msg, err?.statusCode ?? "");
      return res.status(500).json({
        error: msg,
        ...(atType && atType !== msg ? { airtableError: atType } : {}),
        writtenFields: Object.keys(writePayload),
      });
    }

    cache.invalidate(CACHE_KEYS.ONEUPTICK_TRADING_VIEW_DATA);
    res.json({
      ok: true,
      writtenFields: Object.keys(writePayload),
      values: writePayload,
    });
  });

  /**
   * Chart image: browser uploads the file directly to Supabase (signed URL), avoiding large / multipart
   * bodies through Firebase Hosting. Flow: POST prepare → PUT file to signedUrl → POST finalize.
   */
  apiRouter.post(
    "/oneuptick/trading-view/:id/chart-upload/prepare",
    uploadLimiter,
    authenticateToken,
    requireAdmin,
    async (req, res) => {
      if (!airtable) return res.status(503).json({ error: "Airtable not configured." });
      if (!supabase) return res.status(503).json({ error: "Supabase not configured" });
      const { id } = req.params;
      if (!id) return res.status(400).json({ error: "Missing record id" });

      const body = (req.body ?? {}) as {
        mimeType?: unknown;
        filename?: unknown;
        fileSize?: unknown;
      };
      const mimeType =
        typeof body.mimeType === "string" && body.mimeType.trim()
          ? body.mimeType.trim()
          : "image/jpeg";
      if (!(CHART_ALLOWED_MIMES as readonly string[]).includes(mimeType)) {
        return res
          .status(400)
          .json({ error: "Only image files (JPEG, PNG, GIF, WebP) are allowed" });
      }
      if (typeof body.fileSize === "number" && Number.isFinite(body.fileSize)) {
        if (body.fileSize > MAX_CHART_UPLOAD_BYTES) {
          return res.status(413).json({ error: "Image must be 5MB or smaller." });
        }
        if (body.fileSize <= 0) {
          return res.status(400).json({ error: "Invalid file size." });
        }
      }
      const filename = typeof body.filename === "string" ? body.filename : "chart.jpg";

      const tableId = getTradingViewTableId();
      try {
        await airtable(tableId).find(id);
      } catch (err: any) {
        const status = err?.statusCode === 404 ? 404 : 500;
        return res
          .status(status)
          .json({ error: status === 404 ? "Record not found" : err?.message ?? "Failed to load record" });
      }

      const ext = chartExtFromMimeAndName(mimeType, filename);
      const objectPath = `${chartPathPrefixForRecord(id)}${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;

      try {
        await ensureArticleImagesBucket(supabase);
        const bucketRef = supabase.storage.from(ARTICLE_IMAGES_BUCKET) as {
          createSignedUploadUrl?: (
            p: string,
            opts?: { upsert?: boolean }
          ) => Promise<{ data: { signedUrl: string; path: string; token: string }; error: { message?: string } | null }>;
        };
        if (typeof bucketRef.createSignedUploadUrl !== "function") {
          return res.status(501).json({
            error: "Server Supabase client does not support signed uploads. Update @supabase/supabase-js.",
          });
        }
        const { data: signed, error: signErr } = await bucketRef.createSignedUploadUrl(objectPath, {
          upsert: false,
        });
        if (signErr) throw signErr;
        if (!signed?.signedUrl || !signed?.path) {
          return res.status(500).json({ error: "Could not create signed upload URL." });
        }
        res.json({
          signedUrl: signed.signedUrl,
          path: signed.path,
          token: typeof signed.token === "string" ? signed.token : "",
          bucket: ARTICLE_IMAGES_BUCKET,
        });
      } catch (err: any) {
        console.error("TradingView chart prepare signed URL error:", err);
        return res.status(500).json({ error: err?.message ?? "Could not start upload" });
      }
    }
  );

  apiRouter.post(
    "/oneuptick/trading-view/:id/chart-upload/finalize",
    uploadLimiter,
    authenticateToken,
    requireAdmin,
    async (req, res) => {
      if (!airtable) return res.status(503).json({ error: "Airtable not configured." });
      if (!supabase) return res.status(503).json({ error: "Supabase not configured" });
      const { id } = req.params;
      if (!id) return res.status(400).json({ error: "Missing record id" });

      const storagePath =
        typeof (req.body as { path?: unknown })?.path === "string"
          ? (req.body as { path: string }).path.trim()
          : "";
      const prefix = chartPathPrefixForRecord(id);
      if (!storagePath || !storagePath.startsWith(prefix) || storagePath.includes("..")) {
        return res.status(400).json({ error: "Invalid storage path." });
      }

      const tableId = getTradingViewTableId();
      try {
        await airtable(tableId).find(id);
      } catch (err: any) {
        const status = err?.statusCode === 404 ? 404 : 500;
        return res
          .status(status)
          .json({ error: status === 404 ? "Record not found" : err?.message ?? "Failed to load record" });
      }

      const { data: urlData } = supabase.storage.from(ARTICLE_IMAGES_BUCKET).getPublicUrl(storagePath);
      const publicUrl = urlData.publicUrl;
      if (!publicUrl) {
        return res.status(500).json({ error: "Could not resolve public URL for upload." });
      }

      const chartField = config.airtable.oneuptickTradingViewChartField || "chart";
      const asAttachment: Record<string, { url: string }[]> = { [chartField]: [{ url: publicUrl }] };
      const asPlainUrl: Record<string, string> = { [chartField]: publicUrl };
      try {
        try {
          await airtable(tableId).update(id, asAttachment, { typecast: true });
        } catch (attachmentErr: any) {
          console.warn(
            "Airtable trading-view chart (attachment shape) failed, retrying as plain URL:",
            attachmentErr?.message ?? attachmentErr
          );
          await airtable(tableId).update(id, asPlainUrl, { typecast: true });
        }
      } catch (err: any) {
        const atType = typeof err?.error === "string" ? err.error : undefined;
        const msg = err?.message ?? "Uploaded image but failed to write URL to Airtable";
        console.error("Airtable trading-view chart write error:", atType ?? msg, err?.statusCode ?? "");
        return res.status(500).json({
          error: msg,
          ...(atType && atType !== msg ? { airtableError: atType } : {}),
          url: publicUrl,
        });
      }

      cache.invalidate(CACHE_KEYS.ONEUPTICK_TRADING_VIEW_DATA);
      res.json({ ok: true, url: publicUrl, field: chartField });
    }
  );
}

/**
 * Centralized server-side configuration.
 * All API keys and secrets MUST be loaded only here and never exposed to the client.
 * The client should only call /api/* endpoints on this server; no secrets in Vite/build.
 */

import * as dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import {
  DEFAULT_PLAN_MODEL,
  DEFAULT_RESEARCH_MODEL,
  DEFAULT_WRITER_MODEL,
  normalizeRequestyModelId,
} from "./requestyModels.js";

function requestyModelEnv(envKey: string, fallback: string): string {
  const raw = process.env[envKey]?.trim();
  return normalizeRequestyModelId(raw || fallback);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Resolve `.env` from the repo root (`server/..`) so Firebase and other secrets load even when `cwd` is not the project folder. */
const rootEnvPath = path.resolve(__dirname, "..", ".env");
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else {
  dotenv.config();
}

/** Default n8n production Webhook URL when env overrides are unset (topic approval). */
const N8N_DEFAULT_WEBHOOK_URL =
  "https://automation.1uptick.ai/webhook/169dbfaa-9541-49d5-a9cd-7232bafc563d";

/** Default n8n production Webhook for 1uptick Articles “Publish” (separate workflow from topic approval). */
const N8N_DEFAULT_ONEUPTICK_PUBLISH_WEBHOOK_URL =
  "https://automation.1uptick.ai/webhook/f77f4de5-544a-42f6-816e-9f9d1bdf3172";

function loadServiceAccountJsonFromEnv(
  jsonEnvNames: string[],
  pathEnvName: string,
  logLabel: string
): string | null {
  for (const name of jsonEnvNames) {
    const raw = process.env[name]?.trim();
    if (!raw) continue;
    if (raw.startsWith("{")) return raw;
    const keyPath = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
    try {
      return fs.readFileSync(keyPath, "utf8");
    } catch (e) {
      console.error(`${logLabel}: failed to read key file at`, keyPath, e);
      return null;
    }
  }
  const pathEnv = process.env[pathEnvName]?.trim();
  if (pathEnv) {
    const keyPath = path.isAbsolute(pathEnv) ? pathEnv : path.resolve(process.cwd(), pathEnv);
    try {
      return fs.readFileSync(keyPath, "utf8");
    } catch (e) {
      console.error(`${logLabel}: failed to read key file at`, keyPath, e);
      return null;
    }
  }
  return null;
}

function loadServiceAccountJson(): string | null {
  return loadServiceAccountJsonFromEnv(
    ["FIREBASE_SERVICE_ACCOUNT", "GOOGLE_SERVICE_ACCOUNT"],
    "FIREBASE_SERVICE_ACCOUNT_PATH",
    "Firebase Admin"
  );
}

function loadOneuptickServiceAccountJson(): string | null {
  return loadServiceAccountJsonFromEnv(
    ["ONEUPTICK_FIREBASE_SERVICE_ACCOUNT"],
    "ONEUPTICK_FIREBASE_SERVICE_ACCOUNT_PATH",
    "1uptick Firestore"
  );
}

export const config = {
  port: Number(process.env.PORT) || 5001,

  // Airtable (server-only)
  airtable: {
    apiKey: (process.env.AIRTABLE_API_KEY ?? "").trim(),
    baseId: (process.env.AIRTABLE_BASE_ID ?? "").trim(),
    tableId: process.env.AIRTABLE_TABLE_ID ?? "",
    capitalTableId: process.env.AIRTABLE_CAPITAL_TABLE_ID ?? "",
    /**
     * Proposed topics table for ATFX dashboard stats (Proposed / Approved counts).
     * Default tblH4b2m3tjRRvouI — override with AIRTABLE_ATFX_STATS_PROPOSED_TABLE_ID.
     */
    atfxStatsProposedTopicsTableId:
      process.env.AIRTABLE_ATFX_STATS_PROPOSED_TABLE_ID?.trim() || "tblH4b2m3tjRRvouI",
    /** Status column on that table for “Approved Topics” (default Status). */
    atfxStatsProposedTopicsStatusField:
      process.env.AIRTABLE_ATFX_STATS_PROPOSED_STATUS_FIELD?.trim() || "Status",
    /** ATFX dashboard table (optional). Used for Notify → “Content gen” marker when record id exists there. */
    atfxTableId: process.env.AIRTABLE_ATFX_TABLE_ID?.trim() ?? "",
    /** 1uptick Articles page (Title_tc, Excerpt_tc, Article_tc). Default: tblFjxMEFtJvsyLZh */
    oneuptickArticlesTableId: (process.env.AIRTABLE_ONEUPTICK_ARTICLES_TABLE_ID ?? "").trim(),
    /** 1uptick SEO table (Title_TC, Excerpt_TC, Content_TC, Title_EN, …). Default: tblbZ9qSOcnlxewSA */
    oneuptickSeoTableId: (process.env.AIRTABLE_ONEUPTICK_SEO_TABLE_ID ?? "").trim(),
    /** List filter: Airtable field names (case-sensitive). Defaults match {Post}="Ready", {site}!="". */
    oneuptickSeoPostField: process.env.AIRTABLE_ONEUPTICK_SEO_POST_FIELD?.trim() || "Post",
    oneuptickSeoSiteField: process.env.AIRTABLE_ONEUPTICK_SEO_SITE_FIELD?.trim() || "site",
    /** Single-select option name (or text) that counts as “ready” for the list. */
    oneuptickSeoPostReadyValue: process.env.AIRTABLE_ONEUPTICK_SEO_POST_READY_VALUE?.trim() || "Ready",
    /** Left-column list only: English title/excerpt (not Title_TC / Excerpt_TC). */
    oneuptickSeoListTitleField: process.env.AIRTABLE_ONEUPTICK_SEO_LIST_TITLE_FIELD?.trim() || "Title_EN",
    oneuptickSeoListExcerptField: process.env.AIRTABLE_ONEUPTICK_SEO_LIST_EXCERPT_FIELD?.trim() || "Excerpt_EN",
    /** SEO thumbnail URL column (Thumbnail modal). */
    oneuptickSeoImageUrlField: process.env.AIRTABLE_ONEUPTICK_SEO_IMAGE_URL_FIELD?.trim() || "image_url",
    /** Admin-only TradingView page: table in same base (default tblJFseDd1tvhShLy). */
    oneuptickTradingViewTableId: (process.env.AIRTABLE_ONEUPTICK_TRADING_VIEW_TABLE_ID ?? "").trim(),
    /** Airtable list view for the left column (default viwoMDpQ0Yw0855bc). */
    oneuptickTradingViewListViewId: (process.env.AIRTABLE_ONEUPTICK_TRADING_VIEW_LIST_VIEW_ID ?? "").trim(),
    /** Field names for title/body (defaults title_tc, content_tc). */
    oneuptickTradingViewTitleField: (process.env.AIRTABLE_ONEUPTICK_TRADING_VIEW_TITLE_FIELD ?? "").trim(),
    oneuptickTradingViewContentField: (process.env.AIRTABLE_ONEUPTICK_TRADING_VIEW_CONTENT_FIELD ?? "").trim(),
    /** Per-language target columns written by the Translate button. Defaults match `title_tc` / `content_tc` style. */
    oneuptickTradingViewTitleEnField: process.env.AIRTABLE_ONEUPTICK_TRADING_VIEW_TITLE_EN_FIELD?.trim() || "title_en",
    oneuptickTradingViewContentEnField: process.env.AIRTABLE_ONEUPTICK_TRADING_VIEW_CONTENT_EN_FIELD?.trim() || "content_en",
    oneuptickTradingViewTitleJpField: process.env.AIRTABLE_ONEUPTICK_TRADING_VIEW_TITLE_JP_FIELD?.trim() || "title_jp",
    oneuptickTradingViewContentJpField: process.env.AIRTABLE_ONEUPTICK_TRADING_VIEW_CONTENT_JP_FIELD?.trim() || "content_jp",
    oneuptickTradingViewTitleViField: process.env.AIRTABLE_ONEUPTICK_TRADING_VIEW_TITLE_VI_FIELD?.trim() || "title_vi",
    oneuptickTradingViewContentViField: process.env.AIRTABLE_ONEUPTICK_TRADING_VIEW_CONTENT_VI_FIELD?.trim() || "content_vi",
    oneuptickTradingViewTitleMsField: process.env.AIRTABLE_ONEUPTICK_TRADING_VIEW_TITLE_MS_FIELD?.trim() || "title_ms",
    oneuptickTradingViewContentMsField: process.env.AIRTABLE_ONEUPTICK_TRADING_VIEW_CONTENT_MS_FIELD?.trim() || "content_ms",
    oneuptickTradingViewTitleThField: process.env.AIRTABLE_ONEUPTICK_TRADING_VIEW_TITLE_TH_FIELD?.trim() || "title_th",
    oneuptickTradingViewContentThField: process.env.AIRTABLE_ONEUPTICK_TRADING_VIEW_CONTENT_TH_FIELD?.trim() || "content_th",
    /** Hashtag columns (English + Japanese) written by the Translate button. */
    oneuptickTradingViewHashtagEnField: process.env.AIRTABLE_ONEUPTICK_TRADING_VIEW_HASHTAG_EN_FIELD?.trim() || "hashtag_en",
    oneuptickTradingViewHashtagJpField: process.env.AIRTABLE_ONEUPTICK_TRADING_VIEW_HASHTAG_JP_FIELD?.trim() || "hashtag_jp",
    /** Chart image URL column written by the Upload chart button (default `chart`). */
    oneuptickTradingViewChartField: process.env.AIRTABLE_ONEUPTICK_TRADING_VIEW_CHART_FIELD?.trim() || "chart",
    /** Sort column for the left list (descending). Default Airtable field name `Date-Time`. */
    oneuptickTradingViewSortField: process.env.AIRTABLE_ONEUPTICK_TRADING_VIEW_SORT_FIELD?.trim() || "Date-Time",
    /** Requesty model used for TradingView translation. Default: openai/gpt-4.1-mini. */
    oneuptickTradingViewTranslateModel:
      process.env.REQUESTY_ONEUPTICK_TRADING_VIEW_TRANSLATE_MODEL?.trim() || "openai/gpt-4.1-mini",
    /** Single line or select column for workflow state (navbar strip on Articles page). Default: Status */
    oneuptickArticlesStatusField:
      process.env.AIRTABLE_ONEUPTICK_ARTICLES_STATUS_FIELD?.trim() || "Status",
    /** Optional separate column for publish state in the navbar (e.g. "Publish status"). If unset, navbar uses Status for "Publish status" only. */
    oneuptickArticlesPublishStatusField:
      process.env.AIRTABLE_ONEUPTICK_ARTICLES_PUBLISH_STATUS_FIELD?.trim() || "",
    /** Exact Airtable field name on Proposed topics (e.g. "company" or "Company"). */
    proposedTopicsCompanyField: process.env.AIRTABLE_PROPOSED_TOPICS_COMPANY_FIELD?.trim() || "company",
    /**
     * Proposed topics / Capital keywords table (default tblH4b2m3tjRRvouI).
     * Set if your production base uses a different table id.
     */
    capitalKeywordsTableId: process.env.AIRTABLE_CAPITAL_KEYWORDS_TABLE_ID?.trim() || "tblH4b2m3tjRRvouI",
    /** Sort column for keyword lists (must match Airtable primary column name exactly). */
    proposedTopicsSortField: process.env.AIRTABLE_PROPOSED_TOPICS_SORT_FIELD?.trim() || "Create date",

    /**
     * ATFX approve → LLM article output table (default tblL840we8dgnW9vZ).
     * Default field names match the ATFX spec: Title_EN / Title_TC / Excerpt_* / Content_* (case-sensitive).
     * Override with AIRTABLE_ATFX_ARTICLE_*_FIELD if your base uses different names (e.g. Title_en).
     */
    atfxGeneratedArticleTableId:
      process.env.AIRTABLE_ATFX_GENERATED_ARTICLE_TABLE_ID?.trim() || "tblL840we8dgnW9vZ",
    atfxArticleFieldTitleEn: process.env.AIRTABLE_ATFX_ARTICLE_TITLE_EN_FIELD?.trim() || "Title_EN",
    atfxArticleFieldTitleTc: process.env.AIRTABLE_ATFX_ARTICLE_TITLE_TC_FIELD?.trim() || "Title_TC",
    atfxArticleFieldExcerptEn: process.env.AIRTABLE_ATFX_ARTICLE_EXCERPT_EN_FIELD?.trim() || "Excerpt_EN",
    atfxArticleFieldExcerptTc: process.env.AIRTABLE_ATFX_ARTICLE_EXCERPT_TC_FIELD?.trim() || "Excerpt_TC",
    atfxArticleFieldContentEn: process.env.AIRTABLE_ATFX_ARTICLE_CONTENT_EN_FIELD?.trim() || "Content_EN",
    atfxArticleFieldContentTc: process.env.AIRTABLE_ATFX_ARTICLE_CONTENT_TC_FIELD?.trim() || "Content_TC",
    /** If set, filled with English title (e.g. primary column is “Name” instead of Title_EN). */
    atfxArticleFieldName: process.env.AIRTABLE_ATFX_ARTICLE_NAME_FIELD?.trim() ?? "",
    /** Optional tracking fields — omit from API create when unset to avoid UNKNOWN_FIELD_NAME. */
    atfxArticleFieldSourceTopicId: process.env.AIRTABLE_ATFX_ARTICLE_SOURCE_TOPIC_ID_FIELD?.trim() ?? "",
    atfxArticleFieldGeneratedAt: process.env.AIRTABLE_ATFX_ARTICLE_GENERATED_AT_FIELD?.trim() ?? "",
    atfxArticleFieldArticleType: process.env.AIRTABLE_ATFX_ARTICLE_ARTICLE_TYPE_FIELD?.trim() ?? "",
    /** Single line / select: Retail vs institutional on generated rows; default Airtable field name Category. Set to empty to omit. */
    atfxArticleFieldCategory: process.env.AIRTABLE_ATFX_ARTICLE_CATEGORY_FIELD?.trim() ?? "Category",
    /** Generated article rows: field Company (default) is set to ATFX on create; also used for ATFX stats “Completed” + pie. */
    atfxArticleFieldCompany: process.env.AIRTABLE_ATFX_ARTICLE_COMPANY_FIELD?.trim() || "Company",
    /** Optional portal “revise” notes; if unset, server tries Comments / Custome / etc. on the record. */
    atfxArticleFieldComments: process.env.AIRTABLE_ATFX_ARTICLE_COMMENTS_FIELD?.trim() ?? "",
    /**
     * Optional thumbnail URL field on generated ATFX articles (e.g. "image 1").
     * Leave unset to disable automatic thumbnail saving.
     */
    atfxArticleFieldThumbnailUrl: process.env.AIRTABLE_ATFX_ARTICLE_THUMBNAIL_FIELD?.trim() || "",
  },

  // Firebase Admin (server-only) — newsa auth / storage
  firebase: {
    serviceAccountJson: loadServiceAccountJson(),
    /** Defaults to {project_id}.appspot.com from the service account if unset. */
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET?.trim() || process.env.VITE_FIREBASE_STORAGE_BUCKET?.trim() || "",
  },

  /** 1uptick app Firestore (uptick-prod) — market map / movers cache (read-only). */
  oneuptickFirebase: {
    serviceAccountJson: loadOneuptickServiceAccountJson(),
  },

  // Supabase (server-only; service role key must never go to client)
  supabase: {
    url: process.env.SUPABASE_URL ?? "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  },

  // Requesty AI router (OpenAI-compatible Chat Completions; server-only)
  requesty: {
    apiKey:
      (process.env.REQUESTY_API_KEY ?? "").trim() || "",
    /** Override only if Requesty changes the gateway path (default matches OpenAI `/v1/chat/completions`). */
    chatCompletionsUrl:
      process.env.REQUESTY_CHAT_COMPLETIONS_URL?.trim() || "https://router.requesty.ai/v1/chat/completions",
    /**
     * Model id for ATFX article JSON generation (provider/model slug).
     * Default `anthropic/claude-sonnet-4-5` — older dated Sonnet ids may 404 on the router.
     */
    claudeArticleModel: requestyModelEnv("REQUESTY_CLAUDE_ARTICLE_MODEL", DEFAULT_WRITER_MODEL),
    institutionalOutlineModel: requestyModelEnv("REQUESTY_INSTITUTIONAL_OUTLINE_MODEL", DEFAULT_PLAN_MODEL),
    /** Perplexity (or other) model for `/api/capitalkeywords/generate` SEO topic JSON. */
    capitalTopicModel:
      process.env.REQUESTY_CAPITAL_TOPIC_MODEL?.trim() || "perplexity/sonar-pro",
    /** OpenAI-compatible images API endpoint (Requesty router). */
    imagesGenerationsUrl:
      process.env.REQUESTY_IMAGES_GENERATIONS_URL?.trim() || "https://router.requesty.ai/v1/images/generations",
    /**
     * Image model for ATFX thumbnails (Requesty).
     * Gemini image models (`vertex/gemini-2.5-flash-image`, etc.) use `/v1/chat/completions`.
     * `azure/openai/gpt-image-1` / `gpt-image-1.5` use `/v1/images/generations`.
     */
    atfxThumbnailImageModel:
      process.env.REQUESTY_ATFX_THUMBNAIL_IMAGE_MODEL?.trim() || "vertex/gemini-2.5-flash-image",
    /** ATFX Research Report chat agent (tool-calling Bloomberg report writer). */
    atfxResearchReportModel: requestyModelEnv(
      "REQUESTY_ATFX_RESEARCH_REPORT_MODEL",
      requestyModelEnv("REQUESTY_CLAUDE_ARTICLE_MODEL", DEFAULT_WRITER_MODEL)
    ),
    /** Perplexity model for ATFX Research Report live news tool (via Requesty router). */
    atfxResearchNewsModel: requestyModelEnv("REQUESTY_ATFX_RESEARCH_NEWS_MODEL", DEFAULT_RESEARCH_MODEL),
    /** Plan phase (JSON outline, style resolution when auto). */
    atfxResearchPlanModel: requestyModelEnv("REQUESTY_ATFX_RESEARCH_PLAN_MODEL", DEFAULT_PLAN_MODEL),
    /** Research phase web search (Perplexity sonar-pro, then Google flash fallbacks). */
    atfxResearchResearchModel: requestyModelEnv("REQUESTY_ATFX_RESEARCH_RESEARCH_MODEL", DEFAULT_RESEARCH_MODEL),
    /** Write phase (HTML report synthesis). */
    atfxResearchWriterModel: requestyModelEnv(
      "REQUESTY_ATFX_RESEARCH_WRITER_MODEL",
      requestyModelEnv(
        "REQUESTY_ATFX_RESEARCH_REPORT_MODEL",
        requestyModelEnv("REQUESTY_CLAUDE_ARTICLE_MODEL", DEFAULT_WRITER_MODEL)
      )
    ),
    /** Short Q&A without full pipeline. */
    atfxResearchChatModel:
      process.env.REQUESTY_ATFX_RESEARCH_CHAT_MODEL?.trim() || "openai/gpt-4o-mini",
    /** Post-write HTML translation (EN → TC/SC). */
    atfxResearchTranslateModel:
      process.env.REQUESTY_ATFX_RESEARCH_TRANSLATE_MODEL?.trim() || "openai/gpt-4o-mini",
  },

  // Perplexity (server-only) — direct API for sonar-pro research
  perplexity: {
    apiKey: (process.env.PERPLEXITY_API_KEY ?? "").trim(),
    /** Default matches Perplexity OpenAI-compatible endpoint. */
    chatCompletionsUrl:
      process.env.PERPLEXITY_CHAT_COMPLETIONS_URL?.trim() || "https://api.perplexity.ai/chat/completions",
  },

  // Chart-IMG API (server-only) for generating TradingView-style OHLC charts
  chartImg: {
    apiKey: process.env.CHART_IMG_API_KEY ?? "",
  },

  /** QuickChart.io — macro bar/line chart PNGs (optional API key for higher rate limits). */
  quickChart: {
    apiKey: process.env.QUICKCHART_API_KEY?.trim() ?? "",
  },

  /** Telegram Bot API — ATFX Markets quick analysis posts (server-only). */
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "",
  },

  /**
   * Financial Modeling Prep — live quotes for validating numeric claims in ATFX-generated topics.
   * @see https://site.financialmodelingprep.com/developer/docs/quickstart
   */
  fmp: {
    apiKey: process.env.FMP_API_KEY?.trim() ?? "",
    /** Default: validation runs when apiKey is set. Set FMP_QUOTE_VALIDATION=false to disable. */
    quoteValidationEnabled: process.env.FMP_QUOTE_VALIDATION !== "false",
  },

  // SMTP (server-only). In production set SMTP_* and APP_BASE_URL in the host environment.
  smtp: {
    host: process.env.SMTP_HOST?.trim() ?? "",
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_SECURE === "true" || process.env.SMTP_SECURE === "1",
    user: process.env.SMTP_USER?.trim() ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.SMTP_FROM?.trim() || process.env.SMTP_USER || "noreply@newsa.io",
    // Set SMTP_TLS_REJECT_UNAUTHORIZED=false only if your provider uses a self-signed cert and verify fails.
    tlsRejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== "false",
  },

  // App URL for emails (server-only)
  appBaseUrl: process.env.APP_BASE_URL?.trim() || "http://localhost:5001",

  /** n8n webhook for topic approval (Record_ID header; Basic auth only if USER+PASSWORD set; server-only). */
  n8nApproveWebhook: {
    url: process.env.N8N_APPROVE_WEBHOOK_URL?.trim() || N8N_DEFAULT_WEBHOOK_URL,
    user: process.env.N8N_APPROVE_WEBHOOK_USER?.trim() ?? "",
    password: process.env.N8N_APPROVE_WEBHOOK_PASSWORD ?? "",
  },

  /**
   * Oneuptick Articles “Publish” → n8n. Record_ID in header + JSON body.
   * Basic Auth: N8N_ONEUPTICK_PUBLISH_WEBHOOK_USER / _PASSWORD, then approve webhook creds as fallback.
   * Also accepts N8N_ONEUPTICK_PUBLISH_webhook_user / _password (mixed case) for older .env lines.
   */
  oneuptickPublishWebhook: {
    url:
      process.env.N8N_ONEUPTICK_PUBLISH_WEBHOOK_URL?.trim() || N8N_DEFAULT_ONEUPTICK_PUBLISH_WEBHOOK_URL,
    user:
      process.env.N8N_ONEUPTICK_PUBLISH_WEBHOOK_USER?.trim() ||
      process.env.N8N_ONEUPTICK_PUBLISH_webhook_user?.trim() ||
      process.env.N8N_APPROVE_WEBHOOK_USER?.trim() ||
      "",
    password:
      process.env.N8N_ONEUPTICK_PUBLISH_WEBHOOK_PASSWORD ||
      process.env.N8N_ONEUPTICK_PUBLISH_webhook_password ||
      process.env.N8N_APPROVE_WEBHOOK_PASSWORD ||
      "",
  },

  /**
   * 1uptick SEO “Publish” → n8n (optional different URL only).
   * Uses the same Basic + Credential login/password as {@link oneuptickPublishWebhook} always.
   */
  oneuptickSeoPublishWebhook: {
    url:
      process.env.N8N_ONEUPTICK_SEO_PUBLISH_WEBHOOK_URL?.trim() ||
      process.env.N8N_ONEUPTICK_PUBLISH_WEBHOOK_URL?.trim() ||
      N8N_DEFAULT_ONEUPTICK_PUBLISH_WEBHOOK_URL,
  },

  /** 1uptick Twitt “Post” → n8n (POST; `record_id` in header + JSON body). */
  twittPostWebhook: {
    url:
      process.env.N8N_TWITT_POST_WEBHOOK_URL?.trim() ||
      "https://automation.1uptick.ai/webhook/23e3e8be-662b-4060-a5e1-8d376458b940",
    user: process.env.N8N_TWITT_POST_WEBHOOK_USER?.trim() || process.env.N8N_APPROVE_WEBHOOK_USER?.trim() || "",
    password: process.env.N8N_TWITT_POST_WEBHOOK_PASSWORD || process.env.N8N_APPROVE_WEBHOOK_PASSWORD || "",
  },

  /**
   * ATFX Research Report → WordPress REST API (Application Password auth).
   * Creates posts via POST /wp-json/wp/v2/posts.
   */
  atfxWordPress: {
    siteUrl: process.env.ATFX_WORDPRESS_SITE_URL?.trim() || "",
    username: process.env.ATFX_WORDPRESS_USERNAME?.trim() || "",
    appPassword: process.env.ATFX_WORDPRESS_APP_PASSWORD ?? "",
    postStatus: (() => {
      const raw = (process.env.ATFX_WORDPRESS_POST_STATUS?.trim() || "publish").toLowerCase();
      if (raw === "draft" || raw === "pending" || raw === "private" || raw === "publish") return raw;
      return "publish";
    })(),
  },

  // Initial admin emails (optional; never empty — used to recover admin in dev if user_roles is wrong)
  initialAdminEmails: (() => {
    const raw = process.env.INITIAL_ADMIN_EMAIL?.trim();
    const source = raw && raw.length > 0 ? raw : "support@1uptick.com";
    const list = source
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    return list.length > 0 ? list : ["support@1uptick.com"];
  })(),
} as const;

/** Whether Airtable is configured (API key + base). */
export const isAirtableConfigured = Boolean(config.airtable.apiKey && config.airtable.baseId);

/** Whether Supabase is configured. */
export const isSupabaseConfigured = Boolean(config.supabase.url && config.supabase.serviceRoleKey);

/** Whether the Requesty LLM gateway is configured. */
export const isRequestyConfigured = Boolean(config.requesty.apiKey);


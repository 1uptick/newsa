import { jsonrepair } from "jsonrepair";
import sharp from "sharp";
import { config } from "../config.js";
import {
  buildSonnetWriterModelChain,
  buildPlanModelChain,
  isRequestyProviderFailoverError,
  isUnsupportedRequestyModelError,
  PLAN_MODEL_FALLBACKS,
  WRITER_MODEL_FALLBACKS,
  uniqModelChain,
} from "../requestyModels.js";
import { stripOuterArticleWrapper } from "../stripArticleWrapper.js";
import { stripCitationMarkers } from "../stripLlmCitations.js";
import {
  detectFinancialSymbols,
  executeContentChartPlan,
  fetchPriceQuotes,
  planContentCharts,
} from "../atfxMarketData.js";
import {
  type ArticleChartEmbed,
  articleChartSrcs,
  formatArticleChartsWriterBlock,
  formatContentChartBrief,
  maxEconomicChartsAllowed,
} from "../contentChartPlanner.js";
import { escapeHtmlAttr } from "../atfxChartNaming.js";
import { wrapEconomicChartGrid, tagSoloEconomicChartBlock } from "../atfxReportChartLayout.js";
import {
  captureBrokerageImageGenerationUsage,
  getBrokerageUsageContext,
  parseOpenAiChatUsage,
} from "../brokerageTokenBilling.js";

type LLMModel = "perplexity/sonar-pro" | "openai/gpt-4.1-mini";

/** Airtable long-text cells are limited (~100k chars); base64 chart images blow past this quickly. */
const AIRTABLE_LONG_TEXT_SAFE_CHARS = 95_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function recordThumbnailImageUsage(json: unknown, model: string): void {
  const ctx = getBrokerageUsageContext();
  if (!ctx) return;
  const usage = parseOpenAiChatUsage(json, "requesty", model);
  captureBrokerageImageGenerationUsage({
    source: "article_generate",
    model,
    firebaseUid: ctx.firebaseUid,
    referenceId: ctx.referenceId,
    symbol: ctx.symbol,
    usage: usage ?? undefined,
  });
}

function isHtmlDocument(s: string): boolean {
  const t = (s || "").trim();
  return t.startsWith("<!DOCTYPE html") || t.toLowerCase().startsWith("<html");
}

function extractHtmlTitle(s: string): string {
  const m = (s || "").match(/<title>\s*([^<]+?)\s*<\/title>/i);
  return (m?.[1] || "").trim();
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: { timeoutMs: number; retries: number; retryStatuses: number[]; label: string }
): Promise<{ res: Response; text: string }> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= opts.retries + 1; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      const text = await res.text().catch(() => "");
      if (res.ok) return { res, text };
      if (opts.retryStatuses.includes(res.status) && attempt <= opts.retries) {
        const title = isHtmlDocument(text) ? extractHtmlTitle(text) : "";
        console.warn(
          `[${opts.label}] HTTP ${res.status} attempt ${attempt}/${opts.retries + 1}${title ? ` — ${title}` : ""}`
        );
        await sleep(650 * attempt);
        continue;
      }
      return { res, text };
    } catch (e) {
      lastErr = e;
      const isAbort = (e as { name?: string })?.name === "AbortError";
      if (attempt <= opts.retries) {
        console.warn(`[${opts.label}] ${isAbort ? "timeout" : "network error"} attempt ${attempt}/${opts.retries + 1}`);
        await sleep(650 * attempt);
        continue;
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function requestyMessageText(message: { content?: unknown } | undefined): string {
  const c = message?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return c
      .map((part: unknown) => {
        if (part && typeof part === "object" && "text" in part && typeof (part as { text?: unknown }).text === "string") {
          return (part as { text: string }).text;
        }
        return "";
      })
      .join("");
  }
  return "";
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

type ArticleLengthOption = "700-800" | "1400-1500";
type ArticleStyleOption = "paragraph" | "bullet";
type ArticleOptions = { length: ArticleLengthOption; style: ArticleStyleOption };

function normalizeArticleOptions(input?: Partial<ArticleOptions> | null): ArticleOptions {
  const len = input?.length === "1400-1500" ? "1400-1500" : "700-800";
  const style = input?.style === "bullet" ? "bullet" : "paragraph";
  return { length: len, style };
}

function extractJsonObject(payload: string): string {
  const t = (payload ?? "").trim();
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/im);
  const unfenced = fence ? fence[1].trim() : t;
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start >= 0 && end > start) return unfenced.slice(start, end + 1);
  return unfenced;
}

/** LLMs often emit almost-JSON (unescaped newlines in HTML strings, minor syntax). Repair before failing. */
function parseLlmJsonRecord(raw: string): Record<string, string> {
  const t = (raw ?? "").trim();
  if (!t) throw new SyntaxError("empty");
  const extracted = extractJsonObject(t);
  const candidates: string[] = [];
  if (extracted.trim()) candidates.push(extracted);
  if (t !== extracted && t.trim()) candidates.push(t);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as Record<string, string>;
    } catch {
      /* try repair */
    }
    try {
      return JSON.parse(jsonrepair(candidate)) as Record<string, string>;
    } catch {
      /* next candidate */
    }
  }
  throw new SyntaxError("invalid");
}

/** Drop a redundant first <h2>Executive Summary</h2> (or TC 執行摘要) so the body opens with paragraphs only. */
function stripLeadingExecutiveSummaryH2(html: string): string {
  const t = (html || "").trim();
  if (!t) return t;
  return t.replace(
    /(<article\b[^>]*>)\s*<h2\b[^>]*>\s*(?:Executive\s+Summary|執行摘要)\s*<\/h2>\s*/i,
    "$1"
  );
}

function parseEnglishOnlyJson(raw: string): { titleEn: string; excerptEn: string; contentEn: string; imagePrompt?: string } {
  let parsed: Record<string, string>;
  try {
    parsed = parseLlmJsonRecord(raw);
  } catch {
    throw new Error("The English article reply was incomplete or invalid.");
  }
  const titleEn = stripCitationMarkers(parsed.title_en || parsed.Title_EN || "");
  const excerptEn = stripCitationMarkers(parsed.excerpt_en || parsed.Excerpt_EN || "");
  const contentEn = stripLeadingExecutiveSummaryH2(
    stripCitationMarkers(stripOuterArticleWrapper(parsed.content_en || parsed.Content_EN || ""))
  );
  const imagePrompt = stripCitationMarkers(
    parsed.image_prompt ||
      parsed.Image_Prompt ||
      parsed.imagePrompt ||
      parsed.ImagePrompt ||
      parsed.thumbnail_prompt ||
      parsed.Thumbnail_Prompt ||
      parsed.thumbnail_image_prompt ||
      parsed.thumbnailImagePrompt ||
      ""
  ).trim();
  if (!titleEn.trim() || !contentEn.trim()) {
    throw new Error("The English article came back without a title or main text. Please try again.");
  }
  return { titleEn, excerptEn, contentEn, imagePrompt };
}

function parseTraditionalChineseOnlyJson(raw: string): { titleTc: string; excerptTc: string; contentTc: string } {
  let parsed: Record<string, string>;
  try {
    parsed = parseLlmJsonRecord(raw);
  } catch {
    throw new Error("The Chinese translation reply was incomplete or invalid.");
  }
  const titleTc = stripCitationMarkers(parsed.title_tc || parsed.Title_TC || "");
  const excerptTc = stripCitationMarkers(parsed.excerpt_tc || parsed.Excerpt_TC || "");
  const contentTc = stripLeadingExecutiveSummaryH2(
    stripCitationMarkers(stripOuterArticleWrapper(parsed.content_tc || parsed.Content_TC || ""))
  );
  if (!titleTc.trim() || !contentTc.trim()) {
    throw new Error("The Chinese translation came back without a title or main text. Please try again.");
  }
  return { titleTc, excerptTc, contentTc };
}

/** ATFX thumbnail output dimensions (4:3 landscape). */
export const ATFX_THUMBNAIL_WIDTH = 1024;
export const ATFX_THUMBNAIL_HEIGHT = 768;

/** Crop/resize any model output to a consistent 4:3 frame. */
export async function normalizeAtfxThumbnailBuffer(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize(ATFX_THUMBNAIL_WIDTH, ATFX_THUMBNAIL_HEIGHT, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();
}

/** Shared constraints so thumbnails read as finance / markets news, not generic stock art. */
const ATFX_THUMBNAIL_FINANCIAL_STYLE = `Financial-markets editorial thumbnail in 4:3 landscape aspect (investing / macro / FX / commodities / indices / rates / energy or corporate finance when relevant).
Visual language: clear finance cues—abstract candlesticks or soft trend curves (no readable numbers or axis labels), globe or city finance skyline, bullion/currency motifs, modern exchange or trading-floor energy as abstract shapes, briefcase/documents silhouette, subtle data-grid or chart texture in the background.
Tone: professional Bloomberg/Reuters-style seriousness; cinematic lighting ok. Avoid unrelated genres (sports, gaming, medical, food, fashion) unless the article is clearly about markets impact in that sector.
Hard rules: no text, no logos, no watermarks, no real bank or broker branding, no celebrity faces.`;

function safeImagePromptFallback(titleEn: string, excerptEn: string): string {
  const t = (titleEn || "").trim();
  const ex = (excerptEn || "").trim();
  const base = [t, ex].filter(Boolean).join(" — ").slice(0, 220);
  return `${ATFX_THUMBNAIL_FINANCIAL_STYLE}

Subject anchor: ${base || "global financial markets"}. Single clear focal idea, clean composition.`;
}

/** Wrap model-written scene text with mandatory finance thumbnail semantics for image models. */
function buildAtfxThumbnailImagePrompt(sceneDescription: string): string {
  const scene = (sceneDescription || "").trim();
  return `${ATFX_THUMBNAIL_FINANCIAL_STYLE}

Scene to illustrate: ${scene || "abstract global financial markets mood, editorial illustration"}.`;
}

function summarizeForActivityLog(text: string, maxLen = 280): string {
  const t = (text || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1)}…`;
}

/** Requesty `/v1/images/generations` only supports Azure GPT Image models; Gemini image models use chat completions. */
function usesRequestyOpenAiImagesGenerationsApi(model: string): boolean {
  return (model || "").toLowerCase().startsWith("azure/openai/gpt-image");
}

function bufferFromDataUrl(dataUrl: string): { mime: string; buffer: Buffer } {
  const m = dataUrl.match(/^data:([^;,]+)(;base64)?,([\s\S]*)$/);
  if (!m?.[3]) throw new Error("Invalid data URL for image.");
  const mime = (m[1] || "image/png").trim();
  if (m[2]) {
    return { mime, buffer: Buffer.from(m[3], "base64") };
  }
  return { mime, buffer: Buffer.from(decodeURIComponent(m[3])) };
}

async function imageBufferFromUrl(url: string): Promise<{ mime: string; buffer: Buffer }> {
  const u = (url || "").trim();
  if (u.startsWith("data:")) return bufferFromDataUrl(u);
  if (u.startsWith("http://") || u.startsWith("https://")) {
    const r = await fetch(u);
    if (!r.ok) throw new Error(`Failed to fetch generated image URL (${r.status}).`);
    const buf = Buffer.from(await r.arrayBuffer());
    const ct = (r.headers.get("content-type") || "image/png").split(";")[0].trim();
    return { mime: ct, buffer: buf };
  }
  throw new Error("Unsupported image URL in model response.");
}

async function extractImageFromRequestyChatAssistantMessage(
  message: unknown
): Promise<{ mime: string; buffer: Buffer } | null> {
  if (!message || typeof message !== "object") return null;
  const m = message as Record<string, unknown>;

  const images = m.images;
  if (Array.isArray(images)) {
    for (const item of images) {
      const url =
        item && typeof item === "object"
          ? (item as { image_url?: { url?: string }; url?: string }).image_url?.url ||
            (item as { url?: string }).url
          : undefined;
      if (typeof url === "string" && url.trim()) {
        try {
          return await imageBufferFromUrl(url.trim());
        } catch {
          /* try next */
        }
      }
    }
  }

  const content = m.content;
  if (Array.isArray(content)) {
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const p = part as { type?: string; image_url?: { url?: string } };
      const url = p.type === "image_url" ? p.image_url?.url : undefined;
      if (typeof url === "string" && url.trim()) {
        try {
          return await imageBufferFromUrl(url.trim());
        } catch {
          /* try next */
        }
      }
    }
  }

  return null;
}

async function callRequestyOpenAiImagesGeneration(prompt: string, model: string): Promise<{ mime: string; buffer: Buffer }> {
  const apiKey = config.requesty.apiKey;
  if (!apiKey) throw new Error("Image generation is not configured on the server.");

  let endpointLabel = config.requesty.imagesGenerationsUrl;
  try {
    endpointLabel = new URL(config.requesty.imagesGenerationsUrl).host;
  } catch {
    /* keep raw */
  }
  console.info(
    `[atfx-thumbnail] Requesty OpenAI images API: model=${model} endpoint=${endpointLabel} prompt=${JSON.stringify(summarizeForActivityLog(prompt, 400))}`
  );

  const body: Record<string, unknown> = {
    model,
    prompt: buildAtfxThumbnailImagePrompt(prompt),
    n: 1,
    size: "1536x1024",
    response_format: "b64_json",
  };

  const { res, text } = await fetchWithRetry(
    config.requesty.imagesGenerationsUrl,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": config.appBaseUrl,
        "X-Title": "ATFX Thumbnail Generator",
      },
      body: JSON.stringify(body),
    },
    { timeoutMs: 110_000, retries: 2, retryStatuses: [429, 500, 502, 503, 504], label: "requesty:images" }
  );
  let json: any = null;
  try {
    json = text ? (JSON.parse(text) as any) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    let detail =
      json?.error?.message || json?.error || text.trim().slice(0, 200) || res.statusText || "Unknown error";
    if (isHtmlDocument(text)) {
      const title = extractHtmlTitle(text);
      detail = title || "Upstream gateway returned an HTML error page.";
    }
    throw new Error(`Image generation failed (${res.status}). ${detail}`);
  }

  const b64 = json?.data?.[0]?.b64_json;
  if (typeof b64 !== "string" || !b64.trim()) {
    throw new Error("Image generation returned no image data.");
  }

  const mime = (typeof json?.data?.[0]?.mime_type === "string" && json.data[0].mime_type) || "image/png";
  recordThumbnailImageUsage(json, model);
  return { mime, buffer: Buffer.from(b64, "base64") };
}

/** Gemini and similar models: Requesty serves image output via `/v1/chat/completions` (see Requesty image-generation docs). */
async function callRequestyChatCompletionsImageGeneration(
  prompt: string,
  model: string
): Promise<{ mime: string; buffer: Buffer }> {
  const apiKey = config.requesty.apiKey;
  if (!apiKey) throw new Error("Image generation is not configured on the server.");

  let endpointLabel = config.requesty.chatCompletionsUrl;
  try {
    endpointLabel = new URL(config.requesty.chatCompletionsUrl).host;
  } catch {
    /* keep raw */
  }
  const userContent = `Generate ONE 4:3 landscape editorial thumbnail image for a financial news article.

${ATFX_THUMBNAIL_FINANCIAL_STYLE}

Scene to illustrate: ${(prompt || "").trim() || "abstract global financial markets mood"}.

Requirements: no text, no logos, no watermarks; professional look suitable for a markets news thumbnail.`;

  console.info(
    `[atfx-thumbnail] Requesty chat (image model): model=${model} endpoint=${endpointLabel} prompt=${JSON.stringify(summarizeForActivityLog(prompt, 400))}`
  );

  const body: Record<string, unknown> = {
    model,
    messages: [{ role: "user", content: userContent }],
  };

  const { res, text } = await fetchWithRetry(
    config.requesty.chatCompletionsUrl,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": config.appBaseUrl,
        "X-Title": "ATFX Thumbnail Generator",
      },
      body: JSON.stringify(body),
    },
    { timeoutMs: 120_000, retries: 2, retryStatuses: [429, 500, 502, 503, 504], label: "requesty:chat-image" }
  );

  let json: any = null;
  try {
    json = text ? (JSON.parse(text) as any) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    let detail =
      json?.error?.message || json?.error || text.trim().slice(0, 200) || res.statusText || "Unknown error";
    if (isHtmlDocument(text)) {
      const title = extractHtmlTitle(text);
      detail = title || "Upstream gateway returned an HTML error page.";
    }
    throw new Error(`Image generation failed (${res.status}). ${detail}`);
  }

  const message = json?.choices?.[0]?.message;
  const extracted = await extractImageFromRequestyChatAssistantMessage(message);
  if (extracted) {
    recordThumbnailImageUsage(json, model);
    return extracted;
  }

  throw new Error(
    "Image model returned no embedded image (expected message.images or image parts in content). Try another REQUESTY_ATFX_THUMBNAIL_IMAGE_MODEL or check Requesty logs."
  );
}

async function callRequestyImageGeneration(prompt: string): Promise<{ mime: string; buffer: Buffer }> {
  const model = config.requesty.atfxThumbnailImageModel;
  if (usesRequestyOpenAiImagesGenerationsApi(model)) {
    return callRequestyOpenAiImagesGeneration(prompt, model);
  }
  return callRequestyChatCompletionsImageGeneration(prompt, model);
}

async function generateAtfxThumbnailWithRetries(
  imagePrompt: string,
  log?: (message: string) => void
): Promise<{ mime: string; buffer: Buffer } | null> {
  const prompt = (imagePrompt || "").trim();
  if (!prompt) return null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      if (attempt > 1) {
        log?.("Retrying thumbnail image generation once…");
        await sleep(900);
      }
      log?.("Generating a thumbnail image…");
      const thumb = await callRequestyImageGeneration(prompt);
      const buffer = await normalizeAtfxThumbnailBuffer(thumb.buffer);
      log?.("Thumbnail image is ready");
      return { mime: "image/png", buffer };
    } catch (e) {
      console.warn(`[atfx-thumbnail] attempt ${attempt} failed:`, e);
      log?.(
        attempt >= 2
          ? "Thumbnail generation failed after retry (article will still be saved)."
          : "Thumbnail generation failed; will retry once…"
      );
    }
  }
  return null;
}

/** Known-good Requesty router ids for long-form JSON articles; used if primary model returns 404. */
const ARTICLE_WRITER_MODEL_FALLBACKS = WRITER_MODEL_FALLBACKS;

async function callRequestyChatWithModelChain(
  models: string[],
  messages: ChatMessage[],
  options: { temperature?: number; recency_filter?: string; max_tokens?: number } = {}
): Promise<string> {
  const chain = uniqModelChain(models);
  if (chain.length === 0) throw new Error("No LLM models configured for this request.");
  let lastErr: unknown;
  for (let i = 0; i < chain.length; i++) {
    const model = chain[i];
    try {
      return await callRequestyChat(model, messages, options);
    } catch (e) {
      lastErr = e;
      if (!isRequestyProviderFailoverError(e) || i === chain.length - 1) throw e;
      console.warn(`[atfx-article] model ${model} failed, trying fallback…`, e instanceof Error ? e.message : e);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Institutional outline step: planner model + fallbacks if the router omits gpt-4.1-mini etc. */

async function callRequestyChat(
  model: LLMModel | string,
  messages: ChatMessage[],
  options: { temperature?: number; recency_filter?: string; max_tokens?: number } = {}
): Promise<string> {
  const apiKey = config.requesty.apiKey;
  if (!apiKey) throw new Error("Article writing is not set up on the server.");

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: options.temperature ?? 0.7,
  };

  if (typeof options.max_tokens === "number" && Number.isFinite(options.max_tokens) && options.max_tokens > 0) {
    body.max_tokens = Math.floor(options.max_tokens);
  }

  if (model === "perplexity/sonar-pro" && options.recency_filter) {
    body.web_search_options = { search_recency_filter: options.recency_filter };
  }

  const { res, text: rawText } = await fetchWithRetry(
    config.requesty.chatCompletionsUrl,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": config.appBaseUrl,
        "X-Title": "ATFX Article Generator",
      },
      body: JSON.stringify(body),
    },
    { timeoutMs: 110_000, retries: 2, retryStatuses: [429, 500, 502, 503, 504], label: `requesty:${String(model)}` }
  );

  if (!res.ok) {
    const errBody = rawText;
    console.error(`Requesty ${model} error:`, res.status, errBody.slice(0, 500));
    let detail = errBody.slice(0, 800);
    if (isHtmlDocument(errBody)) {
      const title = extractHtmlTitle(errBody);
      detail = title || "Upstream gateway returned an HTML error page.";
    }
    try {
      const j = JSON.parse(errBody) as { error?: { message?: string } | string };
      if (typeof j?.error === "string") detail = j.error;
      else if (j?.error && typeof j.error === "object" && j.error.message) detail = String(j.error.message);
    } catch {
      /* keep raw slice */
    }
    throw new Error(
      `The article-writing request failed (${res.status}). ${detail ? detail.slice(0, 200) : "Please try again."}`
    );
  }

  const json: any = JSON.parse(rawText);
  const text = requestyMessageText(json?.choices?.[0]?.message);
  if (!text.trim()) {
    console.error("Requesty empty content:", JSON.stringify(json).slice(0, 500));
    throw new Error("The article-writing service returned an empty reply. Please try again.");
  }
  return text;
}

/** Article JSON step: try configured model, then fallbacks if router returns unsupported model / 404. */
async function callArticleWriterChat(
  messages: ChatMessage[],
  options: { temperature?: number; max_tokens?: number } = {}
): Promise<string> {
  const primary = config.requesty.claudeArticleModel.trim() || ARTICLE_WRITER_MODEL_FALLBACKS[0];
  const chain = buildSonnetWriterModelChain(primary);
  return callRequestyChatWithModelChain(chain, messages, options);
}

/** Translation step: prefer GPT-4o mini (fast, stable JSON), then fall back to article writer chain. */
async function callTranslationChat(
  messages: ChatMessage[],
  options: { temperature?: number; max_tokens?: number } = {}
): Promise<string> {
  const chain = buildSonnetWriterModelChain(
    config.requesty.claudeArticleModel.trim() || undefined
  );
  chain.unshift("openai/gpt-4o-mini");
  return callRequestyChatWithModelChain(uniqModelChain(chain), messages, options);
}

async function callPerplexityChatDirect(
  messages: ChatMessage[],
  options: { temperature?: number; recency_filter?: string; max_tokens?: number } = {}
): Promise<string> {
  const apiKey = config.perplexity.apiKey;
  if (!apiKey) throw new Error("Perplexity is not configured on the server (missing PERPLEXITY_API_KEY).");

  const body: Record<string, unknown> = {
    model: "sonar-pro",
    messages,
    temperature: options.temperature ?? 0,
  };

  if (typeof options.max_tokens === "number" && Number.isFinite(options.max_tokens) && options.max_tokens > 0) {
    body.max_tokens = Math.floor(options.max_tokens);
  }

  if (options.recency_filter) {
    // Perplexity supports a recency filter on its search-enabled models.
    body.search_recency_filter = options.recency_filter;
  }

  const { res, text: bodyText } = await fetchWithRetry(
    config.perplexity.chatCompletionsUrl,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    },
    { timeoutMs: 90_000, retries: 2, retryStatuses: [429, 500, 502, 503, 504], label: "perplexity:sonar-pro" }
  );

  if (!res.ok) {
    const errBody = bodyText;
    console.error("Perplexity direct error:", res.status, errBody.slice(0, 500));
    let detail = errBody.slice(0, 800);
    if (isHtmlDocument(errBody)) {
      const title = extractHtmlTitle(errBody);
      detail = title || "Upstream gateway returned an HTML error page.";
    }
    try {
      const j = JSON.parse(errBody) as { error?: { message?: string } | string };
      if (typeof j?.error === "string") detail = j.error;
      else if (j?.error && typeof j.error === "object" && j.error.message) detail = String(j.error.message);
    } catch {
      /* keep raw slice */
    }
    throw new Error(
      `Perplexity request failed (${res.status}). ${detail ? detail.slice(0, 200) : "Please try again."}`
    );
  }

  const json: any = JSON.parse(bodyText);
  const messageText = requestyMessageText(json?.choices?.[0]?.message);
  if (!messageText.trim()) {
    console.error("Perplexity empty content:", JSON.stringify(json).slice(0, 500));
    throw new Error("Perplexity returned an empty reply. Please try again.");
  }
  return messageText;
}

/**
 * Perplexity web research for article prep; if the router does not expose sonar-pro, fall back to a plain chat model (no live search).
 */
async function callAtfxResearchChat(userPrompt: string, log?: (message: string) => void): Promise<string> {
  try {
    if (!config.perplexity.apiKey?.trim()) {
      log?.("Research: search unavailable — using another path…");
    } else {
      log?.("Research: gathering sources…");
    }
    return await callPerplexityChatDirect([{ role: "user", content: userPrompt }], {
      temperature: 0,
      recency_filter: "week",
    });
  } catch (e) {
    log?.("Research: trying another search path…");
    console.warn("[atfx-article] Perplexity direct research failed; falling back to Requesty", e);
    try {
      log?.("Research: gathering sources…");
      return await callRequestyChat(
        "perplexity/sonar-pro",
        [{ role: "user", content: userPrompt }],
        { temperature: 0, recency_filter: "week" }
      );
    } catch (e2) {
      if (!isUnsupportedRequestyModelError(e2)) throw e2;
      log?.("Web-search research model unavailable; using a fallback model (no live search)…");
      console.warn(
        "[atfx-article] perplexity/sonar-pro unavailable for research; falling back to openai/gpt-4o-mini",
        e2
      );
      return callRequestyChatWithModelChain(
        ["openai/gpt-4o-mini", "openai/gpt-4o"],
        [{ role: "user", content: userPrompt }],
        { temperature: 0.2 }
      );
    }
  }
}

async function generateRetailArticle(
  title: string,
  summary: string,
  source: string,
  options?: Partial<ArticleOptions> | null,
  log?: (message: string) => void
): Promise<{
  titleEn: string;
  titleTc: string;
  excerptEn: string;
  excerptTc: string;
  contentEn: string;
  contentTc: string;
  charts: ArticleChartEmbed[];
  imagePrompt?: string;
  thumbnail?: { mime: string; buffer: Buffer } | null;
}> {
  const opts = normalizeArticleOptions(options);
  log?.("Looking up prices for symbols in this topic…");
  const topicText = `${title} ${summary}`;
  const chartPlan = planContentCharts(topicText);
  log?.(`Chart plan: ${formatContentChartBrief(chartPlan)}`);
  const symbols = chartPlan.priceSymbols.length ? chartPlan.priceSymbols : detectFinancialSymbols(topicText);
  const quotes = await fetchPriceQuotes(symbols);
  const priceContext = Array.from(quotes.entries())
    .map(([sym, price]) => `${sym}: ${price}`)
    .join(", ");

  const researchPrompt = `Research the following financial topic thoroughly. Focus on recent market developments, key price levels, and expert analysis.

Topic: ${title}
Context: ${summary}
Source category: ${source}
${priceContext ? `Current prices: ${priceContext}` : ""}

Provide a comprehensive research summary including:
1. Recent market movements and catalysts
2. Key support/resistance levels or price targets
3. Expert opinions and institutional views
4. Potential market impact and outlook

Do not use citation markers like [1], [2], or [3] — write plain prose only.`;

  log?.("Gathering recent market research…");
  const research = await callAtfxResearchChat(researchPrompt, log);

  const charts = await executeContentChartPlan(chartPlan, {
    priceInterval: "1D",
    maxPrice: 3,
    maxEconomic: maxEconomicChartsAllowed(topicText),
  });
  log?.(
    charts.length
      ? `Charts ready: ${charts.map((c) => `${c.kind === "economic" ? "macro" : "OHLC"} — ${c.caption}`).join("; ")}`
      : "No charts generated (check server log for [atfx-charts] warnings)."
  );

  const writingPrompt = `You are a senior financial journalist at Bloomberg. Write a professional, authoritative article based on this research.

RESEARCH:
${stripCitationMarkers(research)}

EDITORIAL BRIEF (seed only — do not treat this as the article headline): ${title}
${priceContext ? `VERIFIED PRICES: ${priceContext}` : ""}
${formatArticleChartsWriterBlock(charts)}
REQUIREMENTS:
- Apply E-E-A-T principles (Experience, Expertise, Authoritativeness, Trustworthiness)
- Professional Bloomberg-style tone, human-readable
- ${opts.length} words
- SEO optimized with natural keyword integration
- Include specific data points, price levels, and quotes where relevant
- Structure: compelling hook → market context → analysis → outlook
- Writing style: ${opts.style === "bullet" ? "bullet / point form where appropriate (use <ul><li> for lists; keep list items punchy and information-dense)" : "normal paragraph writing (use <p> as the default)"}
- CRITICAL: Do not include citation markers such as [1], [2], [3] or any bracketed numbers anywhere — no footnote-style references in titles, excerpts, or HTML.

HTML BODY for \`content_en\` and \`content_tc\` (critical — the portal renders real HTML):
- Each value MUST be a single \`<article>...</article>\` wrapper containing **only** semantic HTML — no Markdown, no bare line breaks as paragraphs, no \`#\` headings.
- **Start with one or more \`<p>\` paragraphs** (hook / lead / context). Do **not** put any \`<h2>\` before this opening block.
- Do **not** use \`<h2>Executive Summary</h2>\`, \`<h2>Summary</h2>\`, or similar as the first element — the page title and excerpt already serve that role.
- After the opening paragraph(s), use \`<h2>\` for each subsequent section title (major thematic blocks). Do not use \`<h1>\` inside the body.
- Use \`<p>\` for all normal paragraph text (one \`<p>\` per paragraph).
- Typical pattern: \`<article><p>Opening paragraph...</p><h2>Next section</h2><p>...</p><h2>Another section</h2><p>...</p></article>\`. You may add \`<ul><li>…</li></ul>\` or \`<strong>…</strong>\` where appropriate.

HEADLINES (critical):
- After you write the body, set \`title_en\` and \`title_tc\` to **new** headlines that match **this article’s** hook, specifics, and angle.
- Do **not** copy, translate, or lightly rephrase the editorial brief above into \`title_en\` or \`title_tc\`. The brief may be Traditional Chinese and SEO-oriented for planning; the English title must read like a native financial headline for English readers and SERPs, and the Chinese title must fit the finished piece—not a mirror of the brief unless the article truly warrants the same wording.
- If the brief and the research diverge, the titles must follow the **research and the article you wrote**, not the brief alone.

OUTPUT FORMAT (JSON):
{
  "title_en": "SEO-optimized English title",
  "excerpt_en": "2-3 sentence English excerpt/summary",
  "content_en": "<article><p>Opening paragraph with hook and key facts...</p><h2>Market context</h2><p>...</p><h2>Outlook</h2><p>...</p></article>",
  "image_prompt": "One concise scene for a 4:3 landscape financial-markets thumbnail: tie visuals to the article thesis (FX, indices, commodities, rates, macro, energy, M&A, etc.). Name 2–4 concrete visual elements (e.g. abstract candlesticks, skyline, bullion, currency shapes, chart texture without numbers). Professional editorial style. No text, no logos, no watermarks."
}

Return ONLY valid JSON. Never use [1], [2], or any bracketed citation numbers in the JSON.`;

  log?.("Writing the article in English…");
  const maxTokensEn = opts.length === "1400-1500" ? 12_000 : 8000;
  let en: { titleEn: string; excerptEn: string; contentEn: string; imagePrompt?: string } | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const rawEn = await callArticleWriterChat(
      [
        {
          role: "system",
          content:
            "You are a professional financial journalist. Return only valid JSON with ALL keys: title_en, excerpt_en, content_en, image_prompt. title_en must be an original headline for the article you produce—not a copy/translation of the editorial brief line. image_prompt must describe one 4:3 landscape financial-markets thumbnail scene (investing/macro/trading visual cues—abstract charts without readable numbers, skyline, commodities, FX, etc.); no text, no logos, no watermarks. Never output citation markers like [1] or [2] in any field. In content_en, open <article> with <p> paragraphs first; do not lead with <h2>Executive Summary</h2>. Use <h2> only for section titles after the opening block. Real HTML inside <article> — not Markdown. Escape any double quotes inside HTML as &quot; so the JSON stays valid. Use \\n for line breaks inside string values — never raw newlines inside JSON strings.",
        },
        attempt === 1
          ? { role: "user", content: writingPrompt }
          : {
              role: "user",
              content:
                `${writingPrompt}\n\nIMPORTANT: Your previous response was not valid, complete JSON (it may have been truncated). Return ONLY a single complete JSON object exactly in the specified schema, with all required keys present. Do not include any extra text.`,
            },
      ],
      { temperature: 0.6, max_tokens: maxTokensEn }
    );
    try {
      en = parseEnglishOnlyJson(rawEn);
      break;
    } catch (e) {
      if (attempt >= 2) throw e;
      console.info("[atfx-article] English JSON parse failed on attempt 1; retrying with stricter prompt.");
      log?.("Still writing your article…");
    }
  }

  if (!en) throw new Error("The English article reply was not usable.");
  const imagePrompt = (en.imagePrompt || "").trim() || safeImagePromptFallback(en.titleEn, en.excerptEn);
  if (!(en.imagePrompt || "").trim()) {
    log?.("The model did not return image_prompt; using a safe derived thumbnail prompt instead.");
  }
  const thumbnail = await generateAtfxThumbnailWithRetries(imagePrompt, log);

  log?.("Translating the article to Traditional Chinese…");
  const translatePrompt = `Translate the following English financial article into Traditional Chinese (繁體中文).

CRITICAL REQUIREMENTS:
- Return ONLY valid JSON (no extra text, no Markdown fences).
- Preserve the HTML structure in content_tc exactly: keep all tags (<article>, <h2>, <p>, <ul>, <li>, <strong>, etc.) in the same places; translate only the human-readable text nodes.
- Do not add, remove, or reorder sections.
- Do not include citation markers like [1], [2], or any bracketed numbers anywhere.

INPUT JSON:
{
  "title_en": ${JSON.stringify(en.titleEn)},
  "excerpt_en": ${JSON.stringify(en.excerptEn)},
  "content_en": ${JSON.stringify(en.contentEn)}
}

OUTPUT JSON (Traditional Chinese only):
{
  "title_tc": "繁體中文標題",
  "excerpt_tc": "繁體中文摘要（2-3句）",
  "content_tc": "<article>...</article>"
}`;

  const maxTokensTc = opts.length === "1400-1500" ? 10_000 : 6000;
  let tc: { titleTc: string; excerptTc: string; contentTc: string } | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const rawTc = await callTranslationChat(
      [
        {
          role: "system",
          content:
            "You are a professional translator for financial news. Return only valid JSON. Preserve HTML tags and structure; translate text only. Escape double quotes in HTML as &quot; so JSON stays valid; use \\n for breaks inside strings — never raw newlines inside JSON strings.",
        },
        attempt === 1
          ? { role: "user", content: translatePrompt }
          : {
              role: "user",
              content:
                `${translatePrompt}\n\nIMPORTANT: Your previous response was not valid, complete JSON (it may have been truncated). Return ONLY a single complete JSON object exactly in the specified schema, with all required keys present. Do not include any extra text.`,
            },
      ],
      { temperature: 0.2, max_tokens: maxTokensTc }
    );
    try {
      tc = parseTraditionalChineseOnlyJson(rawTc);
      break;
    } catch (e) {
      if (attempt >= 2) throw e;
      console.info("[atfx-article] Chinese JSON parse failed on attempt 1; retrying with stricter prompt.");
      log?.("Still translating…");
    }
  }

  if (!tc) throw new Error("The Chinese translation reply was not usable.");

  log?.("Article draft is ready");
  return {
    titleEn: en.titleEn,
    titleTc: tc.titleTc,
    excerptEn: en.excerptEn,
    excerptTc: tc.excerptTc,
    contentEn: en.contentEn,
    contentTc: tc.contentTc,
    charts,
    imagePrompt,
    thumbnail,
  };
}

async function generateInstitutionalArticle(
  title: string,
  summary: string,
  source: string,
  options?: Partial<ArticleOptions> | null,
  log?: (message: string) => void
): Promise<{
  titleEn: string;
  titleTc: string;
  excerptEn: string;
  excerptTc: string;
  contentEn: string;
  contentTc: string;
  charts: ArticleChartEmbed[];
  imagePrompt?: string;
  thumbnail?: { mime: string; buffer: Buffer } | null;
}> {
  const opts = normalizeArticleOptions(options);
  log?.("Looking up prices for symbols in this topic…");
  const topicText = `${title} ${summary}`;
  const chartPlan = planContentCharts(topicText);
  log?.(`Chart plan: ${formatContentChartBrief(chartPlan)}`);
  const symbols = chartPlan.priceSymbols.length ? chartPlan.priceSymbols : detectFinancialSymbols(topicText);
  const quotes = await fetchPriceQuotes(symbols);
  const priceContext = Array.from(quotes.entries())
    .map(([sym, price]) => `${sym}: ${price}`)
    .join(", ");

  const outlinePrompt = `You are a research analyst planning institutional-grade financial content.

Topic: ${title}
Context: ${summary}
${priceContext ? `Current prices: ${priceContext}` : ""}

Create a 3-4 point research outline for a comprehensive institutional investor article. Each point should cover a distinct analytical angle.

Return ONLY a JSON array of research points:
["Point 1: ...", "Point 2: ...", "Point 3: ...", "Point 4: ..."]`;

  const outlinePrimary = config.requesty.institutionalOutlineModel.trim() || PLAN_MODEL_FALLBACKS[0];
  const outlineChain = buildPlanModelChain(outlinePrimary);

  // For shorter articles (700–800 words), keep research to a single web-search call to reduce latency/cost.
  const researchScraps: string[] = [];
  if (opts.length === "700-800") {
    const researchPrompt = `Research the following financial topic thoroughly for institutional investors.

Topic: ${title}
Context: ${summary}
${priceContext ? `Current prices: ${priceContext}` : ""}

Provide a structured research summary with:
1) Market context & catalysts
2) Institutional positioning / macro drivers
3) Key levels / data points
4) Risks & outlook

Do not use citation markers like [1], [2], or [3] — plain prose only.`;
    log?.("Gathering research (1 of 1)…");
    const scrap = await callAtfxResearchChat(researchPrompt, log);
    researchScraps.push(`### Institutional research summary\n${stripCitationMarkers(scrap)}`);
  } else {
    log?.("Planning the article structure…");
    const outlineJson = await callRequestyChatWithModelChain(
      outlineChain,
      [
        { role: "system", content: "Return only valid JSON array." },
        { role: "user", content: outlinePrompt },
      ],
      { temperature: 0.5 }
    );

    let outlinePoints: string[] = [];
    try {
      const match = outlineJson.match(/\[[\s\S]*\]/);
      if (match) outlinePoints = JSON.parse(match[0]);
    } catch {
      outlinePoints = [
        "Market dynamics and recent price action",
        "Fundamental analysis and valuation metrics",
        "Technical analysis and key levels",
        "Risk factors and institutional outlook",
      ];
    }

    const points = outlinePoints.slice(0, 4);
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const researchPrompt = `Research this specific aspect of the topic for institutional investors:

Main Topic: ${title}
Research Focus: ${point}
${priceContext ? `Current prices: ${priceContext}` : ""}

Provide detailed, data-driven research with specific figures, institutional views, and analytical insights. Do not use citation markers like [1], [2], or [3] — plain prose only.`;

      log?.(`Gathering research (${i + 1} of ${points.length})…`);
      const scrap = await callAtfxResearchChat(researchPrompt, log);
      researchScraps.push(`### ${point}\n${stripCitationMarkers(scrap)}`);
    }
  }

  const charts = await executeContentChartPlan(chartPlan, {
    priceInterval: "1W",
    maxPrice: 3,
    maxEconomic: maxEconomicChartsAllowed(topicText),
  });
  log?.(
    charts.length
      ? `Charts ready: ${charts.map((c) => `${c.kind === "economic" ? "macro" : "OHLC"} — ${c.caption}`).join("; ")}`
      : "No charts generated (check server log for [atfx-charts] warnings)."
  );

  const synthesisPrompt = `You are a senior research analyst at a top investment bank. Synthesize this multi-faceted research into a cohesive, professional article for institutional investors.

RESEARCH SECTIONS:
${researchScraps.join("\n\n")}

EDITORIAL BRIEF (seed only — do not treat this as the article headline): ${title}
${priceContext ? `VERIFIED PRICES: ${priceContext}` : ""}
${formatArticleChartsWriterBlock(charts)}
REQUIREMENTS:
- Institutional-grade analysis with sophisticated language
- Apply E-E-A-T principles
- ${opts.length} words
- Bloomberg/FT style - authoritative, data-driven
- Include specific metrics, valuations, and institutional positioning
- Structure: lead paragraphs (executive-style opening in \`<p>\`, **no** “Executive Summary” subheading) → multi-angle analysis → investment implications
- Writing style: ${opts.style === "bullet" ? "bullet / point form where appropriate (use <ul><li> for lists; keep list items punchy and information-dense)" : "normal paragraph writing (use <p> as the default)"}
- CRITICAL: Do not include citation markers such as [1], [2], [3] or bracketed numbers in any field — no footnote-style references in titles, excerpts, or HTML.

HTML BODY for \`content_en\` and \`content_tc\` (critical — the portal renders real HTML):
- Each value MUST be a single \`<article>...</article>\` wrapper containing **only** semantic HTML — no Markdown, no bare line breaks as paragraphs, no \`#\` headings.
- **Start with one or more \`<p>\` paragraphs** (institutional lead / thesis / key takeaways). Do **not** put any \`<h2>\` before this opening block.
- Do **not** use \`<h2>Executive Summary</h2>\`, \`<h2>Summary</h2>\`, or similar as the first element — title and excerpt already frame the piece.
- After the opening paragraph(s), use \`<h2>\` for each subsequent section title. Do not use \`<h1>\` inside the body.
- Use \`<p>\` for all normal paragraph text (one \`<p>\` per paragraph).
- Typical pattern: \`<article><p>Opening institutional lead...</p><h2>Analysis</h2><p>...</p><h2>Implications</h2><p>...</p></article>\`. You may add \`<ul><li>…</li></ul>\` or \`<strong>…</strong>\` where appropriate.

HEADLINES (critical):
- Set \`title_en\` and \`title_tc\` to **new** Bloomberg/terminal-style headlines that summarize **this synthesized article** (its main thesis and material facts).
- Do **not** copy, translate, or lightly rephrase the editorial brief above. Institutional titles must reflect the evidence and narrative in your draft, not the planning-line wording from an earlier workflow step.

OUTPUT FORMAT (JSON):
{
  "title_en": "SEO-optimized English title for institutional audience",
  "excerpt_en": "2-3 sentence English executive summary",
  "content_en": "<article><p>Opening lead with thesis and key facts...</p><h2>Multi-angle analysis</h2><p>...</p><h2>Investment implications</h2><p>...</p></article>",
  "image_prompt": "One concise scene for a 4:3 landscape financial-markets thumbnail: tie visuals to the article thesis (FX, indices, commodities, rates, macro, energy, M&A, etc.). Name 2–4 concrete visual elements (e.g. abstract candlesticks, skyline, bullion, currency shapes, chart texture without numbers). Professional editorial style. No text, no logos, no watermarks."
}

Return ONLY valid JSON. Never use [1], [2], or any bracketed citation numbers in the JSON.`;

  log?.("Writing the article in English…");
  const maxTokensEn = opts.length === "1400-1500" ? 12_000 : 8000;
  let en: { titleEn: string; excerptEn: string; contentEn: string; imagePrompt?: string } | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const rawEn = await callArticleWriterChat(
      [
        {
          role: "system",
          content:
            "You are a senior investment research analyst. Return only valid JSON with ALL keys: title_en, excerpt_en, content_en, image_prompt. title_en must be an original wire-style headline for the article you produce—not a copy/translation of the editorial brief line. image_prompt must describe one 4:3 landscape financial-markets thumbnail scene (institutional macro/trading visual language—abstract data curves without readable numbers, markets skyline, rates/FX/commodities motifs as appropriate); no text, no logos, no watermarks. Never output citation markers like [1] or [2] in any field. In content_en, open <article> with <p> paragraphs first; do not lead with <h2>Executive Summary</h2>. Use <h2> only for section titles after the opening block. Real HTML inside <article> — not Markdown. Escape any double quotes inside HTML as &quot; so the JSON stays valid. Use \\n for line breaks inside string values — never raw newlines inside JSON strings.",
        },
        attempt === 1
          ? { role: "user", content: synthesisPrompt }
          : {
              role: "user",
              content:
                `${synthesisPrompt}\n\nIMPORTANT: Your previous response was not valid, complete JSON (it may have been truncated). Return ONLY a single complete JSON object exactly in the specified schema, with all required keys present. Do not include any extra text.`,
            },
      ],
      { temperature: 0.55, max_tokens: maxTokensEn }
    );

    try {
      en = parseEnglishOnlyJson(rawEn);
      break;
    } catch (e) {
      if (attempt >= 2) throw e;
      console.info("[atfx-article] English JSON parse failed on attempt 1; retrying with stricter prompt.");
      log?.("Still writing your article…");
    }
  }

  if (!en) throw new Error("The English article reply was not usable.");
  const imagePrompt = (en.imagePrompt || "").trim() || safeImagePromptFallback(en.titleEn, en.excerptEn);
  if (!(en.imagePrompt || "").trim()) {
    log?.("The model did not return image_prompt; using a safe derived thumbnail prompt instead.");
  }
  const thumbnail = await generateAtfxThumbnailWithRetries(imagePrompt, log);

  log?.("Translating the article to Traditional Chinese…");
  const translatePrompt = `Translate the following English financial article into Traditional Chinese (繁體中文).

CRITICAL REQUIREMENTS:
- Return ONLY valid JSON (no extra text, no Markdown fences).
- Preserve the HTML structure in content_tc exactly: keep all tags (<article>, <h2>, <p>, <ul>, <li>, <strong>, etc.) in the same places; translate only the human-readable text nodes.
- Do not add, remove, or reorder sections.
- Do not include citation markers like [1], [2], or any bracketed numbers anywhere.

INPUT JSON:
{
  "title_en": ${JSON.stringify(en.titleEn)},
  "excerpt_en": ${JSON.stringify(en.excerptEn)},
  "content_en": ${JSON.stringify(en.contentEn)}
}

OUTPUT JSON (Traditional Chinese only):
{
  "title_tc": "機構投資者繁體中文標題",
  "excerpt_tc": "繁體中文摘要（2-3句）",
  "content_tc": "<article>...</article>"
}`;

  const maxTokensTc = opts.length === "1400-1500" ? 10_000 : 6000;
  let tc: { titleTc: string; excerptTc: string; contentTc: string } | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const rawTc = await callTranslationChat(
      [
        {
          role: "system",
          content:
            "You are a professional translator for financial news. Return only valid JSON. Preserve HTML tags and structure; translate text only. Escape double quotes in HTML as &quot; so JSON stays valid; use \\n for breaks inside strings — never raw newlines inside JSON strings.",
        },
        attempt === 1
          ? { role: "user", content: translatePrompt }
          : {
              role: "user",
              content:
                `${translatePrompt}\n\nIMPORTANT: Your previous response was not valid, complete JSON (it may have been truncated). Return ONLY a single complete JSON object exactly in the specified schema, with all required keys present. Do not include any extra text.`,
            },
      ],
      { temperature: 0.2, max_tokens: maxTokensTc }
    );
    try {
      tc = parseTraditionalChineseOnlyJson(rawTc);
      break;
    } catch (e) {
      if (attempt >= 2) throw e;
      console.info("[atfx-article] Chinese JSON parse failed on attempt 1; retrying with stricter prompt.");
      log?.("Still translating…");
    }
  }

  if (!tc) throw new Error("The Chinese translation reply was not usable.");

  log?.("Article draft is ready");
  return {
    titleEn: en.titleEn,
    titleTc: tc.titleTc,
    excerptEn: en.excerptEn,
    excerptTc: tc.excerptTc,
    contentEn: en.contentEn,
    contentTc: tc.contentTc,
    charts,
    imagePrompt,
    thumbnail,
  };
}

function parseArticleJson(raw: string): {
  titleEn: string;
  titleTc: string;
  excerptEn: string;
  excerptTc: string;
  contentEn: string;
  contentTc: string;
} {
  let payload = raw.trim();
  const fence = payload.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/im);
  if (fence) payload = fence[1].trim();

  let parsed: Record<string, string>;
  try {
    parsed = parseLlmJsonRecord(payload);
  } catch {
    throw new Error("The article reply was incomplete or invalid.");
  }

  const contentEn = stripCitationMarkers(stripOuterArticleWrapper(parsed.content_en || parsed.Content_EN || ""));
  const contentTc = stripCitationMarkers(stripOuterArticleWrapper(parsed.content_tc || parsed.Content_TC || ""));
  return {
    titleEn: stripCitationMarkers(parsed.title_en || parsed.Title_EN || ""),
    titleTc: stripCitationMarkers(parsed.title_tc || parsed.Title_TC || ""),
    excerptEn: stripCitationMarkers(parsed.excerpt_en || parsed.Excerpt_EN || ""),
    excerptTc: stripCitationMarkers(parsed.excerpt_tc || parsed.Excerpt_TC || ""),
    contentEn,
    contentTc,
  };
}

function embedChartsInContent(content: string, charts: ArticleChartEmbed[]): string {
  if (charts.length === 0) return content;

  const economic = charts.filter((c) => c.kind === "economic");
  const price = charts.filter((c) => c.kind === "price");

  const buildEconomicCell = (chart: ArticleChartEmbed) => {
    const alt = escapeHtmlAttr(chart.caption);
    const fileName = escapeHtmlAttr(chart.fileName ?? chart.caption);
    return `<p><img src="${chart.src}" alt="${alt}" data-filename="${fileName}.png" style="max-width:100%;height:auto;border-radius:8px;" /></p>`;
  };

  const buildSoloEconomicCell = (chart: ArticleChartEmbed) =>
    tagSoloEconomicChartBlock(buildEconomicCell(chart));

  const buildPriceFigure = (chart: ArticleChartEmbed) => {
    const caption = escapeHtmlAttr(chart.caption);
    const fileName = escapeHtmlAttr(chart.fileName ?? chart.caption);
    return `<figure style="margin:1.5rem 0;"><img src="${chart.src}" alt="${caption}" data-filename="${fileName}.png" style="max-width:100%;height:auto;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);" /><figcaption style="font-size:0.85rem;color:#666;margin-top:0.5rem;text-align:center;">${caption}</figcaption></figure>`;
  };

  const economicHtml =
    economic.length === 0
      ? ""
      : economic.length === 1
        ? buildSoloEconomicCell(economic[0])
        : wrapEconomicChartGrid(economic.map(buildEconomicCell));

  const chartHtml = economicHtml + price.map(buildPriceFigure).join("");

  const insertPoint = content.indexOf("</article>");
  if (insertPoint > 0) {
    return content.slice(0, insertPoint) + chartHtml + content.slice(insertPoint);
  }

  const bodyMatch = content.match(/<\/p>/i);
  if (bodyMatch && bodyMatch.index) {
    const idx = bodyMatch.index + 4;
    return content.slice(0, idx) + chartHtml + content.slice(idx);
  }

  return content + chartHtml;
}

/** Prefer charts in HTML, but stay under Airtable long-text limits (base64 images are huge). */
function embedChartsForAirtable(content: string, charts: ArticleChartEmbed[]): string {
  if (charts.length === 0) return content;

  const ordered = [...charts].sort((a, b) => {
    if (a.kind === b.kind) return 0;
    return a.kind === "economic" ? -1 : 1;
  });

  let result = content;
  let embedded = 0;
  for (const chart of ordered) {
    const candidate = embedChartsInContent(result, [chart]);
    if (candidate.length <= AIRTABLE_LONG_TEXT_SAFE_CHARS) {
      result = candidate;
      embedded++;
    } else {
      console.warn(
        `[atfx-article] Skipping chart "${chart.caption}" (${chart.kind}): would exceed ${AIRTABLE_LONG_TEXT_SAFE_CHARS} chars (${candidate.length})`
      );
    }
  }

  if (embedded < charts.length) {
    console.warn(`[atfx-article] Embedded ${embedded}/${charts.length} chart(s) within Airtable size limit`);
  }
  return result;
}

/** Maps generated article → Airtable fields (defaults in config: Title_EN, Title_TC, Excerpt_EN, Excerpt_TC, Content_EN, Content_TC). */
function buildAtfxArticleAirtableFields(
  article: {
    titleEn: string;
    titleTc: string;
    excerptEn: string;
    excerptTc: string;
    contentEn: string;
    contentTc: string;
  },
  sourceTopicRecordId: string,
  articleTypeLabel: string,
  thumbnailUrl?: string
): Record<string, string> {
  const a = config.airtable;
  const fields: Record<string, string> = {
    [a.atfxArticleFieldTitleEn]: article.titleEn,
    [a.atfxArticleFieldTitleTc]: article.titleTc,
    [a.atfxArticleFieldExcerptEn]: article.excerptEn,
    [a.atfxArticleFieldExcerptTc]: article.excerptTc,
    [a.atfxArticleFieldContentEn]: article.contentEn,
    [a.atfxArticleFieldContentTc]: article.contentTc,
  };
  if (a.atfxArticleFieldName) {
    fields[a.atfxArticleFieldName] = article.titleEn;
  }
  if (a.atfxArticleFieldSourceTopicId) {
    fields[a.atfxArticleFieldSourceTopicId] = sourceTopicRecordId;
  }
  if (a.atfxArticleFieldGeneratedAt) {
    fields[a.atfxArticleFieldGeneratedAt] = new Date().toISOString();
  }
  if (a.atfxArticleFieldArticleType) {
    fields[a.atfxArticleFieldArticleType] = articleTypeLabel;
  }
  if (a.atfxArticleFieldCategory) {
    fields[a.atfxArticleFieldCategory] =
      articleTypeLabel === "Institutional" ? "institutional" : "Retail";
  }
  const companyField = a.atfxArticleFieldCompany?.trim();
  if (companyField) {
    fields[companyField] = "ATFX";
  }
  const thumbField = a.atfxArticleFieldThumbnailUrl?.trim();
  if (thumbField && thumbnailUrl?.trim()) {
    fields[thumbField] = thumbnailUrl.trim();
  }
  return fields;
}

async function createAtfxArticleAirtableRow(
  airtableInstance: any,
  sourceTopicRecordId: string,
  article: {
    titleEn: string;
    titleTc: string;
    excerptEn: string;
    excerptTc: string;
    contentEn: string;
    contentTc: string;
    charts: ArticleChartEmbed[];
  },
  articleTypeLabel: string,
  thumbnailUrl?: string
): Promise<{ id?: string }> {
  const contentEnForSave = stripOuterArticleWrapper(embedChartsForAirtable(article.contentEn, article.charts));
  const contentTcForSave = stripOuterArticleWrapper(embedChartsForAirtable(article.contentTc, article.charts));
  const tableId = config.airtable.atfxGeneratedArticleTableId;
  const outputTable = airtableInstance(tableId) as any;
  const airtableFields = buildAtfxArticleAirtableFields(
    {
      titleEn: article.titleEn,
      titleTc: article.titleTc,
      excerptEn: article.excerptEn,
      excerptTc: article.excerptTc,
      contentEn: contentEnForSave,
      contentTc: contentTcForSave,
    },
    sourceTopicRecordId,
    articleTypeLabel,
    thumbnailUrl
  );
  return outputTable.create(airtableFields);
}

function airtableErrorMessage(err: unknown): string {
  if (err == null) return "Unknown error";
  if (typeof err === "string") return err;
  const e = err as { message?: string; error?: string | { message?: string; type?: string } };
  if (typeof e.message === "string" && e.message) return e.message;
  if (typeof e.error === "string" && e.error) return e.error;
  if (e.error && typeof e.error === "object" && typeof e.error.message === "string") return e.error.message;
  try {
    return JSON.stringify(err).slice(0, 500);
  } catch {
    return String(err);
  }
}

export {
  generateRetailArticle,
  generateInstitutionalArticle,
  createAtfxArticleAirtableRow,
  airtableErrorMessage,
  callRequestyImageGeneration,
  generateAtfxThumbnailWithRetries,
  safeImagePromptFallback,
};

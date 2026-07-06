import { callRequestyChat, extractFirstJsonObject, TRANSLATE_TIMEOUT_MS } from "./atfxResearchRequesty.js";
import { getBrokerageUsageContext } from "./brokerageTokenBilling.js";
import { listReportSections } from "./atfxReportHtmlSections.js";
import { config } from "./config.js";
import type { ReportLanguage } from "./atfxResearchReportOptions.js";

export type ReportLocaleBundle = {
  title: string;
  report_html: string;
  seo_excerpt?: string;
};

export type ReportI18nContent = Partial<Record<ReportLanguage, ReportLocaleBundle>>;

export type TranslateProgressCallbacks = {
  onProgress?: (message: string) => void;
  onPartialHtml?: (html: string) => void;
};

const TRANSLATE_SYSTEM =
  "You are a professional financial translator. Return only valid JSON. Preserve HTML tags and attributes; translate human-readable text only. Never copy instruction or date-context text from the prompt into the HTML output.";

/** Placeholder for img/chart blocks — must not be translated or split mid-token. */
const PRESERVE_TOKEN_PREFIX = "__ATFX_PRESERVE_";
const PRESERVE_TOKEN_RE = new RegExp(`${PRESERVE_TOKEN_PREFIX}\\d+__`, "g");

const ECON_CHARTS_GRID_RE =
  /<div class="atfx-econ-charts-grid">\s*(?:<div class="atfx-econ-charts-grid__cell">[\s\S]*?<\/div>\s*)+<\/div>/gi;

const SOLO_ECON_CHART_BLOCK_RE =
  /<(?:p|figure)[^>]*\batfx-econ-chart-solo\b[^>]*>[\s\S]*?<\/(?:p|figure)>/gi;

type PreservedHtml = {
  masked: string;
  tokens: string[];
};

function maskPreservedHtmlBlocks(html: string): PreservedHtml {
  const tokens: string[] = [];
  let masked = html;

  const stash = (block: string): string => {
    const key = `${PRESERVE_TOKEN_PREFIX}${tokens.length}__`;
    tokens.push(block);
    return key;
  };

  masked = masked.replace(ECON_CHARTS_GRID_RE, (block) => stash(block));
  masked = masked.replace(SOLO_ECON_CHART_BLOCK_RE, (block) => stash(block));
  masked = masked.replace(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi, (block) =>
    /<img\b/i.test(block) ? stash(block) : block
  );
  masked = masked.replace(/<img\b[^>]*>/gi, (tag) => stash(tag));

  return { masked, tokens };
}

function unmaskPreservedHtmlBlocks(html: string, tokens: string[]): string {
  if (!tokens.length) return html;
  return html.replace(PRESERVE_TOKEN_RE, (key) => {
    const idx = Number(key.slice(PRESERVE_TOKEN_PREFIX.length, -2));
    return tokens[idx] ?? key;
  });
}

/** Drop date-context instructions if the model echoed them into body HTML. */
function stripLeakedDateContext(html: string): string {
  return html
    .replace(
      /TODAY'S DATE \(publication \/ as-of\):[\s\S]*?Do not invent dates from training data or copy example dates from instructions\.\s*/gi,
      ""
    )
    .replace(
      /今天的日期[（(][^)）]*[)）][：:][^<]*?(?:使用此日期[^<]*)?(?:<\/p>)?\s*/gi,
      ""
    )
    .replace(
      /Today's date \(publication \/ as-of\):[\s\S]*?Do not invent dates from training data or copy example dates from instructions\.\s*/gi,
      ""
    );
}

function translateDateHint(today: string): string {
  return `Publication as-of date: ${today} (for interpreting relative dates in the source — do NOT paste this line into report_html).`;
}

/** Single-call path for shorter reports; longer reports are split by section. */
const SINGLE_CALL_HTML_MAX = 9_000;
const CHUNK_TARGET_CHARS = 5_500;
const TRANSLATE_CHUNK_CONCURRENCY = 3;

function targetLanguageLabel(lang: Exclude<ReportLanguage, "en">): string {
  switch (lang) {
    case "tc":
      return "Traditional Chinese (繁體中文, Taiwan/HK financial style)";
    case "sc":
      return "Simplified Chinese (简体中文, mainland financial style)";
    case "th":
      return "Thai (ภาษาไทย, Thailand financial style)";
    case "vi":
      return "Vietnamese (Tiếng Việt, Vietnam financial style)";
  }
}

function targetLanguageHeadlineHint(lang: Exclude<ReportLanguage, "en">): string {
  switch (lang) {
    case "tc":
      return "Traditional Chinese";
    case "sc":
      return "Simplified Chinese";
    case "th":
      return "Thai";
    case "vi":
      return "Vietnamese";
  }
}

function translateModels(): string[] {
  const primary = config.requesty.atfxResearchTranslateModel.trim() || "openai/gpt-4o-mini";
  const fallbacks = ["google/gemini-2.5-flash", "openai/gpt-4o-mini"];
  return [...new Set([primary, ...fallbacks])];
}

function buildFullTranslatePrompt(
  titleEn: string,
  htmlEn: string,
  target: Exclude<ReportLanguage, "en">,
  today: string
): string {
  return `Translate the following English financial research report into ${targetLanguageLabel(target)}.

${translateDateHint(today)}

Rules:
- Return ONLY valid JSON: { "title": "...", "report_html": "..." }
- Preserve HTML structure exactly: keep all tags (<article>, <h1>, <h2>, <h4>, <p>, <ul>, <li>, <table>, etc.) in the same places; translate only human-readable text nodes.
- Preserve every ${PRESERVE_TOKEN_PREFIX}N__ token exactly — these are chart/image placeholders.
- Do NOT translate or alter ${PRESERVE_TOKEN_PREFIX} tokens, base64 data, or image URLs.
- Do NOT copy any instruction or date-context text from this prompt into report_html.
- Keep ticker symbols, numbers, and dates in the body unchanged unless they are plain prose.
- title must be a natural ${targetLanguageHeadlineHint(target)} headline — not a literal word-for-word translation if a native phrasing reads better.
- Escape double quotes inside HTML as &quot; so JSON stays valid.

English title:
${titleEn}

English report_html:
${htmlEn}`;
}

function buildTitleTranslatePrompt(
  titleEn: string,
  target: Exclude<ReportLanguage, "en">
): string {
  return `Translate this English financial headline into ${targetLanguageLabel(target)}.

Return ONLY valid JSON: { "title": "..." }

English title:
${titleEn}`;
}

function buildExcerptTranslatePrompt(
  excerptEn: string,
  target: Exclude<ReportLanguage, "en">
): string {
  return `Translate this English SEO excerpt for a financial research article into ${targetLanguageLabel(target)}.

Return ONLY valid JSON: { "seo_excerpt": "..." }

Rules:
- Keep it concise (1–2 sentences).
- Preserve ticker symbols, numbers, and dates.
- Natural ${targetLanguageHeadlineHint(target)} phrasing.

English SEO excerpt:
${excerptEn}`;
}

function buildHtmlFragmentPrompt(
  htmlFragment: string,
  target: Exclude<ReportLanguage, "en">
): string {
  return `Translate this HTML fragment into ${targetLanguageLabel(target)}.

Rules:
- Return ONLY valid JSON: { "html": "..." }
- Preserve all tags and attributes exactly; translate human-readable text only.
- Preserve every ${PRESERVE_TOKEN_PREFIX}N__ token exactly — these are chart/image placeholders. Do NOT remove or translate them.
- Do NOT copy any instruction text from this prompt into the HTML.
- Keep ticker symbols, numbers, and dates unchanged.
- Escape double quotes inside HTML as &quot; so JSON stays valid.

HTML fragment:
${htmlFragment}`;
}

async function callTranslateLlm(
  userPrompt: string,
  opts: { max_tokens?: number; retryHint?: string } = {}
): Promise<string> {
  const messages = [
    { role: "system", content: TRANSLATE_SYSTEM },
    { role: "user", content: opts.retryHint ? `${userPrompt}\n\n${opts.retryHint}` : userPrompt },
  ];
  const models = translateModels();
  let lastError: Error | null = null;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      const ctx = getBrokerageUsageContext();
      return await callRequestyChat(model, messages, {
        temperature: 0.2,
        max_tokens: opts.max_tokens ?? 12_000,
        timeoutMs: TRANSLATE_TIMEOUT_MS,
        retries: 1,
        tokenUsage: ctx ? { ...ctx, source: "translation" } : { source: "translation" },
      });
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (i < models.length - 1) {
        console.warn(`[atfx-translate] ${model} failed (${lastError.message}); trying ${models[i + 1]}…`);
      }
    }
  }

  throw lastError ?? new Error("Translation LLM failed");
}

function adjustEndForPreserveTokens(text: string, end: number): number {
  PRESERVE_TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PRESERVE_TOKEN_RE.exec(text)) !== null) {
    const tokenStart = match.index;
    const tokenEnd = tokenStart + match[0].length;
    if (tokenStart < end && end < tokenEnd) return tokenEnd;
    if (tokenStart >= end) break;
  }
  return end;
}

function splitBySize(html: string, maxChars: number): string[] {
  const trimmed = html.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxChars) return [trimmed];

  const chunks: string[] = [];
  let start = 0;
  while (start < trimmed.length) {
    let end = Math.min(start + maxChars, trimmed.length);
    if (end < trimmed.length) {
      const slice = trimmed.slice(start, end);
      const breakCandidates = ["</table>", "</ul>", "</p>", "</h2>", "</h1>", "</div>"];
      let breakAt = -1;
      for (const token of breakCandidates) {
        breakAt = Math.max(breakAt, slice.lastIndexOf(token));
      }
      if (breakAt > maxChars * 0.35) {
        end = start + breakAt + (slice.slice(breakAt).match(/^<\/\w+>/)?.[0]?.length ?? 4);
      }
      end = adjustEndForPreserveTokens(trimmed, end);
    }
    const piece = trimmed.slice(start, end).trim();
    if (piece) chunks.push(piece);
    start = end;
  }
  return chunks;
}

function splitHtmlForTranslation(html: string): string[] {
  const source = html.trim();
  if (!source) return [];

  const sections = listReportSections(source);
  if (!sections.length) return splitBySize(source, CHUNK_TARGET_CHARS);

  const firstH2 = source.search(/<h2\b/i);
  const chunks: string[] = [];
  if (firstH2 > 0) {
    const preamble = source.slice(0, firstH2).trim();
    if (preamble) chunks.push(...splitBySize(preamble, CHUNK_TARGET_CHARS));
  }
  for (const section of sections) {
    chunks.push(...splitBySize(section.html, CHUNK_TARGET_CHARS));
  }
  return chunks.filter(Boolean);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await fn(items[index], index);
    }
  }

  const workers = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

function joinCompletedPrefix(chunks: Array<string | undefined>): string {
  const parts: string[] = [];
  for (const chunk of chunks) {
    if (!chunk?.trim()) break;
    parts.push(chunk.trim());
  }
  return parts.join("\n");
}

function parseTranslatePayload(raw: string): ReportLocaleBundle | null {
  const jsonStr = extractFirstJsonObject(raw);
  if (!jsonStr) return null;
  try {
    const parsed = JSON.parse(jsonStr) as { title?: string; report_html?: string };
    if (typeof parsed.report_html !== "string") return null;
    return {
      title: typeof parsed.title === "string" ? parsed.title : "",
      report_html: parsed.report_html,
    };
  } catch {
    return null;
  }
}

function parseHtmlFragmentPayload(raw: string): string | null {
  const jsonStr = extractFirstJsonObject(raw);
  if (!jsonStr) return null;
  try {
    const parsed = JSON.parse(jsonStr) as { html?: string; report_html?: string };
    const html = typeof parsed.html === "string" ? parsed.html : parsed.report_html;
    return typeof html === "string" && html.trim() ? html.trim() : null;
  } catch {
    return null;
  }
}

function parseTitlePayload(raw: string): string | null {
  const jsonStr = extractFirstJsonObject(raw);
  if (!jsonStr) return null;
  try {
    const parsed = JSON.parse(jsonStr) as { title?: string };
    return typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : null;
  } catch {
    return null;
  }
}

function parseExcerptPayload(raw: string): string | null {
  const jsonStr = extractFirstJsonObject(raw);
  if (!jsonStr) return null;
  try {
    const parsed = JSON.parse(jsonStr) as { seo_excerpt?: string };
    return typeof parsed.seo_excerpt === "string" && parsed.seo_excerpt.trim()
      ? parsed.seo_excerpt.trim()
      : null;
  } catch {
    return null;
  }
}

async function translateTitleOnly(
  titleEn: string,
  target: Exclude<ReportLanguage, "en">
): Promise<string> {
  const prompt = buildTitleTranslatePrompt(titleEn, target);
  let raw = await callTranslateLlm(prompt, { max_tokens: 512 });
  let title = parseTitlePayload(raw);
  if (!title) {
    raw = await callTranslateLlm(prompt, {
      max_tokens: 512,
      retryHint: "Return ONLY a complete JSON object: { \"title\": \"...\" }.",
    });
    title = parseTitlePayload(raw);
  }
  return (title || titleEn).slice(0, 200);
}

export async function translateExcerptOnly(
  excerptEn: string,
  target: Exclude<ReportLanguage, "en">
): Promise<string> {
  const source = excerptEn.trim();
  if (!source) return "";

  const prompt = buildExcerptTranslatePrompt(source, target);
  let raw = await callTranslateLlm(prompt, { max_tokens: 512 });
  let excerpt = parseExcerptPayload(raw);
  if (!excerpt) {
    raw = await callTranslateLlm(prompt, {
      max_tokens: 512,
      retryHint: "Return ONLY a complete JSON object: { \"seo_excerpt\": \"...\" }.",
    });
    excerpt = parseExcerptPayload(raw);
  }
  return (excerpt || source).slice(0, 500);
}

async function translateHtmlFragment(
  htmlFragment: string,
  target: Exclude<ReportLanguage, "en">
): Promise<string> {
  const prompt = buildHtmlFragmentPrompt(htmlFragment, target);
  let raw = await callTranslateLlm(prompt, { max_tokens: 8_000 });
  let html = parseHtmlFragmentPayload(raw);
  if (!html) {
    raw = await callTranslateLlm(prompt, {
      max_tokens: 8_000,
      retryHint: 'Return ONLY a complete JSON object: { "html": "..." }.',
    });
    html = parseHtmlFragmentPayload(raw);
  }
  if (!html) {
    throw new Error("Translation chunk failed — no HTML returned.");
  }
  return stripLeakedDateContext(html);
}

async function translateFullDocument(
  titleEn: string,
  htmlEn: string,
  target: Exclude<ReportLanguage, "en">,
  today: string
): Promise<ReportLocaleBundle> {
  const prompt = buildFullTranslatePrompt(titleEn, htmlEn, target, today);
  let raw = await callTranslateLlm(prompt);
  let parsed = parseTranslatePayload(raw);
  if (!parsed?.report_html?.trim()) {
    raw = await callTranslateLlm(prompt, {
      retryHint: "Return ONLY a complete JSON object with both title and report_html.",
    });
    parsed = parseTranslatePayload(raw);
  }
  if (!parsed?.report_html?.trim()) {
    throw new Error(`Translation to ${target.toUpperCase()} failed — no HTML returned.`);
  }
  return {
    title: (parsed.title?.trim() || titleEn).slice(0, 200),
    report_html: stripLeakedDateContext(parsed.report_html.trim()),
  };
}

async function translateChunkedDocument(
  titleEn: string,
  htmlEn: string,
  target: Exclude<ReportLanguage, "en">,
  today: string,
  callbacks?: TranslateProgressCallbacks
): Promise<ReportLocaleBundle> {
  const { masked, tokens } = maskPreservedHtmlBlocks(htmlEn);
  const chunks = splitHtmlForTranslation(masked);
  if (!chunks.length) {
    throw new Error(`Translation to ${target.toUpperCase()} failed — empty report HTML.`);
  }

  const langLabel = targetLanguageLabel(target);
  callbacks?.onProgress?.(`Translating title to ${langLabel}…`);
  const translatedTitle = await translateTitleOnly(titleEn, target);

  const translatedChunks: string[] = new Array(chunks.length);
  let completed = 0;

  callbacks?.onProgress?.(`Translating body to ${langLabel} (0/${chunks.length})…`);

  await mapWithConcurrency(chunks, TRANSLATE_CHUNK_CONCURRENCY, async (chunk, index) => {
    translatedChunks[index] = await translateHtmlFragment(chunk, target);
    completed += 1;
    callbacks?.onProgress?.(`Translating body to ${langLabel} (${completed}/${chunks.length})…`);
    const partial = unmaskPreservedHtmlBlocks(joinCompletedPrefix(translatedChunks), tokens);
    if (partial) callbacks?.onPartialHtml?.(partial);
  });

  const report_html = unmaskPreservedHtmlBlocks(translatedChunks.join("\n").trim(), tokens);
  if (!report_html) {
    throw new Error(`Translation to ${target.toUpperCase()} failed — no HTML returned.`);
  }

  callbacks?.onPartialHtml?.(report_html);
  return { title: translatedTitle, report_html };
}

export async function translateResearchReport(
  titleEn: string,
  htmlEn: string,
  target: Exclude<ReportLanguage, "en">,
  callbacks?: TranslateProgressCallbacks
): Promise<ReportLocaleBundle> {
  const html = htmlEn.trim();
  const today = new Date().toISOString().slice(0, 10);
  const { masked, tokens } = maskPreservedHtmlBlocks(html);

  if (masked.length <= SINGLE_CALL_HTML_MAX) {
    callbacks?.onProgress?.(`Translating to ${targetLanguageLabel(target)}…`);
    try {
      const result = await translateFullDocument(titleEn, masked, target, today);
      return {
        title: result.title,
        report_html: unmaskPreservedHtmlBlocks(result.report_html, tokens),
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("timed out") && !msg.includes("no HTML returned")) throw e;
      console.warn("[atfx-translate] Single-call translation failed; falling back to chunked mode:", msg);
    }
  }

  return translateChunkedDocument(titleEn, html, target, today, callbacks);
}

export function parseReportI18n(raw: unknown): ReportI18nContent {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const out: ReportI18nContent = {};
  for (const lang of ["en", "tc", "sc", "th", "vi"] as ReportLanguage[]) {
    const entry = o[lang];
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const report_html = typeof e.report_html === "string" ? e.report_html : "";
    const title = typeof e.title === "string" ? e.title : "";
    const seo_excerpt = typeof e.seo_excerpt === "string" ? e.seo_excerpt : undefined;
    if (report_html.trim()) {
      out[lang] = {
        title: title || "Untitled report",
        report_html,
        ...(seo_excerpt?.trim() ? { seo_excerpt: seo_excerpt.trim() } : {}),
      };
    }
  }
  return out;
}

const REPORT_LANG_ORDER: ReportLanguage[] = ["en", "tc", "sc", "th", "vi"];

export function reportLanguagesFromRow(row: {
  title?: string;
  report_html?: string;
  report_html_i18n?: unknown;
}): ReportLanguage[] {
  const i18n = parseReportI18n(row.report_html_i18n);
  if (row.report_html?.trim() && !i18n.en) {
    i18n.en = {
      title: typeof row.title === "string" ? row.title : "Untitled report",
      report_html: row.report_html,
    };
  }
  return REPORT_LANG_ORDER.filter((lang) => Boolean(i18n[lang]?.report_html?.trim()));
}

export function languageTabLabel(lang: ReportLanguage): string {
  if (lang === "tc") return "繁體";
  if (lang === "sc") return "简体";
  if (lang === "th") return "TH";
  if (lang === "vi") return "VI";
  return "EN";
}

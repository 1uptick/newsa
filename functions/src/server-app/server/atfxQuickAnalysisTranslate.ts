import { callRequestyChat, TRANSLATE_TIMEOUT_MS } from "./atfxResearchRequesty.js";
import { getBrokerageUsageContext } from "./brokerageTokenBilling.js";
import { config } from "./config.js";

export type QuickAnalysisTranslateLocale = "zh-TW" | "zh-CN" | "th" | "vi";

export const QUICK_ANALYSIS_TRANSLATE_LOCALES: QuickAnalysisTranslateLocale[] = ["zh-TW", "zh-CN", "th", "vi"];

export function parseQuickAnalysisTranslateLocale(raw: string): QuickAnalysisTranslateLocale | null {
  const trimmed = raw.trim();
  return QUICK_ANALYSIS_TRANSLATE_LOCALES.includes(trimmed as QuickAnalysisTranslateLocale)
    ? (trimmed as QuickAnalysisTranslateLocale)
    : null;
}

function targetLanguageLabel(locale: QuickAnalysisTranslateLocale): string {
  switch (locale) {
    case "zh-TW":
      return "Traditional Chinese (繁體中文, Taiwan/HK financial style)";
    case "zh-CN":
      return "Simplified Chinese (简体中文, mainland financial style)";
    case "th":
      return "Thai (ภาษาไทย, Thailand financial style)";
    case "vi":
      return "Vietnamese (Tiếng Việt, Vietnam financial style)";
  }
}

function translateModel(): string {
  return config.requesty.atfxResearchTranslateModel.trim() || "openai/gpt-4o-mini";
}

function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:markdown|md)?\s*([\s\S]*?)```$/i);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

const TRANSLATE_SYSTEM =
  "You are a professional financial-markets translator. " +
  "Translate English quick market analysis reports into the requested target language. " +
  "Preserve markdown formatting exactly: **bold**, bullet lists, line breaks, section headers. " +
  "Keep ticker symbols, instrument codes, numeric values, percentages, prices, dates, and ▲/▼ arrows unchanged. " +
  "Use natural financial terminology native to the target locale. " +
  "Do not add commentary, citations, disclaimers, or new content. " +
  "Output ONLY the translated markdown text — no JSON, no code fences, no preamble.";

export async function translateQuickAnalysisReportMarkdown(
  report: string,
  locale: QuickAnalysisTranslateLocale
): Promise<string> {
  const source = report.trim();
  if (!source) {
    throw new Error("Report text is empty.");
  }
  if (!config.requesty.apiKey) {
    throw new Error("Translation is not available (LLM not configured on the server).");
  }

  const userMsg =
    `Translate the following quick analysis report into ${targetLanguageLabel(locale)}.\n\n` +
    `SOURCE (English markdown):\n${source}`;

  const ctx = getBrokerageUsageContext();
  const raw = await callRequestyChat(
    translateModel(),
    [
      { role: "system", content: TRANSLATE_SYSTEM },
      { role: "user", content: userMsg },
    ],
    {
      temperature: 0.2,
      timeoutMs: TRANSLATE_TIMEOUT_MS,
      retries: 1,
      tokenUsage: ctx ? { ...ctx, source: "translation" } : { source: "translation" },
    }
  );

  const translated = stripMarkdownFences(raw);
  if (!translated.trim()) {
    throw new Error("Translation returned empty content.");
  }
  return translated;
}

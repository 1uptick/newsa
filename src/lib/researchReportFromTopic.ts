import type { CapitalKeywordItem } from "../pages/Capital/types";

const TOPIC_INSTRUCTION =
  "Write a research article using this approved ATFX topic brief as the primary editorial anchor. Run the full workflow: plan sections, gather live market data (quotes and price charts for any named instrument such as WTI, gold, or FX pairs; add macro economic figure charts when the topic covers PMI, manufacturing, inflation, employment, GDP, or other data releases), then write the complete article per output settings. Do not merely rewrite the summary — expand with verified market context and outlook.";

function topicKeywords(item: CapitalKeywordItem): string[] {
  return [item.keyword1, item.keyword2, item.keyword3, item.keywordTag].filter(Boolean) as string[];
}

/** Full prompt sent to the research pipeline (planning → research → writing). */
export function researchReportPromptFromTopic(item: CapitalKeywordItem): string {
  const title = (item.title ?? "").trim();
  const summary = (item.summary ?? "").trim();
  const source = (item.source ?? "").trim();
  const socialHook = (item.socialHook ?? "").trim();
  const psyTrigger = (item.psyTrigger ?? "").trim();
  const stockTag = (item.stockTag ?? "").trim();
  const keywords = topicKeywords(item);

  const lines = [
    TOPIC_INSTRUCTION,
    "",
    title ? `Title: ${title}` : "",
    summary ? `Summary: ${summary}` : "",
    source ? `Audience segment: ${source}` : "",
    keywords.length ? `SEO keywords: ${keywords.join(", ")}` : "",
    socialHook ? `Social hook angle: ${socialHook}` : "",
    psyTrigger ? `Psychology trigger: ${psyTrigger}` : "",
    stockTag ? `Stock / tag focus: ${stockTag}` : "",
  ].filter(Boolean);

  return lines.join("\n");
}

/** Short label shown in the user chat bubble when starting from a topic. */
export function researchReportDisplayFromTopic(item: CapitalKeywordItem): string {
  const title = (item.title ?? "").trim();
  return title ? `Start article\n${title}` : "Start article";
}

export function topicAudienceFromItem(item: CapitalKeywordItem): "institutional" | "retail" | null {
  const s = (item.source ?? "").trim().toLowerCase();
  if (s === "institutional") return "institutional";
  if (s === "retail") return "retail";
  return null;
}

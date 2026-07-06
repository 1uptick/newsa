/**
 * Removes bracketed numeric citation markers from LLM output ([1], [2], [1,2], fullwidth ［1］).
 */
export function stripCitationMarkers(text: string): string {
  if (typeof text !== "string" || !text) return text;
  return text
    .replace(/\[\s*\d+\s*(?:,\s*\d+\s*)*\]/g, "")
    .replace(/［\s*\d+\s*(?:,\s*\d+\s*)*］/g, "");
}

/** In-place strip on ATFX keyword JSON fields from /api/capitalkeywords/generate. */
export function stripAtfxTopicJsonFields(topic: Record<string, unknown>): void {
  const m = stripCitationMarkers;
  for (const k of [
    "seo_title",
    "summary",
    "psychology_trigger",
    "social_media_hook",
    "idea_cluster_label",
  ] as const) {
    const v = topic[k];
    if (v != null && typeof v === "string") (topic as Record<string, string>)[k] = m(v);
  }
  const kw = topic.keywords;
  if (Array.isArray(kw)) {
    (topic as Record<string, unknown>).keywords = kw.map((x) => m(String(x ?? "")));
  }
  const ideas = topic.topic_ideas;
  if (Array.isArray(ideas)) {
    (topic as Record<string, unknown>).topic_ideas = ideas.map((x) => m(String(x ?? "")));
  }
}

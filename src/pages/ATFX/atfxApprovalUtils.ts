import type { NewsItem } from "../../types";
import type { CapitalKeywordItem } from "../Capital/types";
import { RECENT_TOPIC_EXCLUDE_LIMIT } from "./atfxApprovalTypes";

/** Resolve drag payload for the Generate topic box (trending keyword bubbles use text/plain). */
export function topicSnippetFromDataTransfer(dt: DataTransfer): string | null {
  const plain = dt.getData("text/plain");
  if (plain && plain.trim()) return plain.trim();
  return null;
}

/** Topic string sent to /api/capitalkeywords/generate from a news card. */
export function topicFromNewsItem(item: NewsItem): string {
  const t = (item.title || "").trim();
  const s = (item.source || "").trim();
  if (!t) return s || "News article";
  return s ? `${t} (${s})` : t;
}

/** Last N topic titles for a given Source (Institutional / Retail), newest first. */
export function getRecentTitlesForExcludeBySource(
  list: CapitalKeywordItem[],
  sourceMatch: "institutional" | "retail"
): string[] {
  const target = sourceMatch.toLowerCase();
  const rows = list.filter((i) => (i.source ?? "").trim().toLowerCase() === target);
  rows.sort((a, b) => {
    const ta = Date.parse(a.createDate) || 0;
    const tb = Date.parse(b.createDate) || 0;
    return tb - ta;
  });
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    const t = (row.title ?? "").trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= RECENT_TOPIC_EXCLUDE_LIMIT) break;
  }
  return out;
}

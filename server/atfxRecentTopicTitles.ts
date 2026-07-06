import { proposedTopicsCompanyFieldName, PROPOSED_TOPICS_COMPANY_ATFX } from "./capitalKeywords.js";

/** Max titles sent to the LLM after merging client + DB lists. */
export const MAX_MERGED_EXCLUDE_TITLES = 32;

function parseRecordCreateDateMs(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "string") {
    const t = Date.parse(raw);
    return Number.isFinite(t) ? t : null;
  }
  if (typeof raw === "object" && raw !== null && "start" in raw) {
    const t = Date.parse(String((raw as { start: string }).start));
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

export type FetchAtfxTopicTitlesOptions = {
  /** Airtable record ids to omit (e.g. the topic row being approved for article generation). */
  excludeRecordIds?: string[];
};

export type AtfxRecentTopicSnippet = {
  id: string;
  title: string;
  summary: string;
};

/**
 * Load ATFX proposed-topic titles from Airtable for the given audience segment,
 * restricted to rows whose Create date falls within the last `days` days when `days` > 0;
 * when `days` is 0, no date cutoff (still capped by Airtable maxRecords).
 */
export async function fetchAtfxTopicTitlesFromDb(
  airtable: any,
  tableId: string,
  audience: "institutional" | "retail",
  days: number,
  options?: FetchAtfxTopicTitlesOptions
): Promise<string[]> {
  const companyCol = proposedTopicsCompanyFieldName();
  const sourceLabel = audience === "institutional" ? "Institutional" : "Retail";
  const formula = `AND(LOWER({${companyCol}}) = "${PROPOSED_TOPICS_COMPANY_ATFX}", {Source} = "${sourceLabel}")`;

  const records = await airtable(tableId)
    .select({
      filterByFormula: formula,
      sort: [{ field: "Create date", direction: "desc" }],
      maxRecords: 120,
      fields: ["Title", "Create date"],
    })
    .firstPage();

  const exclude = new Set((options?.excludeRecordIds ?? []).filter(Boolean));
  const cutoffMs = days > 0 ? Date.now() - days * 24 * 60 * 60 * 1000 : null;
  const titles: string[] = [];
  const seen = new Set<string>();

  for (const record of records as any[]) {
    if (exclude.size > 0 && exclude.has(record.id)) continue;
    const rawDate = record.get("Create date");
    const ms = parseRecordCreateDateMs(rawDate);
    if (cutoffMs != null && ms != null && ms < cutoffMs) continue;

    const title = typeof record.get("Title") === "string" ? String(record.get("Title")).trim() : "";
    if (!title) continue;

    const key = title.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    titles.push(title.length > 220 ? `${title.slice(0, 220)}…` : title);
  }

  return titles;
}

/**
 * Load ATFX recent topic title+summary snippets (used to prevent "different title, same summary/story" repeats).
 */
export async function fetchAtfxTopicSnippetsFromDb(
  airtable: any,
  tableId: string,
  audience: "institutional" | "retail",
  days: number,
  options?: FetchAtfxTopicTitlesOptions
): Promise<AtfxRecentTopicSnippet[]> {
  const companyCol = proposedTopicsCompanyFieldName();
  const sourceLabel = audience === "institutional" ? "Institutional" : "Retail";
  const formula = `AND(LOWER({${companyCol}}) = "${PROPOSED_TOPICS_COMPANY_ATFX}", {Source} = "${sourceLabel}")`;

  const records = await airtable(tableId)
    .select({
      filterByFormula: formula,
      sort: [{ field: "Create date", direction: "desc" }],
      maxRecords: 120,
      fields: ["Title", "summary", "Create date"],
    })
    .firstPage();

  const exclude = new Set((options?.excludeRecordIds ?? []).filter(Boolean));
  const cutoffMs = days > 0 ? Date.now() - days * 24 * 60 * 60 * 1000 : null;
  const out: AtfxRecentTopicSnippet[] = [];
  const seen = new Set<string>();

  for (const record of records as any[]) {
    if (exclude.size > 0 && exclude.has(record.id)) continue;
    const rawDate = record.get("Create date");
    const ms = parseRecordCreateDateMs(rawDate);
    if (cutoffMs != null && ms != null && ms < cutoffMs) continue;

    const title = typeof record.get("Title") === "string" ? String(record.get("Title")).trim() : "";
    const summary = typeof record.get("summary") === "string" ? String(record.get("summary")).trim() : "";
    if (!title && !summary) continue;

    const key = `${title}||${summary}`.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      id: String(record.id ?? ""),
      title: title.length > 220 ? `${title.slice(0, 220)}…` : title,
      summary: summary.length > 600 ? `${summary.slice(0, 600)}…` : summary,
    });
  }

  return out;
}

/** Merge client-supplied exclusions with DB titles; dedupe and cap length/count. */
export function mergeExcludeTitleLists(client: string[], db: string[], maxTotal: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    const s = raw.trim();
    if (!s) return;
    const clipped = s.length > 220 ? `${s.slice(0, 220)}…` : s;
    const key = clipped.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) return;
    seen.add(key);
    out.push(clipped);
  };
  for (const t of client) add(t);
  for (const t of db) add(t);
  return out.slice(0, maxTotal);
}

// ---------------------------------------------------------------------------
// Similarity helpers
// ---------------------------------------------------------------------------

function normalizeTitleForDedup(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Strip spaces, digits, and currency symbols so e.g. €241億 vs 2,410億歐元 compare as the same story. */
function foldForThemeSimilarity(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000]+/g, "")
    .replace(/\p{Nd}+/gu, "")
    .replace(/[€$¥£,，.。%％]/g, "");
}

/** Sørensen–Dice on character bigrams. */
function diceBigramSimilarity(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return 0;
  const counts = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      m.set(bg, (m.get(bg) ?? 0) + 1);
    }
    return m;
  };
  const A = counts(a);
  const B = counts(b);
  let overlap = 0;
  let sumA = 0;
  let sumB = 0;
  for (const v of A.values()) sumA += v;
  for (const v of B.values()) sumB += v;
  for (const [k, v] of A) {
    if (B.has(k)) overlap += Math.min(v, B.get(k)!);
  }
  if (sumA + sumB === 0) return 0;
  return (2 * overlap) / (sumA + sumB);
}

/** |A∩B| / min(|A|,|B|) on unique characters. */
function uniqueCharOverlapCoefficient(a: string, b: string): number {
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const c of A) {
    if (B.has(c)) inter++;
  }
  const denom = Math.min(A.size, B.size);
  return denom === 0 ? 0 : inter / denom;
}

// ---------------------------------------------------------------------------
// Weighted combined score: dice*0.6 + charOverlap*0.4 >= threshold.
// Tested against real CJK title pairs:
//   Same-theme pairs score  ~0.28–0.58  → blocked
//   Different stories score ~0.00–0.24  → pass
// ---------------------------------------------------------------------------
// Slightly lower than 0.30 because long CJK headlines can rephrase the same story
// while diluting bigram overlap; we still want to block "same catalyst, same market story".
const THEME_COMBINED_THRESHOLD = 0.26;
const THEME_MIN_FOLDED_LEN = 8;

function themeCombinedScore(a: string, b: string): number {
  return diceBigramSimilarity(a, b) * 0.6 + uniqueCharOverlapCoefficient(a, b) * 0.4;
}

function isThemeTooSimilar(candidate: string, previous: string): boolean {
  const a = foldForThemeSimilarity(candidate);
  const b = foldForThemeSimilarity(previous);
  if (a.length < THEME_MIN_FOLDED_LEN || b.length < THEME_MIN_FOLDED_LEN) return false;
  return themeCombinedScore(a, b) >= THEME_COMBINED_THRESHOLD;
}

// ---------------------------------------------------------------------------
// Public similarity API
// ---------------------------------------------------------------------------

export type SimilarityScore = {
  against: string;
  dice: number;
  charOverlap: number;
  combined: number;
  blocked: boolean;
};

/** Return the highest similarity score of `candidate` against all `recentTitles` (for logging). */
export function highestSimilarityScore(
  candidate: string,
  recentTitles: string[]
): SimilarityScore | null {
  let best: SimilarityScore | null = null;
  const cFolded = foldForThemeSimilarity(candidate);
  for (const t of recentTitles) {
    const tFolded = foldForThemeSimilarity(t);
    if (cFolded.length < THEME_MIN_FOLDED_LEN || tFolded.length < THEME_MIN_FOLDED_LEN) continue;
    const dice = diceBigramSimilarity(cFolded, tFolded);
    const charOv = uniqueCharOverlapCoefficient(cFolded, tFolded);
    const combined = dice * 0.6 + charOv * 0.4;
    const blocked = combined >= THEME_COMBINED_THRESHOLD;
    if (!best || combined > best.combined) {
      best = {
        against: t.length > 60 ? `${t.slice(0, 60)}…` : t,
        dice: Math.round(dice * 1000) / 1000,
        charOverlap: Math.round(charOv * 1000) / 1000,
        combined: Math.round(combined * 1000) / 1000,
        blocked,
      };
    }
  }
  return best;
}

/**
 * True only for near-exact matches: identical normalized text, full containment,
 * or high similarity on BOTH dice AND char-overlap (AND logic).
 */
export function isDuplicateOfRecentTitles(candidate: string, recentTitles: string[]): boolean {
  const n = normalizeTitleForDedup(candidate);
  if (!n) return false;
  for (const t of recentTitles) {
    const m = normalizeTitleForDedup(t);
    if (!m) continue;
    if (m === n) return true;
    if (n.length >= 36 && m.length >= 36 && (n.includes(m) || m.includes(n))) return true;
    if (isThemeTooSimilar(candidate, t)) return true;
  }
  return false;
}

export function isTooSimilarToRecentText(candidate: string, recentTexts: string[]): boolean {
  const n = normalizeTitleForDedup(candidate);
  if (!n) return false;
  for (const t of recentTexts) {
    const m = normalizeTitleForDedup(t);
    if (!m) continue;
    if (m === n) return true;
    if (n.length >= 36 && m.length >= 36 && (n.includes(m) || m.includes(n))) return true;
    if (isThemeTooSimilar(candidate, t)) return true;
  }
  return false;
}

/** First recent string that would block `candidate` (for retry feedback). */
export function findFirstSimilarText(candidate: string, recentTexts: string[]): string | null {
  for (const t of recentTexts) {
    if (isDuplicateOfRecentTitles(candidate, [t])) return t;
    if (isTooSimilarToRecentText(candidate, [t])) return t;
  }
  return null;
}

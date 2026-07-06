type TrendingKeywordItem = { keyword: string; score: number };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function normalizeKeyword(s: string) {
  return s
    .replace(/^[\s\-*•\d.()#:]+/g, "")
    .replace(/[\s\-–—:]+$/g, "")
    .trim();
}

/**
 * Parse a "keywords" string into { keyword, score }[].
 *
 * Accepts common formats seen in Airtable/LLM outputs, e.g.
 * - "keyword (8/10), other (6/10)"
 * - "keyword - 8/10"
 * - "8/10 keyword"
 * - bullet/newline separated lists
 * - decimal scores like 8.5/10
 */
export function parseTrendingKeywords(raw: string): TrendingKeywordItem[] {
  if (!raw || typeof raw !== "string") return [];

  const text = raw.replace(/\r\n/g, "\n");
  const out: TrendingKeywordItem[] = [];

  // 1) Extract any explicit "<keyword> ... <score>/<max>" patterns.
  // Captures keyword either before or after the fraction.
  const scoreRe =
    /(?:^|[\n,;])\s*(?:(?<kw1>[^,\n()]{2,}?)\s*(?:\(|[-–—:]\s*)\s*(?<score1>\d+(?:\.\d+)?)\s*\/\s*(?<max1>\d+(?:\.\d+)?)\s*\)?|(?<score2>\d+(?:\.\d+)?)\s*\/\s*(?<max2>\d+(?:\.\d+)?)\s*(?<kw2>[^,\n()]{2,}?))\s*(?=$|[\n,;])/g;

  let m: RegExpExecArray | null;
  while ((m = scoreRe.exec(text)) !== null) {
    const groups = (m as RegExpExecArray & { groups?: Record<string, string> }).groups;
    const kwRaw = (groups?.kw1 ?? groups?.kw2 ?? "").trim();
    const keyword = normalizeKeyword(kwRaw);
    const scoreStr = groups?.score1 ?? groups?.score2 ?? "";
    const maxStr = groups?.max1 ?? groups?.max2 ?? "";
    const scoreNum = Number.parseFloat(scoreStr);
    const maxNum = Number.parseFloat(maxStr);
    if (!keyword || !Number.isFinite(scoreNum) || !Number.isFinite(maxNum) || maxNum <= 0) continue;

    // Normalize to a 0..10-ish scale so UI sizing stays reasonable.
    const normalized = (scoreNum / maxNum) * 10;
    const score = clamp(normalized, 0.1, 10);
    out.push({ keyword, score });
  }

  // If we got any explicit scores, de-dupe and return (highest score wins).
  if (out.length > 0) {
    const byKw = new Map<string, TrendingKeywordItem>();
    for (const it of out) {
      const prev = byKw.get(it.keyword);
      if (!prev || it.score > prev.score) byKw.set(it.keyword, it);
    }
    return Array.from(byKw.values()).sort((a, b) => b.score - a.score);
  }

  // 2) Fallback: split into a list (comma/newline/bullets) and assign descending scores.
  const parts = text
    .split(/\n|,|;|•|\u2022/g)
    .map((s) => normalizeKeyword(s))
    .filter(Boolean);

  const seen = new Set<string>();
  const unique = parts.filter((p) => (seen.has(p) ? false : (seen.add(p), true)));
  const maxItems = 18;
  const sliced = unique.slice(0, maxItems);

  return sliced.map((keyword, idx) => ({
    keyword,
    score: clamp(10 - idx * (9 / Math.max(1, sliced.length - 1)), 1, 10),
  }));
}

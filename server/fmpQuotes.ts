/**
 * Financial Modeling Prep (FMP) quote fetch + validation of numeric market claims in ATFX topic text.
 * @see https://site.financialmodelingprep.com/developer/docs/quickstart
 */

const FMP_BASE = "https://financialmodelingprep.com/stable";

export type FmpQuoteFailure = {
  instrument: string;
  fmpSymbol: string;
  claimed: number;
  live: number;
};

export type FmpQuoteValidationResult =
  | { ok: true; skipped?: boolean; reason?: string }
  | { ok: false; message: string; failures: FmpQuoteFailure[] };

/** Remove numeric tokens that FMP flagged as mismatched (standalone only — avoids splitting longer numbers). */
function stripOneNumericClaim(raw: string, claimed: number): string {
  if (!Number.isFinite(claimed)) return raw;
  const text = normalizeDigits(raw).replace(/\s+/g, " ");
  const escaped = String(claimed).replace(/\./g, "\\.");
  const re = new RegExp(`(?<![0-9.,])${escaped}(?![0-9])`, "g");
  return text.replace(re, "").replace(/\s{2,}/g, " ").trim();
}

/**
 * Softens headline/summary after FMP quote mismatch by removing the specific claimed figures.
 * Used for news/trending generation where we still save the topic.
 */
export function stripClaimedPricesFromText(raw: string, failures: FmpQuoteFailure[]): string {
  const seen = new Set<number>();
  let out = raw;
  for (const f of failures) {
    if (!Number.isFinite(f.claimed) || seen.has(f.claimed)) continue;
    seen.add(f.claimed);
    out = stripOneNumericClaim(out, f.claimed);
  }
  return out;
}

type ClaimCheck = {
  instrument: string;
  symbols: string[];
  claimed: number;
  maxRelDiff: number;
  maxAbsDiff?: number;
};

function parsePrice(data: unknown): number | null {
  if (data == null) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  const p = (row as { price?: unknown }).price;
  const n = typeof p === "number" ? p : typeof p === "string" ? parseFloat(p) : NaN;
  return Number.isFinite(n) ? n : null;
}

function normalizeDigits(s: string): string {
  return s.replace(/[\uFF10-\uFF19]/g, (ch) => String(ch.charCodeAt(0) - 0xff10 + 0x30));
}

export type FmpRichQuote = {
  price: number;
  change: number;
  changePercentage: number;
  yearHigh: number;
  yearLow: number;
  priceAvg50: number;
};

function parseRichQuote(data: unknown): FmpRichQuote | null {
  if (data == null) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const price = typeof r.price === "number" ? r.price : NaN;
  if (!Number.isFinite(price)) return null;
  return {
    price,
    change: Number(r.change) || 0,
    changePercentage: Number(r.changesPercentage ?? r.changePercentage) || 0,
    yearHigh: Number(r.yearHigh) || 0,
    yearLow: Number(r.yearLow) || 0,
    priceAvg50: Number(r.priceAvg50) || 0,
  };
}

async function fetchFmpRichQuote(symbol: string, apiKey: string): Promise<FmpRichQuote | null> {
  if (!apiKey) return null;
  const url = `${FMP_BASE}/quote?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`;
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    if (json && typeof json === "object" && "Error Message" in json) return null;
    return parseRichQuote(json);
  } catch {
    return null;
  } finally {
    clearTimeout(tid);
  }
}

export async function fetchFmpQuote(symbol: string, apiKey: string): Promise<number | null> {
  const rq = await fetchFmpRichQuote(symbol, apiKey);
  return rq?.price ?? null;
}

async function fetchFirstLivePrice(symbols: string[], apiKey: string): Promise<{ symbol: string; price: number } | null> {
  for (const sym of symbols) {
    const price = await fetchFmpQuote(sym, apiKey);
    if (price != null) return { symbol: sym, price };
  }
  return null;
}

function passesTolerance(claimed: number, live: number, maxRelDiff: number, maxAbsDiff?: number): boolean {
  const diff = Math.abs(claimed - live);
  const denom = Math.max(Math.abs(live), 1e-9);
  if (diff / denom <= maxRelDiff) return true;
  if (maxAbsDiff != null && diff <= maxAbsDiff) return true;
  return false;
}

/**
 * Extract instrument + claimed numeric level from title/summary (Traditional Chinese + English).
 * Only runs checks when a keyword and a plausible level appear near each other.
 */
function extractClaimChecks(text: string): ClaimCheck[] {
  const t = normalizeDigits(text).replace(/\s+/g, " ");
  const out: ClaimCheck[] = [];
  const seen = new Set<string>();

  const push = (c: ClaimCheck) => {
    const key = `${c.instrument}:${c.claimed}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(c);
  };

  // Dollar index (DXY) — typical range ~92–120
  const dxyPatterns: RegExp[] = [
    /(?:DXY|美(?:元|圓)指數|美匯指數|美元指数)(?:[^0-9]{0,28})(\d{2,3}(?:\.\d{1,2})?)/i,
    /(\d{2,3}(?:\.\d{1,2})?)(?:\s*(?:點|关|關|大關))?[^0-9]{0,22}(?:DXY|美(?:元|圓)指數|美匯指數|美元指数)/i,
    /(?:重破|突破|站穩|失守|跌穿)(?:[^0-9]{0,12})(\d{2,3}(?:\.\d{1,2})?)(?:\s*(?:點|关|關))?[^0-9]{0,18}(?:DXY|美(?:元|圓)指數|美元指)/i,
  ];
  for (const re of dxyPatterns) {
    const m = t.match(re);
    if (!m) continue;
    const claimed = parseFloat(m[1]);
    if (claimed >= 92 && claimed <= 125) {
      push({
        instrument: "USD index (DXY)",
        symbols: ["DXY", "DX-Y.NYB", "^DXY"],
        claimed,
        maxRelDiff: 0.04,
        maxAbsDiff: 2.8,
      });
      break;
    }
  }

  // Major FX pairs (spot-style decimals)
  const fxSpecs: Array<{
    instrument: string;
    symbols: string[];
    kw: RegExp;
    min: number;
    max: number;
    maxRel: number;
    maxAbs: number;
  }> = [
    {
      instrument: "EURUSD",
      symbols: ["EURUSD"],
      kw: /(?:EURUSD|EUR\/USD|歐美|歐元(?:兌|兑)美元|歐\/美)/i,
      min: 0.85,
      max: 1.35,
      maxRel: 0.015,
      maxAbs: 0.025,
    },
    {
      instrument: "GBPUSD",
      symbols: ["GBPUSD"],
      kw: /(?:GBPUSD|GBP\/USD|英鎊(?:兌|兑)美元|鎊美)/i,
      min: 1.05,
      max: 1.45,
      maxRel: 0.015,
      maxAbs: 0.03,
    },
    {
      instrument: "USDJPY",
      symbols: ["USDJPY"],
      kw: /(?:USDJPY|USD\/JPY|美元(?:兌|兑)日圓|美日)/i,
      min: 80,
      max: 200,
      maxRel: 0.02,
      maxAbs: 3,
    },
    {
      instrument: "USDCNH",
      symbols: ["USDCNH"],
      kw: /(?:USDCNH|USD\/CNH|離岸人民幣|美元(?:兌|兑)離岸人民幣)/i,
      min: 6.8,
      max: 7.6,
      maxRel: 0.012,
      maxAbs: 0.06,
    },
  ];

  for (const fx of fxSpecs) {
    if (!fx.kw.test(t)) continue;
    const after = t.match(
      new RegExp(`${fx.kw.source}(?:[^0-9]{0,24})(\\d+(?:\\.\\d{1,6})?)`, "i")
    );
    const before = t.match(
      new RegExp(`(\\d+(?:\\.\\d{1,6})?)(?:[^0-9]{0,20})${fx.kw.source}`, "i")
    );
    const raw = after?.[1] || before?.[1];
    if (!raw) continue;
    const claimed = parseFloat(raw);
    if (!Number.isFinite(claimed) || claimed < fx.min || claimed > fx.max) continue;
    push({
      instrument: fx.instrument,
      symbols: fx.symbols,
      claimed,
      maxRelDiff: fx.maxRel,
      maxAbsDiff: fx.maxAbs,
    });
  }

  // Gold (USD)
  if (/(?:黃金|黄金|XAU|GOLD|GCUSD|XAUUSD)/i.test(t)) {
    const gm = t.match(/(?:黃金|黄金|XAU|GOLD|GCUSD|XAUUSD)(?:[^0-9]{0,28})(\d{3,4}(?:\.\d{1,2})?)/i);
    const gm2 = t.match(/(\d{3,4}(?:\.\d{1,2})?)(?:[^0-9]{0,20})(?:黃金|黄金|XAU|GOLD)/i);
    const g = gm?.[1] || gm2?.[1];
    if (g) {
      const claimed = parseFloat(g);
      if (claimed >= 1500 && claimed <= 4500) {
        push({
          instrument: "Gold (USD)",
          symbols: ["XAUUSD", "GCUSD"],
          claimed,
          maxRelDiff: 0.025,
          maxAbsDiff: 35,
        });
      }
    }
  }

  // WTI crude
  if (/(?:WTI|原油|布蘭特|布伦特|油價|油价|CLUSD)/i.test(t)) {
    const om = t.match(/(?:WTI|原油|油價|油价|CLUSD)(?:[^0-9]{0,26})(\d{2,3}(?:\.\d{1,2})?)/i);
    const om2 = t.match(/(\d{2,3}(?:\.\d{1,2})?)(?:[^0-9]{0,18})(?:WTI|原油|油價)/i);
    const o = om?.[1] || om2?.[1];
    if (o) {
      const claimed = parseFloat(o);
      if (claimed >= 25 && claimed <= 140) {
        push({
          instrument: "WTI crude",
          symbols: ["CLUSD"],
          claimed,
          maxRelDiff: 0.045,
          maxAbsDiff: 4,
        });
      }
    }
  }

  // S&P 500 index
  if (/(?:標普|标普|S&P|SPX|\^GSPC|SP500)/i.test(t)) {
    const sm = t.match(/(?:標普|标普|S&P|SPX|SP500)(?:[^0-9]{0,26})(\d{3,4}(?:\.\d{1,2})?)/i);
    const sm2 = t.match(/(\d{3,4}(?:\.\d{1,2})?)(?:[^0-9]{0,20})(?:標普|标普|S&P\s*500|SPX)/i);
    const s = sm?.[1] || sm2?.[1];
    if (s) {
      const claimed = parseFloat(s);
      if (claimed >= 3000 && claimed <= 8000) {
        push({
          instrument: "S&P 500",
          // Use index only — SPY is ~1/10th of SPX; mixing would false-fail headlines that cite the index level.
          symbols: ["^GSPC"],
          claimed,
          maxRelDiff: 0.02,
          maxAbsDiff: 80,
        });
      }
    }
  }

  return out;
}

/** "黃金2026年展望" — 2026 is a year, not a USD/oz level; avoid false FMP failures. */
function isLikelyCalendarYearUsage(text: string, claimed: number): boolean {
  if (!Number.isFinite(claimed)) return false;
  const n = Math.round(claimed);
  if (Math.abs(n - claimed) > 1e-6) return false;
  if (n < 2000 || n > 2075) return false;
  const s = String(n);
  if (new RegExp(`${s}\\s*年`).test(text)) return true;
  if (new RegExp(`${s}\\s*(?:年度|财年|財年|財政年度)`).test(text)) return true;
  if (new RegExp(`(?:FY|fy)\\s*${s}\\b`).test(text)) return true;
  return false;
}

/** "成長3.1%" next to FX words — 3.1 is a %, not EURUSD. */
function isNumberUsedAsPercentInText(text: string, claimed: number): boolean {
  const normalized = (text || "").replace(/\s+/g, " ");
  const re = /(\d+(?:\.\d+)?)\s*[%％]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized)) !== null) {
    const v = parseFloat(m[1]);
    if (Number.isFinite(v) && Math.abs(v - claimed) < 1e-6) return true;
  }
  return false;
}

/** Drop price-like claims that are almost certainly years or % figures (trending/macro topics). */
function filterSpuriousPriceClaims(text: string, checks: ClaimCheck[]): ClaimCheck[] {
  return checks.filter((c) => {
    if (isLikelyCalendarYearUsage(text, c.claimed)) return false;
    if (isNumberUsedAsPercentInText(text, c.claimed)) return false;
    return true;
  });
}

/**
 * When FMP_API_KEY is set, compares detected numeric claims in title/summary to live FMP quotes.
 * If FMP cannot price a symbol, that check is skipped (generation still allowed).
 */
export async function validateAtfxTopicAgainstFmpQuotes(
  title: string,
  summary: string,
  apiKey: string,
  enabled: boolean
): Promise<FmpQuoteValidationResult> {
  const key = apiKey.trim();
  if (!enabled || !key) {
    return { ok: true, skipped: true, reason: !key ? "FMP_API_KEY not set" : "FMP quote validation disabled" };
  }

  const combined = `${title}\n${summary}`;
  let checks = extractClaimChecks(combined);
  checks = filterSpuriousPriceClaims(combined, checks);
  if (checks.length === 0) {
    return { ok: true, skipped: true, reason: "No FMP-validatable numeric claims detected" };
  }

  const failures: FmpQuoteFailure[] = [];

  for (const c of checks) {
    const liveRow = await fetchFirstLivePrice(c.symbols, key);
    if (!liveRow) continue;

    if (passesTolerance(c.claimed, liveRow.price, c.maxRelDiff, c.maxAbsDiff)) continue;

    failures.push({
      instrument: c.instrument,
      fmpSymbol: liveRow.symbol,
      claimed: c.claimed,
      live: Math.round(liveRow.price * 1e6) / 1e6,
    });
  }

  if (failures.length === 0) {
    return { ok: true };
  }

  const detail = failures
    .map((f) => `${f.instrument}: claimed ${f.claimed} vs FMP ${f.fmpSymbol} ~${f.live}`)
    .join("; ");
  return {
    ok: false,
    message: `Quote validation failed: headline/summary numbers do not match live FMP quotes (${detail}). Regenerate or edit the topic.`,
    failures,
  };
}

// ---------------------------------------------------------------------------
// Directional / trend claim validation
// ---------------------------------------------------------------------------

type DirectionClaim = {
  instrument: string;
  symbols: string[];
  claimedDirection: "up" | "down" | "new_high" | "new_low";
  snippet: string;
};

function extractDirectionClaims(text: string): DirectionClaim[] {
  const t = normalizeDigits(text);
  const out: DirectionClaim[] = [];
  const seen = new Set<string>();

  const push = (c: DirectionClaim) => {
    const key = `${c.instrument}:${c.claimedDirection}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(c);
  };

  const indexSpecs: Array<{
    instrument: string;
    symbols: string[];
    kw: RegExp;
  }> = [
    { instrument: "S&P 500", symbols: ["^GSPC"], kw: /(?:標普|标普|S&P|SPX|SP500|美股三大指數|美股)/i },
    { instrument: "Nasdaq", symbols: ["^IXIC"], kw: /(?:納斯達克|纳斯达克|Nasdaq|IXIC|QQQ)/i },
    { instrument: "Dow Jones", symbols: ["^DJI"], kw: /(?:道瓊|道琼|Dow|DJI|DJIA)/i },
    { instrument: "Gold (USD)", symbols: ["XAUUSD", "GCUSD"], kw: /(?:黃金|黄金|XAU|GOLD|金價|金价)/i },
    { instrument: "WTI crude", symbols: ["CLUSD"], kw: /(?:WTI|原油|油價|油价)/i },
    { instrument: "USD index (DXY)", symbols: ["DXY"], kw: /(?:DXY|美元指數|美匯指數)/i },
  ];

  // "連漲/連升 X 週/天" or "X週連漲" → claiming UP streak
  const upStreakRe = /(?:連漲|連升|連續(?:上漲|上升|走高)|consecutive\s*(?:gains?|rise)|rallied?\s*\d+\s*(?:weeks?|days?))/i;
  // "連跌/連降 X 週/天" → claiming DOWN streak
  const downStreakRe = /(?:連跌|連降|連續(?:下跌|下降|走低)|consecutive\s*(?:losses?|decline|fall)|fell?\s*\d+\s*(?:weeks?|days?))/i;
  // "新高/歷史高/創高" → claiming near all-time high
  const newHighRe = /(?:新高|歷史高|歷史新高|創高|創新高|record\s*high|all[- ]time\s*high|ATH)/i;
  // "新低" → claiming near all-time low
  const newLowRe = /(?:新低|歷史低|歷史新低|record\s*low|all[- ]time\s*low)/i;

  for (const spec of indexSpecs) {
    if (!spec.kw.test(t)) continue;

    // Find the sentence/clause containing the keyword (±80 chars)
    const kwMatch = t.match(spec.kw);
    if (!kwMatch || kwMatch.index == null) continue;
    const start = Math.max(0, kwMatch.index - 80);
    const end = Math.min(t.length, kwMatch.index + kwMatch[0].length + 80);
    const vicinity = t.slice(start, end);

    if (upStreakRe.test(vicinity)) {
      push({ instrument: spec.instrument, symbols: spec.symbols, claimedDirection: "up", snippet: vicinity.slice(0, 60) });
    }
    if (downStreakRe.test(vicinity)) {
      push({ instrument: spec.instrument, symbols: spec.symbols, claimedDirection: "down", snippet: vicinity.slice(0, 60) });
    }
    if (newHighRe.test(vicinity)) {
      push({ instrument: spec.instrument, symbols: spec.symbols, claimedDirection: "new_high", snippet: vicinity.slice(0, 60) });
    }
    if (newLowRe.test(vicinity)) {
      push({ instrument: spec.instrument, symbols: spec.symbols, claimedDirection: "new_low", snippet: vicinity.slice(0, 60) });
    }
  }

  return out;
}

export type FmpDirectionFailure = {
  instrument: string;
  fmpSymbol: string;
  claimed: string;
  actualChange: number;
  actualPrice: number;
};

export type FmpDirectionValidationResult =
  | { ok: true; skipped?: boolean; reason?: string }
  | { ok: false; message: string; failures: FmpDirectionFailure[] };

/**
 * Validate strong 新高/新低 claims against FMP 52-week range when clearly inconsistent.
 * Streak / multi-day direction wording (連漲, 連跌, …) is not checked vs a single session — that comparison was unreliable.
 */
export async function validateDirectionClaims(
  title: string,
  summary: string,
  apiKey: string,
  enabled: boolean
): Promise<FmpDirectionValidationResult> {
  const key = apiKey.trim();
  if (!enabled || !key) {
    return { ok: true, skipped: true, reason: !key ? "FMP_API_KEY not set" : "disabled" };
  }

  const combined = `${title}\n${summary}`;
  const claims = extractDirectionClaims(combined);
  if (claims.length === 0) {
    return { ok: true, skipped: true, reason: "No directional claims detected" };
  }

  const failures: FmpDirectionFailure[] = [];

  for (const claim of claims) {
    let quote: FmpRichQuote | null = null;
    let usedSymbol = "";
    for (const sym of claim.symbols) {
      quote = await fetchFmpRichQuote(sym, key);
      if (quote) { usedSymbol = sym; break; }
    }
    if (!quote) continue;

    const pctChange = quote.changePercentage;

    let mismatch = false;
    let claimedLabel = "";

    // Do NOT compare streak / multi-day wording (連漲, 連跌, consecutive…) to today's session % — they measure different things.
    if (claim.claimedDirection === "up" || claim.claimedDirection === "down") {
      continue;
    }

    // Only flag 新高/新低 when price is clearly inconsistent with being near the yearly range (avoids noisy rejects).
    if (claim.claimedDirection === "new_high" && quote.yearHigh > 0 && quote.price < quote.yearHigh * 0.85) {
      mismatch = true;
      claimedLabel = `new high (price ${quote.price} vs year high ${quote.yearHigh})`;
    } else if (claim.claimedDirection === "new_low" && quote.yearLow > 0 && quote.price > quote.yearLow * 1.15) {
      mismatch = true;
      claimedLabel = `new low (price ${quote.price} vs year low ${quote.yearLow})`;
    }

    if (mismatch) {
      failures.push({
        instrument: claim.instrument,
        fmpSymbol: usedSymbol,
        claimed: claimedLabel,
        actualChange: Math.round(pctChange * 100) / 100,
        actualPrice: Math.round(quote.price * 100) / 100,
      });
    }
  }

  if (failures.length === 0) return { ok: true };

  const detail = failures
    .map((f) => `${f.instrument} (${f.fmpSymbol}): claimed "${f.claimed}" but actual change today is ${f.actualChange}%, price ~${f.actualPrice}`)
    .join("; ");
  return {
    ok: false,
    message: `Direction validation failed: ${detail}. The headline claims a direction that contradicts live market data. Regenerate or edit the topic.`,
    failures,
  };
}

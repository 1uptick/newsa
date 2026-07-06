/**
 * Gainers/losers processor (ported from 1uptick): FMP batch quotes → top 100 by change %.
 */

const FMP_BASE = "https://financialmodelingprep.com/stable";
const PER_EXCHANGE_TIMEOUT_MS = 45_000;
const TOP_N = 100;

export interface GainerLoserEntry {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changesPercentage: number;
  volume?: number;
}

interface RawQuote {
  symbol?: string;
  name?: string;
  companyName?: string;
  price?: number;
  change?: number;
  changesPercentage?: number;
  changePercentage?: number;
  changesPercent?: number;
  volume?: number;
  [key: string]: unknown;
}

const OCC_OPTION_SYMBOL_RE = /^[A-Z]{1,6}\d{6}[CP]\d{8}$/;
const NON_EQUITY_NAME_RE =
  /\b(ETF|ETN|ETP|MUTUAL\s+FUND|INDEX\s+FUND|EXCHANGE\s+TRADED|PROSHARES|ISHARES|SPDR|VANGUARD|INVESCO|DIREXION)\b/i;
const WARRANT_NAME_RE = /\b(WARRANTS?|RIGHTS?|UNITS?)\b/i;
const SPAC_NAME_RE = /\b(ACQUISITION\s+CORP(?:ORATION)?|SPECIAL\s+PURPOSE\s+ACQUISITION|BLANK\s+CHECK)\b/i;
const WARRANT_SYMBOL_RE = /(?:[.\-/](?:W|WT|WS|RT|R|U))$/i;
const NON_COMMON_STOCK_SUFFIX_RE = /(?:[.\-/](?:UN|U|WS?|WT[A-Z]*|W[A-Z]*|RT|R|PR[A-Z]*|PS[A-Z]*|PFD|WI))$/i;
const DASH_SUFFIX_RE = /-[A-Z0-9]+$/i;

function normalizeTickerForMatch(symbol: string): string {
  return String(symbol || "")
    .trim()
    .toUpperCase()
    .replace(/-/g, ".");
}

function buildMembershipSet(symbols: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const raw of symbols) {
    const upper = String(raw || "").trim().toUpperCase();
    if (!upper) continue;
    out.add(upper);
    out.add(normalizeTickerForMatch(upper));
  }
  return out;
}

function getChangePct(q: RawQuote): number {
  const v =
    q.changesPercentage ??
    q.changePercentage ??
    q.changesPercent ??
    (q as Record<string, unknown>).changePercent;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  if (q.price != null && q.change != null) {
    const prev = Number(q.price) - Number(q.change);
    if (prev !== 0) return (Number(q.change) / prev) * 100;
  }
  return 0;
}

function isLikelyCompanyCommonStock(q: RawQuote): boolean {
  const symbol = String(q?.symbol || "")
    .trim()
    .toUpperCase();
  const name = String(q?.name ?? q?.companyName ?? "").trim();
  if (!symbol) return false;
  if (OCC_OPTION_SYMBOL_RE.test(symbol)) return false;
  if (WARRANT_SYMBOL_RE.test(symbol)) return false;
  if (NON_COMMON_STOCK_SUFFIX_RE.test(symbol)) return false;
  if (DASH_SUFFIX_RE.test(symbol)) return false;
  if (/\b(?:WARRANT|RIGHT|UNIT|ETF|ETN|PFD|PREFERRED)\b/i.test(symbol)) return false;
  if (name) {
    if (NON_EQUITY_NAME_RE.test(name)) return false;
    if (WARRANT_NAME_RE.test(name)) return false;
    if (SPAC_NAME_RE.test(name)) return false;
    if (/\b(CALL|PUT|PREFERRED|PREFERENCE SHARES?)\b/i.test(name)) return false;
  }
  return true;
}

function parseVolume(q: RawQuote): number | undefined {
  const rec = q as Record<string, unknown>;
  const tryParse = (raw: unknown): number | undefined => {
    if (raw == null || raw === "") return undefined;
    if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) return Math.round(raw);
    if (typeof raw === "string") {
      const cleaned = raw.replace(/,/g, "").trim();
      if (!cleaned) return undefined;
      const v = Number(cleaned);
      if (Number.isFinite(v) && v >= 0) return Math.round(v);
    }
    return undefined;
  };
  for (const k of ["volume", "dayVolume", "vol", "Vol"] as const) {
    const v = tryParse(rec[k]);
    if (v !== undefined) return v;
  }
  for (const k of ["avgVolume", "averageVolume"] as const) {
    const v = tryParse(rec[k]);
    if (v !== undefined) return v;
  }
  return undefined;
}

function toEntry(q: RawQuote): GainerLoserEntry | null {
  if (!q?.symbol || q.price == null || Number(q.price) <= 0) return null;
  if (!isLikelyCompanyCommonStock(q)) return null;
  const pct = getChangePct(q);
  const vol = parseVolume(q);
  return {
    symbol: String(q.symbol),
    name: String(q.name ?? q.companyName ?? ""),
    price: Number(q.price),
    change: Number(q.change) || 0,
    changesPercentage: pct,
    ...(vol !== undefined ? { volume: vol } : {}),
  };
}

async function fetchBatchExchangeQuote(key: string, exchangeAlias: string): Promise<RawQuote[]> {
  const url = `${FMP_BASE}/batch-exchange-quote?exchange=${encodeURIComponent(exchangeAlias)}&apikey=${key}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return [];
    if (data[0]?.["Error Message"]) return [];
    return data as RawQuote[];
  } catch {
    return [];
  }
}

function computeTopGainersLosers(quotes: RawQuote[]): {
  gainers: GainerLoserEntry[];
  losers: GainerLoserEntry[];
} {
  const entries = quotes.map(toEntry).filter(Boolean) as GainerLoserEntry[];
  const gainers = entries.filter((e) => e.changesPercentage >= 0);
  const losers = entries.filter((e) => e.changesPercentage < 0);
  gainers.sort((a, b) => b.changesPercentage - a.changesPercentage);
  losers.sort((a, b) => a.changesPercentage - b.changesPercentage);
  return {
    gainers: gainers.slice(0, TOP_N),
    losers: losers.slice(0, TOP_N),
  };
}

function filterQuotesByConstituents(quotes: RawQuote[], constituentSymbols: Set<string>): RawQuote[] {
  if (!constituentSymbols || constituentSymbols.size === 0) return [];
  const membership = buildMembershipSet(constituentSymbols);
  return quotes.filter((q) => {
    if (!q?.symbol) return false;
    const upper = String(q.symbol).trim().toUpperCase();
    if (!upper) return false;
    return membership.has(upper) || membership.has(normalizeTickerForMatch(upper));
  });
}

export async function fetchBatchQuotesForSymbols(key: string, symbols: string[]): Promise<RawQuote[]> {
  const unique = [...new Set(symbols.map((s) => String(s).trim()).filter(Boolean))];
  if (unique.length === 0) return [];

  const CHUNK_SIZE = 100;
  const allQuotes: RawQuote[] = [];

  for (let i = 0; i < unique.length; i += CHUNK_SIZE) {
    const chunk = unique.slice(i, i + CHUNK_SIZE);
    const symbolsParam = chunk.map((s) => encodeURIComponent(s)).join(",");
    const url = `${FMP_BASE}/batch-quote?symbols=${symbolsParam}&apikey=${key}`;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data)) continue;
      if (data.length > 0 && data[0]?.["Error Message"]) continue;
      allQuotes.push(...(data as RawQuote[]));
    } catch {
      /* next chunk */
    }
  }

  return allQuotes;
}

export async function computeGainersLosersFromSymbols(
  key: string,
  symbols: string[]
): Promise<{ gainers: GainerLoserEntry[]; losers: GainerLoserEntry[] }> {
  const quotes = await fetchBatchQuotesForSymbols(key, symbols);
  return computeTopGainersLosers(quotes);
}

export async function computeGainersLosersForExchange(
  key: string,
  exchange: string,
  exchangeAliases: string[],
  constituentSymbols?: Set<string>
): Promise<{ gainers: GainerLoserEntry[]; losers: GainerLoserEntry[] }> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Gainers/losers timed out for ${exchange}`)), PER_EXCHANGE_TIMEOUT_MS)
  );

  const work = async () => {
    for (const alias of exchangeAliases) {
      const quotes = await fetchBatchExchangeQuote(key, alias);
      if (quotes.length > 0) {
        const filteredQuotes = constituentSymbols ? filterQuotesByConstituents(quotes, constituentSymbols) : quotes;
        return computeTopGainersLosers(filteredQuotes);
      }
    }

    if (!exchangeAliases.includes(exchange)) {
      const quotes = await fetchBatchExchangeQuote(key, exchange);
      if (quotes.length > 0) {
        const filteredQuotes = constituentSymbols ? filterQuotesByConstituents(quotes, constituentSymbols) : quotes;
        return computeTopGainersLosers(filteredQuotes);
      }
    }

    return { gainers: [], losers: [] };
  };

  try {
    return await Promise.race([work(), timeoutPromise]);
  } catch {
    return { gainers: [], losers: [] };
  }
}

/** Generic quote → mover row (forex / commodities / crypto). */
export function quoteToMoverEntry(q: RawQuote, skipStockFilter = false): GainerLoserEntry | null {
  if (!q?.symbol || q.price == null || Number(q.price) <= 0) return null;
  if (!skipStockFilter && !isLikelyCompanyCommonStock(q)) return null;
  const pct = getChangePct(q);
  const vol = parseVolume(q);
  return {
    symbol: String(q.symbol),
    name: String(q.name ?? q.companyName ?? q.symbol),
    price: Number(q.price),
    change: Number(q.change) || 0,
    changesPercentage: pct,
    ...(vol !== undefined ? { volume: vol } : {}),
  };
}

export function splitTopMovers(entries: GainerLoserEntry[]): {
  gainers: GainerLoserEntry[];
  losers: GainerLoserEntry[];
} {
  const gainers = entries.filter((e) => e.changesPercentage >= 0);
  const losers = entries.filter((e) => e.changesPercentage < 0);
  gainers.sort((a, b) => b.changesPercentage - a.changesPercentage);
  losers.sort((a, b) => a.changesPercentage - b.changesPercentage);
  return {
    gainers: gainers.slice(0, TOP_N),
    losers: losers.slice(0, TOP_N),
  };
}

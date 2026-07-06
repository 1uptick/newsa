/**
 * ATFX Markets movers: stocks / forex / commodities / crypto.
 * Primary source: 1uptick Firestore (uptick-prod). FMP is fallback when Firestore is unavailable.
 */

import { cache } from "./cache.js";
import { config } from "./config.js";
import { isWeekdayUTC } from "./atfxMarketMap.js";
import {
  computeGainersLosersForExchange,
  computeGainersLosersFromSymbols,
  fetchBatchQuotesForSymbols,
  quoteToMoverEntry,
  splitTopMovers,
  type GainerLoserEntry,
} from "./atfxGainersLosersProcessor.js";
import {
  canonicalizeIndexSymbol,
  FOREX_HEATMAP_PAIRS,
  GAINERS_LOSERS_INDEXES,
  pairDisplaySymbol,
  type MarketMoversCategory,
  type MarketMoversData,
} from "./atfxMarketMoversShared.js";
import {
  isOneuptickFirestoreConfigured,
  readMoversFromOneuptickFirestore,
} from "./oneuptickMarketDataCache.js";

const FMP_BASE = "https://financialmodelingprep.com/stable";
const CACHE_TTL_SECONDS = 20 * 60;

export { GAINERS_LOSERS_INDEXES, canonicalizeIndexSymbol } from "./atfxMarketMoversShared.js";
export type { MarketMoversCategory, MarketMoversData } from "./atfxMarketMoversShared.js";
export type MarketMoverEntry = GainerLoserEntry;

interface IndexExchangeConfig {
  symbol: string;
  exchange: string;
  exchangeAliases: string[];
}

const INDEX_EXCHANGE_CONFIG: IndexExchangeConfig[] = [
  { symbol: "^DJI", exchange: "NYSE", exchangeAliases: ["NYSE", "XNYS", "New York Stock Exchange"] },
  { symbol: "^GSPC", exchange: "NYSE", exchangeAliases: ["NYSE", "XNYS", "New York Stock Exchange"] },
  { symbol: "^NDX", exchange: "NASDAQ", exchangeAliases: ["NASDAQ", "XNAS", "Nasdaq", "Nasdaq Global Select"] },
  { symbol: "^GSPTSE", exchange: "TSX", exchangeAliases: ["TSX", "XTSE", "Toronto Stock Exchange", "Toronto"] },
  { symbol: "^FTSE", exchange: "LSE", exchangeAliases: ["LSE", "LON", "London Stock Exchange", "London"] },
  { symbol: "^FCHI", exchange: "EURONEXT", exchangeAliases: ["EPA", "PAR", "EURONEXT", "Euronext Paris", "Paris"] },
  { symbol: "^GDAXI", exchange: "XETRA", exchangeAliases: ["XETRA", "ETR", "FRA", "Frankfurt Stock Exchange", "Frankfurt"] },
  { symbol: "^N225", exchange: "JPX", exchangeAliases: ["JPX", "TSE", "TYO", "Tokyo Stock Exchange", "Japan Exchange Group", "Tokyo"] },
  { symbol: "^KS11", exchange: "KRX", exchangeAliases: ["KRX", "KRXK", "XKRX", "KSC", "Korea Exchange", "Korea Stock Exchange", "Seoul", "KSE"] },
  { symbol: "^HSI", exchange: "HKEX", exchangeAliases: ["HKSE", "HKEX", "HKG", "HKE", "SEHK", "Hong Kong Stock Exchange", "Hong Kong Exchanges", "Hong Kong"] },
  { symbol: "^TWII", exchange: "TWSE", exchangeAliases: ["TWSE", "TAI", "TWO", "Taiwan Stock Exchange", "Taipei Exchange", "Taiwan"] },
  { symbol: "^STI", exchange: "SGX", exchangeAliases: ["SGX", "SES", "Singapore Exchange", "Singapore"] },
  { symbol: "^BSESN", exchange: "BSE", exchangeAliases: ["BSE", "NSE", "BOM", "Bombay Stock Exchange", "National Stock Exchange of India", "Mumbai"] },
  { symbol: "000001.SS", exchange: "SSE", exchangeAliases: ["SSE", "SHA", "SHH", "Shanghai Stock Exchange", "Shanghai"] },
  { symbol: "^AXJO", exchange: "ASX", exchangeAliases: ["ASX", "Australian Securities Exchange", "Sydney"] },
  { symbol: "^BVSP", exchange: "B3", exchangeAliases: ["B3", "BVMF", "BOVESPA", "Brasil Bolsa Balcão", "B3 - Brasil Bolsa Balcão", "São Paulo", "Sao Paulo"] },
];

const INDEX_GAINERS_LOSERS_SUFFIX_FILTER: Record<string, string | string[]> = {
  "^KS11": ".KS",
  "^GSPTSE": ".TO",
  "^FTSE": ".L",
  "^HSI": ".HK",
  "^TWII": ".TW",
  "^STI": ".SI",
  "^BSESN": ".BO",
  "000001.SS": ".SS",
  "^BVSP": ".SA",
};

const FOREX_PAIRS = FOREX_HEATMAP_PAIRS;

function getFmpKey(): string | null {
  const key = config.fmp.apiKey?.trim();
  return key || null;
}

function getIndexConfig(indexSymbol: string): IndexExchangeConfig | null {
  const canonical = canonicalizeIndexSymbol(indexSymbol);
  return INDEX_EXCHANGE_CONFIG.find((i) => i.symbol === canonical) ?? null;
}

function moversCacheKey(category: MarketMoversCategory, indexSymbol?: string): string {
  if (category === "stocks" && indexSymbol) {
    return `atfx:movers:stocks:v2:${canonicalizeIndexSymbol(indexSymbol)}`;
  }
  if (category === "forex") {
    return "atfx:movers:forex:v3";
  }
  return `atfx:movers:${category}`;
}

function readCache(category: MarketMoversCategory, indexSymbol?: string): MarketMoversData | null {
  const hit = cache.get<MarketMoversData>(moversCacheKey(category, indexSymbol));
  if (!hit?.data) return null;
  const ageMs = Date.now() - (hit.data.lastUpdated || 0);
  if (ageMs > CACHE_TTL_SECONDS * 1000 && isWeekdayUTC()) return null;
  return hit.data;
}

function writeCache(data: MarketMoversData): void {
  cache.set(moversCacheKey(data.category, data.indexSymbol), data, CACHE_TTL_SECONDS);
}

function filterBySuffix(
  indexSymbol: string,
  gainers: GainerLoserEntry[],
  losers: GainerLoserEntry[]
): { gainers: GainerLoserEntry[]; losers: GainerLoserEntry[] } {
  const canonical = canonicalizeIndexSymbol(indexSymbol);
  const allowed = INDEX_GAINERS_LOSERS_SUFFIX_FILTER[canonical];
  if (!allowed) return { gainers, losers };
  const suffixes = (Array.isArray(allowed) ? allowed : [allowed]).map((s) => String(s).toUpperCase());
  const match = (symbol: string) => {
    const u = String(symbol || "").toUpperCase();
    return suffixes.some((suf) => u.endsWith(suf));
  };
  return {
    gainers: gainers.filter((r) => match(r.symbol)),
    losers: losers.filter((r) => match(r.symbol)),
  };
}

function symbolLookupKeys(symbol: string): string[] {
  const u = String(symbol || "").trim().toUpperCase();
  if (!u) return [];
  const keys = new Set<string>([u]);
  if (u.includes(".")) keys.add(u.replace(/\./g, "-"));
  if (u.includes("-")) keys.add(u.replace(/-/g, "."));
  return [...keys];
}

function lookupNameInMap(nameMap: Map<string, string>, symbol: string): string {
  for (const key of symbolLookupKeys(symbol)) {
    const hit = nameMap.get(key)?.trim();
    if (hit) return hit;
  }
  return "";
}

function rowNeedsCompanyName(entry: GainerLoserEntry): boolean {
  const name = entry.name?.trim() ?? "";
  if (!name) return true;
  const sym = entry.symbol.trim().toUpperCase();
  return name.toUpperCase() === sym;
}

function extractConstituentRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    const nested = obj.data ?? obj.constituents ?? obj.holdings ?? obj.results;
    if (Array.isArray(nested)) return nested;
  }
  return [];
}

function extractConstituents(payload: unknown): { symbols: string[]; names: Map<string, string> } {
  const rows = extractConstituentRows(payload);
  const symbols = new Set<string>();
  const names = new Map<string, string>();

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const candidate =
      (typeof rec.asset === "string" && rec.asset) ||
      (typeof rec.symbol === "string" && rec.symbol) ||
      (typeof rec.ticker === "string" && rec.ticker) ||
      "";
    const sym = String(candidate).trim().toUpperCase().replace(/-/g, ".");
    if (!sym || sym.startsWith("^")) continue;
    symbols.add(sym);

    const rawName =
      (typeof rec.name === "string" && rec.name) ||
      (typeof rec.companyName === "string" && rec.companyName) ||
      (typeof rec.company === "string" && rec.company) ||
      (typeof rec.securityName === "string" && rec.securityName) ||
      "";
    const name = String(rawName).trim();
    if (name) {
      for (const key of symbolLookupKeys(sym)) {
        names.set(key, name);
      }
    }
  }

  return { symbols: [...symbols], names };
}

async function fetchCompanyNamesFromFmp(key: string, symbols: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(symbols.map((s) => String(s).trim()).filter(Boolean))];
  if (unique.length === 0) return out;

  const PROFILE_CHUNK = 40;
  for (let i = 0; i < unique.length; i += PROFILE_CHUNK) {
    const chunk = unique.slice(i, i + PROFILE_CHUNK);
    const param = chunk.map((s) => encodeURIComponent(s)).join(",");
    try {
      const res = await fetch(`${FMP_BASE}/profile?symbol=${param}&apikey=${key}`);
      if (!res.ok) continue;
      const data: unknown = await res.json();
      if (data && typeof data === "object" && !Array.isArray(data) && (data as Record<string, unknown>)["Error Message"]) {
        continue;
      }
      const rows = Array.isArray(data) ? data : data ? [data] : [];
      for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const rec = row as Record<string, unknown>;
        const sym = String(rec.symbol ?? "").trim();
        const name = String(rec.companyName ?? rec.name ?? "").trim();
        if (!sym || !name) continue;
        for (const mapKey of symbolLookupKeys(sym)) {
          out.set(mapKey, name);
        }
      }
    } catch {
      /* try individual fallback below */
    }
  }

  const stillMissing = unique.filter((sym) => !lookupNameInMap(out, sym));
  const CONCURRENCY = 8;
  for (let i = 0; i < stillMissing.length; i += CONCURRENCY) {
    const batch = stillMissing.slice(i, i + CONCURRENCY);
    await Promise.allSettled(
      batch.map(async (sym) => {
        try {
          const res = await fetch(`${FMP_BASE}/profile?symbol=${encodeURIComponent(sym)}&apikey=${key}`);
          if (!res.ok) return;
          const data: unknown = await res.json();
          const row = Array.isArray(data) ? data[0] : data;
          if (!row || typeof row !== "object") return;
          const rec = row as Record<string, unknown>;
          const name = String(rec.companyName ?? rec.name ?? "").trim();
          if (!name) return;
          const resolvedSym = String(rec.symbol ?? sym).trim();
          for (const mapKey of symbolLookupKeys(resolvedSym)) {
            out.set(mapKey, name);
          }
        } catch {
          /* skip symbol */
        }
      })
    );
  }

  return out;
}

async function enrichStockMoverNames(
  key: string,
  gainers: GainerLoserEntry[],
  losers: GainerLoserEntry[],
  presetNames: Map<string, string>
): Promise<{ gainers: GainerLoserEntry[]; losers: GainerLoserEntry[] }> {
  const nameMap = new Map(presetNames);
  const needsLookup = [...gainers, ...losers]
    .filter(rowNeedsCompanyName)
    .map((e) => e.symbol.trim())
    .filter(Boolean);
  const missing = [...new Set(needsLookup.filter((sym) => !lookupNameInMap(nameMap, sym)))];
  if (missing.length > 0) {
    const fetched = await fetchCompanyNamesFromFmp(key, missing);
    for (const [sym, name] of fetched) {
      nameMap.set(sym, name);
    }
  }

  const enrich = (entry: GainerLoserEntry): GainerLoserEntry => {
    if (!rowNeedsCompanyName(entry)) return entry;
    const name = lookupNameInMap(nameMap, entry.symbol);
    return name ? { ...entry, name } : entry;
  };

  return {
    gainers: gainers.map(enrich),
    losers: losers.map(enrich),
  };
}

async function fetchIndexConstituents(
  key: string,
  indexSymbol: string
): Promise<{ symbols: string[]; names: Map<string, string> }> {
  const canonical = canonicalizeIndexSymbol(indexSymbol);
  const endpoints: Record<string, string[]> = {
    "^GSPC": [`${FMP_BASE}/sp500-constituent?apikey=${key}`, `${FMP_BASE}/sp500_constituent?apikey=${key}`],
    "^DJI": [`${FMP_BASE}/dowjones-constituent?apikey=${key}`, `${FMP_BASE}/dowjones_constituent?apikey=${key}`],
    "^NDX": [
      `${FMP_BASE}/nasdaq100-constituent?apikey=${key}`,
      `${FMP_BASE}/index-constituent?symbol=${encodeURIComponent("^NDX")}&apikey=${key}`,
    ],
  };

  const urls = endpoints[canonical] ?? [
    `${FMP_BASE}/index-constituent?symbol=${encodeURIComponent(canonical)}&apikey=${key}`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      if (data && typeof (data as { "Error Message"?: string })["Error Message"] === "string") continue;
      const parsed = extractConstituents(data);
      if (parsed.symbols.length > 0) return parsed;
    } catch {
      /* try next */
    }
  }
  return { symbols: [], names: new Map() };
}

async function fetchStockMoversFromFmp(key: string, indexSymbol: string): Promise<MarketMoversData> {
  const canonical = canonicalizeIndexSymbol(indexSymbol);
  const cfg = getIndexConfig(canonical);
  if (!cfg) {
    throw new Error(`Unknown index symbol: ${indexSymbol}`);
  }

  const { symbols: constituents, names: constituentNames } = await fetchIndexConstituents(key, canonical);
  let gainers: GainerLoserEntry[] = [];
  let losers: GainerLoserEntry[] = [];

  if (constituents.length > 0) {
    const direct = await computeGainersLosersFromSymbols(key, constituents);
    gainers = direct.gainers;
    losers = direct.losers;
  }

  if (gainers.length + losers.length < 5 && constituents.length > 10) {
    const constituentSet = new Set(constituents);
    const fallback = await computeGainersLosersForExchange(
      key,
      cfg.exchange,
      cfg.exchangeAliases,
      constituentSet
    );
    if (fallback.gainers.length + fallback.losers.length > gainers.length + losers.length) {
      gainers = fallback.gainers;
      losers = fallback.losers;
    }
  }

  if (gainers.length + losers.length === 0) {
    const exchangeOnly = await computeGainersLosersForExchange(key, cfg.exchange, cfg.exchangeAliases, undefined);
    gainers = exchangeOnly.gainers;
    losers = exchangeOnly.losers;
  }

  const filtered = filterBySuffix(canonical, gainers, losers);
  const enriched = await enrichStockMoverNames(key, filtered.gainers, filtered.losers, constituentNames);
  return {
    category: "stocks",
    gainers: enriched.gainers,
    losers: enriched.losers,
    lastUpdated: Date.now(),
    indexSymbol: canonical,
  };
}

const FOREX_MAJOR_PAIR_KEYS = new Set([
  "EUR|USD",
  "GBP|USD",
  "USD|JPY",
  "USD|CAD",
  "USD|CHF",
  "AUD|USD",
  "USD|CNY",
]);

function sortForexPairsByChange(rows: GainerLoserEntry[]): GainerLoserEntry[] {
  return [...rows].sort((a, b) => b.changesPercentage - a.changesPercentage);
}

const FOREX_DISPLAY_TO_FMP = new Map(
  FOREX_PAIRS.map((pair) => [pairDisplaySymbol(pair.base, pair.quote), pair.symbol.toUpperCase()])
);

function displaySymbolToFmpSymbol(display: string): string | null {
  const normalized = String(display || "").trim().toUpperCase();
  if (!normalized) return null;
  const direct = FOREX_DISPLAY_TO_FMP.get(normalized);
  if (direct) return direct;

  const slash = normalized.split("/").map((p) => p.replace(/[^A-Z]/g, "")).filter(Boolean);
  if (slash.length === 2 && slash[0].length === 3 && slash[1].length === 3) {
    const base = slash[0] === "CNY" ? "CNH" : slash[0];
    const quote = slash[1] === "CNY" ? "CNH" : slash[1];
    return `${base}${quote}`;
  }

  const letters = normalized.replace(/[^A-Z]/g, "");
  if (letters.length === 6) {
    const base = letters.slice(0, 3) === "CNY" ? "CNH" : letters.slice(0, 3);
    const quote = letters.slice(3, 6) === "CNY" ? "CNH" : letters.slice(3, 6);
    return `${base}${quote}`;
  }

  return null;
}

function forexRowNeedsPrice(row: GainerLoserEntry): boolean {
  return !Number.isFinite(row.price) || row.price <= 0;
}

/** 1uptick heatmap has % change only — fill live FMP bid/ask prices when missing. */
async function enrichForexMoversWithFmpPrices(
  data: MarketMoversData,
  key: string
): Promise<MarketMoversData> {
  const all = [...data.gainers, ...data.losers];
  if (all.length === 0 || !all.some(forexRowNeedsPrice)) return data;

  const fmpSymbols = [
    ...new Set(
      all
        .map((row) => displaySymbolToFmpSymbol(row.symbol))
        .filter((sym): sym is string => Boolean(sym))
    ),
  ];
  if (fmpSymbols.length === 0) return data;

  const quotes = await fetchBatchQuotesForSymbols(key, fmpSymbols);
  const byFmp = new Map(quotes.map((q) => [String(q.symbol || "").toUpperCase(), q]));

  const enrichRows = (rows: GainerLoserEntry[]): GainerLoserEntry[] =>
    rows.map((row) => {
      if (!forexRowNeedsPrice(row)) return row;
      const fmp = displaySymbolToFmpSymbol(row.symbol);
      if (!fmp) return row;
      const q = byFmp.get(fmp);
      const entry = q ? quoteToMoverEntry(q, true) : null;
      if (!entry) return row;
      return {
        ...row,
        price: entry.price,
        change: Number.isFinite(row.change) ? row.change : entry.change,
        changesPercentage: Number.isFinite(row.changesPercentage)
          ? row.changesPercentage
          : entry.changesPercentage,
      };
    });

  return {
    ...data,
    gainers: enrichRows(data.gainers),
    losers: enrichRows(data.losers),
  };
}

async function finalizeForexMovers(data: MarketMoversData): Promise<MarketMoversData> {
  const key = getFmpKey();
  if (!key) return data;
  return enrichForexMoversWithFmpPrices(data, key);
}

async function fetchForexMoversFromFmp(key: string): Promise<MarketMoversData> {
  const symbols = FOREX_PAIRS.map((p) => p.symbol);
  const quotes = await fetchBatchQuotesForSymbols(key, symbols);
  const bySymbol = new Map(quotes.map((q) => [String(q.symbol || "").toUpperCase(), q]));

  const majors: GainerLoserEntry[] = [];
  const crosses: GainerLoserEntry[] = [];

  for (const pair of FOREX_PAIRS) {
    const q = bySymbol.get(pair.symbol.toUpperCase());
    if (!q) continue;
    const row = quoteToMoverEntry(q, true);
    if (!row) continue;
    const entry: GainerLoserEntry = {
      ...row,
      symbol: pairDisplaySymbol(pair.base, pair.quote),
      name: pairDisplaySymbol(pair.base, pair.quote),
    };
    const pairKey = `${pair.base}|${pair.quote}`;
    if (FOREX_MAJOR_PAIR_KEYS.has(pairKey)) {
      majors.push(entry);
    } else if (pair.base !== "USD" && pair.quote !== "USD") {
      crosses.push(entry);
    }
  }

  return {
    category: "forex",
    gainers: sortForexPairsByChange(majors),
    losers: sortForexPairsByChange(crosses),
    lastUpdated: Date.now(),
  };
}

async function fetchBatchQuotesFromEndpoint(key: string, endpoint: string): Promise<GainerLoserEntry[]> {
  try {
    const res = await fetch(`${FMP_BASE}/${endpoint}?apikey=${key}`);
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data) || (data.length > 0 && data[0]?.["Error Message"])) return [];
    const entries = data
      .map((q) => quoteToMoverEntry(q as Parameters<typeof quoteToMoverEntry>[0], true))
      .filter(Boolean) as GainerLoserEntry[];
    return entries;
  } catch {
    return [];
  }
}

async function fetchCommoditiesMoversFromFmp(key: string): Promise<MarketMoversData> {
  let entries = await fetchBatchQuotesFromEndpoint(key, "batch-commodity-quotes");
  if (entries.length === 0) {
    const listRes = await fetch(`${FMP_BASE}/commodities-list?apikey=${key}`);
    if (listRes.ok) {
      const list = await listRes.json();
      const symbols = (Array.isArray(list) ? list : [])
        .map((i: { symbol?: string }) => i?.symbol)
        .filter(Boolean)
        .slice(0, 200) as string[];
      if (symbols.length > 0) {
        const quotes = await fetchBatchQuotesForSymbols(key, symbols);
        entries = quotes
          .map((q) => quoteToMoverEntry(q, true))
          .filter(Boolean) as GainerLoserEntry[];
      }
    }
  }
  const { gainers, losers } = splitTopMovers(entries);
  return { category: "commodities", gainers, losers, lastUpdated: Date.now() };
}

async function fetchCryptoMoversFromFmp(key: string): Promise<MarketMoversData> {
  let entries = await fetchBatchQuotesFromEndpoint(key, "batch-crypto-quotes");
  if (entries.length === 0) {
    const listRes = await fetch(`${FMP_BASE}/cryptocurrency-list?apikey=${key}`);
    if (listRes.ok) {
      const list = await listRes.json();
      const symbols = (Array.isArray(list) ? list : [])
        .map((i: { symbol?: string }) => i?.symbol)
        .filter(Boolean)
        .slice(0, 200) as string[];
      if (symbols.length > 0) {
        const quotes = await fetchBatchQuotesForSymbols(key, symbols);
        entries = quotes
          .map((q) => quoteToMoverEntry(q, true))
          .filter(Boolean) as GainerLoserEntry[];
      }
    }
  }
  const { gainers, losers } = splitTopMovers(entries);
  return { category: "crypto", gainers, losers, lastUpdated: Date.now() };
}

export function parseMarketMoversCategory(raw: unknown): MarketMoversCategory | null {
  const v = String(raw || "")
    .trim()
    .toLowerCase();
  if (v === "stocks" || v === "forex" || v === "commodities" || v === "crypto") return v;
  return null;
}

export async function fetchMarketMovers(
  category: MarketMoversCategory,
  options?: { indexSymbol?: string; forceRefresh?: boolean }
): Promise<MarketMoversData> {
  const indexSymbol = options?.indexSymbol ? canonicalizeIndexSymbol(options.indexSymbol) : "^GSPC";
  const allowStale = options?.forceRefresh === true || !isWeekdayUTC();

  if (!options?.forceRefresh) {
    const cached = readCache(category, category === "stocks" ? indexSymbol : undefined);
    if (cached) {
      if (category === "forex") {
        const enriched = await finalizeForexMovers(cached);
        if (enriched !== cached) writeCache(enriched);
        return enriched;
      }
      return cached;
    }
  }

  if (isOneuptickFirestoreConfigured()) {
    const fromFirestore = await readMoversFromOneuptickFirestore(
      category,
      category === "stocks" ? indexSymbol : undefined,
      { allowStale }
    );
    if (fromFirestore) {
      const data =
        category === "forex" ? await finalizeForexMovers(fromFirestore) : fromFirestore;
      writeCache(data);
      return data;
    }
  }

  const key = getFmpKey();
  if (!key) {
    const stale = readCache(category, category === "stocks" ? indexSymbol : undefined);
    if (stale) {
      if (category === "forex") return finalizeForexMovers(stale);
      return stale;
    }
    throw new Error("FMP_API_KEY is not configured on the server.");
  }

  let data: MarketMoversData;
  switch (category) {
    case "stocks":
      data = await fetchStockMoversFromFmp(key, indexSymbol);
      break;
    case "forex":
      data = await fetchForexMoversFromFmp(key);
      break;
    case "commodities":
      data = await fetchCommoditiesMoversFromFmp(key);
      break;
    case "crypto":
      data = await fetchCryptoMoversFromFmp(key);
      break;
    default:
      throw new Error(`Unsupported category: ${category}`);
  }

  if (category === "forex") {
    data = await finalizeForexMovers(data);
  }

  writeCache(data);
  return data;
}

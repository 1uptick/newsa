/**
 * Global market map data for ATFX Markets page.
 * Primary source: 1uptick Firestore marketMapCache/latest. FMP fallback when Firestore unavailable.
 */

import { cache, CACHE_KEYS } from "./cache.js";
import { config } from "./config.js";
import {
  isOneuptickFirestoreConfigured,
  readMarketMapFromOneuptickFirestore,
} from "./oneuptickMarketDataCache.js";

const FMP_BASE = "https://financialmodelingprep.com/stable";
const CACHE_TTL_SECONDS = 20 * 60;
const EXPECTED_INDEX_COUNT = 16;
const REFRESH_INTERVAL_MS = 20 * 60 * 1000;

export interface MarketMapIndex {
  symbol: string;
  name: string;
  shortName: string;
  exchange: string;
  country: string;
  lat: number;
  lng: number;
  price: number;
  change: number;
  changesPercentage: number;
  isOpen: boolean;
}

export interface MarketMapData {
  indexes: MarketMapIndex[];
  lastUpdated: number;
}

interface TargetIndex {
  symbol: string;
  name: string;
  shortName: string;
  exchange: string;
  exchangeAliases: string[];
  country: string;
  lat: number;
  lng: number;
}

interface QuoteResponse {
  symbol: string;
  name?: string;
  price?: number;
  change?: number;
  changesPercentage?: number;
  changePercentage?: number;
  changesPercent?: number;
  [key: string]: unknown;
}

interface ExchangeHoursEntry {
  exchange?: string;
  name?: string;
  isMarketOpen?: boolean | string;
  stockExchange?: string;
  exchangeShortName?: string;
  [key: string]: unknown;
}

const TARGET_INDEXES: TargetIndex[] = [
  { symbol: "^DJI", name: "Dow Jones Industrial Average", shortName: "DOW 30", exchange: "NYSE", exchangeAliases: ["NYSE", "XNYS", "New York Stock Exchange"], country: "US", lat: 43, lng: -92 },
  { symbol: "^GSPC", name: "S&P 500", shortName: "S&P 500", exchange: "NYSE", exchangeAliases: ["NYSE", "XNYS", "New York Stock Exchange"], country: "US", lat: 37, lng: -82 },
  { symbol: "^NDX", name: "Nasdaq 100", shortName: "NASDAQ 100", exchange: "NASDAQ", exchangeAliases: ["NASDAQ", "XNAS", "Nasdaq", "Nasdaq Global Select"], country: "US", lat: 31, lng: -72 },
  { symbol: "^GSPTSE", name: "S&P/TSX Composite Index", shortName: "TSX", exchange: "TSX", exchangeAliases: ["TSX", "XTSE", "Toronto Stock Exchange", "Toronto"], country: "CA", lat: 44, lng: -79 },
  { symbol: "^FTSE", name: "FTSE 100", shortName: "FTSE 100", exchange: "LSE", exchangeAliases: ["LSE", "LON", "London Stock Exchange", "London"], country: "GB", lat: 55, lng: -5 },
  { symbol: "^FCHI", name: "CAC 40", shortName: "CAC 40", exchange: "EURONEXT", exchangeAliases: ["EPA", "PAR", "EURONEXT", "Euronext Paris", "Paris"], country: "FR", lat: 47, lng: 2 },
  { symbol: "^GDAXI", name: "DAX Performance Index", shortName: "DAX", exchange: "XETRA", exchangeAliases: ["XETRA", "ETR", "FRA", "Frankfurt Stock Exchange", "Frankfurt"], country: "DE", lat: 52, lng: 12 },
  { symbol: "^N225", name: "Nikkei 225", shortName: "NIKKEI 225", exchange: "JPX", exchangeAliases: ["JPX", "TSE", "TYO", "Tokyo Stock Exchange", "Japan Exchange Group", "Tokyo"], country: "JP", lat: 38, lng: 140 },
  { symbol: "^KS11", name: "KOSPI Composite Index", shortName: "KOSPI", exchange: "KRX", exchangeAliases: ["KRX", "KRXK", "XKRX", "KSC", "Korea Exchange", "Korea Stock Exchange", "Seoul", "KSE"], country: "KR", lat: 37.5, lng: 127 },
  { symbol: "^HSI", name: "Hang Seng Index", shortName: "HSI", exchange: "HKEX", exchangeAliases: ["HKSE", "HKEX", "HKG", "HKE", "SEHK", "Hong Kong Stock Exchange", "Hong Kong Exchanges", "Hong Kong"], country: "HK", lat: 22, lng: 114 },
  { symbol: "^TWII", name: "Taiwan Weighted Index", shortName: "TAIEX", exchange: "TWSE", exchangeAliases: ["TWSE", "TAI", "TWO", "Taiwan Stock Exchange", "Taipei Exchange", "Taiwan"], country: "TW", lat: 15, lng: 126 },
  { symbol: "^STI", name: "Straits Times Index", shortName: "STI", exchange: "SGX", exchangeAliases: ["SGX", "SES", "Singapore Exchange", "Singapore"], country: "SG", lat: 1, lng: 104 },
  { symbol: "^BSESN", name: "BSE SENSEX", shortName: "SENSEX", exchange: "BSE", exchangeAliases: ["BSE", "NSE", "BOM", "Bombay Stock Exchange", "National Stock Exchange of India", "Mumbai"], country: "IN", lat: 19, lng: 73 },
  { symbol: "000001.SS", name: "Shanghai Composite", shortName: "SSE", exchange: "SSE", exchangeAliases: ["SSE", "SHA", "SHH", "Shanghai Stock Exchange", "Shanghai"], country: "CN", lat: 31, lng: 121 },
  { symbol: "^AXJO", name: "S&P/ASX 200", shortName: "ASX 200", exchange: "ASX", exchangeAliases: ["ASX", "Australian Securities Exchange", "Sydney"], country: "AU", lat: -30, lng: 135 },
  { symbol: "^BVSP", name: "Ibovespa Index", shortName: "IBOVESPA", exchange: "B3", exchangeAliases: ["B3", "BVMF", "BOVESPA", "Brasil Bolsa Balcão", "B3 - Brasil Bolsa Balcão", "São Paulo", "Sao Paulo"], country: "BR", lat: -15, lng: -48 },
];

export function isWeekdayUTC(): boolean {
  const utcDay = new Date().getUTCDay();
  return utcDay !== 0 && utcDay !== 6;
}

function toBool(v: unknown): boolean | undefined {
  if (v === true || v === false) return v;
  if (typeof v === "string") {
    const s = v.toLowerCase().trim();
    if (s === "true" || s === "1") return true;
    if (s === "false" || s === "0") return false;
  }
  return undefined;
}

function getChangePct(q: QuoteResponse): number {
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

function matchesExchange(entry: ExchangeHoursEntry, aliases: string[]): boolean {
  const fields = [entry.exchange, entry.name, entry.exchangeShortName, entry.stockExchange]
    .filter(Boolean)
    .map((f) => String(f).trim().toUpperCase());

  return aliases.some((alias) => {
    const upper = alias.toUpperCase();
    return fields.some((f) => f === upper);
  });
}

function getFmpKey(): string | null {
  const key = config.fmp.apiKey?.trim();
  return key || null;
}

function peekCachedMarketMap(): MarketMapData | null {
  const hit = cache.get<MarketMapData>(CACHE_KEYS.ATFX_MARKET_MAP);
  if (!hit?.data?.indexes?.length) return null;
  if (hit.data.indexes.length < EXPECTED_INDEX_COUNT) return null;
  return hit.data;
}

/**
 * Read cache only. On weekdays UTC, expired cache returns null. On weekends, stale snapshot is kept.
 */
export function getMarketMapFromCache(): MarketMapData | null {
  const hit = cache.get<MarketMapData>(CACHE_KEYS.ATFX_MARKET_MAP);
  if (!hit?.data?.indexes?.length) return null;
  if (hit.data.indexes.length < EXPECTED_INDEX_COUNT) return null;

  const ageMs = Date.now() - (hit.data.lastUpdated || 0);
  const ttlExpired = ageMs > CACHE_TTL_SECONDS * 1000;
  if (ttlExpired && isWeekdayUTC()) return null;

  return hit.data;
}

async function fetchMarketMapFromFmp(key: string): Promise<MarketMapData> {
  const symbols = TARGET_INDEXES.map((i) => encodeURIComponent(i.symbol)).join(",");

  const [quotesRes, hoursRes] = await Promise.all([
    fetch(`${FMP_BASE}/batch-quote?symbols=${symbols}&apikey=${key}`).catch(() => null),
    fetch(`${FMP_BASE}/all-exchange-market-hours?apikey=${key}`).catch(() => null),
  ]);

  let quotes: QuoteResponse[] = [];
  if (quotesRes?.ok) {
    const data = await quotesRes.json();
    if (Array.isArray(data) && data.length > 0 && !data[0]?.["Error Message"]) {
      quotes = data;
    }
  }

  if (quotes.length === 0) {
    const results = await Promise.allSettled(
      TARGET_INDEXES.map(async (idx) => {
        const res = await fetch(`${FMP_BASE}/quote?symbol=${encodeURIComponent(idx.symbol)}&apikey=${key}`);
        if (!res.ok) return null;
        const d = await res.json();
        if (d && typeof d["Error Message"] === "string") return null;
        return Array.isArray(d) ? d[0] : d;
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value?.symbol) quotes.push(r.value);
    }
  }

  let hours: ExchangeHoursEntry[] = [];
  if (hoursRes?.ok) {
    const data = await hoursRes.json();
    if (Array.isArray(data)) hours = data;
  }

  const quotesMap = new Map<string, QuoteResponse>();
  for (const q of quotes) {
    if (!q?.symbol) continue;
    const raw = String(q.symbol).toUpperCase();
    const norm = raw.replace(/^\^/, "");
    quotesMap.set(raw, q);
    quotesMap.set("^" + norm, q);
    quotesMap.set(norm, q);
  }

  const openEntries = hours.filter((h) => toBool(h.isMarketOpen) === true);

  const indexes: MarketMapIndex[] = TARGET_INDEXES.map((target) => {
    const sym = target.symbol.toUpperCase();
    const norm = sym.replace(/^\^/, "");
    const quote = quotesMap.get(sym) ?? quotesMap.get("^" + norm) ?? quotesMap.get(norm);
    const isOpen = openEntries.some((entry) => matchesExchange(entry, target.exchangeAliases));
    return {
      symbol: target.symbol,
      name: quote?.name ?? target.name,
      shortName: target.shortName,
      exchange: target.exchange,
      country: target.country,
      lat: target.lat,
      lng: target.lng,
      price: Number(quote?.price) || 0,
      change: Number(quote?.change) || 0,
      changesPercentage: quote ? getChangePct(quote) : 0,
      isOpen,
    };
  });

  return { indexes, lastUpdated: Date.now() };
}

/** Cache-first load (page mount). Prefers 1uptick Firestore, then in-memory, then FMP fallback. */
export async function fetchMarketMapData(): Promise<MarketMapData> {
  const cached = getMarketMapFromCache();
  if (cached) return cached;

  if (isOneuptickFirestoreConfigured()) {
    const fromFirestore = await readMarketMapFromOneuptickFirestore();
    if (fromFirestore) {
      cache.set(CACHE_KEYS.ATFX_MARKET_MAP, fromFirestore, CACHE_TTL_SECONDS);
      return fromFirestore;
    }
  }

  return refreshMarketMapDataFromServer();
}

/** Re-read from 1uptick Firestore (or FMP when Firestore unavailable). */
export async function refreshMarketMapDataFromServer(): Promise<MarketMapData> {
  if (isOneuptickFirestoreConfigured()) {
    const fromFirestore = await readMarketMapFromOneuptickFirestore({ allowStale: true });
    if (fromFirestore) {
      cache.set(CACHE_KEYS.ATFX_MARKET_MAP, fromFirestore, CACHE_TTL_SECONDS);
      return fromFirestore;
    }
  }

  const key = getFmpKey();
  if (!key) {
    const stale = peekCachedMarketMap();
    if (stale) return stale;
    throw new Error("FMP API key not configured");
  }

  if (!isWeekdayUTC()) {
    const stale = peekCachedMarketMap();
    if (stale) return stale;
  }

  const data = await fetchMarketMapFromFmp(key);
  cache.set(CACHE_KEYS.ATFX_MARKET_MAP, data, CACHE_TTL_SECONDS);
  return data;
}

let warmSchedulerStarted = false;

/** Background refresh every 20 minutes — re-reads 1uptick Firestore (no FMP when configured). */
export function startAtfxMarketMapWarmScheduler(): void {
  if (warmSchedulerStarted) return;
  warmSchedulerStarted = true;

  const tick = () => {
    if (!isWeekdayUTC()) return;
    void refreshMarketMapDataFromServer().catch((err) => {
      console.warn("[atfxMarketMap] scheduled refresh failed:", err instanceof Error ? err.message : err);
    });
  };

  setTimeout(tick, 5_000);
  setInterval(tick, REFRESH_INTERVAL_MS);
}

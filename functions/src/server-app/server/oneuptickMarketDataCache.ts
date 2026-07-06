/**
 * Read market map / movers snapshots from 1uptick Firestore (uptick-prod).
 * Collections are warmed every 5–20 min by 1uptick Cloud Functions — newsa reads only.
 */

import { type MarketMapData, type MarketMapIndex } from "./atfxMarketMap.js";
import type { GainerLoserEntry } from "./atfxGainersLosersProcessor.js";
import { splitTopMovers } from "./atfxGainersLosersProcessor.js";
import {
  canonicalizeIndexSymbol,
  FOREX_HEATMAP_PAIRS,
  pairDisplaySymbol,
  type MarketMoversCategory,
  type MarketMoversData,
} from "./atfxMarketMoversShared.js";
import { getOneuptickFirestore, isOneuptickFirestoreConfigured } from "./oneuptickFirestore.js";

const MARKET_MAP_COLLECTION = "marketMapCache";
const MARKET_MAP_DOC = "latest";
const GAINERS_LOSERS_COLLECTION = "marketMapGainersLosersCache";
const FOREX_HEATMAP_COLLECTION = "forexHeatmapCache";
const COMMODITIES_COLLECTION = "commoditiesMarketCache";
const CRYPTO_COLLECTION = "cryptoMarketCache";

const FOREX_MAJOR_PAIR_KEYS = new Set([
  "EUR|USD",
  "GBP|USD",
  "USD|JPY",
  "USD|CAD",
  "USD|CHF",
  "AUD|USD",
  "USD|CNY",
]);

type CacheReadOptions = {
  /** Reserved for callers that force a Firestore re-read (TTL is not enforced — 1uptick warms these docs). */
  allowStale?: boolean;
};

function hasValidSnapshot(lastUpdated: number): boolean {
  return Number.isFinite(lastUpdated) && lastUpdated > 0;
}

function parseMarketMapIndexes(raw: unknown): MarketMapIndex[] {
  if (!Array.isArray(raw)) return [];
  const out: MarketMapIndex[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const symbol = String(r.symbol ?? "").trim();
    if (!symbol) continue;
    out.push({
      symbol,
      name: String(r.name ?? "").trim() || symbol,
      shortName: String(r.shortName ?? r.short_name ?? "").trim() || symbol,
      exchange: String(r.exchange ?? "").trim(),
      country: String(r.country ?? "").trim(),
      lat: typeof r.lat === "number" && Number.isFinite(r.lat) ? r.lat : 0,
      lng: typeof r.lng === "number" && Number.isFinite(r.lng) ? r.lng : 0,
      price: typeof r.price === "number" && Number.isFinite(r.price) ? r.price : 0,
      change: typeof r.change === "number" && Number.isFinite(r.change) ? r.change : 0,
      changesPercentage:
        typeof r.changesPercentage === "number" && Number.isFinite(r.changesPercentage)
          ? r.changesPercentage
          : 0,
      isOpen: r.isOpen === true,
    });
  }
  return out;
}

function parseGainerLoserRows(raw: unknown): GainerLoserEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: GainerLoserEntry[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const symbol = String(r.symbol ?? "").trim();
    if (!symbol) continue;
    const entry: GainerLoserEntry = {
      symbol,
      name: String(r.name ?? "").trim() || symbol,
      price: typeof r.price === "number" && Number.isFinite(r.price) ? r.price : 0,
      change: typeof r.change === "number" && Number.isFinite(r.change) ? r.change : 0,
      changesPercentage:
        typeof r.changesPercentage === "number" && Number.isFinite(r.changesPercentage)
          ? r.changesPercentage
          : 0,
    };
    if (typeof r.volume === "number" && Number.isFinite(r.volume) && r.volume >= 0) {
      entry.volume = Math.round(r.volume);
    }
    out.push(entry);
  }
  return out;
}

function parseQuoteRows(raw: unknown): GainerLoserEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      const symbol = String(r.symbol ?? "").trim();
      if (!symbol) return null;
      const price = typeof r.price === "number" && Number.isFinite(r.price) ? r.price : Number(r.price) || 0;
      const change = typeof r.change === "number" && Number.isFinite(r.change) ? r.change : Number(r.change) || 0;
      let changesPercentage =
        typeof r.changesPercentage === "number" && Number.isFinite(r.changesPercentage)
          ? r.changesPercentage
          : Number(r.changesPercentage) || 0;
      if (!Number.isFinite(changesPercentage) && price !== 0 && change !== 0) {
        const prev = price - change;
        if (prev !== 0) changesPercentage = (change / prev) * 100;
      }
      return {
        symbol,
        name: String(r.name ?? "").trim() || symbol,
        price,
        change,
        changesPercentage,
      } satisfies GainerLoserEntry;
    })
    .filter((r): r is GainerLoserEntry => r != null);
}

function sortForexPairsByChange(rows: GainerLoserEntry[]): GainerLoserEntry[] {
  return [...rows].sort((a, b) => b.changesPercentage - a.changesPercentage);
}

function forexMoversFromHeatmapMatrix(
  matrix: Record<string, Record<string, number | null>>,
  lastUpdated: number
): MarketMoversData {
  const majors: GainerLoserEntry[] = [];
  const crosses: GainerLoserEntry[] = [];

  for (const pair of FOREX_HEATMAP_PAIRS) {
    const pct = matrix[pair.base]?.[pair.quote] ?? null;
    if (pct == null || !Number.isFinite(pct)) continue;
    const entry: GainerLoserEntry = {
      symbol: pairDisplaySymbol(pair.base, pair.quote),
      name: pairDisplaySymbol(pair.base, pair.quote),
      price: Number.NaN,
      change: Number.NaN,
      changesPercentage: pct,
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
    lastUpdated,
  };
}

export async function readMarketMapFromOneuptickFirestore(
  options?: CacheReadOptions
): Promise<MarketMapData | null> {
  const db = getOneuptickFirestore();
  if (!db) return null;

  try {
    const snap = await db.collection(MARKET_MAP_COLLECTION).doc(MARKET_MAP_DOC).get();
    if (!snap.exists) return null;

    const d = snap.data() as { indexes?: unknown; lastUpdated?: number } | undefined;
    const indexes = parseMarketMapIndexes(d?.indexes);
    if (indexes.length < 16) return null;

    const lastUpdated = typeof d?.lastUpdated === "number" ? d.lastUpdated : 0;
    if (!hasValidSnapshot(lastUpdated)) return null;

    return { indexes, lastUpdated };
  } catch (e) {
    console.warn("[oneuptickMarketDataCache] market map read failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function readStockMoversFromOneuptickFirestore(
  indexSymbol: string,
  options?: CacheReadOptions
): Promise<MarketMoversData | null> {
  const db = getOneuptickFirestore();
  if (!db) return null;

  const canonical = canonicalizeIndexSymbol(indexSymbol);
  if (!canonical) return null;

  try {
    const snap = await db.collection(GAINERS_LOSERS_COLLECTION).doc(canonical).get();
    if (!snap.exists) return null;

    const d = snap.data() as { gainers?: unknown; losers?: unknown; lastUpdated?: number } | undefined;
    const gainers = parseGainerLoserRows(d?.gainers);
    const losers = parseGainerLoserRows(d?.losers);
    if (gainers.length === 0 && losers.length === 0) return null;

    const lastUpdated = typeof d?.lastUpdated === "number" ? d.lastUpdated : 0;
    if (!hasValidSnapshot(lastUpdated)) return null;

    return {
      category: "stocks",
      gainers,
      losers,
      lastUpdated: lastUpdated || Date.now(),
      indexSymbol: canonical,
    };
  } catch (e) {
    console.warn(
      "[oneuptickMarketDataCache] stock movers read failed:",
      canonical,
      e instanceof Error ? e.message : e
    );
    return null;
  }
}

export async function readForexMoversFromOneuptickFirestore(
  options?: CacheReadOptions
): Promise<MarketMoversData | null> {
  const db = getOneuptickFirestore();
  if (!db) return null;

  try {
    const snap = await db.collection(FOREX_HEATMAP_COLLECTION).doc("latest").get();
    if (!snap.exists) return null;

    const d = snap.data() as { matrix?: Record<string, Record<string, number | null>>; lastUpdated?: number } | undefined;
    if (!d?.matrix || typeof d.matrix !== "object") return null;

    const lastUpdated = typeof d.lastUpdated === "number" ? d.lastUpdated : 0;
    if (!hasValidSnapshot(lastUpdated)) return null;

    return forexMoversFromHeatmapMatrix(d.matrix, lastUpdated);
  } catch (e) {
    console.warn("[oneuptickMarketDataCache] forex heatmap read failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function readCommoditiesMoversFromOneuptickFirestore(
  options?: CacheReadOptions
): Promise<MarketMoversData | null> {
  const db = getOneuptickFirestore();
  if (!db) return null;

  try {
    const snap = await db.collection(COMMODITIES_COLLECTION).doc("latest").get();
    if (!snap.exists) return null;

    const d = snap.data() as { commodities?: unknown; lastUpdated?: number } | undefined;
    const entries = parseQuoteRows(d?.commodities);
    if (entries.length === 0) return null;

    const lastUpdated = typeof d?.lastUpdated === "number" ? d.lastUpdated : 0;
    if (!hasValidSnapshot(lastUpdated)) return null;

    const { gainers, losers } = splitTopMovers(entries);
    return { category: "commodities", gainers, losers, lastUpdated };
  } catch (e) {
    console.warn("[oneuptickMarketDataCache] commodities read failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function readCryptoMoversFromOneuptickFirestore(
  options?: CacheReadOptions
): Promise<MarketMoversData | null> {
  const db = getOneuptickFirestore();
  if (!db) return null;

  try {
    const snap = await db.collection(CRYPTO_COLLECTION).doc("latest").get();
    if (!snap.exists) return null;

    const d = snap.data() as { cryptos?: unknown; lastUpdated?: number } | undefined;
    const entries = parseQuoteRows(d?.cryptos);
    if (entries.length === 0) return null;

    const lastUpdated = typeof d?.lastUpdated === "number" ? d.lastUpdated : 0;
    if (!hasValidSnapshot(lastUpdated)) return null;

    const { gainers, losers } = splitTopMovers(entries);
    return { category: "crypto", gainers, losers, lastUpdated };
  } catch (e) {
    console.warn("[oneuptickMarketDataCache] crypto read failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function readMoversFromOneuptickFirestore(
  category: MarketMoversCategory,
  indexSymbol?: string,
  options?: CacheReadOptions
): Promise<MarketMoversData | null> {
  switch (category) {
    case "stocks":
      return readStockMoversFromOneuptickFirestore(indexSymbol ?? "^GSPC", options);
    case "forex":
      return readForexMoversFromOneuptickFirestore(options);
    case "commodities":
      return readCommoditiesMoversFromOneuptickFirestore(options);
    case "crypto":
      return readCryptoMoversFromOneuptickFirestore(options);
    default:
      return null;
  }
}

export { isOneuptickFirestoreConfigured };

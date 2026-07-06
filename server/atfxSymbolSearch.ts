/**
 * Symbol search for ATFX Markets quick analysis.
 * Uses the shared Supabase `symbols` table (same as 1uptick) via search_symbols_fast RPC.
 * Falls back to FMP only when Supabase is unavailable.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cache } from "./cache.js";
import { config, isSupabaseConfigured } from "./config.js";

const FMP_BASE = "https://financialmodelingprep.com/stable";
const CACHE_TTL_SECONDS = 5 * 60;

export interface AtfxSymbolSearchResult {
  symbol: string;
  name: string;
  exchange?: string;
  exchangeFullName?: string;
  currency?: string;
}

interface SymbolsRow {
  symbol: string;
  name?: string | null;
  exchange?: string | null;
  exchange_full_name?: string | null;
  currency?: string | null;
}

interface FmpSearchRow {
  symbol?: string;
  name?: string;
  currency?: string;
  exchange?: string;
  exchangeFullName?: string;
}

/** Common names → canonical symbols (subset aligned with 1uptick postgresSymbolService). */
const SEARCH_ALIASES: Record<string, string[]> = {
  gold: ["XAUUSD", "XAU/USD", "GCUSD"],
  "spot gold": ["XAUUSD", "XAU/USD", "GCUSD"],
  silver: ["XAGUSD", "XAG/USD", "SIUSD"],
  oil: ["CLUSD", "BZUSD", "WTIUSD", "BRENTUSD"],
  crude: ["CLUSD", "BZUSD", "WTIUSD", "BRENTUSD"],
  wti: ["CLUSD", "WTIUSD"],
  brent: ["BZUSD", "BRENTUSD"],
  copper: ["HGUSD", "COPPERUSD"],
  "s&p 500": ["^GSPC", "GSPC", "^SPX", "SPX"],
  sp500: ["^GSPC", "GSPC", "^SPX", "SPX"],
  "dow jones": ["^DJI", "DJI"],
  dow: ["^DJI", "DJI"],
  nasdaq: ["^IXIC", "IXIC", "^NDX", "NDX"],
  dxy: ["DX-Y.NYB", "DXY"],
  "us dollar index": ["DX-Y.NYB", "DXY"],
  eurusd: ["EURUSD", "EUR/USD"],
  gbpusd: ["GBPUSD", "GBP/USD"],
  usdjpy: ["USDJPY", "USD/JPY"],
  audusd: ["AUDUSD", "AUD/USD"],
  usdcad: ["USDCAD", "USD/CAD"],
  usdchf: ["USDCHF", "USD/CHF"],
  usdcny: ["USDCNY", "USD/CNY"],
  bitcoin: ["BTCUSD", "BTC/USD"],
  btc: ["BTCUSD", "BTC/USD"],
  ethereum: ["ETHUSD", "ETH/USD"],
  eth: ["ETHUSD", "ETH/USD"],
};

function normalizeSymbolSearchTerm(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const displayLabel = trimmed.match(/^([A-Za-z0-9^./_\-]+)\s*(?:—|–|-)\s+/);
  if (displayLabel?.[1]) return displayLabel[1].trim();

  const firstToken = trimmed.split(/\s+/)[0];
  if (firstToken && firstToken !== trimmed && /^[A-Za-z0-9^./_\-]+$/.test(firstToken)) {
    return firstToken;
  }

  return trimmed;
}

function rowToResult(row: SymbolsRow): AtfxSymbolSearchResult {
  return {
    symbol: row.symbol,
    name: String(row.name ?? "").trim() || row.symbol,
    exchange: row.exchange?.trim() || undefined,
    exchangeFullName: row.exchange_full_name?.trim() || undefined,
    currency: row.currency?.trim() || undefined,
  };
}

function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  return createClient(config.supabase.url, config.supabase.serviceRoleKey);
}

async function fetchAliasRows(
  supabase: SupabaseClient,
  term: string,
  limit: number
): Promise<AtfxSymbolSearchResult[]> {
  const aliasSymbols = SEARCH_ALIASES[term.toLowerCase()] ?? [];
  if (aliasSymbols.length === 0) return [];

  const { data, error } = await supabase
    .from("symbols")
    .select("symbol,name,exchange,exchange_full_name,currency")
    .eq("is_active", true)
    .in("symbol", aliasSymbols)
    .limit(limit);

  if (error) {
    console.warn("[atfxSymbolSearch] alias query error:", error.message);
    return [];
  }

  return (data ?? []).map((row) => rowToResult(row as SymbolsRow));
}

async function fetchExactSymbolRows(
  supabase: SupabaseClient,
  term: string,
  limit: number
): Promise<AtfxSymbolSearchResult[]> {
  const upper = term.toUpperCase();
  const attempts = new Set<string>([upper]);
  if (upper.startsWith("^")) attempts.add(upper.slice(1));
  else attempts.add(`^${upper}`);

  const { data, error } = await supabase
    .from("symbols")
    .select("symbol,name,exchange,exchange_full_name,currency")
    .eq("is_active", true)
    .in("symbol", [...attempts])
    .limit(limit);

  if (error) {
    console.warn("[atfxSymbolSearch] exact symbol query error:", error.message);
    return [];
  }

  return (data ?? []).map((row) => rowToResult(row as SymbolsRow));
}

async function searchSymbolsViaRpc(
  supabase: SupabaseClient,
  term: string,
  limit: number
): Promise<AtfxSymbolSearchResult[]> {
  const { data, error } = await supabase.rpc("search_symbols_fast", {
    p_term: term,
    p_limit: limit,
    p_category: null,
  });

  if (error) {
    console.warn("[atfxSymbolSearch] search_symbols_fast RPC failed:", error.message);
    return [];
  }

  return (Array.isArray(data) ? data : []).map((row) => rowToResult(row as SymbolsRow));
}

async function searchSymbolsLegacyFallback(
  supabase: SupabaseClient,
  term: string,
  limit: number
): Promise<AtfxSymbolSearchResult[]> {
  const upper = term.toUpperCase();
  const bySymbol = new Map<string, AtfxSymbolSearchResult>();

  const prefixRes = await supabase
    .from("symbols")
    .select("symbol,name,exchange,exchange_full_name,currency")
    .eq("is_active", true)
    .like("symbol_upper", `${upper}%`)
    .order("symbol", { ascending: true })
    .limit(limit);

  if (prefixRes.error) {
    console.warn("[atfxSymbolSearch] symbol prefix query error:", prefixRes.error.message);
  } else {
    for (const row of prefixRes.data ?? []) {
      const result = rowToResult(row as SymbolsRow);
      bySymbol.set(result.symbol, result);
    }
  }

  if (bySymbol.size < limit && term.length >= 2) {
    const nameRes = await supabase
      .from("symbols")
      .select("symbol,name,exchange,exchange_full_name,currency")
      .eq("is_active", true)
      .like("name_upper", `${upper}%`)
      .order("symbol", { ascending: true })
      .limit(limit);

    if (nameRes.error) {
      console.warn("[atfxSymbolSearch] name prefix query error:", nameRes.error.message);
    } else {
      for (const row of nameRes.data ?? []) {
        const result = rowToResult(row as SymbolsRow);
        if (!bySymbol.has(result.symbol)) bySymbol.set(result.symbol, result);
      }
    }
  }

  return [...bySymbol.values()].slice(0, limit);
}

async function searchSymbolsViaSupabase(term: string, limit: number): Promise<AtfxSymbolSearchResult[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const ordered: AtfxSymbolSearchResult[] = [];
  const seen = new Set<string>();

  const pushUnique = (rows: AtfxSymbolSearchResult[]) => {
    for (const row of rows) {
      if (seen.has(row.symbol)) continue;
      seen.add(row.symbol);
      ordered.push(row);
      if (ordered.length >= limit) return true;
    }
    return ordered.length >= limit;
  };

  if (pushUnique(await fetchAliasRows(supabase, term, limit))) {
    return ordered;
  }
  if (pushUnique(await fetchExactSymbolRows(supabase, term, limit))) {
    return ordered;
  }

  const rpcRows = await searchSymbolsViaRpc(supabase, term, limit);
  if (rpcRows.length > 0) {
    pushUnique(rpcRows);
  } else if (ordered.length < limit) {
    pushUnique(await searchSymbolsLegacyFallback(supabase, term, limit));
  }

  return ordered.slice(0, limit);
}

async function fmpSearch(
  endpoint: "search-symbol" | "search-name",
  query: string,
  limit: number
): Promise<FmpSearchRow[]> {
  const key = config.fmp.apiKey;
  if (!key) return [];

  const url = new URL(`${FMP_BASE}/${endpoint}`);
  url.searchParams.set("query", query);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("apikey", key);

  const res = await fetch(url.toString());
  if (!res.ok) return [];

  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as FmpSearchRow[]) : [];
}

function normalizeFmpRow(row: FmpSearchRow): AtfxSymbolSearchResult | null {
  const symbol = String(row.symbol ?? "").trim();
  if (!symbol) return null;

  return {
    symbol,
    name: String(row.name ?? "").trim() || symbol,
    exchange: row.exchange?.trim() || undefined,
    exchangeFullName: row.exchangeFullName?.trim() || undefined,
    currency: row.currency?.trim() || undefined,
  };
}

async function searchSymbolsViaFmp(query: string, limit: number): Promise<AtfxSymbolSearchResult[]> {
  const perEndpointLimit = Math.min(limit, 10);
  const [bySymbol, byName] = await Promise.all([
    fmpSearch("search-symbol", query, perEndpointLimit),
    fmpSearch("search-name", query, perEndpointLimit),
  ]);

  const seen = new Set<string>();
  const results: AtfxSymbolSearchResult[] = [];

  for (const row of [...bySymbol, ...byName]) {
    const normalized = normalizeFmpRow(row);
    if (!normalized) continue;
    const dedupeKey = normalized.symbol.toUpperCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    results.push(normalized);
    if (results.length >= limit) break;
  }

  return results;
}

export async function searchAtfxSymbols(query: string, limit = 12): Promise<AtfxSymbolSearchResult[]> {
  const term = normalizeSymbolSearchTerm(query);
  if (term.length < 2) return [];

  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 30);
  const cacheKey = `atfx:symbol-search:v2:${term.toLowerCase()}:${safeLimit}`;
  const cached = cache.get<AtfxSymbolSearchResult[]>(cacheKey);
  if (cached) return cached.data;

  let results = await searchSymbolsViaSupabase(term, safeLimit);

  if (results.length === 0) {
    results = await searchSymbolsViaFmp(term, safeLimit);
  }

  cache.set(cacheKey, results, CACHE_TTL_SECONDS);
  return results;
}

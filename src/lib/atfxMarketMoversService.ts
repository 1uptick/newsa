export type MarketMoversCategory = "stocks" | "forex" | "commodities" | "crypto";

export type MarketsRightTab = "map" | MarketMoversCategory;

export interface MarketMoverEntry {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changesPercentage: number;
  volume?: number;
}

export interface MarketMoversData {
  category: MarketMoversCategory;
  gainers: MarketMoverEntry[];
  losers: MarketMoverEntry[];
  lastUpdated: number;
  indexSymbol?: string;
}

export interface GainersLosersIndexOption {
  symbol: string;
  shortName: string;
  country: string;
}

export const MARKET_MOVERS_CATEGORIES: { id: MarketMoversCategory; label: string }[] = [
  { id: "forex", label: "Forex" },
  { id: "commodities", label: "Commodities" },
  { id: "stocks", label: "Stocks" },
  { id: "crypto", label: "Crypto" },
];

export const DEFAULT_STOCK_INDEX_SYMBOL = "^GSPC";

type AuthFetch = (url: string, options?: RequestInit) => Promise<Response>;

export async function fetchAtfxMarketMovers(
  authFetch: AuthFetch,
  category: MarketMoversCategory,
  options?: { indexSymbol?: string; refresh?: boolean }
): Promise<MarketMoversData> {
  const params = new URLSearchParams({ category });
  if (category === "stocks" && options?.indexSymbol) {
    params.set("index", options.indexSymbol);
  }
  if (options?.refresh) params.set("refresh", "1");

  const res = await authFetch(`/api/atfx/markets/movers?${params.toString()}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Failed to load movers (${res.status})`);
  }
  return res.json() as Promise<MarketMoversData>;
}

export async function fetchAtfxMoversIndexes(authFetch: AuthFetch): Promise<GainersLosersIndexOption[]> {
  const res = await authFetch("/api/atfx/markets/movers/indexes");
  if (!res.ok) return [];
  const body = (await res.json()) as { indexes?: GainersLosersIndexOption[] };
  return Array.isArray(body.indexes) ? body.indexes : [];
}

export async function fetchForexPairQuotes(
  authFetch: AuthFetch,
  symbols: string[]
): Promise<MarketMoverEntry[]> {
  const unique = [...new Set(symbols.map((s) => s.trim()).filter(Boolean))];
  if (unique.length === 0) return [];

  const params = new URLSearchParams({ symbols: unique.join(",") });
  const res = await authFetch(`/api/atfx/markets/forex-quotes?${params.toString()}`);
  const body = (await res.json().catch(() => ({}))) as { quotes?: MarketMoverEntry[]; error?: string };

  if (!res.ok) {
    throw new Error(typeof body.error === "string" ? body.error : `Failed to load forex quotes (${res.status})`);
  }

  return Array.isArray(body.quotes) ? body.quotes : [];
}

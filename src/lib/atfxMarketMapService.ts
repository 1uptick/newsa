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

const REFRESH_INTERVAL_MS = 20 * 60 * 1000;

function isWeekdayUTC(): boolean {
  const utcDay = new Date().getUTCDay();
  return utcDay !== 0 && utcDay !== 6;
}

export function shouldAutoRefreshMarketMap(): boolean {
  return isWeekdayUTC();
}

export { REFRESH_INTERVAL_MS };

const CLIENT_CACHE_KEY = "atfx:market-map:data:v1";
/** Prefer fresh data within this window; still show up to STALE cache while revalidating. */
const CLIENT_CACHE_FRESH_MS = 3 * 60 * 1000;
const CLIENT_CACHE_STALE_MS = 30 * 60 * 1000;

function readClientMarketMapCache(maxAgeMs: number): MarketMapData | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CLIENT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt: number; data: MarketMapData };
    if (!parsed?.data?.indexes?.length || Date.now() - parsed.savedAt > maxAgeMs) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function writeClientMarketMapCache(data: MarketMapData): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(CLIENT_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    /* ignore quota */
  }
}

export function getCachedClientMarketMapData(): MarketMapData | null {
  return readClientMarketMapCache(CLIENT_CACHE_STALE_MS);
}

export function getFreshClientMarketMapData(): MarketMapData | null {
  return readClientMarketMapCache(CLIENT_CACHE_FRESH_MS);
}

export async function fetchAtfxMarketMap(
  authFetch: (url: string, opts?: { forceRefresh?: boolean }) => Promise<Response>,
  opts?: { refresh?: boolean }
): Promise<MarketMapData> {
  const url = opts?.refresh ? "/api/atfx/markets/world-map?refresh=1" : "/api/atfx/markets/world-map";
  const res = await authFetch(url, opts?.refresh ? { forceRefresh: true } : undefined);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err?.error === "string" ? err.error : `Failed to load market map (${res.status})`);
  }
  return res.json();
}

/** Natural Earth 110m countries — same source as react-simple-maps examples. */
export const MARKET_MAP_GEO_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson";

const SESSION_KEY = "atfx:market-map:geo:v1";

let memoryCache: object | null = null;
let inflight: Promise<object> | null = null;

function readSessionCache(): object | null {
  if (memoryCache) return memoryCache;
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as object;
    memoryCache = parsed;
    return parsed;
  } catch {
    return null;
  }
}

function writeSessionCache(data: object): void {
  memoryCache = data;
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch {
    /* quota or private mode */
  }
}

/** Synchronous read when geography was cached earlier this session. */
export function getCachedMarketMapGeography(): object | null {
  return readSessionCache();
}

/** Fetch once; reuse memory + sessionStorage on later mounts. */
export function loadMarketMapGeography(): Promise<object> {
  const cached = readSessionCache();
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;

  inflight = fetch(MARKET_MAP_GEO_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load map geography (${res.status})`);
      return res.json() as Promise<object>;
    })
    .then((data) => {
      writeSessionCache(data);
      return data;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

/** Warm geography cache during idle time or on page mount. */
export function prefetchMarketMapGeography(): void {
  void loadMarketMapGeography();
}

/** Warm the lazy movers chunk after the map is interactive. */
export function prefetchMarketsMoversSection(): void {
  void import("../components/atfx/AtfxMarketsMoversSection");
}

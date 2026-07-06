import { fetchAtfxMarketMap, writeClientMarketMapCache } from "./atfxMarketMapService";
import { prefetchMarketMapGeography } from "./atfxMarketMapGeography";
import { fetchAtfxQuickAnalysisHistoryLite } from "./atfxQuickAnalysisService";
import { mergeLiteQuickAnalysisHistoryCache } from "./atfxQuickAnalysisHistoryCache";
import { prefetchAtfxDashboardWorkspace } from "./prefetchAtfxDashboard";

type AuthFetch = (
  input: RequestInfo | URL,
  init?: RequestInit & { forceRefresh?: boolean }
) => Promise<Response>;

let chunkPrefetched = false;
let mapWarmPromise: Promise<void> | null = null;
let qaHistoryWarmPromise: Promise<void> | null = null;

/** Preload the Markets route chunk (call from nav hover or ATFX dashboard). */
export function prefetchMarketsPageChunk(): void {
  if (chunkPrefetched) return;
  chunkPrefetched = true;
  void import("../pages/ATFX/atfxMarkets");
}

/** Warm world-map API + session cache before navigating to Markets. */
export function prefetchMarketsWorldMap(authFetch: AuthFetch): void {
  if (mapWarmPromise) return;

  mapWarmPromise = (async () => {
    try {
      const data = await fetchAtfxMarketMap(authFetch);
      writeClientMarketMapCache(data);
    } catch {
      /* ignore */
    } finally {
      mapWarmPromise = null;
    }
  })();
}

/** Warm lite quick-analysis history before navigating to Markets. */
export function prefetchMarketsQuickAnalysisHistory(
  authFetch: AuthFetch,
  uid: string | undefined | null
): void {
  if (!uid || qaHistoryWarmPromise) return;

  qaHistoryWarmPromise = (async () => {
    try {
      const items = await fetchAtfxQuickAnalysisHistoryLite(authFetch);
      mergeLiteQuickAnalysisHistoryCache(uid, items);
    } catch {
      /* ignore */
    } finally {
      qaHistoryWarmPromise = null;
    }
  })();
}

export function prefetchMarketsWorkspace(authFetch: AuthFetch, uid?: string | null): void {
  prefetchMarketsPageChunk();
  prefetchMarketMapGeography();
  prefetchMarketsWorldMap(authFetch);
  prefetchMarketsQuickAnalysisHistory(authFetch, uid);
  prefetchAtfxDashboardWorkspace(authFetch, uid);
}

export function warmMarketsNavLink(to: string): (() => void) | undefined {
  if (!to.includes("/atfx/markets")) return undefined;
  return () => {
    prefetchMarketsPageChunk();
    prefetchMarketMapGeography();
  };
}

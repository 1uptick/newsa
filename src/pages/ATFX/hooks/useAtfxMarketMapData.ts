import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchAtfxMarketMap,
  getCachedClientMarketMapData,
  getFreshClientMarketMapData,
  REFRESH_INTERVAL_MS,
  shouldAutoRefreshMarketMap,
  writeClientMarketMapCache,
  type MarketMapData,
} from "../../../lib/atfxMarketMapService";
import { usePageVisible } from "../../../hooks/usePageVisible";

type AuthFetch = (url: string, opts?: { forceRefresh?: boolean }) => Promise<Response>;

export function useAtfxMarketMapData(authFetch: AuthFetch) {
  const pageVisible = usePageVisible();
  const [data, setData] = useState<MarketMapData | null>(() => getCachedClientMarketMapData());
  const [loading, setLoading] = useState(() => getCachedClientMarketMapData() == null);
  const [error, setError] = useState<string | null>(null);

  const applyMarketMap = useCallback((next: MarketMapData) => {
    setData(next);
    writeClientMarketMapCache(next);
  }, []);

  const refreshFromServer = useCallback(
    async (opts?: { background?: boolean }) => {
      if (!opts?.background) setError(null);
      try {
        const next = await fetchAtfxMarketMap(authFetch, { refresh: true });
        applyMarketMap(next);
        setError(null);
      } catch (e) {
        if (!opts?.background) {
          setError(e instanceof Error ? e.message : "Failed to refresh market data");
        }
      } finally {
        if (!opts?.background) setLoading(false);
      }
    },
    [applyMarketMap, authFetch]
  );

  useEffect(() => {
    let cancelled = false;
    const cached = getCachedClientMarketMapData();
    const fresh = getFreshClientMarketMapData();
    if (!cached) {
      setLoading(true);
      setError(null);
    } else if (fresh) {
      setLoading(false);
    }

    void (async () => {
      try {
        const next = await fetchAtfxMarketMap(authFetch);
        if (!cancelled) applyMarketMap(next);
      } catch (e) {
        if (!cancelled && !cached) {
          setError(e instanceof Error ? e.message : "Failed to load market data");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyMarketMap, authFetch]);

  useEffect(() => {
    if (!data || !shouldAutoRefreshMarketMap() || !pageVisible) return;
    const timer = setInterval(() => {
      void refreshFromServer({ background: true });
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [data, pageVisible, refreshFromServer]);

  const indexes = useMemo(() => data?.indexes ?? [], [data]);

  const openIndexes = useMemo(
    () => indexes.filter((i) => i.isOpen).sort((a, b) => b.changesPercentage - a.changesPercentage),
    [indexes]
  );

  const closedIndexes = useMemo(
    () => indexes.filter((i) => !i.isOpen).sort((a, b) => b.changesPercentage - a.changesPercentage),
    [indexes]
  );

  const retry = useCallback(() => void refreshFromServer(), [refreshFromServer]);

  return {
    data,
    indexes,
    openIndexes,
    closedIndexes,
    loading,
    error,
    retry,
  };
}

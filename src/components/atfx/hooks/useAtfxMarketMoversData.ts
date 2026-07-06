import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_STOCK_INDEX_SYMBOL,
  fetchAtfxMarketMovers,
  fetchAtfxMoversIndexes,
  type GainersLosersIndexOption,
  type MarketMoversCategory,
  type MarketMoversData,
  type MarketsRightTab,
} from "../../../lib/atfxMarketMoversService";
import { usePageVisible } from "../../../hooks/usePageVisible";

const REFRESH_INTERVAL_MS = 20 * 60 * 1000;

type AuthFetch = (url: string, options?: RequestInit) => Promise<Response>;

export function useAtfxMarketMoversData(authFetch: AuthFetch, tab: MarketsRightTab) {
  const pageVisible = usePageVisible();
  const moversCategory: MarketMoversCategory | null = tab === "map" ? null : tab;

  const [stockIndex, setStockIndex] = useState(DEFAULT_STOCK_INDEX_SYMBOL);
  const [indexOptions, setIndexOptions] = useState<GainersLosersIndexOption[]>([]);
  const [moversData, setMoversData] = useState<MarketMoversData | null>(null);
  const [moversLoading, setMoversLoading] = useState(false);
  const [moversError, setMoversError] = useState<string | null>(null);

  useEffect(() => {
    if (tab !== "stocks") return;

    let cancelled = false;
    void fetchAtfxMoversIndexes(authFetch).then((list) => {
      if (!cancelled && list.length > 0) setIndexOptions(list);
    });
    return () => {
      cancelled = true;
    };
  }, [authFetch, tab]);

  const loadMovers = useCallback(
    async (opts?: { refresh?: boolean; background?: boolean }) => {
      if (!moversCategory) return;
      if (!opts?.background) {
        setMoversLoading(true);
        setMoversError(null);
      }
      try {
        const next = await fetchAtfxMarketMovers(authFetch, moversCategory, {
          indexSymbol: moversCategory === "stocks" ? stockIndex : undefined,
          refresh: opts?.refresh,
        });
        setMoversData(next);
        if (opts?.background) setMoversError(null);
      } catch (e) {
        if (!opts?.background) {
          setMoversError(e instanceof Error ? e.message : "Failed to load movers");
        }
      } finally {
        if (!opts?.background) setMoversLoading(false);
      }
    },
    [authFetch, moversCategory, stockIndex]
  );

  useEffect(() => {
    if (!moversCategory) return;
    void loadMovers();
  }, [loadMovers, moversCategory]);

  useEffect(() => {
    if (!moversCategory || !moversData || !pageVisible) return;
    const timer = setInterval(() => void loadMovers({ background: true }), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [moversCategory, moversData, pageVisible, loadMovers]);

  const indexLabel = useMemo(() => {
    const hit = indexOptions.find((i) => i.symbol === stockIndex);
    return hit?.shortName ?? stockIndex;
  }, [indexOptions, stockIndex]);

  const retryMovers = useCallback(() => void loadMovers({ refresh: true }), [loadMovers]);

  return {
    moversCategory,
    stockIndex,
    setStockIndex,
    indexOptions,
    indexLabel,
    moversData,
    moversLoading,
    moversError,
    retryMovers,
  };
}

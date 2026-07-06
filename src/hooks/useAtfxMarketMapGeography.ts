import { useEffect, useState } from "react";
import { getCachedMarketMapGeography, loadMarketMapGeography } from "../lib/atfxMarketMapGeography";

export function useAtfxMarketMapGeography() {
  const [geography, setGeography] = useState<object | null>(() => getCachedMarketMapGeography());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (geography) return;

    let cancelled = false;
    void loadMarketMapGeography()
      .then((geo) => {
        if (!cancelled) setGeography(geo);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load map");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [geography]);

  return {
    geography,
    loading: !geography && !error,
    error,
  };
}

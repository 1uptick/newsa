import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { fetchAtfxSymbolSearch, type AtfxSymbolSearchItem } from "../lib/atfxSymbolSearchService";

const DEBOUNCE_MS = 300;

export function useDebouncedAtfxSymbolSearch(
  query: string,
  options?: { limit?: number; enabled?: boolean; minLength?: number }
): { results: AtfxSymbolSearchItem[]; isSearching: boolean } {
  const { authFetch } = useAuth();
  const limit = options?.limit ?? 12;
  const enabled = options?.enabled ?? true;
  const minLength = options?.minLength ?? 2;

  const [results, setResults] = useState<AtfxSymbolSearchItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (!enabled || trimmed.length < minLength) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    setIsSearching(true);

    const timeoutId = window.setTimeout(async () => {
      try {
        const next = await fetchAtfxSymbolSearch(authFetch, trimmed, limit);
        if (!cancelled) setResults(next);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [authFetch, query, limit, enabled, minLength]);

  return { results, isSearching };
}

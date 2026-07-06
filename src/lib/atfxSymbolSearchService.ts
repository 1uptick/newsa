export type AtfxSymbolSearchItem = {
  symbol: string;
  name: string;
  exchange?: string;
  exchangeFullName?: string;
  currency?: string;
};

export async function fetchAtfxSymbolSearch(
  authFetch: (url: string, opts?: RequestInit & { forceRefresh?: boolean }) => Promise<Response>,
  query: string,
  limit = 12
): Promise<AtfxSymbolSearchItem[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const params = new URLSearchParams({ q: trimmed, limit: String(limit) });
  const res = await authFetch(`/api/atfx/markets/symbol-search?${params.toString()}`);
  const data = (await res.json().catch(() => ({}))) as { results?: AtfxSymbolSearchItem[]; error?: string };

  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : `Symbol search failed (${res.status})`);
  }

  return Array.isArray(data.results) ? data.results : [];
}

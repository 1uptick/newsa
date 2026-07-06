import type { MarketMoverEntry } from "./atfxMarketMoversService";

export type ForexTableKind = "major" | "cross";

const STORAGE_KEYS: Record<ForexTableKind, string> = {
  major: "atfx.markets.forexOrder.major",
  cross: "atfx.markets.forexOrder.cross",
};

export function loadForexPairOrder(kind: ForexTableKind): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS[kind]);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
  } catch {
    return [];
  }
}

export function saveForexPairOrder(kind: ForexTableKind, order: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS[kind], JSON.stringify(order));
  } catch {
    /* quota / private mode */
  }
}

/** Apply saved symbol order; new pairs from API are appended at the end. */
export function applyForexPairOrder(rows: MarketMoverEntry[], savedOrder: string[]): MarketMoverEntry[] {
  if (savedOrder.length === 0 || rows.length === 0) return rows;

  const bySymbol = new Map(rows.map((r) => [r.symbol, r]));
  const ordered: MarketMoverEntry[] = [];
  const seen = new Set<string>();

  for (const sym of savedOrder) {
    const row = bySymbol.get(sym);
    if (row) {
      ordered.push(row);
      seen.add(sym);
    }
  }

  for (const row of rows) {
    if (!seen.has(row.symbol)) ordered.push(row);
  }

  return ordered;
}

export function reorderForexRows(rows: MarketMoverEntry[], fromIndex: number, toIndex: number): MarketMoverEntry[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= rows.length || toIndex >= rows.length) {
    return rows;
  }
  const next = [...rows];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

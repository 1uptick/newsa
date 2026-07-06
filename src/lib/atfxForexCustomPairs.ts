import type { ForexTableKind } from "./atfxForexTableOrder";
import type { MarketMoverEntry } from "./atfxMarketMoversService";

const STORAGE_KEYS: Record<ForexTableKind, string> = {
  major: "atfx.markets.forexCustom.major",
  cross: "atfx.markets.forexCustom.cross",
};

const HIDDEN_STORAGE_KEYS: Record<ForexTableKind, string> = {
  major: "atfx.markets.forexHidden.major",
  cross: "atfx.markets.forexHidden.cross",
};

export function loadForexCustomPairs(kind: ForexTableKind): string[] {
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

export function saveForexCustomPairs(kind: ForexTableKind, symbols: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS[kind], JSON.stringify(symbols));
  } catch {
    /* quota / private mode */
  }
}

export function loadForexHiddenPairs(kind: ForexTableKind): string[] {
  try {
    const raw = localStorage.getItem(HIDDEN_STORAGE_KEYS[kind]);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
  } catch {
    return [];
  }
}

export function saveForexHiddenPairs(kind: ForexTableKind, symbols: string[]): void {
  try {
    localStorage.setItem(HIDDEN_STORAGE_KEYS[kind], JSON.stringify(symbols));
  } catch {
    /* quota / private mode */
  }
}

export function filterForexHiddenRows(rows: MarketMoverEntry[], hiddenSymbols: string[]): MarketMoverEntry[] {
  if (hiddenSymbols.length === 0) return rows;
  const hidden = new Set(hiddenSymbols);
  return rows.filter((r) => !hidden.has(r.symbol));
}

/** Parse user input like EURUSD, EUR/USD, or eur-usd into display + FMP symbols. */
export function parseForexPairInput(raw: string): { displaySymbol: string; fmpSymbol: string } | null {
  const trimmed = raw.trim().toUpperCase();
  if (!trimmed) return null;

  let base: string;
  let quote: string;

  if (trimmed.includes("/")) {
    const parts = trimmed.split("/").map((p) => p.replace(/[^A-Z]/g, "")).filter(Boolean);
    if (parts.length !== 2 || parts[0].length !== 3 || parts[1].length !== 3) return null;
    [base, quote] = parts;
  } else {
    const letters = trimmed.replace(/[^A-Z]/g, "");
    if (letters.length !== 6) return null;
    base = letters.slice(0, 3);
    quote = letters.slice(3, 6);
  }

  const fmpBase = base === "CNY" ? "CNH" : base;
  const fmpQuote = quote === "CNY" ? "CNH" : quote;

  return {
    displaySymbol: `${base}/${quote}`,
    fmpSymbol: `${fmpBase}${fmpQuote}`,
  };
}

export function mergeForexTableRows(
  primaryApiRows: MarketMoverEntry[],
  secondaryApiRows: MarketMoverEntry[],
  customSymbols: string[],
  customQuoteRows: MarketMoverEntry[]
): MarketMoverEntry[] {
  const bySymbol = new Map(primaryApiRows.map((r) => [r.symbol, r]));
  const lookup = new Map([...primaryApiRows, ...secondaryApiRows].map((r) => [r.symbol, r]));
  const customBySymbol = new Map(customQuoteRows.map((r) => [r.symbol, r]));

  for (const sym of customSymbols) {
    if (bySymbol.has(sym)) continue;
    const hit = customBySymbol.get(sym) ?? lookup.get(sym);
    if (hit) bySymbol.set(sym, hit);
  }

  return [...bySymbol.values()];
}

/**
 * Fetch live quotes for user-added forex pairs (FMP batch-quote).
 */

import { fetchBatchQuotesForSymbols, quoteToMoverEntry } from "./atfxGainersLosersProcessor.js";
import { config } from "./config.js";

export interface ForexPairQuoteRow {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changesPercentage: number;
}

function parseForexPairSymbol(raw: string): { displaySymbol: string; fmpSymbol: string } | null {
  const trimmed = String(raw || "").trim().toUpperCase();
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

export async function fetchForexPairQuotes(userSymbols: string[]): Promise<ForexPairQuoteRow[]> {
  const key = config.fmp.apiKey?.trim();
  if (!key) throw new Error("FMP_API_KEY is not configured on the server.");

  const parsedList = userSymbols
    .map((s) => parseForexPairSymbol(s))
    .filter((p): p is NonNullable<typeof p> => p != null);

  if (parsedList.length === 0) return [];

  const fmpToDisplay = new Map<string, string>();
  for (const p of parsedList) {
    fmpToDisplay.set(p.fmpSymbol.toUpperCase(), p.displaySymbol);
  }

  const quotes = await fetchBatchQuotesForSymbols(key, [...fmpToDisplay.keys()]);
  const rows: ForexPairQuoteRow[] = [];

  for (const q of quotes) {
    const fmpSym = String(q.symbol || "").toUpperCase();
    const displaySymbol = fmpToDisplay.get(fmpSym);
    if (!displaySymbol) continue;

    const entry = quoteToMoverEntry(q, true);
    if (!entry) continue;

    rows.push({
      ...entry,
      symbol: displaySymbol,
      name: displaySymbol,
    });
  }

  return rows;
}

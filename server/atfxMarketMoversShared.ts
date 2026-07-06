/**
 * Shared constants/helpers for ATFX market movers (used by movers + 1uptick Firestore cache reader).
 */

export type MarketMoversCategory = "stocks" | "forex" | "commodities" | "crypto";

export interface MarketMoversData {
  category: MarketMoversCategory;
  gainers: import("./atfxGainersLosersProcessor.js").GainerLoserEntry[];
  losers: import("./atfxGainersLosersProcessor.js").GainerLoserEntry[];
  lastUpdated: number;
  indexSymbol?: string;
}

export const GAINERS_LOSERS_INDEXES: { symbol: string; shortName: string; country: string }[] = [
  { symbol: "^DJI", shortName: "DOW 30", country: "US" },
  { symbol: "^GSPC", shortName: "S&P 500", country: "US" },
  { symbol: "^NDX", shortName: "NASDAQ 100", country: "US" },
  { symbol: "^BVSP", shortName: "B3", country: "BR" },
  { symbol: "^GSPTSE", shortName: "TSX", country: "CA" },
  { symbol: "^FTSE", shortName: "FTSE 100", country: "GB" },
  { symbol: "^FCHI", shortName: "CAC 40", country: "FR" },
  { symbol: "^GDAXI", shortName: "DAX", country: "DE" },
  { symbol: "^N225", shortName: "NIKKEI 225", country: "JP" },
  { symbol: "^KS11", shortName: "KOSPI", country: "KR" },
  { symbol: "^HSI", shortName: "HSI", country: "HK" },
  { symbol: "^TWII", shortName: "TAIEX", country: "TW" },
  { symbol: "^STI", shortName: "STI", country: "SG" },
  { symbol: "^BSESN", shortName: "SENSEX", country: "IN" },
  { symbol: "000001.SS", shortName: "SSE", country: "CN" },
  { symbol: "^AXJO", shortName: "ASX 200", country: "AU" },
];

export const FOREX_HEATMAP_PAIRS: { symbol: string; base: string; quote: string }[] = [
  { symbol: "EURUSD", base: "EUR", quote: "USD" },
  { symbol: "EURGBP", base: "EUR", quote: "GBP" },
  { symbol: "EURJPY", base: "EUR", quote: "JPY" },
  { symbol: "EURCHF", base: "EUR", quote: "CHF" },
  { symbol: "EURAUD", base: "EUR", quote: "AUD" },
  { symbol: "EURCAD", base: "EUR", quote: "CAD" },
  { symbol: "GBPUSD", base: "GBP", quote: "USD" },
  { symbol: "GBPJPY", base: "GBP", quote: "JPY" },
  { symbol: "GBPCHF", base: "GBP", quote: "CHF" },
  { symbol: "GBPAUD", base: "GBP", quote: "AUD" },
  { symbol: "GBPCAD", base: "GBP", quote: "CAD" },
  { symbol: "AUDUSD", base: "AUD", quote: "USD" },
  { symbol: "AUDJPY", base: "AUD", quote: "JPY" },
  { symbol: "AUDCHF", base: "AUD", quote: "CHF" },
  { symbol: "AUDCAD", base: "AUD", quote: "CAD" },
  { symbol: "USDJPY", base: "USD", quote: "JPY" },
  { symbol: "USDCHF", base: "USD", quote: "CHF" },
  { symbol: "USDCAD", base: "USD", quote: "CAD" },
  { symbol: "CHFJPY", base: "CHF", quote: "JPY" },
  { symbol: "CADJPY", base: "CAD", quote: "JPY" },
  { symbol: "CADCHF", base: "CAD", quote: "CHF" },
  { symbol: "USDCNH", base: "USD", quote: "CNY" },
  { symbol: "EURCNH", base: "EUR", quote: "CNY" },
  { symbol: "GBPCNH", base: "GBP", quote: "CNY" },
  { symbol: "AUDCNH", base: "AUD", quote: "CNY" },
  { symbol: "CADCNH", base: "CAD", quote: "CNY" },
  { symbol: "CNHJPY", base: "CNY", quote: "JPY" },
  { symbol: "CNHCHF", base: "CNY", quote: "CHF" },
];

export function canonicalizeIndexSymbol(indexSymbol: string): string {
  const raw = String(indexSymbol || "").trim().toUpperCase();
  for (const idx of GAINERS_LOSERS_INDEXES) {
    const sym = idx.symbol.toUpperCase();
    const norm = sym.replace(/^\^/, "");
    const rawNorm = raw.replace(/^\^/, "");
    if (sym === raw || norm === raw || sym === rawNorm || norm === rawNorm) return idx.symbol;
  }
  return raw;
}

export function pairDisplaySymbol(base: string, quote: string): string {
  const fmpBase = base === "CNY" ? "CNH" : base;
  const fmpQuote = quote === "CNY" ? "CNH" : quote;
  return `${fmpBase}/${fmpQuote}`;
}

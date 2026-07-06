/**
 * FMP stable `historical-chart` / `historical-price-eod` symbol candidates for Quick Analysis.
 * Batch quotes resolve aliases (commodities, ^ for indices); chart endpoints need the same exploration order.
 *
 * The actual alias maps live in `./fmpSymbolAliases` so dashboard quotes, watchlist quotes,
 * and chart endpoints always agree on UI-symbol → FMP-symbol resolution.
 */

import {
  commodityAliasCandidates,
  cryptoAliasCandidates,
  equityAliasCandidates,
  indexAliasCandidates,
} from "./fmpSymbolAliases.js";

/** @deprecated Use `commodityAliasCandidates` from `./fmpSymbolAliases` directly. */
export function commodityAliasCandidatesForChart(norm: string): string[] {
  const n = String(norm || "")
    .replace(/\//g, "")
    .trim()
    .toUpperCase();
  return commodityAliasCandidates(n);
}

/** @deprecated Use `indexAliasCandidates` from `./fmpSymbolAliases` directly. */
export function indexHistoricalChartCandidates(norm: string): string[] {
  const n = String(norm || "")
    .replace(/\//g, "")
    .trim()
    .toUpperCase();
  return indexAliasCandidates(n);
}

export type FmpChartAssetType = "equity" | "indices" | "forex" | "crypto" | "commodities";

function normalizeChartAssetType(value: unknown): FmpChartAssetType {
  switch (String(value ?? "").trim().toLowerCase()) {
  case "indices":
  case "index":
    return "indices";
  case "forex":
    return "forex";
  case "crypto":
    return "crypto";
  case "commodities":
  case "commodity":
    return "commodities";
  default:
    return "equity";
  }
}

function uniqPush(arr: string[], ...vals: string[]): void {
  for (const v of vals) {
    const s = String(v || "").trim().toUpperCase();
    if (!s) continue;
    if (!arr.includes(s)) arr.push(s);
  }
}

/**
 * Ordered symbols to try for FMP OHLC until one returns data.
 * When assetType is omitted (legacy chart-only callers), combine commodity + (short) index +
 * crypto fallbacks so terminals, the charting page, and Quick Analysis all behave identically.
 */
export function fmpQuickAnalysisChartSymbolCandidates(
  normalizedSymbol: string,
  assetType?: unknown
): string[] {
  const n = String(normalizedSymbol || "")
    .replace(/\//g, "")
    .trim()
    .toUpperCase();
  if (!n) return [];

  const assetTypeMissing =
    assetType === undefined || assetType === null || String(assetType).trim() === "";

  if (assetTypeMissing) {
    const merged: string[] = [];
    uniqPush(merged, ...commodityAliasCandidates(n));
    uniqPush(merged, ...cryptoAliasCandidates(n));

    const bare = n.replace(/^\^/, "");
    const likelyForexSix = bare.length === 6 && /^[A-Z]{6}$/.test(bare);
    const hasExchangeSuffix = bare.includes(".");
    if (!likelyForexSix && !hasExchangeSuffix && /^[A-Z]{2,5}$/.test(bare)) {
      uniqPush(merged, ...equityAliasCandidates(n));
      uniqPush(merged, ...indexAliasCandidates(n));
    }
    return merged.length ? merged : [n];
  }

  const at = normalizeChartAssetType(assetType);
  if (at === "indices") return indexAliasCandidates(n);
  if (at === "commodities") return commodityAliasCandidates(n);
  if (at === "crypto") {
    const c = cryptoAliasCandidates(n);
    return c.length ? c : [n];
  }
  if (at === "equity") return equityAliasCandidates(n);
  return [n];
}

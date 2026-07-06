/**
 * ATFX chart file names / alt text (research reports + articles).
 * Examples:
 *   ATFX - EURUSD 2026-6-13 hourly chart
 *   ATFX - US unemployment 2026-6-13
 */

import { ECONOMIC_INDICATOR_LABELS } from "./fmpEconomicIndicators.js";
import { formatAtfxChartBrandLabel } from "./atfxChartBrandOverlay.js";

/** Date stamp for chart names: YYYY-M-D (no zero-padding). */
export function formatAtfxChartDate(date?: Date): string {
  const d = date ?? new Date();
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return `${y}-${m}-${day}`;
}

/** Interval label for price chart file names. */
export function formatAtfxIntervalLabel(interval: string): string {
  const iv = interval.trim().toLowerCase();
  if (iv === "1h" || iv === "60" || iv === "1hour") return "hourly";
  if (iv === "4h" || iv === "240" || iv === "4hour") return "4-hour";
  if (iv === "1d" || iv === "d" || iv === "1day") return "daily";
  if (iv === "1w" || iv === "w" || iv === "1week") return "weekly";
  if (iv === "5m" || iv === "5min") return "5-minute";
  if (iv === "15m" || iv === "15min") return "15-minute";
  if (iv === "30m" || iv === "30min") return "30-minute";
  return `${interval} chart`;
}

/** Price OHLC chart name e.g. ATFX - EURUSD 2026-6-13 hourly chart */
export function formatAtfxPriceChartFileName(
  symbol: string,
  interval: string,
  date?: Date
): string {
  const sym = formatAtfxChartBrandLabel(symbol);
  return `ATFX - ${sym} ${formatAtfxChartDate(date)} ${formatAtfxIntervalLabel(interval)} chart`;
}

const ECONOMIC_SHORT_LABELS: Record<string, string> = {
  unemploymentRate: "US unemployment",
  CPI: "US CPI",
  inflationRate: "US CPI",
  inflation: "US CPI",
  GDP: "US GDP",
  initialClaims: "US jobless claims",
  totalNonfarmPayroll: "US nonfarm payrolls",
  retailSales: "US retail sales",
  consumerSentiment: "US consumer sentiment",
  federalFunds: "US fed funds rate",
  treasury10Y: "US 10-year treasury",
  treasury2Y: "US 2-year treasury",
};

function economicTopicShort(topic: string): string {
  const key = topic.trim();
  if (ECONOMIC_SHORT_LABELS[key]) return ECONOMIC_SHORT_LABELS[key];

  const fromLabels = ECONOMIC_INDICATOR_LABELS[key];
  if (fromLabels) {
    return fromLabels
      .replace(/^US /i, "US ")
      .replace(/ Rate$/i, "")
      .replace(/ Index$/i, "")
      .replace(/^US (.+)$/i, (_m, rest: string) => `US ${rest.toLowerCase()}`);
  }

  if (/^US /i.test(key)) {
    return key
      .replace(/ Rate$/i, "")
      .replace(/ Index$/i, "")
      .replace(/^US (.+)$/i, (_m, rest: string) => `US ${rest.toLowerCase()}`);
  }

  return key;
}

/** Visible chart title e.g. US CPI (no ATFX prefix, no date). */
export function formatEconomicChartDisplayTitle(indicatorOrTitle: string): string {
  return economicTopicShort(indicatorOrTitle);
}

/** SEO file name e.g. ATFX - US unemployment 2026-6-13 */
export function formatAtfxEconomicChartFileName(indicatorOrTitle: string, date?: Date): string {
  return `ATFX - ${economicTopicShort(indicatorOrTitle)} ${formatAtfxChartDate(date)}`;
}

/** img attrs: human-readable alt + ATFX data-filename for SEO/downloads. */
export function atfxEconomicChartImgAttrs(indicatorOrTitle: string): string {
  const display = formatEconomicChartDisplayTitle(indicatorOrTitle);
  const fileName = formatAtfxEconomicChartFileName(indicatorOrTitle);
  const safeAlt = escapeHtmlAttr(display);
  const safeFile = escapeHtmlAttr(fileName);
  return `alt="${safeAlt}" data-filename="${safeFile}.png"`;
}

export function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Standard img attributes for ATFX chart embeds. */
export function atfxChartImgAttrs(fileName: string): string {
  const safe = escapeHtmlAttr(fileName);
  return `alt="${safe}" data-filename="${safe}.png"`;
}

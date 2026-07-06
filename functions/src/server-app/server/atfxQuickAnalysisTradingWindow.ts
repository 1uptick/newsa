/**
 * Trading-aware lookback windows for Quick Analysis.
 * Maps user-facing 24h / 48h / 1w to session-bounded news windows (equities) or calendar windows (crypto).
 */

import type { FmpChartAssetType } from "./fmpQuickAnalysisChartSymbol.js";
import type { QuickAnalysisLookback } from "./atfxQuickAnalysisLookback.js";

export interface OhlcBarTime {
  time: number;
}

export interface ResolvedQuickAnalysisWindow {
  assetType: FmpChartAssetType;
  asOfMs: number;
  windowStartMs: number;
  windowEndMs: number;
  marketStatus: "open" | "closed";
  sessionCount: number;
  resolvedWindowLabel: string;
  newsWindowLabel: string;
  driverVerificationWindow: string;
  searchRecencyFilter: "day" | "week";
  dailyOhlcBarsForPrompt: number;
  closedMarketNote: string;
  dataAsOfLabel: string;
}

const MS_HOUR = 60 * 60 * 1000;
const MS_DAY = 24 * MS_HOUR;
const MARKET_CLOSED_HOURS = 3;

export function inferQuickAnalysisAssetType(symbol: string): FmpChartAssetType {
  const raw = String(symbol || "").trim().toUpperCase();
  if (raw.startsWith("^")) return "indices";

  if (raw.includes("/")) return "forex";

  const bare = raw.replace(/^\^/, "").replace(/\//g, "");

  if (
    /^(BTC|ETH|XRP|SOL|ADA|DOGE|BNB|DOT|AVAX|MATIC|LINK|UNI|LTC|BCH|XLM|ATOM|SHIB|TRX|TON)(USD|USDT)?$/i.test(
      bare
    )
  ) {
    return "crypto";
  }

  if (/^[A-Z]{6}$/.test(bare)) return "forex";

  if (
    /^(XAU|XAG|GC|SI|CL|BZ|HG|NG|ZW|PL|PA)(USD)?$/i.test(bare) ||
    ["GCUSD", "CLUSD", "SIUSD", "HGUSD", "BZUSD", "NGUSD"].includes(bare)
  ) {
    return "commodities";
  }

  if (bare.includes(".")) return "equity";
  if (/^[A-Z]{1,5}$/.test(bare)) return "equity";

  return "equity";
}

function sessionCountForLookback(lookback: QuickAnalysisLookback, assetType: FmpChartAssetType): number {
  if (assetType === "crypto") {
    if (lookback === "1w") return 7;
    if (lookback === "48h") return 2;
    return 1;
  }
  switch (lookback) {
    case "48h":
      return 2;
    case "1w":
      return 5;
    default:
      return 1;
  }
}

function usesTradingSessions(assetType: FmpChartAssetType): boolean {
  return assetType === "indices" || assetType === "equity" || assetType === "commodities";
}

function formatShortDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatLongDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function utcDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function formatDateRange(startMs: number, endMs: number): string {
  if (utcDayKey(startMs) === utcDayKey(endMs)) return formatLongDate(endMs);
  return `${formatLongDate(startMs)} through ${formatLongDate(endMs)}`;
}

function resolveCalendarWindow(
  asOfMs: number,
  lookback: QuickAnalysisLookback
): { windowStartMs: number; windowEndMs: number } {
  const spanMs = lookback === "1w" ? 7 * MS_DAY : lookback === "48h" ? 2 * MS_DAY : MS_DAY;
  return { windowStartMs: asOfMs - spanMs, windowEndMs: asOfMs };
}

function resolveFromDailySessions(
  candles1d: OhlcBarTime[],
  sessionCount: number,
  asOfMs: number
): { windowStartMs: number; windowEndMs: number } {
  const daily = [...candles1d].filter((b) => b.time > 0).sort((a, b) => a.time - b.time);
  if (daily.length >= sessionCount) {
    const windowBars = daily.slice(-sessionCount);
    return {
      windowStartMs: windowBars[0].time * 1000,
      windowEndMs: windowBars[windowBars.length - 1].time * 1000,
    };
  }
  return resolveCalendarWindow(asOfMs, sessionCount === 5 ? "1w" : sessionCount === 2 ? "48h" : "24h");
}

function buildResolvedWindowLabel(
  assetType: FmpChartAssetType,
  lookback: QuickAnalysisLookback,
  sessionCount: number,
  windowStartMs: number,
  windowEndMs: number,
  marketStatus: "open" | "closed"
): string {
  const range = formatDateRange(windowStartMs, windowEndMs);
  if (assetType === "crypto") {
    if (lookback === "1w") return `Last 7 days (${range})`;
    if (lookback === "48h") return `Last 48 hours (${range})`;
    return `Last 24 hours (${range})`;
  }

  const sessionWord = sessionCount === 1 ? "session" : "sessions";
  const lookbackHint =
    lookback === "1w"
      ? `Last ${sessionCount} trading ${sessionWord}`
      : lookback === "48h"
        ? `Last ${sessionCount} trading ${sessionWord}`
        : "Last trading session";

  if (marketStatus === "closed") {
    return `${lookbackHint} · ${range}`;
  }
  return `${lookbackHint} · ${range}`;
}

function buildClosedMarketNote(assetType: FmpChartAssetType, marketStatus: "open" | "closed"): string {
  if (marketStatus !== "closed" || assetType === "crypto") return "";
  if (assetType === "forex") {
    return "FX may be quiet over the weekend; focus on the last active trading days in the window, not empty weekend hours.";
  }
  return "Cash/equity markets were closed after the data timestamp. Do NOT require news from the weekend gap — use catalysts from the quoted session window only.";
}

export function resolveQuickAnalysisTradingWindow(
  symbol: string,
  lookback: QuickAnalysisLookback,
  candles1h: OhlcBarTime[],
  candles1d: OhlcBarTime[],
  nowMs: number = Date.now()
): ResolvedQuickAnalysisWindow {
  const assetType = inferQuickAnalysisAssetType(symbol);
  const sessionCount = sessionCountForLookback(lookback, assetType);

  const daily = [...candles1d].filter((b) => b.time > 0).sort((a, b) => a.time - b.time);
  const hourly = [...candles1h].filter((b) => b.time > 0).sort((a, b) => a.time - b.time);

  let asOfMs = nowMs;
  if (daily.length > 0) {
    asOfMs = daily[daily.length - 1].time * 1000;
  } else if (hourly.length > 0) {
    asOfMs = hourly[hourly.length - 1].time * 1000;
  }

  const hoursSinceLastBar = (nowMs - asOfMs) / MS_HOUR;
  const marketStatus: "open" | "closed" =
    assetType === "crypto" ? (hoursSinceLastBar > 6 ? "closed" : "open") : hoursSinceLastBar > MARKET_CLOSED_HOURS ? "closed" : "open";

  let windowStartMs: number;
  let windowEndMs: number;

  if (assetType === "crypto" || assetType === "forex") {
    const cal = resolveCalendarWindow(asOfMs, lookback);
    windowStartMs = cal.windowStartMs;
    windowEndMs = cal.windowEndMs;

    if (assetType === "forex" && marketStatus === "closed" && daily.length >= 1) {
      const fxSessions = resolveFromDailySessions(daily, sessionCount, asOfMs);
      windowStartMs = fxSessions.windowStartMs;
      windowEndMs = fxSessions.windowEndMs;
    }
  } else if (usesTradingSessions(assetType)) {
    const sessions = resolveFromDailySessions(daily, sessionCount, asOfMs);
    windowStartMs = sessions.windowStartMs;
    windowEndMs = sessions.windowEndMs;
  } else {
    const cal = resolveCalendarWindow(asOfMs, lookback);
    windowStartMs = cal.windowStartMs;
    windowEndMs = cal.windowEndMs;
  }

  const rangeLabel = formatDateRange(windowStartMs, windowEndMs);
  const newsWindowLabel = rangeLabel;
  const driverVerificationWindow = rangeLabel;
  const resolvedWindowLabel = buildResolvedWindowLabel(
    assetType,
    lookback,
    sessionCount,
    windowStartMs,
    windowEndMs,
    marketStatus
  );

  const windowSpanHours = (windowEndMs - windowStartMs) / MS_HOUR;
  const searchRecencyFilter: "day" | "week" =
    lookback === "1w" || windowSpanHours > 36 || (marketStatus === "closed" && assetType !== "crypto") ? "week" : "day";

  const dailyOhlcBarsForPrompt = Math.max(sessionCount, lookback === "1w" ? 5 : lookback === "48h" ? 3 : 2);

  return {
    assetType,
    asOfMs,
    windowStartMs,
    windowEndMs,
    marketStatus,
    sessionCount,
    resolvedWindowLabel,
    newsWindowLabel,
    driverVerificationWindow,
    searchRecencyFilter,
    dailyOhlcBarsForPrompt,
    closedMarketNote: buildClosedMarketNote(assetType, marketStatus),
    dataAsOfLabel: formatShortDate(asOfMs),
  };
}

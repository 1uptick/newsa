/**
 * OHLC fetch from FMP + technical analysis (adapted from 1uptick technicalAnalysisService).
 */

import { config } from "./config.js";
import { resolveCoachSymbol } from "./coachSymbolResolver.js";
import { normalizeFmpSymbol } from "./atfxResearchFmpTools.js";
import { buildSupportResistanceTableFromLevels } from "./atfxReportTableHtml.js";
import { fmpQuickAnalysisChartSymbolCandidates } from "./fmpQuickAnalysisChartSymbol.js";

const FMP_BASE = "https://financialmodelingprep.com/stable";
const FETCH_TIMEOUT_MS = 20_000;

export type OhlcCandle = {
  open: number;
  high: number;
  low: number;
  close: number;
  time: number;
};

export type SupportResistanceLevels = {
  pivotPoint: number;
  resistance1: number;
  resistance2: number;
  resistance3: number;
  support1: number;
  support2: number;
  support3: number;
  recentSwingHigh: number;
  recentSwingLow: number;
};

export type TechnicalAnalysisSummary = {
  symbol: string;
  fmpSymbol: string;
  timeframe: string;
  mode: "full" | "lite";
  currentPrice: number;
  candleCount: number;
  supportResistance: SupportResistanceLevels;
  trend?: { direction: string; description: string; strength: number };
  ema?: { alignment: string; alignmentDescription: string; ema20: number; ema50: number };
  rsi?: { value: number; condition: string; description: string };
  macd?: { trend: string; histogram: number };
  atr?: { value: number; volatility: string; percentOfPrice: number };
  bollingerBands?: { upper: number; lower: number; percentB: number; breakout: string };
  signals?: {
    trend: string;
    momentum: string;
    volatility: string;
    overallBias: string;
  };
};

function fmpApiKey(): string {
  const key = config.fmp.apiKey?.trim();
  if (!key) throw new Error("FMP_API_KEY is not configured on the server.");
  return key;
}

function fmpCandleDateToUtcMs(date: string): number {
  const s = date.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return Date.parse(`${s}T00:00:00Z`);
  const parsed = Date.parse(s.endsWith("Z") ? s : `${s}Z`);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fmpFetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`FMP HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    if (data && typeof data === "object" && "Error Message" in (data as Record<string, unknown>)) {
      throw new Error(String((data as Record<string, unknown>)["Error Message"]));
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function parseCandleRows(raw: unknown): OhlcCandle[] {
  const arr = Array.isArray(raw) ? raw : (raw as { historical?: unknown })?.historical ?? [];
  if (!Array.isArray(arr)) return [];
  return (arr as Record<string, unknown>[])
    .map((c) => ({
      time: c.date ? Math.floor(fmpCandleDateToUtcMs(String(c.date)) / 1000) : 0,
      open: parseFloat(String(c.open)) || 0,
      high: parseFloat(String(c.high)) || 0,
      low: parseFloat(String(c.low)) || 0,
      close: parseFloat(String(c.close)) || 0,
    }))
    .filter((c) => c.time > 0 && c.close > 0 && c.high >= c.low)
    .sort((a, b) => a.time - b.time);
}

function objectiveToTimeframe(objective: string): { kind: "intraday" | "daily"; tf: string; limit: number; label: string } {
  switch (objective.trim().toLowerCase()) {
    case "intraday":
      return { kind: "intraday", tf: "1hour", limit: 168, label: "1H" };
    case "swing":
      return { kind: "intraday", tf: "4hour", limit: 120, label: "4H" };
    case "position":
      return { kind: "daily", tf: "1day", limit: 250, label: "1D" };
    default:
      return { kind: "daily", tf: "1day", limit: 120, label: "1D" };
  }
}

async function fetchIntradayCandles(fmpSymbol: string, tf: string, limit: number, apiKey: string): Promise<OhlcCandle[]> {
  const url = `${FMP_BASE}/historical-chart/${tf}?symbol=${encodeURIComponent(fmpSymbol)}&apikey=${apiKey}&limit=${limit}`;
  try {
    const json = await fmpFetchJson(url);
    return parseCandleRows(json);
  } catch {
    return [];
  }
}

async function fetchDailyCandles(fmpSymbol: string, apiKey: string, limitDays = 120): Promise<OhlcCandle[]> {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - limitDays);
  const from = start.toISOString().slice(0, 10);
  const to = end.toISOString().slice(0, 10);
  const url = `${FMP_BASE}/historical-price-eod/full?symbol=${encodeURIComponent(fmpSymbol)}&from=${from}&to=${to}&apikey=${apiKey}`;
  try {
    const json = await fmpFetchJson(url);
    return parseCandleRows(json);
  } catch {
    return [];
  }
}

async function fetchOhlcForSymbol(
  rawSymbol: string,
  objective: string
): Promise<{ candles: OhlcCandle[]; fmpSymbol: string; timeframeLabel: string }> {
  const apiKey = fmpApiKey();
  const normalized = normalizeFmpSymbol(rawSymbol);
  const resolved = resolveCoachSymbol(normalized || rawSymbol);
  const tfSpec = objectiveToTimeframe(objective);
  const candidates = fmpQuickAnalysisChartSymbolCandidates(resolved.fmpSymbol || normalized, "indices");

  for (const sym of candidates) {
    const candles =
      tfSpec.kind === "intraday"
        ? await fetchIntradayCandles(sym, tfSpec.tf, tfSpec.limit, apiKey)
        : await fetchDailyCandles(sym, apiKey, tfSpec.limit);

    if (candles.length >= 10) {
      return { candles, fmpSymbol: sym, timeframeLabel: tfSpec.label };
    }

    if (tfSpec.kind === "intraday") {
      const daily = await fetchDailyCandles(sym, apiKey, tfSpec.limit);
      if (daily.length >= 10) {
        return { candles: daily, fmpSymbol: sym, timeframeLabel: "1D" };
      }
    }
  }

  throw new Error(`No OHLC data from FMP for ${rawSymbol} (tried: ${candidates.slice(0, 4).join(", ")})`);
}

function calculateSMA(data: number[], period: number): number {
  if (data.length < period) return data[data.length - 1] || 0;
  const slice = data.slice(-period);
  return slice.reduce((sum, val) => sum + val, 0) / period;
}

function calculateEMA(data: number[], period: number): number[] {
  if (data.length === 0) return [];
  const multiplier = 2 / (period + 1);
  const emaValues: number[] = [];
  let ema = calculateSMA(data.slice(0, period), period);
  emaValues.push(ema);
  for (let i = period; i < data.length; i++) {
    ema = (data[i] - ema) * multiplier + ema;
    emaValues.push(ema);
  }
  return emaValues;
}

function calculateTrueRange(candles: OhlcCandle[]): number[] {
  const trueRanges: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = i > 0 ? candles[i - 1].close : candles[i].open;
    trueRanges.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  return trueRanges;
}

function calculateRsiValue(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) changes.push(closes[i] - closes[i - 1]);
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period; i < changes.length; i++) {
    const change = changes[i];
    if (change > 0) {
      avgGain = (avgGain * (period - 1) + change) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
    }
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function findSwingPoints(candles: OhlcCandle[], lookback = 5): { swingHighs: number[]; swingLows: number[] } {
  const swingHighs: number[] = [];
  const swingLows: number[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    let isSwingHigh = true;
    let isSwingLow = true;
    for (let j = 1; j <= lookback; j++) {
      if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) isSwingHigh = false;
      if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) isSwingLow = false;
    }
    if (isSwingHigh) swingHighs.push(candles[i].high);
    if (isSwingLow) swingLows.push(candles[i].low);
  }
  return { swingHighs, swingLows };
}

function safeFixed(value: number, digits: number, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback;
  return parseFloat(value.toFixed(digits));
}

export function formatLevelPrice(value: number, refPrice?: number): string {
  const ref = refPrice && refPrice > 0 ? refPrice : value;
  if (ref >= 1000) return value.toFixed(2);
  if (ref >= 10) return value.toFixed(3);
  if (ref >= 1) return value.toFixed(4);
  return value.toFixed(5);
}

export function calculateSupportResistance(candles: OhlcCandle[]): SupportResistanceLevels {
  const last = candles[candles.length - 1];
  const high = last.high;
  const low = last.low;
  const close = last.close;
  const pivotPoint = (high + low + close) / 3;
  const resistance1 = 2 * pivotPoint - low;
  const support1 = 2 * pivotPoint - high;
  const resistance2 = pivotPoint + (high - low);
  const support2 = pivotPoint - (high - low);
  const resistance3 = high + 2 * (pivotPoint - low);
  const support3 = low - 2 * (high - pivotPoint);
  const { swingHighs, swingLows } = findSwingPoints(candles);
  const recentSwingHigh = swingHighs.length ? Math.max(...swingHighs.slice(-3)) : high;
  const recentSwingLow = swingLows.length ? Math.min(...swingLows.slice(-3)) : low;
  const fix = (v: number, fb: number) => safeFixed(v, 6, fb);
  return {
    pivotPoint: fix(pivotPoint, close),
    resistance1: fix(resistance1, close * 1.01),
    resistance2: fix(resistance2, close * 1.02),
    resistance3: fix(resistance3, close * 1.03),
    support1: fix(support1, close * 0.99),
    support2: fix(support2, close * 0.98),
    support3: fix(support3, close * 0.97),
    recentSwingHigh: fix(recentSwingHigh, high),
    recentSwingLow: fix(recentSwingLow, low),
  };
}

function analyzeTrend(candles: OhlcCandle[]) {
  const { swingHighs, swingLows } = findSwingPoints(candles);
  let higherHighs = false;
  let higherLows = false;
  let lowerHighs = false;
  let lowerLows = false;
  if (swingHighs.length >= 2) {
    higherHighs = swingHighs[swingHighs.length - 1] > swingHighs[swingHighs.length - 2];
    lowerHighs = swingHighs[swingHighs.length - 1] < swingHighs[swingHighs.length - 2];
  }
  if (swingLows.length >= 2) {
    higherLows = swingLows[swingLows.length - 1] > swingLows[swingLows.length - 2];
    lowerLows = swingLows[swingLows.length - 1] < swingLows[swingLows.length - 2];
  }
  let direction = "Neutral";
  let strength = 50;
  let description = "No clear trend structure identified";
  if (higherHighs && higherLows) {
    direction = "Bullish";
    strength = 75;
    description = "Uptrend: higher highs and higher lows";
  } else if (lowerHighs && lowerLows) {
    direction = "Bearish";
    strength = 75;
    description = "Downtrend: lower highs and lower lows";
  } else if (lowerHighs && higherLows) {
    description = "Contracting range — consolidation";
    strength = 40;
  } else if (higherHighs && lowerLows) {
    description = "Expanding range — volatility expansion";
    strength = 40;
  }
  return { direction, strength, description };
}

function filterValidCandles(candles: OhlcCandle[]): OhlcCandle[] {
  return candles.filter(
    (c) =>
      c.open > 0 &&
      c.high > 0 &&
      c.low > 0 &&
      c.close > 0 &&
      c.high >= c.low &&
      c.high >= c.open &&
      c.high >= c.close &&
      c.low <= c.open &&
      c.low <= c.close
  );
}

export function runTechnicalAnalysis(
  symbol: string,
  candles: OhlcCandle[],
  timeframeLabel: string,
  fmpSymbol: string
): TechnicalAnalysisSummary {
  const valid = filterValidCandles(candles);
  if (valid.length < 10) throw new Error(`Insufficient OHLC data (${valid.length} bars)`);
  const currentPrice = valid[valid.length - 1].close;
  const supportResistance = calculateSupportResistance(valid);
  const mode: "full" | "lite" = valid.length >= 50 ? "full" : "lite";

  const summary: TechnicalAnalysisSummary = {
    symbol,
    fmpSymbol,
    timeframe: timeframeLabel,
    mode,
    currentPrice: safeFixed(currentPrice, 6),
    candleCount: valid.length,
    supportResistance,
    trend: analyzeTrend(valid),
  };

  if (mode === "lite") return summary;

  const closes = valid.map((c) => c.close);
  const ema10 = calculateEMA(closes, 10);
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const lastEma10 = ema10[ema10.length - 1] ?? currentPrice;
  const lastEma20 = ema20[ema20.length - 1] ?? currentPrice;
  const lastEma50 = ema50[ema50.length - 1] ?? currentPrice;
  let alignment = "Mixed";
  let alignmentDescription = "EMAs mixed — no clear alignment";
  if (currentPrice > lastEma10 && lastEma10 > lastEma20 && lastEma20 > lastEma50) {
    alignment = "Bullish";
    alignmentDescription = "Price > EMA10 > EMA20 > EMA50";
  } else if (currentPrice < lastEma10 && lastEma10 < lastEma20 && lastEma20 < lastEma50) {
    alignment = "Bearish";
    alignmentDescription = "Price < EMA10 < EMA20 < EMA50";
  }
  summary.ema = {
    alignment,
    alignmentDescription,
    ema20: safeFixed(lastEma20, 6),
    ema50: safeFixed(lastEma50, 6),
  };

  const rsiValue = calculateRsiValue(closes, 14);
  let rsiCondition = "Neutral";
  if (rsiValue >= 70) rsiCondition = "Overbought";
  else if (rsiValue <= 30) rsiCondition = "Oversold";
  summary.rsi = {
    value: safeFixed(rsiValue, 2),
    condition: rsiCondition,
    description: `RSI(14) ${rsiValue.toFixed(1)} — ${rsiCondition}`,
  };

  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  const macdLine = (ema12[ema12.length - 1] ?? 0) - (ema26[ema26.length - 1] ?? 0);
  const macdTrend = macdLine > 0 ? "Bullish" : macdLine < 0 ? "Bearish" : "Neutral";
  summary.macd = { trend: macdTrend, histogram: safeFixed(macdLine, 6) };

  const tr = calculateTrueRange(valid);
  const atrSeries = calculateEMA(tr, 14);
  const atr = atrSeries[atrSeries.length - 1] ?? 0;
  const pct = currentPrice > 0 ? (atr / currentPrice) * 100 : 0;
  let volatility = "Medium";
  if (pct > 1.5) volatility = "High";
  else if (pct < 0.5) volatility = "Low";
  summary.atr = { value: safeFixed(atr, 6), volatility, percentOfPrice: safeFixed(pct, 3) };

  const middle = calculateSMA(closes, 20);
  const slice = closes.slice(-20);
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  const std = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length);
  const upper = middle + 2 * std;
  const lower = middle - 2 * std;
  const percentB = upper !== lower ? ((currentPrice - lower) / (upper - lower)) * 100 : 50;
  let breakout = "None";
  if (currentPrice > upper) breakout = "Upper";
  else if (currentPrice < lower) breakout = "Lower";
  summary.bollingerBands = {
    upper: safeFixed(upper, 6),
    lower: safeFixed(lower, 6),
    percentB: safeFixed(percentB, 2),
    breakout,
  };

  let bullish = 0;
  let bearish = 0;
  if (alignment === "Bullish") bullish += 2;
  if (alignment === "Bearish") bearish += 2;
  if (macdTrend === "Bullish") bullish += 1;
  if (macdTrend === "Bearish") bearish += 1;
  if (rsiValue > 50) bullish += 1;
  if (rsiValue < 50) bearish += 1;
  if (summary.trend?.direction === "Bullish") bullish += 2;
  if (summary.trend?.direction === "Bearish") bearish += 2;
  const net = bullish - bearish;
  let overallBias = "Neutral";
  if (net >= 4) overallBias = "Strong Buy";
  else if (net >= 2) overallBias = "Buy";
  else if (net <= -4) overallBias = "Strong Sell";
  else if (net <= -2) overallBias = "Sell";
  summary.signals = {
    trend: summary.trend?.direction ?? "Neutral",
    momentum: macdTrend,
    volatility,
    overallBias,
  };

  return summary;
}

export function formatTechnicalAnalysisText(summary: TechnicalAnalysisSummary): string {
  const sr = summary.supportResistance;
  const fp = (n: number) => formatLevelPrice(n, summary.currentPrice);
  const lines: string[] = [
    `Technical analysis: ${summary.symbol} (${summary.timeframe}, ${summary.candleCount} bars, FMP ${summary.fmpSymbol})`,
    `Mode: ${summary.mode === "full" ? "full indicator suite" : "support/resistance + trend (limited history)"}`,
    `Current price: ${fp(summary.currentPrice)}`,
    "",
    "Support / resistance (floor pivots from latest bar):",
    `R3 ${fp(sr.resistance3)} | R2 ${fp(sr.resistance2)} | R1 ${fp(sr.resistance1)} | Pivot ${fp(sr.pivotPoint)} | S1 ${fp(sr.support1)} | S2 ${fp(sr.support2)} | S3 ${fp(sr.support3)}`,
    `Recent swing high ${fp(sr.recentSwingHigh)} | swing low ${fp(sr.recentSwingLow)}`,
    "",
    "SUPPORT_RESISTANCE_TABLE_HTML (embed under the instrument chart — copy exactly):",
    buildSupportResistanceTableFromLevels(sr, summary.currentPrice),
  ];

  if (summary.trend) {
    lines.push("", `Trend: ${summary.trend.direction} (${summary.trend.description})`);
  }
  if (summary.mode === "full") {
    lines.push(
      "",
      "Indicators:",
      summary.ema ? `- EMA stack: ${summary.ema.alignment} — ${summary.ema.alignmentDescription}` : "",
      summary.rsi ? `- ${summary.rsi.description}` : "",
      summary.macd ? `- MACD bias: ${summary.macd.trend} (histogram ${summary.macd.histogram})` : "",
      summary.atr
        ? `- ATR(14): ${fp(summary.atr.value)} (${summary.atr.volatility} volatility, ${summary.atr.percentOfPrice}% of price)`
        : "",
      summary.bollingerBands
        ? `- Bollinger %B ${summary.bollingerBands.percentB}; breakout ${summary.bollingerBands.breakout}`
        : "",
      summary.signals
        ? `- Overall bias: ${summary.signals.overallBias} (trend ${summary.signals.trend}, momentum ${summary.signals.momentum})`
        : ""
    );
  }

  lines.push(
    "",
    "Writer rules: use the SUPPORT_RESISTANCE_TABLE_HTML block verbatim after each price chart. Do NOT invent levels — use these numbers only. Add narrative on trend/RSI/MACD when mode is full."
  );

  return lines.filter(Boolean).join("\n");
}

export async function runGetTechnicalAnalysis(args: Record<string, unknown>): Promise<string> {
  const symbol = typeof args.symbol === "string" ? args.symbol.trim() : "";
  if (!symbol) return "Error: symbol is required for get_technical_analysis.";
  const objective =
    typeof args.objective === "string" && args.objective.trim()
      ? args.objective.trim()
      : typeof args.timeframe === "string" && args.timeframe.trim()
        ? args.timeframe.trim()
        : "daily";

  try {
    const { candles, fmpSymbol, timeframeLabel } = await fetchOhlcForSymbol(symbol, objective);
    const summary = runTechnicalAnalysis(symbol, candles, timeframeLabel, fmpSymbol);
    return formatTechnicalAnalysisText(summary);
  } catch (e) {
    return `Technical analysis failed for ${symbol}: ${(e as Error).message}`;
  }
}

export const TECHNICAL_ANALYSIS_TOOL_DEFINITION = {
  type: "function" as const,
  function: {
    name: "get_technical_analysis",
    description:
      "Fetch FMP OHLC candles and compute support/resistance (floor pivots), trend, and full indicators (EMA, RSI, MACD, ATR, Bollinger) when enough history exists. " +
      "Returns SUPPORT_RESISTANCE_TABLE_HTML for the report. Use whenever price charts or key levels are needed.",
    parameters: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "FMP ticker e.g. EURUSD, XAUUSD, AAPL, ^GSPC",
        },
        objective: {
          type: "string",
          description: "Horizon for OHLC timeframe: intraday→1H, swing→4H, daily→1D, position→1D",
          enum: ["intraday", "swing", "daily", "position"],
        },
      },
      required: ["symbol"],
    },
  },
} as const;

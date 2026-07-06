/**
 * Shared FMP quote + Chart-IMG helpers for ATFX article generation and research reports.
 */

import { config } from "./config.js";
import {
  CHART_IMG_GOLD_API_SYMBOL,
  getChartImgSymbolCandidates,
  isGoldChartInput,
  resolveFmpSymbol,
} from "./chartSymbolHelpers.js";
import {
  fetchChartImgPng,
  isChartImgSymbolMismatchError,
} from "./chartImg/chartImgSymbolFallback.js";
import { buildChartImgAdvancedChartBody } from "./chartImg/chartImgRequest.js";
import { uiTimeframeToChartImgInterval } from "./chartImg/timeframe.js";
import { fetchFmpQuote } from "./fmpQuotes.js";
import {
  applyAtfxChartBrandOverlay,
} from "./atfxChartBrandOverlay.js";
import {
  atfxChartImgAttrs,
  formatAtfxEconomicChartFileName,
  formatAtfxPriceChartFileName,
  formatEconomicChartDisplayTitle,
} from "./atfxChartNaming.js";
import {
  type ArticleChartEmbed,
  type ContentChartPlan,
  detectFinancialSymbols,
  MAX_ECONOMIC_CHARTS,
  MAX_PRICE_CHARTS,
  planContentCharts,
} from "./contentChartPlanner.js";
import { generateEconomicChartDataUrl } from "./economicChart.js";

export { detectFinancialSymbols, planContentCharts };
export type { ArticleChartEmbed, ContentChartPlan };

/** ATFX brand OHLC candle colors (research reports + ATFX article charts only). */
export const ATFX_CHART_CANDLE_UP = "rgb(242,104,42)"; // #f2682a orange
export const ATFX_CHART_CANDLE_DOWN = "rgb(23,43,76)"; // #172b4c navy

const RESEARCH_CHART_WIDTH = 800;
const RESEARCH_CHART_HEIGHT = 500;

function resolveChartApiSymbol(tradingViewSymbol: string, rawInput?: string): string {
  if (rawInput && isGoldChartInput(rawInput)) return CHART_IMG_GOLD_API_SYMBOL;
  if (isGoldChartInput(tradingViewSymbol)) return CHART_IMG_GOLD_API_SYMBOL;
  return tradingViewSymbol;
}

/** chart-img v2 advanced-chart body (legacy override.studies shape returns HTTP 422). */
function buildAtfxResearchChartBody(tradingViewSymbol: string, interval: string, rawInput?: string) {
  return buildChartImgAdvancedChartBody({
    tradingViewSymbol: resolveChartApiSymbol(tradingViewSymbol, rawInput),
    interval: uiTimeframeToChartImgInterval(interval),
    width: RESEARCH_CHART_WIDTH,
    height: RESEARCH_CHART_HEIGHT,
    theme: "light",
    bias: "neutral",
    candleUpColor: ATFX_CHART_CANDLE_UP,
    candleDownColor: ATFX_CHART_CANDLE_DOWN,
  });
}

/** Map trading objective to Chart-IMG interval. */
export function intervalFromObjective(objective?: string): string {
  const o = (objective ?? "").toLowerCase();
  if (/intraday|scalp|day.?trad|hourly/.test(o)) return "1h";
  if (/swing|short.?term|4h/.test(o)) return "4h";
  if (/position|long.?term|invest/.test(o)) return "1D";
  return "1D";
}

export function resolveChartInterval(args: {
  interval?: string;
  objective?: string;
}): string {
  const explicit = typeof args.interval === "string" ? args.interval.trim() : "";
  if (explicit) return explicit;
  if (args.objective) return intervalFromObjective(args.objective);
  return "1D";
}

async function fetchAtfxChartDataUrl(symbol: string, interval: string): Promise<string | null> {
  const apiKey = config.chartImg.apiKey;
  if (!apiKey) return null;

  const candidates = getChartImgSymbolCandidates(symbol);
  if (!candidates.length) return null;

  const fileName = formatAtfxPriceChartFileName(symbol, interval);
  let lastError = "";
  for (const chartSym of candidates) {
    try {
      const buf = await fetchChartImgPng(buildAtfxResearchChartBody(chartSym, interval, symbol), apiKey);
      const branded = await applyAtfxChartBrandOverlay(buf, fileName, {
        hideTradingViewLogo: true,
        theme: "light",
      });
      const dataUrl = `data:image/png;base64,${branded.toString("base64")}`;
      if (candidates[0] !== chartSym) {
        console.info("Chart-IMG symbol fallback succeeded", {
          input: symbol,
          primary: candidates[0],
          resolved: chartSym,
        });
      }
      return dataUrl;
    } catch (err) {
      const message = (err as Error)?.message ?? String(err);
      lastError = message;
      if (!isChartImgSymbolMismatchError(message)) {
        console.error("Chart-IMG error (non-symbol):", message);
        break;
      }
      console.warn("Chart-IMG symbol rejected, trying fallback:", chartSym, message);
    }
  }

  console.error("Chart-IMG fetch error:", lastError || "all candidates failed");
  return null;
}

export async function generateChartImage(symbol: string, interval: string = "1D"): Promise<string | null> {
  if (!config.chartImg.apiKey) {
    console.warn("Chart-IMG API key not configured, skipping chart generation");
    return null;
  }
  return fetchAtfxChartDataUrl(symbol, interval);
}

/** Execute a content chart plan: OHLC price charts + macro economic charts. */
export async function executeContentChartPlan(
  plan: ContentChartPlan,
  opts?: { priceInterval?: string; maxPrice?: number; maxEconomic?: number }
): Promise<ArticleChartEmbed[]> {
  const priceInterval = opts?.priceInterval ?? "1D";
  const maxPrice = opts?.maxPrice ?? MAX_PRICE_CHARTS;
  const maxEconomic = opts?.maxEconomic ?? MAX_ECONOMIC_CHARTS;
  const charts: ArticleChartEmbed[] = [];

  for (const sym of plan.priceSymbols.slice(0, maxPrice)) {
    const src = await generateChartImage(sym, priceInterval);
    if (src) {
      charts.push({
        src,
        caption: formatAtfxPriceChartFileName(sym, priceInterval),
        fileName: formatAtfxPriceChartFileName(sym, priceInterval),
        kind: "price",
      });
      console.info("[atfx-charts] OHLC chart OK:", sym, `(${src.length} chars)`);
    } else {
      console.warn("[atfx-charts] OHLC chart FAILED:", sym);
    }
  }

  for (const econ of plan.economicCharts.slice(0, maxEconomic)) {
    const src = await generateEconomicChartDataUrl(econ);
    if (src) {
      charts.push({
        src,
        caption: formatEconomicChartDisplayTitle(econ.indicator ?? econ.title),
        fileName: formatAtfxEconomicChartFileName(econ.indicator ?? econ.title),
        kind: "economic",
      });
      console.info("[atfx-charts] economic chart OK:", econ.title, `(${src.length} chars)`);
    } else {
      console.warn("[atfx-charts] economic chart FAILED:", econ.title);
    }
  }

  return charts;
}

export async function fetchPriceQuotes(symbols: string[]): Promise<Map<string, number>> {
  const quotes = new Map<string, number>();
  const apiKey = config.fmp.apiKey;
  if (!apiKey) return quotes;

  for (const sym of symbols) {
    const fmpSymbol = resolveFmpSymbol(sym);
    const price = await fetchFmpQuote(fmpSymbol, apiKey);
    if (price != null) quotes.set(sym, price);
  }

  return quotes;
}

/** Format a live FMP quote as plain text for LLM tool results. */
export async function fetchFmpQuoteText(symbol: string): Promise<string> {
  const apiKey = config.fmp.apiKey;
  if (!apiKey) {
    return "FMP_API_KEY is not configured on the server.";
  }
  const fmpSymbol = resolveFmpSymbol(symbol);
  const price = await fetchFmpQuote(fmpSymbol, apiKey);
  if (price == null) {
    return `No live quote found for ${fmpSymbol}.`;
  }
  return `Live quote for ${fmpSymbol}: ${price}`;
}

/** Chart-IMG snapshot as embeddable data URL text for LLM tool results. */
export async function fetchChartImageText(
  symbol: string,
  interval?: string,
  objective?: string
): Promise<string> {
  const apiKey = config.chartImg.apiKey;
  if (!apiKey) {
    return "Chart image unavailable (CHART_IMG_API_KEY not set).";
  }

  const iv = resolveChartInterval({ interval, objective });
  const candidates = getChartImgSymbolCandidates(symbol);
  if (!candidates.length) {
    return `Chart image unavailable for ${symbol} (no TradingView symbol candidates).`;
  }

  const dataUrl = await fetchAtfxChartDataUrl(symbol, iv);
  if (!dataUrl) {
    return `Chart image unavailable for ${symbol} (upstream error).`;
  }

  const fileName = formatAtfxPriceChartFileName(symbol, iv);
  const imgAttrs = atfxChartImgAttrs(fileName);
  return `Chart image: ${fileName} (embed in report HTML as <img src="${dataUrl}" ${imgAttrs} />): data URL ready.`;
}

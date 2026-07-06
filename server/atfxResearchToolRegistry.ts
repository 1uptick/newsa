/**
 * Tool registry for the ATFX Research Report chat agent.
 */

import { fetchChartImageText } from "./atfxMarketData.js";
import { fetchEconomicChartText } from "./economicChart.js";
import {
  ATFX_RESEARCH_FMP_TOOL_DEFINITIONS,
  executeFmpResearchTool,
} from "./atfxResearchFmpTools.js";
import {
  ATFX_RESEARCH_NEWS_TOOL_DEFINITION,
  runGetMarketNewsResearch,
} from "./atfxResearchNewsTool.js";
import {
  TECHNICAL_ANALYSIS_TOOL_DEFINITION,
  runGetTechnicalAnalysis,
} from "./atfxTechnicalAnalysis.js";

const CHART_TOOL_DEFINITION = {
  type: "function" as const,
  function: {
    name: "get_chart_image",
    description:
      "Generate a TradingView-style OHLC chart image for price trend analysis. " +
      "Pick interval from user objective: intraday→1H, swing→4H, daily macro→1D, position/long-term→1W. " +
      "Returns a data URL to embed in report HTML as <img>.",
    parameters: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "TradingView-style symbol e.g. FOREX:EURUSD, COMEX:GC1!, TVC:DXY",
        },
        interval: {
          type: "string",
          description: "Explicit chart interval override",
          enum: ["1H", "4H", "1D", "1W"],
        },
        objective: {
          type: "string",
          description: "Trading horizon when interval not set: intraday, swing, daily, or position",
          enum: ["intraday", "swing", "daily", "position"],
        },
      },
      required: ["symbol"],
    },
  },
} as const;

const ECON_CHART_TOOL_DEFINITION = {
  type: "function" as const,
  function: {
    name: "get_economic_chart",
    description:
      "Generate a bar or line chart PNG for macroeconomic indicators. US series: unemploymentRate, CPI, GDP, treasury10Y. " +
      "Non-US: pass country + eventPattern + title (e.g. country AU, eventPattern 'inflation|cpi', title 'Australia Inflation Rate (YoY)'). " +
      "Separate from price OHLC charts. Returns __ECON_CHART_REF_N__ placeholder.",
    parameters: {
      type: "object",
      properties: {
        indicator: {
          type: "string",
          description:
            "US indicator: unemploymentRate, CPI, inflationRate, GDP, initialClaims, totalNonfarmPayroll, treasury10Y, treasury2Y",
        },
        country: { type: "string", description: "ISO country for calendar-based charts (AU, GB, JP, …)" },
        eventPattern: { type: "string", description: "Regex to match calendar event names when using country" },
        preferEventPrefix: { type: "string", description: "Prefer one headline release family (e.g. Inflation Rate YoY)" },
        title: { type: "string", description: "Chart title for calendar-based charts" },
        chartType: {
          type: "string",
          description: "bar for monthly releases, line for continuous series (treasury yields)",
          enum: ["bar", "line"],
        },
        months: { type: "integer", description: "Lookback months. Default 24." },
        fromDate: { type: "string", description: "Optional start YYYY-MM-DD" },
        toDate: { type: "string", description: "Optional end YYYY-MM-DD" },
      },
      required: ["indicator"],
    },
  },
} as const;

export const RESEARCH_TOOL_DEFINITIONS = [
  ATFX_RESEARCH_NEWS_TOOL_DEFINITION,
  ...ATFX_RESEARCH_FMP_TOOL_DEFINITIONS,
  TECHNICAL_ANALYSIS_TOOL_DEFINITION,
  CHART_TOOL_DEFINITION,
  ECON_CHART_TOOL_DEFINITION,
];

const TOOL_LABELS: Record<string, string> = {
  get_market_news_research: "Market news research",
  get_fmp_quote: "Live quote",
  get_fmp_economic_calendar: "Economic calendar",
  get_fmp_economic_indicator: "Economic indicator",
  get_fmp_treasury_rates: "Treasury rates",
  get_fmp_company_profile: "Company profile",
  get_fmp_ratios: "Valuation ratios",
  get_fmp_financial_statements: "Financial statements",
  get_fmp_technical_indicator: "Technical indicator",
  get_technical_analysis: "Technical analysis",
  get_chart_image: "Price chart",
  get_economic_chart: "Economic chart",
};

export function toolDisplayLabel(name: string): string {
  if (TOOL_LABELS[name]) return TOOL_LABELS[name];
  const stripped = name
    .trim()
    .replace(/^get_fmp_/, "")
    .replace(/^get_/, "")
    .replace(/_/g, " ");
  if (!stripped) return name;
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

/** Short suffix for duplicate tool pills (symbol, indicator, etc.). */
export function toolEventDetail(name: string, args: Record<string, unknown>): string | undefined {
  const symbol = typeof args.symbol === "string" ? args.symbol.trim().toUpperCase() : "";
  if (
    symbol &&
    (name === "get_fmp_quote" ||
      name === "get_chart_image" ||
      name === "get_fmp_company_profile" ||
      name === "get_fmp_ratios" ||
      name === "get_fmp_technical_indicator" ||
      name === "get_technical_analysis")
  ) {
    return symbol;
  }
  if (name === "get_fmp_economic_indicator" || name === "get_economic_chart") {
    const indicator = String(args.indicator ?? args.name ?? args.eventPattern ?? args.title ?? "").trim();
    if (indicator) return indicator.slice(0, 32);
  }
  if (name === "get_market_news_research") {
    const symbols = String(args.symbols ?? "")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 3);
    if (symbols.length) return symbols.join(", ");
  }
  return undefined;
}

export async function executeResearchTool(name: string, args: Record<string, unknown>): Promise<string> {
  if (name === "get_market_news_research") {
    return runGetMarketNewsResearch(args);
  }

  if (name === "get_chart_image") {
    const symbol = typeof args.symbol === "string" ? args.symbol.trim() : "";
    if (!symbol) return "Error: symbol is required for get_chart_image.";
    const interval = typeof args.interval === "string" ? args.interval.trim() : undefined;
    const objective = typeof args.objective === "string" ? args.objective.trim() : undefined;
    return fetchChartImageText(symbol, interval, objective);
  }

  if (name === "get_economic_chart") {
    return fetchEconomicChartText(args);
  }

  if (name === "get_technical_analysis") {
    return runGetTechnicalAnalysis(args);
  }

  const fmpResult = await executeFmpResearchTool(name, args);
  if (fmpResult != null) return fmpResult;

  return `Unknown tool: ${name}`;
}

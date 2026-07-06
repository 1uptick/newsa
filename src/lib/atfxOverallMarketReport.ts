import type { AtfxQuickAnalysisResult } from "./atfxQuickAnalysisService";
import type { BrokerageTokenBalance } from "./brokerageTokens";

export const OVERALL_MARKET_SYMBOL_PREFIX = "OVERALL:";

export type OverallMarketSegment = "us_stocks" | "forex" | "commodities";

export const OVERALL_MARKET_SEGMENT_OPTIONS: ReadonlyArray<{
  id: OverallMarketSegment;
  label: string;
  description: string;
}> = [
  {
    id: "us_stocks",
    label: "Stocks market",
    description: "US equities — S&P 500, Nasdaq 100, Dow 30",
  },
  {
    id: "forex",
    label: "Forex",
    description: "Major G10 currency pairs vs USD",
  },
  {
    id: "commodities",
    label: "Commodity",
    description: "Gold, oil, silver, natural gas, copper",
  },
];

export function isOverallMarketReportSymbol(symbol: string): boolean {
  return String(symbol ?? "")
    .trim()
    .toUpperCase()
    .startsWith(OVERALL_MARKET_SYMBOL_PREFIX);
}

export const OVERALL_MARKET_HTML_MARKER = "<!--ATFX_OVERALL_HTML-->";

export function isOverallMarketHtmlReport(report: string): boolean {
  const t = report.trim();
  return t.startsWith(OVERALL_MARKET_HTML_MARKER) || (t.startsWith("<") && /<h2\b/i.test(t));
}

export async function fetchAtfxOverallMarketReport(
  authFetch: (url: string, opts?: RequestInit) => Promise<Response>,
  segments: OverallMarketSegment[]
): Promise<AtfxQuickAnalysisResult & { tokenBalance?: BrokerageTokenBalance }> {
  const res = await authFetch("/api/atfx/markets/overall-market-report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ segments }),
  });

  const data = (await res.json().catch(() => ({}))) as AtfxQuickAnalysisResult & {
    error?: string;
    tokenBalance?: BrokerageTokenBalance;
  };
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : `Overall market report failed (${res.status})`);
  }
  return data;
}

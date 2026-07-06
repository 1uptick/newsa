export type QuickAnalysisLookback = "24h" | "48h" | "1w";

export const DEFAULT_QUICK_ANALYSIS_LOOKBACK: QuickAnalysisLookback = "24h";

export function parseQuickAnalysisLookback(value: unknown): QuickAnalysisLookback {
  if (value === "24h" || value === "48h" || value === "1w") return value;
  return DEFAULT_QUICK_ANALYSIS_LOOKBACK;
}

export function lookbackLabel(lookback: QuickAnalysisLookback): string {
  switch (lookback) {
    case "48h":
      return "Last 48 hours";
    case "1w":
      return "Last 1 week";
    default:
      return "Last 24 hours";
  }
}

export type QuickAnalysisLookbackConfig = {
  dailyOhlcBarsForPrompt: number;
  newsWindowLabel: string;
  driverVerificationWindow: string;
  searchRecencyFilter: "day" | "week";
};

const LOOKBACK_CONFIG: Record<QuickAnalysisLookback, QuickAnalysisLookbackConfig> = {
  "24h": {
    dailyOhlcBarsForPrompt: 2,
    newsWindowLabel: "the last 24 hours",
    driverVerificationWindow: "the last 48 hours",
    searchRecencyFilter: "day",
  },
  "48h": {
    dailyOhlcBarsForPrompt: 3,
    newsWindowLabel: "the last 48 hours",
    driverVerificationWindow: "the last 48 hours",
    searchRecencyFilter: "day",
  },
  "1w": {
    dailyOhlcBarsForPrompt: 7,
    newsWindowLabel: "the last week",
    driverVerificationWindow: "the last 7 days",
    searchRecencyFilter: "week",
  },
};

export function getQuickAnalysisLookbackConfig(lookback: QuickAnalysisLookback): QuickAnalysisLookbackConfig {
  return LOOKBACK_CONFIG[lookback];
}

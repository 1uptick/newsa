export type QuickAnalysisLookback = "24h" | "48h" | "1w";

export const DEFAULT_QUICK_ANALYSIS_LOOKBACK: QuickAnalysisLookback = "24h";

export const QUICK_ANALYSIS_LOOKBACK_OPTIONS: ReadonlyArray<{
  value: QuickAnalysisLookback;
  label: string;
}> = [
  { value: "24h", label: "Last 24 hours" },
  { value: "48h", label: "Last 48 hours" },
  { value: "1w", label: "Last 1 week" },
];

export function formatQuickAnalysisLookback(lookback: QuickAnalysisLookback | undefined): string {
  const opt = QUICK_ANALYSIS_LOOKBACK_OPTIONS.find((o) => o.value === lookback);
  return opt?.label ?? QUICK_ANALYSIS_LOOKBACK_OPTIONS[0].label;
}

import type { QuickAnalysisLookback } from "./atfxQuickAnalysisLookback";
import type { QuickAnalysisTranslateLocale } from "./atfxQuickAnalysisLocale";
import type { BrokerageTokenBalance } from "./brokerageTokens";

export interface AtfxQuickAnalysisResult {
  success: boolean;
  id?: string;
  symbol: string;
  displayName: string;
  report: string;
  timestamp: number;
  lookback?: QuickAnalysisLookback;
  changePct?: number;
  lastClose?: number;
  chartImageUrl?: string;
  chartCaption?: string;
  chartInterval?: string;
  resolvedWindowLabel?: string;
  dataAsOfLabel?: string;
  reportTc?: string;
  reportSc?: string;
  reportTh?: string;
  reportVi?: string;
  owner_uid?: string;
  owner_email?: string | null;
  tokenBalance?: BrokerageTokenBalance;
  error?: string;
}

export async function fetchAtfxQuickAnalysis(
  authFetch: (url: string, opts?: RequestInit & { forceRefresh?: boolean }) => Promise<Response>,
  symbol: string,
  displayName: string,
  lookback: QuickAnalysisLookback
): Promise<AtfxQuickAnalysisResult> {
  const res = await authFetch("/api/atfx/markets/quick-analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol, displayName, lookback }),
  });

  const data = (await res.json().catch(() => ({}))) as AtfxQuickAnalysisResult & { error?: string };
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : `Quick analysis failed (${res.status})`);
  }
  return data;
}

export async function fetchAtfxQuickAnalysisHistory(
  authFetch: (url: string, opts?: RequestInit & { forceRefresh?: boolean }) => Promise<Response>
): Promise<AtfxQuickAnalysisResult[]> {
  const res = await authFetch("/api/atfx/markets/quick-analysis");
  const data = (await res.json().catch(() => ({}))) as { items?: AtfxQuickAnalysisResult[]; error?: string };
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : `Failed to load quick analysis history (${res.status})`);
  }
  return Array.isArray(data.items) ? data.items : [];
}

export async function fetchAtfxQuickAnalysisHistoryLite(
  authFetch: (url: string, opts?: RequestInit & { forceRefresh?: boolean }) => Promise<Response>
): Promise<AtfxQuickAnalysisResult[]> {
  const res = await authFetch("/api/atfx/markets/quick-analysis?lite=1");
  const data = (await res.json().catch(() => ({}))) as { items?: AtfxQuickAnalysisResult[]; error?: string };
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : `Failed to load quick analysis history (${res.status})`);
  }
  return Array.isArray(data.items) ? data.items : [];
}

export async function fetchAtfxQuickAnalysisById(
  authFetch: (url: string, opts?: RequestInit & { forceRefresh?: boolean }) => Promise<Response>,
  id: string
): Promise<AtfxQuickAnalysisResult> {
  const res = await authFetch(`/api/atfx/markets/quick-analysis/${encodeURIComponent(id)}`);
  const data = (await res.json().catch(() => ({}))) as AtfxQuickAnalysisResult & { error?: string };
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : `Failed to load quick analysis (${res.status})`);
  }
  return data;
}

export function formatQuickAnalysisTime(ts: number): string {
  if (!Number.isFinite(ts)) return "";
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function quickAnalysisResultToSession(result: AtfxQuickAnalysisResult): {
  id: string;
  symbol: string;
  displayName: string;
  report: string;
  timestamp: number;
  status: "ready";
  lookback?: QuickAnalysisLookback;
  changePct?: number;
  chartImageUrl?: string;
  chartCaption?: string;
  resolvedWindowLabel?: string;
  dataAsOfLabel?: string;
  reportTc?: string;
  reportSc?: string;
  reportTh?: string;
  reportVi?: string;
  ownerEmail?: string | null;
  detailLoading?: boolean;
} {
  return {
    id: result.id || `${result.symbol}-${result.timestamp}`,
    symbol: result.symbol,
    displayName: result.displayName,
    report: result.report,
    timestamp: result.timestamp,
    status: "ready",
    lookback: result.lookback,
    changePct: result.changePct,
    chartImageUrl: result.chartImageUrl,
    chartCaption: result.chartCaption,
    resolvedWindowLabel: result.resolvedWindowLabel,
    dataAsOfLabel: result.dataAsOfLabel,
    reportTc: result.reportTc,
    reportSc: result.reportSc,
    reportTh: result.reportTh,
    reportVi: result.reportVi,
    ownerEmail: result.owner_email ?? null,
    detailLoading: false,
  };
}

export function quickAnalysisNeedsDetailLoad(result: AtfxQuickAnalysisResult): boolean {
  return !result.report?.trim();
}

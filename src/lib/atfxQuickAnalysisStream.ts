import { apiUrl } from "./api";
import type { QuickAnalysisLookback } from "./atfxQuickAnalysisLookback";
import type { AtfxQuickAnalysisResult } from "./atfxQuickAnalysisService";
import type { BrokerageTokenBalance } from "./brokerageTokens";
import type { OverallMarketSegment } from "./atfxOverallMarketReport";

export type QuickAnalysisProgressStep =
  | "price"
  | "snapshot"
  | "chart"
  | "drivers"
  | "report"
  | "quotes"
  | "research"
  | "charts"
  | "narrative";

export const QA_STANDARD_PROGRESS_STEPS: Array<{ id: QuickAnalysisProgressStep; label: string }> = [
  { id: "price", label: "Price data" },
  { id: "snapshot", label: "Session snapshot" },
  { id: "chart", label: "ATFX chart" },
  { id: "drivers", label: "Market drivers" },
  { id: "report", label: "Report" },
];

export const QA_OVERALL_PROGRESS_STEPS: Array<{ id: QuickAnalysisProgressStep; label: string }> = [
  { id: "quotes", label: "Market quotes" },
  { id: "charts", label: "Hourly charts" },
  { id: "research", label: "Session research" },
  { id: "narrative", label: "Market overview" },
  { id: "report", label: "Final report" },
];

export type QuickAnalysisStreamEvent =
  | { type: "phase"; message: string; step?: QuickAnalysisProgressStep }
  | { type: "step_complete"; step: QuickAnalysisProgressStep }
  | {
      type: "chart";
      chartImageUrl: string;
      chartCaption?: string;
      chartInterval?: string;
    }
  | { type: "partial_report"; report: string }
  | {
      type: "meta";
      changePct?: number;
      lastClose?: number;
      resolvedWindowLabel?: string;
      dataAsOfLabel?: string;
    }
  | ({ type: "done" } & AtfxQuickAnalysisResult & { tokenBalance?: BrokerageTokenBalance })
  | { type: "error"; error: string };

export type QuickAnalysisStreamHandlers = {
  onPhase?: (message: string, step?: QuickAnalysisProgressStep) => void;
  onStepComplete?: (step: QuickAnalysisProgressStep) => void;
  onChart?: (payload: {
    chartImageUrl: string;
    chartCaption?: string;
    chartInterval?: string;
  }) => void;
  onPartialReport?: (report: string) => void;
  onMeta?: (payload: {
    changePct?: number;
    lastClose?: number;
    resolvedWindowLabel?: string;
    dataAsOfLabel?: string;
  }) => void;
  onError?: (error: string) => void;
  signal?: AbortSignal;
};

async function consumeQuickAnalysisStream(
  response: Response,
  handlers: QuickAnalysisStreamHandlers
): Promise<Extract<QuickAnalysisStreamEvent, { type: "done" }>> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Stream response has no body");

  const decoder = new TextDecoder();
  let buffer = "";
  let done: Extract<QuickAnalysisStreamEvent, { type: "done" }> | null = null;
  let streamError: string | null = null;

  const dispatch = (raw: string) => {
    if (!raw || raw.startsWith(":")) return;
    if (!raw.startsWith("data:")) return;
    const payload = raw.slice(5).trim();
    if (!payload) return;
    let evt: QuickAnalysisStreamEvent;
    try {
      evt = JSON.parse(payload) as QuickAnalysisStreamEvent;
    } catch {
      return;
    }
    switch (evt.type) {
      case "phase":
        handlers.onPhase?.(evt.message, evt.step);
        break;
      case "step_complete":
        handlers.onStepComplete?.(evt.step);
        break;
      case "chart":
        handlers.onChart?.({
          chartImageUrl: evt.chartImageUrl,
          chartCaption: evt.chartCaption,
          chartInterval: evt.chartInterval,
        });
        break;
      case "partial_report":
        handlers.onPartialReport?.(evt.report);
        break;
      case "meta":
        handlers.onMeta?.({
          changePct: evt.changePct,
          lastClose: evt.lastClose,
          resolvedWindowLabel: evt.resolvedWindowLabel,
          dataAsOfLabel: evt.dataAsOfLabel,
        });
        break;
      case "done":
        done = evt;
        break;
      case "error":
        streamError = evt.error;
        handlers.onError?.(evt.error);
        break;
      default:
        break;
    }
  };

  while (true) {
    const { value, done: readDone } = await reader.read();
    if (readDone) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) dispatch(line);
  }
  if (buffer.trim()) dispatch(buffer);

  if (streamError) throw new Error(streamError);
  if (!done) throw new Error("Stream ended without result");
  return done;
}

export async function streamAtfxQuickAnalysis(
  authFetch: (url: string, opts?: RequestInit) => Promise<Response>,
  params: {
    symbol: string;
    displayName: string;
    lookback: QuickAnalysisLookback;
    forceRefresh?: boolean;
  },
  handlers: QuickAnalysisStreamHandlers = {}
): Promise<AtfxQuickAnalysisResult & { tokenBalance?: BrokerageTokenBalance }> {
  const response = await authFetch("/api/atfx/markets/quick-analysis/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      symbol: params.symbol,
      displayName: params.displayName,
      lookback: params.lookback,
      forceRefresh: params.forceRefresh === true,
    }),
    signal: handlers.signal,
  });

  if (!response.ok) {
    let detail = "";
    try {
      const j = await response.json();
      detail = (j as { error?: string }).error || JSON.stringify(j);
    } catch {
      detail = await response.text().catch(() => "");
    }
    const err = detail || `Quick analysis stream failed (${response.status})`;
    handlers.onError?.(err);
    throw new Error(err);
  }

  const done = await consumeQuickAnalysisStream(response, handlers);
  const { type: _t, tokenBalance, ...result } = done;
  return { ...result, tokenBalance };
}

export async function streamAtfxOverallMarketReport(
  authFetch: (url: string, opts?: RequestInit) => Promise<Response>,
  segments: OverallMarketSegment[],
  handlers: QuickAnalysisStreamHandlers = {}
): Promise<AtfxQuickAnalysisResult & { tokenBalance?: BrokerageTokenBalance }> {
  const response = await authFetch("/api/atfx/markets/overall-market-report/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({ segments }),
    signal: handlers.signal,
  });

  if (!response.ok) {
    let detail = "";
    try {
      const j = await response.json();
      detail = (j as { error?: string }).error || JSON.stringify(j);
    } catch {
      detail = await response.text().catch(() => "");
    }
    const err = detail || `Overall market report stream failed (${response.status})`;
    handlers.onError?.(err);
    throw new Error(err);
  }

  const done = await consumeQuickAnalysisStream(response, handlers);
  const { type: _t, tokenBalance, ...result } = done;
  return { ...result, tokenBalance };
}

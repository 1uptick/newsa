import type { AtfxQuickAnalysisResult } from "./atfxQuickAnalysisService";
import { escapeAttr, sanitizeHtml } from "./html";
import { formatQuickAnalysisReportHtml } from "./atfxQuickAnalysisReportHtml";
import { formatQuickAnalysisLookback } from "./atfxQuickAnalysisLookback";

/** Must match server `QUICK_ANALYSIS_RESEARCH_MARKER` in atfxResearchPrompts.ts */
export const QUICK_ANALYSIS_RESEARCH_MARKER = "[QUICK_ANALYSIS_RESEARCH]";

const QA_INSTRUCTION =
  "Write a research article expanding on this Quick Analysis snapshot. Use the market data, drivers, and context below as the editorial anchor. Run the full workflow: plan sections, gather live market data and charts, then write the complete article per output settings.";

/** Full prompt sent to the research pipeline when starting from a Quick Analysis. */
export function researchReportPromptFromQuickAnalysis(item: AtfxQuickAnalysisResult): string {
  const report = (item.report || "").trim();
  const displayName = (item.displayName || "").trim();
  const symbol = (item.symbol || "").trim();
  const windowLabel = (item.resolvedWindowLabel || "").trim();
  const lookbackLabel = item.lookback ? formatQuickAnalysisLookback(item.lookback) : "";
  const dataAsOf = (item.dataAsOfLabel || "").trim();
  const changePct = item.changePct;

  const instrument =
    displayName && symbol && symbol !== displayName
      ? `${displayName} (${symbol})`
      : displayName || symbol;

  const lines = [
    QUICK_ANALYSIS_RESEARCH_MARKER,
    QA_INSTRUCTION,
    "",
    symbol ? `Primary symbol: ${symbol}` : "",
    instrument ? `Instrument: ${instrument}` : "",
    windowLabel ? `Analysis window: ${windowLabel}` : lookbackLabel ? `Lookback: ${lookbackLabel}` : "",
    dataAsOf ? `Data as of: ${dataAsOf}` : "",
    changePct != null ? `Recent change: ${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%` : "",
    "",
    report ? "Quick Analysis report:" : "",
    report,
  ].filter(Boolean);

  return lines.join("\n");
}

/** Short label shown in the user chat bubble when starting from Quick Analysis. */
export function researchReportDisplayFromQuickAnalysis(item: AtfxQuickAnalysisResult): string {
  const name = (item.displayName || item.symbol || "").trim();
  return name ? `Research article from Quick Analysis\n${name}` : "Research article from Quick Analysis";
}

/** Sanitized HTML preview for the chat input (optional rich preview). */
export function researchReportPromptHtmlFromQuickAnalysis(item: AtfxQuickAnalysisResult): string {
  const displayName = (item.displayName || item.symbol || "").trim();
  const windowLabel = (item.resolvedWindowLabel || "").trim();
  const dataAsOf = (item.dataAsOfLabel || "").trim();
  const changePct = item.changePct;
  const reportHtml = formatQuickAnalysisReportHtml(item.report || "");
  const chartUrl = (item.chartImageUrl || "").trim();

  const metaParts = [
    windowLabel ? `<p><strong>Window:</strong> ${escapeAttr(windowLabel)}</p>` : "",
    dataAsOf ? `<p><strong>Data as of:</strong> ${escapeAttr(dataAsOf)}</p>` : "",
    changePct != null
      ? `<p><strong>Recent change:</strong> ${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%</p>`
      : "",
  ].filter(Boolean);

  const parts = [
    `<div class="research-chat-input-news">`,
    chartUrl
      ? `<div class="research-chat-input-news__media"><img src="${escapeAttr(chartUrl)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" /></div>`
      : "",
    `<div class="research-chat-input-news__body">`,
    `<p class="research-chat-input-news__lead">${escapeAttr(QA_INSTRUCTION)}</p>`,
    displayName ? `<p><strong>Instrument:</strong> ${escapeAttr(displayName)}</p>` : "",
    ...metaParts,
    reportHtml
      ? `<div class="research-chat-input-news__summary"><p><strong>Quick Analysis:</strong></p><div class="research-chat-input-news__summary-body">${sanitizeHtml(reportHtml)}</div></div>`
      : "",
    `</div>`,
    `</div>`,
  ];

  return parts.filter(Boolean).join("");
}

export const QUICK_ANALYSIS_RESEARCH_LOOKBACK_MS = 72 * 60 * 60 * 1000;

export function filterRecentQuickAnalyses<T extends { timestamp: number }>(
  items: T[],
  lookbackMs = QUICK_ANALYSIS_RESEARCH_LOOKBACK_MS,
  nowMs = Date.now()
): T[] {
  const cutoff = nowMs - lookbackMs;
  return items.filter((item) => Number.isFinite(item.timestamp) && item.timestamp >= cutoff);
}

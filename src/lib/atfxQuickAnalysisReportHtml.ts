import { marked } from "marked";
import { escapeAttr, getResearchReportCanvasHtml, sanitizeHtml } from "./html";
import { isOverallMarketHtmlReport } from "./atfxOverallMarketReport";

const UP_CLASS = "atfx-qa-last-close-up";
const DOWN_CLASS = "atfx-qa-last-close-down";

/** Color Quick Snapshot "Last close" price + ▲/▼ + % change (matches 1uptick quick analysis). */
export function colorQuickSnapshotLastCloseHtml(html: string): string {
  let out = html.replace(
    /(Last close:\s*)<strong>([\d,]+\.?\d*)<\/strong>(\s*(?:▲|▼|↑|↓)\s*)([+-]?[\d.]+%)/gi,
    (_m, prefix, price, arrowWs, changePct) => {
      const arrow = String(arrowWs).trim();
      const isUp = arrow === "▲" || arrow === "↑";
      const cls = isUp ? UP_CLASS : DOWN_CLASS;
      return `${prefix}<span class="${cls}"><strong>${price}</strong> ${arrow} ${changePct}</span>`;
    }
  );

  out = out.replace(
    /(Last close:\s*)<strong>([\d,]+\.?\d*)<\/strong>(?!\s*(?:▲|▼|↑|↓))(\s*\([+-]?[\d.]+%)/gi,
    (_m, prefix, price, rest) => {
      const pctMatch = String(rest).match(/([+-]?[\d.]+%)/);
      const changePct = pctMatch?.[1] ?? "";
      const isUp = !changePct.trim().startsWith("-");
      const cls = isUp ? UP_CLASS : DOWN_CLASS;
      return `${prefix}<span class="${cls}"><strong>${price}</strong></span>${rest}`;
    }
  );

  return out;
}

function stripQuickAnalysisCitations(text: string): string {
  return text
    .replace(/\[\s*\d+\s*(?:,\s*\d+\s*)*\]/g, "")
    .replace(/［\s*\d+\s*(?:,\s*\d+\s*)*］/g, "");
}

export function formatQuickAnalysisReportHtml(
  report: string,
  opts?: { rawHtml?: boolean }
): string {
  const trimmed = stripQuickAnalysisCitations(report.trim());
  if (!trimmed) return "";

  if (opts?.rawHtml || isOverallMarketHtmlReport(trimmed)) {
    const withoutMarker = trimmed.replace(/^<!--ATFX_OVERALL_HTML-->\s*/i, "");
    // Server-built HTML with large inline chart PNGs — same path as research canvas (no DOMPurify data-URI strip).
    return getResearchReportCanvasHtml(withoutMarker);
  }

  const raw = marked.parse(trimmed, { async: false, gfm: true, breaks: true }) as string;
  const html = colorQuickSnapshotLastCloseHtml(raw);
  return sanitizeHtml(html.replace(/\[\s*\d+\s*(?:,\s*\d+\s*)*\]/g, "").replace(/［\s*\d+\s*(?:,\s*\d+\s*)*］/g, ""));
}

export const QUICK_ANALYSIS_REPORT_PROSE_CLASS =
  "prose prose-sm prose-slate max-w-none prose-headings:text-slate-900 prose-p:text-slate-700 prose-strong:text-slate-900 prose-li:text-slate-700 [&_ul]:list-disc [&_ul]:pl-5 [&_.atfx-qa-last-close-up]:text-emerald-500 [&_.atfx-qa-last-close-up_strong]:!text-emerald-500 [&_.atfx-qa-last-close-down]:text-rose-500 [&_.atfx-qa-last-close-down_strong]:!text-rose-500";

export const QUICK_ANALYSIS_HTML_REPORT_CLASS =
  "atfx-qa-html-content prose prose-sm prose-slate max-w-none prose-headings:text-slate-900 prose-p:text-slate-700 prose-strong:text-slate-900 prose-li:text-slate-700 [&_ul]:list-disc [&_ul]:pl-5 [&_table]:w-full [&_table.atfx-report-table_th]:!text-center [&_table.atfx-report-table_td]:!text-center [&_table.atfx-report-table_th]:align-middle [&_table.atfx-report-table_td]:align-middle";

function buildQuickAnalysisDownloadDocument(opts: {
  title: string;
  reportHtml: string;
  chartImageUrl?: string;
  chartCaption?: string;
}): string {
  const { title, reportHtml, chartImageUrl, chartCaption } = opts;
  const chartBlock = chartImageUrl
    ? `<figure style="margin:0 0 1.25rem"><img src="${escapeAttr(chartImageUrl)}" alt="${escapeAttr(chartCaption || "Chart")}" style="max-width:100%;height:auto;border:1px solid #e2e8f0;border-radius:4px"/></figure>`
    : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeAttr(title)}</title><style>
body{font-family:system-ui,sans-serif;max-width:720px;margin:2rem auto;padding:0 1rem;color:#334155;line-height:1.6}
h1,h2,h3{color:#0f172a}
.${UP_CLASS}{color:#10b981}
.${DOWN_CLASS}{color:#f43f5e}
ul{padding-left:1.25rem}
</style></head><body>
<h1>${escapeAttr(title)}</h1>
${chartBlock}
${reportHtml}
</body></html>`;
}

export function downloadQuickAnalysisHtml(opts: {
  displayName: string;
  report: string;
  contentTab: string;
  chartImageUrl?: string;
  chartCaption?: string;
}): void {
  const reportHtml = formatQuickAnalysisReportHtml(opts.report, {
    rawHtml: isOverallMarketHtmlReport(opts.report),
  });
  if (!reportHtml && !opts.chartImageUrl) return;

  const suffix = opts.contentTab === "en" ? "" : `-${opts.contentTab}`;
  const baseName =
    opts.displayName.replace(/[^\w\s-]/g, "").trim().slice(0, 60) || "quick-analysis";
  const title = opts.displayName.trim() || "Quick Analysis";
  const doc = buildQuickAnalysisDownloadDocument({
    title,
    reportHtml,
    chartImageUrl: opts.chartImageUrl,
    chartCaption: opts.chartCaption,
  });
  const blob = new Blob([doc], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${baseName}${suffix}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

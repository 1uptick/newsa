import React, { useEffect, useMemo, useRef } from "react";
import { Check, Loader2 } from "lucide-react";
import {
  formatQuickAnalysisReportHtml,
  QUICK_ANALYSIS_HTML_REPORT_CLASS,
  QUICK_ANALYSIS_REPORT_PROSE_CLASS,
} from "../../lib/atfxQuickAnalysisReportHtml";
import { isOverallMarketHtmlReport, isOverallMarketReportSymbol } from "../../lib/atfxOverallMarketReport";
import {
  QA_OVERALL_PROGRESS_STEPS,
  QA_STANDARD_PROGRESS_STEPS,
  type QuickAnalysisProgressStep,
} from "../../lib/atfxQuickAnalysisStream";
import { useTypewriterText } from "../../hooks/useTypewriterText";
import type { QuickAnalysisSession } from "./AtfxQuickAnalysisSidebar";

type AtfxQuickAnalysisReportBodyProps = {
  report: string;
  symbol?: string;
  chartImageUrl?: string;
  chartCaption?: string;
  /** Fast typewriter reveal for freshly generated reports */
  typewriter?: boolean;
  onTypewriterComplete?: () => void;
};

export function AtfxQuickAnalysisReportBody({
  report,
  symbol,
  chartImageUrl,
  chartCaption,
  typewriter = false,
  onTypewriterComplete,
}: AtfxQuickAnalysisReportBodyProps) {
  const hasReport = Boolean(report.trim());
  const isHtmlReport = isOverallMarketReportSymbol(symbol ?? "") || isOverallMarketHtmlReport(report);
  const hasChart = Boolean(chartImageUrl) && !isHtmlReport;
  const useTypewriter = typewriter && hasReport && !isHtmlReport;
  const { text: typedReport, isTyping } = useTypewriterText(report, {
    enabled: useTypewriter,
    intervalMs: 10,
    charsPerStep: 4,
  });
  const wasTypingRef = useRef(false);

  useEffect(() => {
    if (isTyping) {
      wasTypingRef.current = true;
      return;
    }
    if (wasTypingRef.current && typewriter) {
      wasTypingRef.current = false;
      onTypewriterComplete?.();
    }
  }, [isTyping, typewriter, onTypewriterComplete]);
  const reportHtml = useMemo(
    () => formatQuickAnalysisReportHtml(useTypewriter ? typedReport : report, { rawHtml: isHtmlReport }),
    [useTypewriter, typedReport, report, isHtmlReport]
  );

  if (!hasReport && !hasChart) return null;

  return (
    <div className="space-y-3">
      {hasChart ? (
        <figure className="m-0 mb-5">
          <img
            src={chartImageUrl}
            alt={chartCaption || "Price chart"}
            data-filename={chartCaption ? `${chartCaption}.png` : undefined}
            className="w-full h-auto rounded border border-slate-200 bg-white"
          />
        </figure>
      ) : null}
      {hasReport && reportHtml ? (
        <div
          className={`${isHtmlReport ? QUICK_ANALYSIS_HTML_REPORT_CLASS : QUICK_ANALYSIS_REPORT_PROSE_CLASS}${isTyping ? " qa-typewriter-active" : ""}`}
          dangerouslySetInnerHTML={{ __html: reportHtml }}
        />
      ) : null}
    </div>
  );
}
export function AtfxQuickAnalysisGenerating({ session }: { session: QuickAnalysisSession }) {
  const isOverall = isOverallMarketReportSymbol(session.symbol);
  const steps = isOverall ? QA_OVERALL_PROGRESS_STEPS : QA_STANDARD_PROGRESS_STEPS;
  const completed = new Set(session.loadingCompletedSteps ?? []);
  const activeStep = session.loadingActiveStep as QuickAnalysisProgressStep | undefined;
  const hasPartialReport = Boolean(session.report.trim());
  const isHtmlReport = isOverall || isOverallMarketHtmlReport(session.report);
  const partialHtml = useMemo(
    () => (hasPartialReport ? formatQuickAnalysisReportHtml(session.report, { rawHtml: isHtmlReport }) : ""),
    [hasPartialReport, session.report, isHtmlReport]
  );
  const showChart = Boolean(session.chartImageUrl) && !isHtmlReport;

  return (
    <div className="space-y-4 py-2">
      <div className="rounded-xl border border-orange-200/80 bg-orange-50/40 px-3.5 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 mb-2">
          <Loader2 className="w-4 h-4 animate-spin text-[#ff7900] shrink-0" aria-hidden />
          {session.loadingPhase || "Generating…"}
        </div>
        <ul className="space-y-1.5" aria-label="Generation progress">
          {steps.map((step) => {
            const done = completed.has(step.id);
            const active = activeStep === step.id;
            return (
              <li
                key={step.id}
                className={`flex items-center gap-2 text-xs ${
                  done ? "text-emerald-700" : active ? "text-[#c45a00] font-medium" : "text-slate-500"
                }`}
              >
                {done ? (
                  <Check className="w-3.5 h-3.5 shrink-0" aria-hidden />
                ) : active ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden />
                ) : (
                  <span className="w-3.5 h-3.5 rounded-full border border-slate-300 shrink-0" aria-hidden />
                )}
                {step.label}
              </li>
            );
          })}
        </ul>
        {session.resolvedWindowLabel ? (
          <p className="mt-2 text-[10px] text-slate-500 truncate">{session.resolvedWindowLabel}</p>
        ) : null}
      </div>

      {showChart ? (
        <figure className="m-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Chart preview</p>
          <img
            src={session.chartImageUrl}
            alt={session.chartCaption || "Price chart"}
            className="w-full h-auto rounded border border-slate-200 bg-white"
          />
        </figure>
      ) : null}

      {partialHtml ? (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Live preview</p>
          <div
            className={`${isHtmlReport ? QUICK_ANALYSIS_HTML_REPORT_CLASS : QUICK_ANALYSIS_REPORT_PROSE_CLASS} opacity-90`}
            dangerouslySetInnerHTML={{ __html: partialHtml }}
          />
        </div>
      ) : null}
    </div>
  );
}

/** @deprecated Use AtfxQuickAnalysisGenerating */
export function AtfxQuickAnalysisLoading() {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
      <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden />
      Generating quick analysis…
    </div>
  );
}

import React, { useState } from "react";
import { FileText, Sparkles } from "lucide-react";
import type { NavigateFunction } from "react-router-dom";
import type { QuickAnalysisSession } from "../../../components/atfx/AtfxQuickAnalysisSidebar";
import {
  formatQuickAnalysisTime,
} from "../../../lib/atfxQuickAnalysisService";
import {
  hasQuickAnalysisReportForLocale,
  quickAnalysisSendLanguageLabel,
  quickAnalysisTabLabel,
  QUICK_ANALYSIS_SEND_LANGUAGE_OPTIONS,
} from "../../../lib/atfxQuickAnalysisLocale";
import {
  historyListTitle,
  historyOwnerLabel,
  type ReportListItem,
} from "../researchReportUtils";
import {
  languagePillLabel,
  languageTranslatingLabel,
  type ReportLanguage,
} from "../../../lib/atfxResearchReportOptions";
import { ContentAreaLoader } from "../../../components/ContentAreaLoader";

type DashboardArticlesTab = "research" | "quick-analysis";

type AtfxDashboardArticlesPanelProps = {
  navigate: NavigateFunction;
  researchReports: ReportListItem[];
  qaSessions: QuickAnalysisSession[];
  loading: boolean;
  error: string | null;
};

function qaSessionStatusLine(session: QuickAnalysisSession): string {
  if (session.status === "loading") return "Generating…";
  if (session.status === "error") return "Failed";
  return formatQuickAnalysisTime(session.timestamp);
}

const RESEARCH_LANG_PILL_CLASS =
  "inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold border border-[#ff7900]/30 bg-orange-50/90 text-[#c45f00]";

const ResearchHistoryRow = React.memo(function ResearchHistoryRow({
  report,
  onSelect,
}: {
  report: ReportListItem;
  onSelect: () => void;
}) {
  const languages = (report.languages ?? []) as ReportLanguage[];

  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full text-left rounded-lg border border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 px-3 py-2 transition-colors"
    >
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
          <span className="text-sm font-medium text-slate-900 truncate min-w-0">
            {historyListTitle(report.title)}
          </span>
          {languages.length > 0 ? (
            <span className="inline-flex items-center gap-1 shrink-0" aria-label="Available languages">
              {languages.map((lang) => (
                <span key={lang} title={languageTranslatingLabel(lang)} className={RESEARCH_LANG_PILL_CLASS}>
                  {languagePillLabel(lang)}
                </span>
              ))}
            </span>
          ) : null}
        </div>
        <span className="text-[11px] text-slate-500 shrink-0 whitespace-nowrap text-right">
          {historyOwnerLabel(report.owner_email) ? (
            <span className="block text-[10px] text-slate-400 truncate max-w-[8rem]">
              {historyOwnerLabel(report.owner_email)}
            </span>
          ) : null}
          {new Date(report.updated_at).toLocaleString()}
        </span>
      </div>
    </button>
  );
});

const QuickAnalysisHistoryRow = React.memo(function QuickAnalysisHistoryRow({
  session,
  onSelect,
}: {
  session: QuickAnalysisSession;
  onSelect: () => void;
}) {
  const isGain = session.changePct == null ? null : session.changePct >= 0;
  const ownerLabel = historyOwnerLabel(session.ownerEmail);
  const languages = QUICK_ANALYSIS_SEND_LANGUAGE_OPTIONS.filter((option) =>
    hasQuickAnalysisReportForLocale(session, option.value)
  );

  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full text-left rounded-lg border border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 px-3 py-2 transition-colors"
    >
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
          <span className="text-sm font-semibold text-slate-900 truncate min-w-0">{session.displayName}</span>
          {session.status === "ready" && session.changePct != null ? (
            <span
              className={`text-[10px] font-mono font-bold shrink-0 ${isGain ? "text-emerald-600" : "text-rose-600"}`}
            >
              {isGain ? "▲" : "▼"} {session.changePct >= 0 ? "+" : ""}
              {session.changePct.toFixed(2)}%
            </span>
          ) : null}
          {languages.length > 0 ? (
            <span className="inline-flex items-center gap-1 shrink-0" aria-label="Available languages">
              {languages.map((option) => (
                <span
                  key={option.value}
                  title={quickAnalysisSendLanguageLabel(option.value)}
                  className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold border border-[#ff7900]/30 bg-orange-50/90 text-[#c45f00]"
                >
                  {quickAnalysisTabLabel(option.value)}
                </span>
              ))}
            </span>
          ) : null}
        </div>
        <span className="text-[10px] text-slate-500 shrink-0 whitespace-nowrap text-right">
          {ownerLabel ? <span className="block text-[10px] text-slate-400 truncate max-w-[8rem]">{ownerLabel}</span> : null}
          {qaSessionStatusLine(session)}
        </span>
      </div>
    </button>
  );
});

export function AtfxDashboardArticlesPanel({
  navigate,
  researchReports,
  qaSessions,
  loading,
  error,
}: AtfxDashboardArticlesPanelProps) {
  const [activeTab, setActiveTab] = useState<DashboardArticlesTab>("research");

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="shrink-0 mb-3">
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Group history</h2>
        <p className="text-[11px] text-slate-400 mt-0.5">Research and quick analysis from your ATFX team</p>
      </div>
      <div
        className="shrink-0 mb-2 flex rounded-lg border border-slate-200 bg-slate-50 p-1 gap-1"
        role="tablist"
        aria-label="Article lists"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "research"}
          onClick={() => setActiveTab("research")}
          className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors inline-flex items-center justify-center gap-1.5 ${
            activeTab === "research" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <FileText className="w-3.5 h-3.5 text-[#ff7900] shrink-0" aria-hidden />
          Research Articles
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "quick-analysis"}
          onClick={() => setActiveTab("quick-analysis")}
          className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors inline-flex items-center justify-center gap-1.5 ${
            activeTab === "quick-analysis"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-[#ff7900] shrink-0" aria-hidden />
          Quick Analysis
        </button>
      </div>

      {loading ? (
        <ContentAreaLoader
          variant="panel"
          size="sm"
          message={activeTab === "research" ? "Loading research articles…" : "Loading quick analysis…"}
          className="rounded-xl border border-slate-200 bg-white shadow-sm"
        />
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-10 text-center flex-1 min-h-0 rounded-xl border border-slate-200 bg-white shadow-sm px-4">
          <p className="text-slate-600 font-medium mb-1">Couldn&apos;t load articles</p>
          <p className="text-slate-500 text-sm">{error}</p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden w-full rounded-xl border border-slate-200 bg-white shadow-sm">
          {activeTab === "research" ? (
            <div className="p-2 space-y-1.5" role="tabpanel" aria-label="Research articles">
              {researchReports.length === 0 ? (
                <p className="px-4 py-8 text-sm text-slate-500 text-center">No saved reports</p>
              ) : (
                researchReports.map((report) => (
                  <ResearchHistoryRow
                    key={report.id}
                    report={report}
                    onSelect={() => {
                      navigate("/atfx/research-report", { state: { openReportId: report.id } });
                    }}
                  />
                ))
              )}
            </div>
          ) : (
            <div className="p-2 space-y-1.5" role="tabpanel" aria-label="Quick analysis articles">
              {qaSessions.length === 0 ? (
                <p className="px-2 py-8 text-sm text-slate-500 text-center">No quick analysis yet</p>
              ) : (
                qaSessions.map((session) => (
                  <QuickAnalysisHistoryRow
                    key={session.id}
                    session={session}
                    onSelect={() => {
                      navigate("/atfx/markets", { state: { openQuickAnalysisId: session.id } });
                    }}
                  />
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

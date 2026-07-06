import React, { useState } from "react";
import { Download, FileText, History, Languages, Loader2, Rocket, Settings } from "lucide-react";
import { ResearchReportMetaPanel } from "../../../components/ResearchReportMetaPanel";
import { ContentAreaLoader } from "../../../components/ContentAreaLoader";
import {
  languagePillLabel,
  languageTranslatingLabel,
  missingReportTranslationLocales,
  type ReportI18nContent,
  type ReportLanguage,
  type ReportTranslateLocale,
} from "../../../lib/atfxResearchReportOptions";
import { PROSE_REPORT } from "../researchReportUtils";
import { ResearchReportHistoryPanel } from "./ResearchReportHistoryPanel";
import {
  ResearchReportTranslateModal,
  researchReportIsTranslating,
} from "./ResearchReportTranslateModal";
import { ResearchReportPublishModal } from "./ResearchReportPublishModal";
import type { AtfxWordPressCategory } from "../../../lib/atfxResearchWordPressSettings";

type ResearchReportCanvasPanelProps = {
  historyOpen: boolean;
  historyLoading?: boolean;
  reportLoading?: boolean;
  onToggleHistory: () => void;
  onCloseHistory: () => void;
  reports: Parameters<typeof ResearchReportHistoryPanel>[0]["reports"];
  activeId: string | null;
  currentUserUid?: string | null;
  onSelectReport: (id: string) => void;
  onDeleteReport: (id: string) => void;
  canvasTabs: ReportLanguage[];
  activeLangTab: ReportLanguage;
  onLangTabChange: (lang: ReportLanguage) => void;
  displayHtml: string;
  activeTitle: string;
  seoExcerpt: string;
  thumbnailUrl: string;
  metaLoading: boolean;
  sending: boolean;
  writingPhase: string | null;
  onDownloadHtml: () => void;
  reportI18n: ReportI18nContent;
  translatingLocales?: ReportTranslateLocale[];
  translateProgress?: string | null;
  onTranslateLocale?: (locale: ReportTranslateLocale, options?: { force?: boolean }) => void | Promise<void>;
  activeReportId: string | null;
  wordpressCategories: AtfxWordPressCategory[];
  publishing?: boolean;
  onPublish?: (locale: ReportLanguage, categoryId: string) => void | Promise<void>;
  onOpenWordPressSettings?: () => void;
};

function langPillClass(active: boolean) {
  return [
    "px-2 py-0.5 rounded-md text-[10px] font-bold border transition-colors shrink-0",
    active
      ? "border-[#ff7900] bg-orange-50 text-[#c45f00]"
      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700",
  ].join(" ");
}

function ResearchReportCanvasPanelInner(props: ResearchReportCanvasPanelProps) {
  const {
    historyOpen,
    historyLoading = false,
    reportLoading = false,
    onToggleHistory,
    onCloseHistory,
    reports,
    activeId,
    currentUserUid = null,
    onSelectReport,
    onDeleteReport,
    canvasTabs,
    activeLangTab,
    onLangTabChange,
    displayHtml,
    activeTitle,
    seoExcerpt,
    thumbnailUrl,
    metaLoading,
    sending,
    writingPhase,
    onDownloadHtml,
    reportI18n,
    translatingLocales = [],
    translateProgress = null,
    onTranslateLocale,
    activeReportId,
    wordpressCategories,
    publishing = false,
    onPublish,
    onOpenWordPressSettings,
  } = props;

  const [translateModalOpen, setTranslateModalOpen] = useState(false);
  const [publishModalOpen, setPublishModalOpen] = useState(false);

  const hasEnglish = Boolean(reportI18n.en?.report_html?.trim());
  const canTranslate = hasEnglish && Boolean(onTranslateLocale);
  const missingTranslations = missingReportTranslationLocales(reportI18n);
  const translateBusy = researchReportIsTranslating(translatingLocales);
  const activeTabTranslating =
    activeLangTab !== "en" && translatingLocales.includes(activeLangTab as ReportTranslateLocale);

  const showLangPills = hasEnglish || canvasTabs.length > 0 || translatingLocales.length > 0;
  const translationTabs = canvasTabs.filter((lang) => lang !== "en");
  const pendingTranslationTabs = translatingLocales.filter((lang) => !canvasTabs.includes(lang));

  const handleTranslate = (locale: ReportTranslateLocale, options?: { force?: boolean }) => {
    if (!onTranslateLocale) return;
    void onTranslateLocale(locale, options);
  };

  const canPublish = Boolean(activeReportId && displayHtml && thumbnailUrl.trim() && onPublish);

  const handlePublish = (locale: ReportLanguage, categoryId: string) => {
    if (!onPublish) return;
    void onPublish(locale, categoryId);
  };

  return (
    <main className="relative flex flex-col min-h-0 lg:w-[60%] flex-1 bg-white overflow-hidden">
      <ResearchReportHistoryPanel
        open={historyOpen}
        loading={historyLoading}
        reports={reports}
        activeId={activeId}
        currentUserUid={currentUserUid}
        onClose={onCloseHistory}
        onSelect={onSelectReport}
        onDelete={onDeleteReport}
      />

      <header className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 shrink-0 min-w-0">
        <FileText className="w-5 h-5 text-slate-500 shrink-0" />
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide shrink-0">
          Article preview
        </span>
        {showLangPills ? (
          <div className="flex items-center gap-1 shrink-0 min-w-0" role="tablist" aria-label="Report language">
            {hasEnglish || canvasTabs.includes("en") ? (
              <button
                type="button"
                role="tab"
                aria-selected={activeLangTab === "en"}
                onClick={() => onLangTabChange("en")}
                className={langPillClass(activeLangTab === "en")}
              >
                {languagePillLabel("en")}
              </button>
            ) : null}
            {translationTabs.map((lang) => (
              <button
                key={lang}
                type="button"
                role="tab"
                aria-selected={activeLangTab === lang}
                onClick={() => onLangTabChange(lang)}
                className={langPillClass(activeLangTab === lang)}
              >
                {translatingLocales.includes(lang as ReportTranslateLocale) &&
                !reportI18n[lang]?.report_html?.trim() ? (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="w-2.5 h-2.5 animate-spin" aria-hidden />
                    {languagePillLabel(lang)}
                  </span>
                ) : (
                  languagePillLabel(lang)
                )}
              </button>
            ))}
            {pendingTranslationTabs.map((lang) => (
              <button
                key={lang}
                type="button"
                role="tab"
                aria-selected={activeLangTab === lang}
                disabled
                className={langPillClass(activeLangTab === lang)}
              >
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="w-2.5 h-2.5 animate-spin" aria-hidden />
                  {languagePillLabel(lang)}
                </span>
              </button>
            ))}
          </div>
        ) : null}
        <div className="ml-auto flex items-center gap-2 shrink-0">
        {canTranslate ? (
          <button
            type="button"
            onClick={() => setTranslateModalOpen(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
            aria-label="Translate article"
            title={
              missingTranslations.length === 0
                ? "Re-translate or add another language"
                : "Translate to another language"
            }
          >
            {translateBusy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
            ) : (
              <Languages className="w-3.5 h-3.5" aria-hidden />
            )}
            Translate
          </button>
        ) : null}
        {translateBusy && translateProgress ? (
          <span className="hidden sm:inline text-[11px] text-slate-500 max-w-[12rem] truncate" title={translateProgress}>
            {translateProgress}
          </span>
        ) : null}
        <button
          type="button"
          onClick={onDownloadHtml}
          disabled={!displayHtml}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        >
          <Download className="w-3.5 h-3.5" />
          Download
        </button>
        {onPublish ? (
          <button
            type="button"
            onClick={() => setPublishModalOpen(true)}
            disabled={!canPublish || publishing}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            title={
              !activeReportId
                ? "Save a report first"
                : !displayHtml
                  ? "No article content yet"
                  : !thumbnailUrl.trim()
                    ? "Thumbnail is required before publishing"
                    : undefined
            }
          >
            {publishing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
            ) : (
              <Rocket className="w-3.5 h-3.5" aria-hidden />
            )}
            Publish
          </button>
        ) : null}
        <button
          type="button"
          onClick={onToggleHistory}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-all shadow-sm ${
            historyOpen
              ? "border-[#c45f00] bg-[#e66d00] text-white ring-2 ring-[#ff7900]/40"
              : "border-[#ff7900] bg-[#ff7900] text-white hover:bg-[#e66d00] hover:border-[#e66d00]"
          }`}
          aria-expanded={historyOpen}
          aria-controls="report-history-panel"
        >
          <History className="w-3.5 h-3.5" />
          History
        </button>
        {onOpenWordPressSettings ? (
          <button
            type="button"
            onClick={onOpenWordPressSettings}
            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-[#ff7900] hover:border-[#ff7900]/30 transition-colors"
            aria-controls="research-wordpress-settings-panel"
            aria-label="WordPress settings"
            title="WordPress settings"
          >
            <Settings className="w-3.5 h-3.5" aria-hidden />
          </button>
        ) : null}
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto relative">
        {reportLoading ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
            <p className="text-sm text-slate-600 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              Loading report…
            </p>
          </div>
        ) : null}
        {sending && writingPhase && !displayHtml ? (
          <p className="text-xs text-slate-500 mb-4 px-6 pt-6 flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {writingPhase}
          </p>
        ) : null}
        {activeTabTranslating && !displayHtml ? (
          <ContentAreaLoader
            variant="panel"
            size="sm"
            message={translateProgress || `Translating to ${languageTranslatingLabel(activeLangTab)}…`}
            pulseMessage={false}
          />
        ) : null}
        {displayHtml ? (
          <>
            <ResearchReportMetaPanel
              title={activeTitle}
              seoExcerpt={seoExcerpt}
              thumbnailUrl={thumbnailUrl}
              loading={metaLoading || (sending && !seoExcerpt && !thumbnailUrl)}
            />
            <div
              className={`px-6 pb-6 ${PROSE_REPORT}`}
              dangerouslySetInnerHTML={{ __html: displayHtml }}
            />
          </>
        ) : activeTabTranslating ? null : (
          <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center px-6 py-6">
            <FileText className="w-12 h-12 text-slate-300 mb-3" />
            <p className="text-slate-600 font-medium">Report canvas</p>
            <p className="text-sm text-slate-500 mt-1 max-w-md">
              Your report will appear here as the assistant writes it.
            </p>
          </div>
        )}
      </div>

      <ResearchReportTranslateModal
        open={translateModalOpen}
        reportTitle={activeTitle || reportI18n.en?.title || ""}
        reportI18n={reportI18n}
        translatingLocales={translatingLocales}
        onClose={() => setTranslateModalOpen(false)}
        onTranslate={handleTranslate}
      />

      {onPublish ? (
        <ResearchReportPublishModal
          open={publishModalOpen}
          reportTitle={activeTitle || reportI18n.en?.title || ""}
          reportI18n={reportI18n}
          categories={wordpressCategories}
          onClose={() => setPublishModalOpen(false)}
          onPublish={handlePublish}
        />
      ) : null}
    </main>
  );
}

export const ResearchReportCanvasPanel = React.memo(ResearchReportCanvasPanelInner);

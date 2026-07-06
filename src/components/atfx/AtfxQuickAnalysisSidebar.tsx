import React, { useEffect, useMemo, useRef, useState } from "react";
import { Clock, Download, History, Languages, Loader2, Send, Sparkles, X } from "lucide-react";
import { Toast } from "../Toast";
import { ContentAreaLoader } from "../ContentAreaLoader";
import { formatQuickAnalysisTime } from "../../lib/atfxQuickAnalysisService";
import { formatQuickAnalysisLookback } from "../../lib/atfxQuickAnalysisLookback";
import {
  quickAnalysisTabLabel,
  hasQuickAnalysisTranslation,
  QUICK_ANALYSIS_AUTO_TRANSLATE_OPTIONS,
  getQuickAnalysisReportForLocale,
  quickAnalysisSendLanguageLabel,
  type QuickAnalysisContentTab,
  type QuickAnalysisTranslateLocale,
} from "../../lib/atfxQuickAnalysisLocale";
import { sendQuickAnalysisToTelegram } from "../../lib/atfxQuickAnalysisTelegramService";
import type { AtfxTelegramChannel } from "../../lib/atfxQuickAnalysisTelegramSettings";
import { AtfxQuickAnalysisGenerating, AtfxQuickAnalysisReportBody } from "./AtfxQuickAnalysisReportBody";
import {
  AtfxQuickAnalysisTranslateModal,
  quickAnalysisIsTranslating,
  quickAnalysisMissingTranslationLocales,
} from "./AtfxQuickAnalysisTranslateModal";
import { AtfxQuickAnalysisTelegramModal } from "./AtfxQuickAnalysisTelegramModal";
import type { QuickAnalysisLookback } from "../../lib/atfxQuickAnalysisLookback";
import { downloadQuickAnalysisHtml } from "../../lib/atfxQuickAnalysisReportHtml";
import { isOverallMarketReportSymbol } from "../../lib/atfxOverallMarketReport";

export type QuickAnalysisSession = {
  id: string;
  symbol: string;
  displayName: string;
  report: string;
  timestamp: number;
  status: "loading" | "ready" | "error";
  lookback?: QuickAnalysisLookback;
  changePct?: number;
  chartImageUrl?: string;
  chartCaption?: string;
  chartInterval?: string;
  resolvedWindowLabel?: string;
  dataAsOfLabel?: string;
  reportTc?: string;
  reportSc?: string;
  reportTh?: string;
  reportVi?: string;
  ownerEmail?: string | null;
  translatingLocales?: QuickAnalysisTranslateLocale[];
  translationErrors?: Partial<Record<QuickAnalysisTranslateLocale, string>>;
  error?: string;
  detailLoading?: boolean;
  /** True only for a report just generated in this session — enables typewriter once */
  playTypewriter?: boolean;
  loadingPhase?: string;
  loadingActiveStep?: string;
  loadingCompletedSteps?: string[];
};

type AtfxQuickAnalysisSidebarProps = {
  sessions: QuickAnalysisSession[];
  telegramChannels: AtfxTelegramChannel[];
  authFetch: (url: string, opts?: RequestInit) => Promise<Response>;
  onTranslateSession?: (sessionId: string, locale: QuickAnalysisTranslateLocale) => void | Promise<void>;
  onOpenSettings?: () => void;
  initialSessionId?: string | null;
  onEnsureSessionDetail?: (sessionId: string) => void | Promise<void>;
  onTypewriterComplete?: (sessionId: string) => void;
};

function sessionStatusLine(session: QuickAnalysisSession): string {
  if (session.status === "loading") return "Generating…";
  if (session.status === "error") return "Failed";
  return formatQuickAnalysisTime(session.timestamp);
}

function contentTabClass(active: boolean) {
  return [
    "px-2 py-0.5 rounded-md text-[10px] font-bold border transition-colors",
    active
      ? "border-[#ff7900] bg-orange-50 text-[#c45f00]"
      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700",
  ].join(" ");
}

function reportForTab(session: QuickAnalysisSession, tab: QuickAnalysisContentTab): string {
  return getQuickAnalysisReportForLocale(session, tab);
}

function isTabTranslating(session: QuickAnalysisSession, tab: QuickAnalysisContentTab): boolean {
  if (tab === "en") return false;
  return (session.translatingLocales ?? []).includes(tab);
}

function tabError(session: QuickAnalysisSession, tab: QuickAnalysisContentTab): string | undefined {
  if (tab === "en") return undefined;
  return session.translationErrors?.[tab];
}

type HistoryListItemProps = {
  session: QuickAnalysisSession;
  active: boolean;
  onSelect: () => void;
};

function HistoryListItem({ session, active, onSelect }: HistoryListItemProps) {
  const isGain = session.changePct == null ? null : session.changePct >= 0;
  const timeLabel = sessionStatusLine(session);
  const ownerLabel = session.ownerEmail?.trim() || null;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
        active
          ? "border-[#ff7900]/40 bg-orange-50/80 ring-1 ring-[#ff7900]/20"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-semibold text-slate-900 truncate min-w-0">{session.displayName}</span>
        {session.status === "ready" && session.changePct != null ? (
          <span
            className={`text-[10px] font-mono font-bold shrink-0 ${isGain ? "text-emerald-600" : "text-rose-600"}`}
          >
            {isGain ? "▲" : "▼"} {session.changePct >= 0 ? "+" : ""}
            {session.changePct.toFixed(2)}%
          </span>
        ) : null}
        <span className="text-[10px] text-slate-500 shrink-0 ml-auto whitespace-nowrap text-right">
          {ownerLabel ? <span className="block text-[10px] text-slate-400 truncate max-w-[7rem]">{ownerLabel}</span> : null}
          {timeLabel}
        </span>
      </div>
    </button>
  );
}

export function AtfxQuickAnalysisSidebar({
  sessions,
  telegramChannels,
  authFetch,
  onTranslateSession,
  onOpenSettings,
  initialSessionId = null,
  onEnsureSessionDetail,
  onTypewriterComplete,
}: AtfxQuickAnalysisSidebarProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [contentTab, setContentTab] = useState<QuickAnalysisContentTab>("en");
  const [translateModalOpen, setTranslateModalOpen] = useState(false);
  const [telegramModalOpen, setTelegramModalOpen] = useState(false);
  const [telegramSending, setTelegramSending] = useState(false);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);

  const latestId = sessions[0]?.id ?? null;
  const pendingInitialRef = useRef(initialSessionId);
  const skipNextLatestRef = useRef(false);

  useEffect(() => {
    pendingInitialRef.current = initialSessionId;
  }, [initialSessionId]);

  useEffect(() => {
    const targetId = pendingInitialRef.current;
    if (!targetId) return;
    if (!sessions.some((s) => s.id === targetId)) return;
    setActiveId(targetId);
    pendingInitialRef.current = null;
    skipNextLatestRef.current = true;
  }, [sessions]);

  useEffect(() => {
    if (pendingInitialRef.current) return;
    if (skipNextLatestRef.current) {
      skipNextLatestRef.current = false;
      return;
    }
    if (latestId) setActiveId(latestId);
    else setActiveId(null);
  }, [latestId]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeId) ?? sessions[0] ?? null,
    [sessions, activeId]
  );

  useEffect(() => {
    setContentTab("en");
  }, [activeSession?.id]);

  useEffect(() => {
    if (!activeSession?.id || activeSession.status !== "ready") return;
    if (activeSession.report.trim() || activeSession.detailLoading) return;
    onEnsureSessionDetail?.(activeSession.id);
  }, [activeSession?.id, activeSession?.status, activeSession?.report, activeSession?.detailLoading, onEnsureSessionDetail]);

  const availableTranslationTabs = useMemo(() => {
    if (!activeSession || activeSession.status !== "ready") return [] as QuickAnalysisContentTab[];
    const tabs = new Set<QuickAnalysisContentTab>();
    for (const option of QUICK_ANALYSIS_AUTO_TRANSLATE_OPTIONS) {
      if (hasQuickAnalysisTranslation(activeSession, option.value)) tabs.add(option.value);
    }
    for (const locale of activeSession.translatingLocales ?? []) {
      tabs.add(locale);
    }
    return [...tabs];
  }, [activeSession]);

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[200px] px-6 text-center text-slate-500">
        <Sparkles className="w-8 h-8 text-[#ff7900]/60 mb-3" aria-hidden />
        <p className="text-sm font-medium text-slate-700">Quick Analysis</p>
        <p className="text-xs mt-1 max-w-[240px]">
          Search for a symbol, use <strong>Overall market report</strong> in the header, or click an index on the world
          map to generate a snapshot or market overview.
        </p>
      </div>
    );
  }

  const selectSession = (id: string) => {
    setActiveId(id);
    setHistoryOpen(false);
  };

  const activeReport = activeSession ? reportForTab(activeSession, contentTab) : "";
  const showTranslationLoading = activeSession ? isTabTranslating(activeSession, contentTab) : false;
  const activeTabError = activeSession ? tabError(activeSession, contentTab) : undefined;
  const canManualTranslate =
    Boolean(activeSession?.status === "ready" && activeSession.report.trim() && onTranslateSession);
  const missingTranslations = activeSession ? quickAnalysisMissingTranslationLocales(activeSession) : [];
  const translateBusy = activeSession ? quickAnalysisIsTranslating(activeSession) : false;

  const handleManualTranslate = (locale: QuickAnalysisTranslateLocale) => {
    if (!activeSession || !onTranslateSession) return;
    void onTranslateSession(activeSession.id, locale);
  };

  const handleTelegramSend = ({
    locale,
    channel,
  }: {
    locale: QuickAnalysisContentTab;
    channel: AtfxTelegramChannel;
  }) => {
    if (!activeSession) return;
    const report = getQuickAnalysisReportForLocale(activeSession, locale);
    if (!report.trim()) return;

    setTelegramModalOpen(false);
    setTelegramSending(true);
    void sendQuickAnalysisToTelegram(authFetch, {
      channelId: channel.channelId,
      report,
      displayName: activeSession.displayName,
      symbol: activeSession.symbol,
      chartImageUrl: activeSession.chartImageUrl,
      languageLabel: quickAnalysisSendLanguageLabel(locale),
    })
      .then(() => {
        setToast({ message: `Sent to ${channel.label || channel.channelId}`, variant: "success" });
      })
      .catch((e: unknown) => {
        setToast({
          message: e instanceof Error ? e.message : "Failed to send to Telegram",
          variant: "error",
        });
      })
      .finally(() => {
        setTelegramSending(false);
      });
  };

  return (
    <div className="relative flex flex-col min-h-0 h-full overflow-hidden">
      <div className="shrink-0 px-6 py-2.5 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 min-w-0">
          <Sparkles className="w-3.5 h-3.5 text-[#ff7900] shrink-0" aria-hidden />
          Quick Analysis
        </h2>
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold text-slate-600 hover:text-[#ff7900] hover:bg-orange-50 border border-slate-200 hover:border-[#ff7900]/30 transition-colors shrink-0"
          aria-expanded={historyOpen}
          aria-controls="atfx-qa-history-panel"
        >
          <History className="w-3.5 h-3.5" aria-hidden />
          History
          {sessions.length > 1 ? (
            <span className="text-[10px] font-bold text-slate-400">({sessions.length})</span>
          ) : null}
        </button>
      </div>

      {activeSession ? (
        <div className="shrink-0 px-6 py-2 border-b border-slate-100 bg-white flex items-start justify-between gap-3 min-w-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">{activeSession.displayName}</p>
              {isOverallMarketReportSymbol(activeSession.symbol) ? (
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[#ff7900] text-white">
                  Overall
                </span>
              ) : null}
              {activeSession.status === "ready" ? (
                <div className="flex items-center gap-1 shrink-0" role="tablist" aria-label="Report language">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={contentTab === "en"}
                    onClick={() => setContentTab("en")}
                    className={contentTabClass(contentTab === "en")}
                  >
                    {quickAnalysisTabLabel("en")}
                  </button>
                  {availableTranslationTabs.map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      role="tab"
                      aria-selected={contentTab === tab}
                      onClick={() => setContentTab(tab)}
                      className={contentTabClass(contentTab === tab)}
                    >
                      {isTabTranslating(activeSession, tab) ? (
                        <span className="inline-flex items-center gap-1">
                          <Loader2 className="w-2.5 h-2.5 animate-spin" aria-hidden />
                          {quickAnalysisTabLabel(tab)}
                        </span>
                      ) : (
                        quickAnalysisTabLabel(tab)
                      )}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            {activeSession.resolvedWindowLabel ? (
              <p className="text-[10px] text-slate-500 truncate">{activeSession.resolvedWindowLabel}</p>
            ) : activeSession.lookback ? (
              <p className="text-[10px] text-slate-500 truncate">{formatQuickAnalysisLookback(activeSession.lookback)}</p>
            ) : null}
            {activeSession.dataAsOfLabel ? (
              <p className="text-[10px] text-slate-400 truncate">Data through {activeSession.dataAsOfLabel}</p>
            ) : null}
          </div>
          <div className="shrink-0 flex items-center gap-1.5">
            {activeSession.status === "ready" ? (
              <button
                type="button"
                onClick={() =>
                  downloadQuickAnalysisHtml({
                    displayName: activeSession.displayName,
                    report: getQuickAnalysisReportForLocale(activeSession, contentTab),
                    contentTab,
                    chartImageUrl: activeSession.chartImageUrl,
                    chartCaption: activeSession.chartCaption,
                  })
                }
                className="p-1 rounded-md text-slate-400 hover:text-[#ff7900] hover:bg-orange-50 border border-transparent hover:border-[#ff7900]/20 transition-colors"
                aria-label="Download HTML"
                title="Download HTML"
              >
                <Download className="w-3.5 h-3.5" aria-hidden />
              </button>
            ) : null}
            {canManualTranslate ? (
              <button
                type="button"
                onClick={() => setTranslateModalOpen(true)}
                disabled={translateBusy && missingTranslations.length === 0}
                className="p-1 rounded-md text-slate-400 hover:text-[#ff7900] hover:bg-orange-50 border border-transparent hover:border-[#ff7900]/20 transition-colors disabled:opacity-40"
                aria-label="Translate quick analysis"
                title={
                  missingTranslations.length === 0
                    ? "All translations available"
                    : "Translate to another language"
                }
              >
                {translateBusy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                ) : (
                  <Languages className="w-3.5 h-3.5" aria-hidden />
                )}
              </button>
            ) : null}
            {activeSession.status === "ready" ? (
              <button
                type="button"
                onClick={() => setTelegramModalOpen(true)}
                disabled={telegramSending}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold text-slate-500 hover:text-[#0088cc] hover:bg-sky-50 border border-transparent hover:border-sky-200 transition-colors disabled:opacity-40"
                aria-label="Send to Telegram"
                title="Send to Telegram"
              >
                {telegramSending ? (
                  <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
                ) : (
                  <Send className="w-3 h-3" aria-hidden />
                )}
                Telegram
              </button>
            ) : null}
            <p className="text-[10px] text-slate-400 whitespace-nowrap flex items-center gap-1">
              <Clock className="w-3 h-3" aria-hidden />
              {sessionStatusLine(activeSession)}
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex-1 min-h-0 overflow-y-auto px-6 pt-4 pb-16">
        {!activeSession ? null : activeSession.status === "loading" ? (
          <AtfxQuickAnalysisGenerating session={activeSession} />
        ) : activeSession.status === "error" ? (
          <p className="text-sm text-red-600">{activeSession.error || "Analysis failed"}</p>
        ) : activeSession.detailLoading || (!activeSession.report.trim() && !activeReport.trim() && contentTab === "en") ? (
          <ContentAreaLoader variant="panel" size="sm" message="Loading report…" pulseMessage={false} />
        ) : contentTab !== "en" && showTranslationLoading && !activeReport.trim() ? (
          <ContentAreaLoader
            variant="panel"
            size="sm"
            message={`Translating to ${quickAnalysisTabLabel(contentTab)}…`}
            pulseMessage={false}
          />
        ) : (
          <>
            {activeTabError ? (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-2.5 py-2 mb-3">
                {activeTabError}
              </p>
            ) : null}
            <AtfxQuickAnalysisReportBody
              report={contentTab === "en" ? activeSession.report : activeReport}
              symbol={activeSession.symbol}
              chartImageUrl={activeSession.chartImageUrl}
              chartCaption={activeSession.chartCaption}
              typewriter={contentTab === "en" && Boolean(activeSession.playTypewriter)}
              onTypewriterComplete={
                activeSession.playTypewriter
                  ? () => onTypewriterComplete?.(activeSession.id)
                  : undefined
              }
            />
          </>
        )}
      </div>

      {historyOpen ? (
        <button
          type="button"
          className="absolute inset-0 z-20 bg-slate-900/20"
          aria-label="Close history"
          onClick={() => setHistoryOpen(false)}
        />
      ) : null}

      <div
        id="atfx-qa-history-panel"
        className={`absolute inset-y-0 right-0 z-30 w-[80%] flex flex-col bg-white border-l border-slate-200 shadow-xl transition-transform duration-200 ease-out ${
          historyOpen ? "translate-x-0" : "translate-x-full pointer-events-none"
        }`}
        aria-hidden={!historyOpen}
      >
        <div className="shrink-0 px-3 py-2.5 border-b border-slate-200 flex items-center justify-between gap-2 bg-slate-50/80">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Group history</h3>
          <button
            type="button"
            onClick={() => setHistoryOpen(false)}
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-200/80 transition-colors"
            aria-label="Close history panel"
          >
            <X className="w-4 h-4" aria-hidden />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5">
          {sessions.map((session) => (
            <HistoryListItem
              key={session.id}
              session={session}
              active={session.id === (activeSession?.id ?? activeId)}
              onSelect={() => selectSession(session.id)}
            />
          ))}
        </div>
      </div>

      <AtfxQuickAnalysisTranslateModal
        open={translateModalOpen}
        session={activeSession}
        translatingLocales={activeSession?.translatingLocales ?? []}
        onClose={() => setTranslateModalOpen(false)}
        onTranslate={handleManualTranslate}
      />

      <AtfxQuickAnalysisTelegramModal
        open={telegramModalOpen}
        session={activeSession}
        channels={telegramChannels}
        onClose={() => setTelegramModalOpen(false)}
        onSend={handleTelegramSend}
        onOpenSettings={onOpenSettings}
      />

      <Toast
        message={toast?.message ?? null}
        variant={toast?.variant ?? "success"}
        onClose={() => setToast(null)}
      />
    </div>
  );
}

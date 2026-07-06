import React, { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { ResearchReportPageLoader } from "./components/ResearchReportPageLoader";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import type { AtfxQuickAnalysisResult } from "../../lib/atfxQuickAnalysisService";
import {
  researchReportPromptFromQuickAnalysis,
  researchReportPromptHtmlFromQuickAnalysis,
} from "../../lib/researchReportFromQuickAnalysis";
import { Toast } from "../../components/Toast";
import {
  researchReportPromptFromNewsItem,
  researchReportPromptHtmlFromNewsItem,
} from "../../lib/researchReportFromNews";
import {
  researchReportPromptFromTopic,
  researchReportDisplayFromTopic,
  topicAudienceFromItem,
} from "../../lib/researchReportFromTopic";
import type { NewsItem } from "../../types";
import type { CapitalKeywordItem } from "../Capital/types";
import { ResearchReportCanvasPanel } from "./components/ResearchReportCanvasPanel";
import { ResearchReportChatPanel } from "./components/ResearchReportChatPanel";
import { TopicCustomizeModal } from "./components/TopicCustomizeModal";
import { ResearchReportWordPressSettingsPanel } from "./components/ResearchReportWordPressSettingsPanel";
import { useFreshTopicsBatch } from "./hooks/useFreshTopicsBatch";
import { useResearchReportCanvas } from "./hooks/useResearchReportCanvas";
import { useResearchReportWorkspace } from "./hooks/useResearchReportWorkspace";
import { useBrokerageTokenBalanceApply, useBrokerageTokenBalanceRefresh } from "../../contexts/BrokerageTokenBalanceContext";
import type { BrokerageTokenBalance } from "../../lib/brokerageTokens";
import { settingsSummary } from "./researchReportUtils";
import {
  readStoredWordPressCategories,
  writeStoredWordPressCategories,
  type AtfxWordPressCategory,
} from "../../lib/atfxResearchWordPressSettings";
import { resolveReportSeoExcerpt, type ReportLanguage } from "../../lib/atfxResearchReportOptions";
import { ATFX_PAGE_SHELL_ELEVATED_CLASS } from "../../lib/atfxPageLayout";

const AtfxTrendingNewsDrawer = lazy(() =>
  import("../../components/AtfxTrendingNewsDrawer").then((m) => ({ default: m.AtfxTrendingNewsDrawer }))
);

export default function AtfxResearchReportPage() {
  const { authFetch, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const refreshTokenBalance = useBrokerageTokenBalanceRefresh();
  const applyTokenBalance = useBrokerageTokenBalanceApply();

  const handleTokenUsageChanged = useCallback(
    async (balance?: BrokerageTokenBalance) => {
      if (balance) {
        applyTokenBalance(balance);
        return;
      }
      await refreshTokenBalance();
    },
    [applyTokenBalance, refreshTokenBalance]
  );

  const {
    reports,
    activeId,
    title,
    reportI18n,
    activeLangTab,
    setActiveLangTab,
    messages,
    input,
    setInput,
    inputHtmlPreview,
    setInputHtmlPreview,
    sending,
    loading,
    historyLoading,
    reportLoading,
    creatingNewReport,
    error,
    outputOptions,
    setOutputOptions,
    seoExcerpt,
    thumbnailUrl,
    metaLoading,
    liveStages,
    writingPhase,
    handleSend: sendResearchReport,
    handleKill,
    handleNewReport: createNewReport,
    handleSelectReport: selectReport,
    handleDeleteReport: deleteReport,
    translateReportLocale,
    translatingLocales,
    translateProgress,
    translateToast,
    dismissTranslateToast,
    refreshHistoryList,
    beginFreshTopicsSession,
    syncFreshTopicsSession,
    resetToFreshCanvas,
  } = useResearchReportWorkspace({ onTokenUsageChanged: handleTokenUsageChanged });

  const topicPersistence = useMemo(
    () => ({
      beginSession: beginFreshTopicsSession,
      syncSession: syncFreshTopicsSession,
    }),
    [beginFreshTopicsSession, syncFreshTopicsSession]
  );
  const topics = useFreshTopicsBatch(authFetch, topicPersistence);

  useEffect(() => {
    if (location.pathname !== "/atfx/research-report" || loading) return;

    const openReportId = (location.state as { openReportId?: string } | null)?.openReportId?.trim() || null;
    if (openReportId) return;

    if (locationKeyRef.current === location.key) return;
    const isFirstVisit = locationKeyRef.current === null;
    locationKeyRef.current = location.key;
    if (isFirstVisit) return;

    resetToFreshCanvas();
    topics.resetFreshTopicsSession();
  }, [loading, location.key, location.pathname, location.state, resetToFreshCanvas, topics]);

  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [newsDrawerOpen, setNewsDrawerOpen] = React.useState(false);
  const [quickAnalysisSheetOpen, setQuickAnalysisSheetOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [wordpressSettingsOpen, setWordpressSettingsOpen] = useState(false);
  const [wordpressCategories, setWordpressCategories] = useState<AtfxWordPressCategory[]>(() =>
    readStoredWordPressCategories()
  );
  const [publishing, setPublishing] = useState(false);
  const [publishToast, setPublishToast] = useState<{
    message: string;
    variant: "success" | "error" | "info";
  } | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const openedFromNavigationRef = useRef<string | null>(null);
  const locationKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const openReportId = (location.state as { openReportId?: string } | null)?.openReportId?.trim() || null;
    if (!openReportId || loading || openedFromNavigationRef.current === openReportId) return;
    openedFromNavigationRef.current = openReportId;
    void selectReport(openReportId);
    navigate(location.pathname, { replace: true, state: {} });
  }, [loading, location.pathname, location.state, navigate, selectReport]);

  const {
    sectionTitles,
    activeHtml,
    canvasTabs,
    displayHtml,
    activeTitle,
    downloadHtml,
  } = useResearchReportCanvas(reportI18n, activeLangTab, title);

  const activeSeoExcerpt = useMemo(
    () => resolveReportSeoExcerpt(reportI18n, activeLangTab, seoExcerpt),
    [reportI18n, activeLangTab, seoExcerpt]
  );

  const settingsLine = useMemo(() => settingsSummary(outputOptions), [outputOptions]);

  const resizeChatInput = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const maxPx = Math.min(window.innerHeight * 0.35, 320);
    const next = Math.min(el.scrollHeight, maxPx);
    el.style.height = `${Math.max(next, 76)}px`;
  }, []);

  useEffect(() => {
    resizeChatInput();
  }, [input, inputHtmlPreview, resizeChatInput]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSettingsOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [settingsOpen]);

  useEffect(() => {
    if (!wordpressSettingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setWordpressSettingsOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [wordpressSettingsOpen]);

  useEffect(() => {
    if (!historyOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHistoryOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [historyOpen]);

  useEffect(() => {
    if (topics.generatingFreshTopics) return;
    topics.hydrateFromMessages(messages);
  }, [activeId, messages, topics.generatingFreshTopics, topics.hydrateFromMessages]);

  useEffect(() => {
    if (activeId && topics.generatedTopics.length > 0) {
      topics.sessionReportIdRef.current = activeId;
    }
  }, [activeId, topics.generatedTopics.length, topics.sessionReportIdRef]);

  const handleStartArticleFromTopic = useCallback(
    (item: CapitalKeywordItem) => {
      const audience = topicAudienceFromItem(item);
      if (audience) {
        setOutputOptions((prev) => ({ ...prev, audience }));
      }
      topics.setActiveTopicId(item.id);
      topics.setOpenTopicId(item.id);
      void sendResearchReport(researchReportPromptFromTopic(item), {
        displayMessage: researchReportDisplayFromTopic(item),
      });
    },
    [sendResearchReport, setOutputOptions, topics]
  );

  const handleNewsForReport = useCallback((item: NewsItem) => {
    setInput(researchReportPromptFromNewsItem(item));
    setInputHtmlPreview(researchReportPromptHtmlFromNewsItem(item));
    setNewsDrawerOpen(false);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [setInput, setInputHtmlPreview]);

  const applySectionPrompt = useCallback(
    (prompt: string) => {
      setInput(prompt);
      setInputHtmlPreview(null);
    },
    [setInput, setInputHtmlPreview]
  );

  const handleInputChange = useCallback(
    (next: string) => {
      setInput(next);
      setInputHtmlPreview((prev) => (prev ? null : prev));
    },
    [setInput, setInputHtmlPreview]
  );

  const handleToggleTopic = useCallback(
    (id: string) => {
      topics.setOpenTopicId((prev) => (prev === id ? null : id));
    },
    [topics]
  );

  const handleCustomizeTopic = useCallback(
    (id: string) => {
      topics.setOpenTopicId(id);
      topics.setCustomizeTopicId(id);
    },
    [topics]
  );

  const handleRegenerateTopic = useCallback(
    (id: string) => {
      topics.setOpenTopicId(id);
      void topics.regenerateTopic(id);
    },
    [topics]
  );

  const handleSaveTopicCustomization = useCallback(
    async (patch: Partial<CapitalKeywordItem>) => {
      if (!topics.customizeTopic) return;
      await topics.updateTopic(topics.customizeTopic.id, patch);
    },
    [topics]
  );

  const handleToggleSettings = useCallback(() => {
    setSettingsOpen((o) => !o);
  }, []);

  const handleNewReport = useCallback(() => {
    void createNewReport(topics.resetFreshTopicsSession);
  }, [createNewReport, topics.resetFreshTopicsSession]);

  const handleClearHtmlPreview = useCallback(() => {
    setInputHtmlPreview(null);
  }, [setInputHtmlPreview]);

  const handleSend = useCallback(() => {
    void sendResearchReport();
  }, [sendResearchReport]);

  const handleOpenFreshTopicsModal = useCallback(() => {
    setQuickAnalysisSheetOpen(false);
    setNewsDrawerOpen(false);
    topics.setFreshTopicsRunCount(1);
    topics.setFreshTopicsAudience(outputOptions.audience);
    topics.setFreshTopicsModalOpen(true);
  }, [outputOptions.audience, topics]);

  const handleOpenTrending = useCallback(() => {
    setQuickAnalysisSheetOpen(false);
    topics.setFreshTopicsModalOpen(false);
    setNewsDrawerOpen(true);
  }, [topics]);

  const handleCloseNewsDrawer = useCallback(() => {
    setNewsDrawerOpen(false);
  }, []);

  const handleOpenQuickAnalysis = useCallback(() => {
    setNewsDrawerOpen(false);
    topics.setFreshTopicsModalOpen(false);
    setQuickAnalysisSheetOpen(true);
  }, [topics]);

  const handleCloseQuickAnalysisSheet = useCallback(() => {
    setQuickAnalysisSheetOpen(false);
  }, []);

  const handleQuickAnalysisForReport = useCallback(
    (item: AtfxQuickAnalysisResult) => {
      setInput(researchReportPromptFromQuickAnalysis(item));
      setInputHtmlPreview(researchReportPromptHtmlFromQuickAnalysis(item));
      setQuickAnalysisSheetOpen(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    },
    [setInput, setInputHtmlPreview]
  );

  const handleToggleHistory = useCallback(() => {
    setHistoryOpen((open) => {
      const next = !open;
      if (next) void refreshHistoryList();
      return next;
    });
  }, [refreshHistoryList]);

  const handleCloseHistory = useCallback(() => {
    setHistoryOpen(false);
  }, []);

  const handleSelectReport = useCallback(
    (id: string) => {
      setHistoryOpen(false);
      void selectReport(id);
    },
    [selectReport]
  );

  const handleDeleteReport = useCallback(
    (id: string) => {
      void deleteReport(id);
    },
    [deleteReport]
  );

  const handleWordPressCategoriesChange = useCallback((categories: AtfxWordPressCategory[]) => {
    setWordpressCategories(categories);
    writeStoredWordPressCategories(categories);
  }, []);

  const handlePublishReport = useCallback(
    async (locale: ReportLanguage, categoryId: string) => {
      if (!activeId) {
        setPublishToast({ message: "No report selected.", variant: "error" });
        return;
      }
      setPublishing(true);
      setPublishToast({ message: "Publishing to newsa.io…", variant: "info" });
      try {
        const res = await authFetch(`/api/atfx/research-report/${activeId}/publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locale, category: categoryId }),
        });
        const text = await res.text();
        let detail = "";
        let postUrl = "";
        try {
          const j = JSON.parse(text) as { error?: string; hint?: string; detail?: string; post_url?: string };
          detail = [j.error, j.detail, j.hint].filter(Boolean).join(" — ");
          postUrl = typeof j.post_url === "string" ? j.post_url.trim() : "";
        } catch {
          detail = text.trim().slice(0, 200);
        }
        if (!res.ok) {
          throw new Error(detail || res.statusText || "Publish failed");
        }
        setPublishToast({
          message: postUrl ? `Published to newsa.io: ${postUrl}` : "Published to newsa.io successfully.",
          variant: "success",
        });
      } catch (err) {
        const message = (err as Error).message || "Publish failed";
        setPublishToast({ message, variant: "error" });
      } finally {
        setPublishing(false);
      }
    },
    [activeId, authFetch]
  );

  const handleCloseFreshTopicsModal = useCallback(() => {
    topics.setFreshTopicsModalOpen(false);
  }, [topics]);

  const handleRunFreshTopicsBatch = useCallback(() => {
    void topics.runFreshTopicsBatch(topics.freshTopicsRunCount, topics.freshTopicsAudience);
  }, [topics]);

  if (loading && !activeId) {
    return <ResearchReportPageLoader />;
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 h-[calc(100vh-4rem)] bg-[var(--color-page-bg)]">
      <div className={`${ATFX_PAGE_SHELL_ELEVATED_CLASS} flex flex-col flex-1 min-h-0`}>
      <div className="flex flex-col lg:flex-row flex-1 min-h-0">
        <ResearchReportChatPanel
          settingsOpen={settingsOpen}
          settingsLine={settingsLine}
          onToggleSettings={handleToggleSettings}
          outputOptions={outputOptions}
          onOutputOptionsChange={setOutputOptions}
          sending={sending}
          creatingNewReport={creatingNewReport}
          onNewReport={handleNewReport}
          topicGenUserRequest={topics.topicGenUserRequest}
          topicsNotice={topics.topicsNotice}
          generatingFreshTopics={topics.generatingFreshTopics}
          topicGenProgress={topics.topicGenProgress}
          topicGenBatchHint={topics.topicGenBatchHint}
          generatedTopics={topics.generatedTopics}
          openTopicId={topics.openTopicId}
          onToggleTopic={handleToggleTopic}
          onStartArticleFromTopic={handleStartArticleFromTopic}
          onCustomizeTopic={handleCustomizeTopic}
          onRegenerateTopic={handleRegenerateTopic}
          regeneratingTopicId={topics.regeneratingTopicId}
          activeTopicId={topics.activeTopicId}
          messages={messages}
          liveStages={liveStages}
          writingPhase={writingPhase}
          error={error}
          sectionTitles={sectionTitles}
          onApplySectionPrompt={applySectionPrompt}
          input={input}
          inputHtmlPreview={inputHtmlPreview}
          onInputChange={handleInputChange}
          onClearHtmlPreview={handleClearHtmlPreview}
          onSend={handleSend}
          onKill={handleKill}
          inputRef={inputRef}
          activeHtml={activeHtml}
          onOpenFreshTopicsModal={handleOpenFreshTopicsModal}
          freshTopicsSheetOpen={topics.freshTopicsModalOpen}
          onCloseFreshTopicsSheet={handleCloseFreshTopicsModal}
          onRunFreshTopicsBatch={handleRunFreshTopicsBatch}
          freshTopicsRunCount={topics.freshTopicsRunCount}
          onFreshTopicsRunCountChange={topics.setFreshTopicsRunCount}
          freshTopicsAudience={topics.freshTopicsAudience}
          onFreshTopicsAudienceChange={topics.setFreshTopicsAudience}
          onOpenTrending={handleOpenTrending}
          onOpenQuickAnalysis={handleOpenQuickAnalysis}
          newsDrawerOpen={newsDrawerOpen}
          quickAnalysisSheetOpen={quickAnalysisSheetOpen}
          onCloseQuickAnalysisSheet={handleCloseQuickAnalysisSheet}
          onSelectQuickAnalysis={handleQuickAnalysisForReport}
          pageEssentialsReady={!loading && !reportLoading}
        />

        <ResearchReportCanvasPanel
          historyOpen={historyOpen}
          historyLoading={historyLoading}
          reportLoading={reportLoading}
          onToggleHistory={handleToggleHistory}
          onCloseHistory={handleCloseHistory}
          reports={reports}
          activeId={activeId}
          currentUserUid={user?.uid ?? null}
          onSelectReport={handleSelectReport}
          onDeleteReport={handleDeleteReport}
          canvasTabs={canvasTabs}
          activeLangTab={activeLangTab}
          onLangTabChange={setActiveLangTab}
          displayHtml={displayHtml}
          activeTitle={activeTitle}
          seoExcerpt={activeSeoExcerpt}
          thumbnailUrl={thumbnailUrl}
          metaLoading={metaLoading}
          sending={sending}
          writingPhase={writingPhase}
          onDownloadHtml={downloadHtml}
          reportI18n={reportI18n}
          translatingLocales={translatingLocales}
          translateProgress={translateProgress}
          onTranslateLocale={translateReportLocale}
          activeReportId={activeId}
          wordpressCategories={wordpressCategories}
          publishing={publishing}
          onPublish={handlePublishReport}
          onOpenWordPressSettings={() => setWordpressSettingsOpen(true)}
        />
      </div>
      </div>

      <ResearchReportWordPressSettingsPanel
        open={wordpressSettingsOpen}
        categories={wordpressCategories}
        onCategoriesChange={handleWordPressCategoriesChange}
        onClose={() => setWordpressSettingsOpen(false)}
      />

      {newsDrawerOpen ? (
        <Suspense fallback={null}>
          <AtfxTrendingNewsDrawer
            open={newsDrawerOpen}
            onClose={handleCloseNewsDrawer}
            variant="research"
            panelLeftClass="lg:left-[40%]"
            onUseNews={handleNewsForReport}
            pageEssentialsReady={!loading && !reportLoading}
          />
        </Suspense>
      ) : null}

      {topics.customizeTopic ? (
        <TopicCustomizeModal
          item={topics.customizeTopic}
          onClose={() => topics.setCustomizeTopicId(null)}
          onSave={handleSaveTopicCustomization}
        />
      ) : null}

      <Toast
        message={translateToast?.message ?? publishToast?.message ?? null}
        variant={translateToast?.variant ?? publishToast?.variant ?? "success"}
        duration={
          (translateToast?.variant ?? publishToast?.variant) === "error"
            ? 6000
            : publishToast?.variant === "info"
              ? 0
              : 4000
        }
        onClose={() => {
          dismissTranslateToast();
          setPublishToast(null);
        }}
      />
    </div>
  );
}

import React, { useCallback, useEffect, useState, lazy, Suspense } from "react";
import { useLocation } from "react-router-dom";
import { ContentAreaLoader } from "../../components/ContentAreaLoader";
import { useAuth } from "../../contexts/AuthContext";
import { AtfxQuickAnalysisSidebar } from "../../components/atfx/AtfxQuickAnalysisSidebar";
import { AtfxMarketsHeader } from "../../components/atfx/AtfxMarketsHeader";
import { AtfxMarketsRightPanel } from "../../components/atfx/AtfxMarketsRightPanel";
import { useAtfxMarketMapData } from "./hooks/useAtfxMarketMapData";
import { useAtfxQuickAnalysisWorkspace } from "./hooks/useAtfxQuickAnalysisWorkspace";
import { useBrokerageTokenBalanceApply, useBrokerageTokenBalanceRefresh } from "../../contexts/BrokerageTokenBalanceContext";
import type { BrokerageTokenBalance } from "../../lib/brokerageTokens";
import { ATFX_PAGE_SHELL_ELEVATED_CLASS } from "../../lib/atfxPageLayout";
import {
  readStoredQuickAnalysisAutoTranslate,
  writeStoredQuickAnalysisAutoTranslate,
  type QuickAnalysisTranslateLocale,
} from "../../lib/atfxQuickAnalysisLocale";
import {
  readStoredTelegramChannels,
  writeStoredTelegramChannels,
  type AtfxTelegramChannel,
} from "../../lib/atfxQuickAnalysisTelegramSettings";
import { prefetchMarketsMoversSection } from "../../lib/atfxMarketMapGeography";

const AtfxMarketsSettingsPanel = lazy(() =>
  import("../../components/atfx/AtfxMarketsSettingsPanel").then((m) => ({ default: m.AtfxMarketsSettingsPanel }))
);
const AtfxQuickAnalysisConfirmModal = lazy(() =>
  import("../../components/atfx/AtfxQuickAnalysisConfirmModal").then((m) => ({
    default: m.AtfxQuickAnalysisConfirmModal,
  }))
);
const AtfxOverallMarketReportModal = lazy(() =>
  import("../../components/atfx/AtfxOverallMarketReportModal").then((m) => ({
    default: m.AtfxOverallMarketReportModal,
  }))
);

export default function AtfxMarketsPage() {
  const { authFetch, user, loading: authLoading } = useAuth();
  const location = useLocation();
  const openQuickAnalysisId =
    (location.state as { openQuickAnalysisId?: string } | null)?.openQuickAnalysisId?.trim() || null;
  const { data, indexes, openIndexes, closedIndexes, error, retry } = useAtfxMarketMapData(authFetch);
  const [hoveredIndex, setHoveredIndex] = React.useState<string | null>(null);

  useEffect(() => {
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (typeof requestIdleCallback === "function") {
      idleId = requestIdleCallback(() => prefetchMarketsMoversSection());
    } else {
      timeoutId = setTimeout(() => prefetchMarketsMoversSection(), 1500);
    }
    return () => {
      if (idleId != null && typeof cancelIdleCallback === "function") cancelIdleCallback(idleId);
      if (timeoutId != null) clearTimeout(timeoutId);
    };
  }, []);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [autoTranslateLocales, setAutoTranslateLocales] = useState<QuickAnalysisTranslateLocale[]>(() =>
    readStoredQuickAnalysisAutoTranslate()
  );
  const [telegramChannels, setTelegramChannels] = useState<AtfxTelegramChannel[]>(() =>
    readStoredTelegramChannels()
  );

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

  const qa = useAtfxQuickAnalysisWorkspace(authFetch, {
    authLoading,
    userPresent: Boolean(user),
    userId: user?.uid,
    autoTranslateLocales,
    onTokenUsageChanged: handleTokenUsageChanged,
  });

  const handleAutoTranslateChange = useCallback((locales: QuickAnalysisTranslateLocale[]) => {
    setAutoTranslateLocales(locales);
    writeStoredQuickAnalysisAutoTranslate(locales);
  }, []);

  const handleTelegramChannelsChange = useCallback((channels: AtfxTelegramChannel[]) => {
    setTelegramChannels(channels);
    writeStoredTelegramChannels(channels);
  }, []);

  const handleHoverIndex = useCallback((symbol: string | null) => {
    setHoveredIndex(symbol);
  }, []);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] min-h-0 bg-[var(--color-page-bg)]">
      <div className={`${ATFX_PAGE_SHELL_ELEVATED_CLASS} flex flex-col flex-1 min-h-0`}>
      <AtfxMarketsHeader
        onSymbolSelect={qa.openFromSearch}
        onOpenOverallMarketReport={qa.openOverallMarketReportModal}
        onOpenSettings={() => setSettingsOpen(true)}
        searchDisabled={qa.confirmBusy}
        overallReportDisabled={qa.confirmBusy}
      />

      {error ? (
        <div className="shrink-0 mt-3 p-3 rounded-lg bg-red-50 text-red-800 text-sm border border-red-200">
          <p className="font-medium mb-1">Could not load market data</p>
          <p className="text-xs mb-2 text-red-600">{error}</p>
          <button
            type="button"
            onClick={retry}
            className="px-3 py-1 rounded bg-red-100 hover:bg-red-200 text-red-800 font-medium text-xs"
          >
            Retry
          </button>
        </div>
      ) : null}

      {!error ? (
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          <aside className="w-full lg:w-[35%] shrink-0 min-h-0 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-200 bg-white relative overflow-hidden">
            <AtfxQuickAnalysisSidebar
              sessions={qa.sessions}
              telegramChannels={telegramChannels}
              authFetch={authFetch}
              onTranslateSession={qa.translateSessionLocale}
              onOpenSettings={() => setSettingsOpen(true)}
              initialSessionId={openQuickAnalysisId}
              onEnsureSessionDetail={qa.ensureSessionDetail}
              onTypewriterComplete={qa.markSessionTypewriterDone}
            />
          </aside>

          {data ? (
            <AtfxMarketsRightPanel
              className="w-full lg:w-[65%] flex-1 min-h-[320px] lg:min-h-0 min-w-0"
              indexes={indexes}
              openIndexes={openIndexes}
              closedIndexes={closedIndexes}
              hoveredIndex={hoveredIndex}
              onHoverIndex={handleHoverIndex}
              onIndexClick={qa.openFromIndex}
              onMoverClick={qa.openFromMover}
              mapLastUpdated={data.lastUpdated}
            />
          ) : (
            <div className="w-full lg:w-[65%] flex-1 min-h-[320px] lg:min-h-0 min-w-0 bg-white">
              <ContentAreaLoader
                variant="inline"
                size="sm"
                message="Loading market data…"
                className="min-h-[320px] lg:min-h-full"
                pulseMessage={false}
              />
            </div>
          )}
        </div>
      ) : null}
      </div>

      {qa.confirmOpen ? (
        <Suspense fallback={null}>
          <AtfxQuickAnalysisConfirmModal
            open={qa.confirmOpen}
            pendingTarget={qa.pendingTarget}
            lookback={qa.analysisLookback}
            busy={qa.confirmBusy}
            onLookbackChange={qa.setAnalysisLookback}
            onClose={qa.closeConfirm}
            onConfirm={() => void qa.runAnalysis()}
          />
        </Suspense>
      ) : null}

      {qa.overallModalOpen ? (
        <Suspense fallback={null}>
          <AtfxOverallMarketReportModal
            open={qa.overallModalOpen}
            busy={qa.confirmBusy}
            onClose={qa.closeOverallMarketReportModal}
            onGenerate={(segments) => void qa.runOverallMarketReport(segments)}
          />
        </Suspense>
      ) : null}

      {settingsOpen ? (
        <Suspense fallback={null}>
          <AtfxMarketsSettingsPanel
            open={settingsOpen}
            autoTranslateLocales={autoTranslateLocales}
            onAutoTranslateChange={handleAutoTranslateChange}
            telegramChannels={telegramChannels}
            onTelegramChannelsChange={handleTelegramChannelsChange}
            onClose={() => setSettingsOpen(false)}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

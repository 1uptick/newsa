import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { QuickAnalysisSession } from "../../../components/atfx/AtfxQuickAnalysisSidebar";
import {
  fetchAtfxQuickAnalysisById,
  fetchAtfxQuickAnalysisHistoryLite,
  quickAnalysisResultToSession,
} from "../../../lib/atfxQuickAnalysisService";
import {
  streamAtfxOverallMarketReport,
  streamAtfxQuickAnalysis,
  type QuickAnalysisProgressStep,
} from "../../../lib/atfxQuickAnalysisStream";
import {
  saveQuickAnalysisTranslations,
  translateQuickAnalysisReport,
} from "../../../lib/atfxQuickAnalysisTranslateService";
import {
  DEFAULT_QUICK_ANALYSIS_LOOKBACK,
  type QuickAnalysisLookback,
} from "../../../lib/atfxQuickAnalysisLookback";
import type { QuickAnalysisTranslateLocale } from "../../../lib/atfxQuickAnalysisLocale";
import {
  quickAnalysisReportFieldForLocale,
  quickAnalysisTranslationPayloadForLocale,
} from "../../../lib/atfxQuickAnalysisLocale";
import type { AtfxSymbolSearchItem } from "../../../lib/atfxSymbolSearchService";
import { parseForexPairInput } from "../../../lib/atfxForexCustomPairs";
import type { MarketMoverEntry } from "../../../lib/atfxMarketMoversService";
import type { BrokerageTokenBalance } from "../../../lib/brokerageTokens";
import {
  readQuickAnalysisHistoryCache,
  mergeLiteQuickAnalysisHistoryCache,
  upsertQuickAnalysisHistoryCacheItem,
} from "../../../lib/atfxQuickAnalysisHistoryCache";
import type { AtfxQuickAnalysisResult } from "../../../lib/atfxQuickAnalysisService";
import type { OverallMarketSegment } from "../../../lib/atfxOverallMarketReport";

type AuthFetch = (url: string, opts?: RequestInit) => Promise<Response>;

export type QuickAnalysisTarget = {
  symbol: string;
  displayName: string;
};

function newSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function patchSessionStreamProgress(
  sessionId: string,
  patch: Partial<
    Pick<
      QuickAnalysisSession,
      | "loadingPhase"
      | "loadingActiveStep"
      | "loadingCompletedSteps"
      | "report"
      | "chartImageUrl"
      | "chartCaption"
      | "chartInterval"
      | "changePct"
      | "resolvedWindowLabel"
      | "dataAsOfLabel"
    >
  >
) {
  return (prev: QuickAnalysisSession[]) =>
    prev.map((s) => (s.id === sessionId ? { ...s, ...patch } : s));
}

function createStreamHandlers(
  sessionId: string,
  setSessions: Dispatch<SetStateAction<QuickAnalysisSession[]>>
) {
  return {
    onPhase: (message: string, step?: QuickAnalysisProgressStep) => {
      setSessions(patchSessionStreamProgress(sessionId, {
        loadingPhase: message,
        ...(step ? { loadingActiveStep: step } : {}),
      }));
    },
    onStepComplete: (step: QuickAnalysisProgressStep) => {
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;
          const completed = new Set(s.loadingCompletedSteps ?? []);
          completed.add(step);
          return {
            ...s,
            loadingCompletedSteps: [...completed],
            loadingActiveStep: s.loadingActiveStep === step ? undefined : s.loadingActiveStep,
          };
        })
      );
    },
    onChart: (payload: { chartImageUrl: string; chartCaption?: string; chartInterval?: string }) => {
      setSessions(patchSessionStreamProgress(sessionId, {
        chartImageUrl: payload.chartImageUrl,
        chartCaption: payload.chartCaption,
        chartInterval: payload.chartInterval,
      }));
    },
    onPartialReport: (report: string) => {
      setSessions(patchSessionStreamProgress(sessionId, { report }));
    },
    onMeta: (payload: {
      changePct?: number;
      resolvedWindowLabel?: string;
      dataAsOfLabel?: string;
    }) => {
      setSessions(patchSessionStreamProgress(sessionId, payload));
    },
  };
}

function patchSessionTranslations(
  session: QuickAnalysisSession,
  locale: QuickAnalysisTranslateLocale,
  report: string
): QuickAnalysisSession {
  return { ...session, [quickAnalysisReportFieldForLocale(locale)]: report };
}

function mergeQuickAnalysisSessions(
  prev: QuickAnalysisSession[],
  items: AtfxQuickAnalysisResult[]
): QuickAnalysisSession[] {
  if (prev.some((s) => s.status === "loading")) return prev;

  const prevById = new Map(prev.map((s) => [s.id, s]));
  const loaded = items.map((item) => {
    const next = quickAnalysisResultToSession(item);
    const existing = prevById.get(next.id);
    if (!existing) return next;

    const report = existing.report.trim() || next.report;
    return {
      ...next,
      report,
      reportTc: existing.reportTc?.trim() ? existing.reportTc : next.reportTc,
      reportSc: existing.reportSc?.trim() ? existing.reportSc : next.reportSc,
      reportTh: existing.reportTh?.trim() ? existing.reportTh : next.reportTh,
      reportVi: existing.reportVi?.trim() ? existing.reportVi : next.reportVi,
      detailLoading: !report.trim() && existing.detailLoading ? true : false,
      translatingLocales: existing.translatingLocales,
      translationErrors: existing.translationErrors,
      playTypewriter: existing.playTypewriter ?? false,
    };
  });

  const loadedIds = new Set(loaded.map((s) => s.id));
  const pending = prev.filter((s) => !loadedIds.has(s.id));
  return [...pending, ...loaded];
}

export function useAtfxQuickAnalysisWorkspace(
  authFetch: AuthFetch,
  options: {
    authLoading: boolean;
    userPresent: boolean;
    userId?: string | null;
    autoTranslateLocales: QuickAnalysisTranslateLocale[];
    onTokenUsageChanged?: (balance?: BrokerageTokenBalance) => void | Promise<void>;
  }
) {
  const cachedHistory = readQuickAnalysisHistoryCache(options.userId);
  const [sessions, setSessions] = useState<QuickAnalysisSession[]>(() =>
    cachedHistory?.length ? cachedHistory.map(quickAnalysisResultToSession) : []
  );
  const [pendingTarget, setPendingTarget] = useState<QuickAnalysisTarget | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [overallModalOpen, setOverallModalOpen] = useState(false);
  const [analysisLookback, setAnalysisLookback] = useState<QuickAnalysisLookback>(DEFAULT_QUICK_ANALYSIS_LOOKBACK);
  const autoTranslateRef = useRef(options.autoTranslateLocales);
  autoTranslateRef.current = options.autoTranslateLocales;
  const detailInflightRef = useRef(new Set<string>());
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  const mergeSessionFromResult = useCallback((sessionId: string, result: Awaited<ReturnType<typeof fetchAtfxQuickAnalysisById>>) => {
    const hydrated = quickAnalysisResultToSession(result);
    const resolvedId = result.id || sessionId;
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId || s.id === resolvedId
          ? {
              ...hydrated,
              id: resolvedId,
              detailLoading: false,
            }
          : s
      )
    );
    if (result.id) {
      upsertQuickAnalysisHistoryCacheItem(options.userId, result);
    }
  }, [options.userId]);

  const ensureSessionDetail = useCallback(
    async (sessionId: string) => {
      const trimmedId = sessionId.trim();
      if (!trimmedId) return;

      if (detailInflightRef.current.has(trimmedId)) {
        const session = sessionsRef.current.find((s) => s.id === trimmedId);
        if (session?.detailLoading) return;
        detailInflightRef.current.delete(trimmedId);
      }

      let needsLoad = false;
      setSessions((prev) => {
        const session = prev.find((s) => s.id === trimmedId);
        if (!session || session.status !== "ready") return prev;
        if (session.report.trim()) return prev;
        needsLoad = true;
        return prev.map((s) => (s.id === trimmedId ? { ...s, detailLoading: true } : s));
      });
      if (!needsLoad) return;

      detailInflightRef.current.add(trimmedId);
      try {
        const result = await fetchAtfxQuickAnalysisById(authFetch, trimmedId);
        mergeSessionFromResult(trimmedId, result);
      } catch (e) {
        console.warn("[atfx/markets] quick analysis detail load failed:", e);
        setSessions((prev) =>
          prev.map((s) =>
            s.id === trimmedId
              ? {
                  ...s,
                  detailLoading: false,
                  status: "error",
                  error: e instanceof Error ? e.message : "Failed to load report",
                }
              : s
          )
        );
      } finally {
        detailInflightRef.current.delete(trimmedId);
      }
    },
    [authFetch, mergeSessionFromResult]
  );

  useEffect(() => {
    if (options.authLoading || !options.userPresent) return;

    let cancelled = false;
    void (async () => {
      try {
        const items = await fetchAtfxQuickAnalysisHistoryLite(authFetch);
        mergeLiteQuickAnalysisHistoryCache(options.userId, items);
        if (cancelled || items.length === 0) return;
        setSessions((prev) => mergeQuickAnalysisSessions(prev, items));
      } catch (e) {
        console.warn("[atfx/markets] quick analysis history load failed:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authFetch, options.authLoading, options.userPresent, options.userId]);

  const translateSessionLocale = useCallback(
    async (sessionId: string, locale: QuickAnalysisTranslateLocale, dbIdOverride?: string) => {
      let englishReport = "";

      setSessions((prev) => {
        const session = prev.find((s) => s.id === sessionId);
        if (!session || session.status !== "ready" || !session.report.trim()) return prev;
        if ((session.translatingLocales ?? []).includes(locale)) return prev;
        englishReport = session.report;
        return prev.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                translatingLocales: [...(s.translatingLocales ?? []), locale],
                translationErrors: { ...s.translationErrors, [locale]: undefined },
              }
            : s
        );
      });

      if (!englishReport) return;

      try {
        const dbId = dbIdOverride ?? sessionId;
        const { report: translated, tokenBalance } = await translateQuickAnalysisReport(
          authFetch,
          englishReport,
          locale,
          dbId
        );
        const saved = quickAnalysisTranslationPayloadForLocale(locale, translated);

        setSessions((prev) =>
          prev.map((s) => {
            if (s.id !== sessionId) return s;
            const next = patchSessionTranslations(s, locale, translated);
            return {
              ...next,
              translatingLocales: (s.translatingLocales ?? []).filter((l) => l !== locale),
            };
          })
        );

        if (Object.values(saved).some((v) => typeof v === "string" && v.trim())) {
          try {
            await saveQuickAnalysisTranslations(authFetch, dbId, saved);
          } catch (e) {
            console.warn("[atfx/markets] failed to persist quick analysis translations:", e);
          }
        }
        await options.onTokenUsageChanged?.(tokenBalance);
        if (!tokenBalance) {
          await options.onTokenUsageChanged?.();
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "Translation failed";
        setSessions((prev) =>
          prev.map((s) => {
            if (s.id !== sessionId) return s;
            return {
              ...s,
              translatingLocales: (s.translatingLocales ?? []).filter((l) => l !== locale),
              translationErrors: { ...s.translationErrors, [locale]: message },
            };
          })
        );
      }
    },
    [authFetch, options.onTokenUsageChanged]
  );

  const runPostGenerationTranslations = useCallback(
    async (sessionId: string, dbId: string | undefined, englishReport: string) => {
      const locales = autoTranslateRef.current;
      if (locales.length === 0 || !englishReport.trim()) return;

      await Promise.all(locales.map((locale) => translateSessionLocale(sessionId, locale, dbId)));
    },
    [translateSessionLocale]
  );

  const openConfirm = useCallback((target: QuickAnalysisTarget) => {
    setPendingTarget(target);
    setAnalysisLookback(DEFAULT_QUICK_ANALYSIS_LOOKBACK);
    setConfirmOpen(true);
  }, []);

  const openFromIndex = useCallback(
    (index: { symbol: string; shortName: string; name: string }) => {
      openConfirm({
        symbol: index.symbol,
        displayName: index.shortName || index.name || index.symbol,
      });
    },
    [openConfirm]
  );

  const openFromSearch = useCallback(
    (item: AtfxSymbolSearchItem) => {
      openConfirm({
        symbol: item.symbol,
        displayName: item.name || item.symbol,
      });
    },
    [openConfirm]
  );

  const openFromMover = useCallback(
    (row: MarketMoverEntry) => {
      if (row.symbol.includes("/")) {
        const parsed = parseForexPairInput(row.symbol);
        openConfirm({
          symbol: parsed?.fmpSymbol ?? row.symbol.replace(/[^A-Za-z0-9]/g, ""),
          displayName: parsed?.displaySymbol ?? row.symbol,
        });
        return;
      }
      const name = row.name?.trim();
      const displayName =
        name && name.toUpperCase() !== row.symbol.trim().toUpperCase() ? name : row.symbol;
      openConfirm({ symbol: row.symbol, displayName });
    },
    [openConfirm]
  );

  const confirmBusy = sessions.some((s) => s.status === "loading");

  const closeConfirm = useCallback(() => {
    if (confirmBusy) return;
    setConfirmOpen(false);
    setPendingTarget(null);
  }, [confirmBusy]);

  const runAnalysis = useCallback(async () => {
    if (!pendingTarget) return;
    const target = pendingTarget;
    const sessionId = newSessionId();
    const loadingSession: QuickAnalysisSession = {
      id: sessionId,
      symbol: target.symbol,
      displayName: target.displayName,
      report: "",
      timestamp: Date.now(),
      status: "loading",
      lookback: analysisLookback,
      loadingPhase: "Starting quick analysis…",
      loadingCompletedSteps: [],
    };

    setSessions((prev) => [loadingSession, ...prev]);
    setConfirmOpen(false);
    setPendingTarget(null);

    try {
      const streamHandlers = createStreamHandlers(sessionId, setSessions);
      const result = await streamAtfxQuickAnalysis(
        authFetch,
        {
          symbol: target.symbol,
          displayName: loadingSession.displayName,
          lookback: analysisLookback,
        },
        streamHandlers
      );
      const readySession: QuickAnalysisSession = {
        ...quickAnalysisResultToSession(result),
        id: result.id || sessionId,
        playTypewriter: true,
        loadingPhase: undefined,
        loadingActiveStep: undefined,
        loadingCompletedSteps: undefined,
      };

      setSessions((prev) => prev.map((s) => (s.id === sessionId ? readySession : s)));
      if (result.id) {
        upsertQuickAnalysisHistoryCacheItem(options.userId, { ...result, id: result.id });
      }

      await options.onTokenUsageChanged?.(result.tokenBalance);
      if (!result.tokenBalance) {
        await options.onTokenUsageChanged?.();
      }
      void runPostGenerationTranslations(readySession.id, result.id, result.report);
    } catch (e) {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                status: "error",
                error: e instanceof Error ? e.message : "Quick analysis failed",
              }
            : s
        )
      );
    }
  }, [authFetch, pendingTarget, analysisLookback, runPostGenerationTranslations, options.onTokenUsageChanged]);

  const markSessionTypewriterDone = useCallback((sessionId: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, playTypewriter: false } : s))
    );
  }, []);

  const openOverallMarketReportModal = useCallback(() => {
    if (confirmBusy) return;
    setOverallModalOpen(true);
  }, [confirmBusy]);

  const closeOverallMarketReportModal = useCallback(() => {
    if (confirmBusy) return;
    setOverallModalOpen(false);
  }, [confirmBusy]);

  const runOverallMarketReport = useCallback(
    async (segments: OverallMarketSegment[]) => {
      const sessionId = newSessionId();
      const loadingSession: QuickAnalysisSession = {
        id: sessionId,
        symbol: "OVERALL:…",
        displayName: "Overall Market Report",
        report: "",
        timestamp: Date.now(),
        status: "loading",
        lookback: "24h",
        loadingPhase: "Starting overall market report…",
        loadingCompletedSteps: [],
      };

      setSessions((prev) => [loadingSession, ...prev]);
      setOverallModalOpen(false);

      try {
        const streamHandlers = createStreamHandlers(sessionId, setSessions);
        const result = await streamAtfxOverallMarketReport(authFetch, segments, streamHandlers);
        const readySession: QuickAnalysisSession = {
          ...quickAnalysisResultToSession(result),
          id: result.id || sessionId,
          playTypewriter: true,
          loadingPhase: undefined,
          loadingActiveStep: undefined,
          loadingCompletedSteps: undefined,
        };

        setSessions((prev) => prev.map((s) => (s.id === sessionId ? readySession : s)));
        if (result.id) {
          upsertQuickAnalysisHistoryCacheItem(options.userId, { ...result, id: result.id });
        }

        await options.onTokenUsageChanged?.(result.tokenBalance);
        if (!result.tokenBalance) {
          await options.onTokenUsageChanged?.();
        }
        void runPostGenerationTranslations(readySession.id, result.id, result.report);
      } catch (e) {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  status: "error",
                  error: e instanceof Error ? e.message : "Overall market report failed",
                }
              : s
          )
        );
      }
    },
    [authFetch, runPostGenerationTranslations, options.onTokenUsageChanged, options.userId]
  );

  return {
    sessions,
    pendingTarget,
    confirmOpen,
    overallModalOpen,
    analysisLookback,
    setAnalysisLookback,
    confirmBusy,
    openFromIndex,
    openFromSearch,
    openFromMover,
    closeConfirm,
    runAnalysis,
    openOverallMarketReportModal,
    closeOverallMarketReportModal,
    runOverallMarketReport,
    translateSessionLocale,
    ensureSessionDetail,
    markSessionTypewriterDone,
  };
}

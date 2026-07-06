import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../contexts/AuthContext";
import {
  fetchAtfxQuickAnalysisById,
  fetchAtfxQuickAnalysisHistoryLite,
  formatQuickAnalysisTime,
  quickAnalysisNeedsDetailLoad,
  type AtfxQuickAnalysisResult,
} from "../lib/atfxQuickAnalysisService";
import { formatQuickAnalysisLookback } from "../lib/atfxQuickAnalysisLookback";
import { filterRecentQuickAnalyses } from "../lib/researchReportFromQuickAnalysis";
import { ContentAreaLoader } from "./ContentAreaLoader";

export type AtfxQuickAnalysisPickerSheetProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (item: AtfxQuickAnalysisResult) => void;
  selectDisabled?: boolean;
  pageEssentialsReady?: boolean;
};

function QuickAnalysisPickerRow({
  item,
  onSelect,
  disabled,
  selecting,
}: {
  item: AtfxQuickAnalysisResult;
  onSelect: () => void;
  disabled: boolean;
  selecting: boolean;
}) {
  const isGain = item.changePct == null ? null : item.changePct >= 0;
  const ownerLabel = item.owner_email?.trim() || null;
  const windowLabel =
    item.resolvedWindowLabel?.trim() || (item.lookback ? formatQuickAnalysisLookback(item.lookback) : "");

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled || selecting}
      className="w-full text-left rounded-xl border border-slate-200 bg-white hover:border-[#ff7900]/35 hover:bg-orange-50/30 px-3 py-3 transition-colors disabled:opacity-50 disabled:hover:border-slate-200 disabled:hover:bg-white group"
    >
      <div className="flex items-start gap-3 min-w-0">
        {item.chartImageUrl ? (
          <div className="shrink-0 w-16 h-10 rounded-md overflow-hidden border border-slate-200 bg-slate-50">
            <img
              src={item.chartImageUrl}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
            />
          </div>
        ) : (
          <span className="shrink-0 flex h-10 w-16 items-center justify-center rounded-md border border-slate-200 bg-orange-50 text-[#ff7900]">
            <BarChart3 className="h-4 w-4" aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <span className="text-sm font-semibold text-slate-900 truncate min-w-0 group-hover:text-[#ff7900] transition-colors">
              {item.displayName || item.symbol || "—"}
            </span>
            {item.changePct != null ? (
              <span
                className={`text-[10px] font-mono font-bold shrink-0 ${isGain ? "text-emerald-600" : "text-rose-600"}`}
              >
                {isGain ? "▲" : "▼"} {item.changePct >= 0 ? "+" : ""}
                {item.changePct.toFixed(2)}%
              </span>
            ) : null}
            <span className="text-[10px] text-slate-500 shrink-0 ml-auto whitespace-nowrap">
              {formatQuickAnalysisTime(item.timestamp)}
            </span>
          </div>
          {windowLabel ? (
            <p className="text-[10px] text-slate-500 truncate mt-0.5">{windowLabel}</p>
          ) : null}
          {ownerLabel ? (
            <p className="text-[10px] text-slate-400 truncate mt-0.5">{ownerLabel}</p>
          ) : null}
          {item.report?.trim() ? (
            <p className="text-[11px] text-slate-600 line-clamp-2 leading-snug mt-1">{item.report.trim()}</p>
          ) : selecting ? (
            <p className="text-[11px] text-slate-500 mt-1 inline-flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
              Loading report…
            </p>
          ) : (
            <p className="text-[11px] text-slate-400 mt-1">Tap to use for research article</p>
          )}
        </div>
      </div>
    </button>
  );
}

export function AtfxQuickAnalysisPickerSheet({
  open,
  onClose,
  onSelect,
  selectDisabled = false,
  pageEssentialsReady = true,
}: AtfxQuickAnalysisPickerSheetProps) {
  const { authFetch } = useAuth();
  const [items, setItems] = useState<AtfxQuickAnalysisResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectingId, setSelectingId] = useState<string | null>(null);

  const recentItems = useMemo(() => filterRecentQuickAnalyses(items), [items]);

  const fetchHistory = useCallback(
    async (forceRefresh: boolean) => {
      if (forceRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const list = await fetchAtfxQuickAnalysisHistoryLite((url, opts) =>
          authFetch(url, forceRefresh ? { ...opts, forceRefresh: true } : opts)
        );
        setItems(list);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load quick analyses");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [authFetch]
  );

  const handleSelect = useCallback(
    async (item: AtfxQuickAnalysisResult) => {
      if (selectDisabled || selectingId) return;
      setSelectingId(item.id || item.symbol);
      try {
        const id = item.id?.trim();
        if (!id) {
          setError("This quick analysis cannot be loaded.");
          return;
        }
        const full = quickAnalysisNeedsDetailLoad(item)
          ? await fetchAtfxQuickAnalysisById(authFetch, id)
          : item;
        if (!full.report?.trim()) {
          setError("This quick analysis has no report content.");
          return;
        }
        onSelect(full);
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load quick analysis");
      } finally {
        setSelectingId(null);
      }
    },
    [authFetch, onClose, onSelect, selectDisabled, selectingId]
  );

  useEffect(() => {
    if (!open || items.length > 0 || loading) return;
    void fetchHistory(false);
  }, [open, items.length, loading, fetchHistory]);

  useEffect(() => {
    if (!pageEssentialsReady || open || items.length > 0 || loading || refreshing) return;

    let cancelled = false;
    const warmCache = () => {
      if (cancelled || items.length > 0) return;
      void fetchHistory(false);
    };

    const idleId =
      typeof requestIdleCallback !== "undefined"
        ? requestIdleCallback(warmCache, { timeout: 2500 })
        : window.setTimeout(warmCache, 800);

    return () => {
      cancelled = true;
      if (typeof idleId === "number") window.clearTimeout(idleId);
      else cancelIdleCallback(idleId);
    };
  }, [pageEssentialsReady, open, items.length, loading, refreshing, fetchHistory]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            key="atfx-qa-picker-backdrop"
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-[25] bg-slate-900/25 pointer-events-auto border-0 p-0 cursor-default"
            aria-label="Close quick analysis picker"
            onClick={onClose}
          />
          <motion.div
            id="atfx-qa-picker-sheet"
            key="atfx-qa-picker-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Quick Analysis picker"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "tween", duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
            className="absolute bottom-0 left-0 right-0 z-[26] flex max-h-[min(72vh,85%)] min-h-[240px] flex-col overflow-hidden rounded-t-2xl border-t border-slate-200 bg-white shadow-[0_-12px_40px_rgba(15,23,42,0.18)] pointer-events-auto"
          >
            <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 min-w-0">
                <Sparkles className="w-5 h-5 text-[#ff7900] shrink-0" />
                <span className="truncate">Quick Analysis — past 72 hours</span>
              </h3>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => void fetchHistory(true)}
                  disabled={loading || refreshing}
                  className="p-2 rounded-lg text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-50"
                  title="Refresh list"
                  aria-label="Refresh quick analysis list"
                >
                  <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-lg text-slate-600 hover:bg-slate-200 transition-colors"
                  aria-label="Close quick analysis picker"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <p className="shrink-0 px-4 py-2 text-[10px] text-slate-500 border-b border-slate-100 leading-tight">
              Select a recent Quick Analysis to generate a full research article from its market snapshot and drivers.
            </p>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3">
              {loading && items.length === 0 ? (
                <ContentAreaLoader variant="drawer" message="Loading quick analyses…" />
              ) : error ? (
                <div className="text-center py-12 px-2">
                  <p className="text-sm text-red-600 font-medium mb-2">{error}</p>
                  <button
                    type="button"
                    onClick={() => void fetchHistory(true)}
                    className="text-sm text-[#ff7900] font-semibold hover:underline"
                  >
                    Try again
                  </button>
                </div>
              ) : recentItems.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm px-4">
                  {items.length === 0
                    ? "No Quick Analyses yet. Generate one from the Markets page, then return here to start a research article."
                    : "No Quick Analyses from the past 72 hours. Try refreshing or generate a new analysis on Markets."}
                </div>
              ) : (
                <div className="space-y-2 pb-2">
                  {recentItems.map((item) => (
                    <QuickAnalysisPickerRow
                      key={item.id || `${item.symbol}-${item.timestamp}`}
                      item={item}
                      disabled={selectDisabled}
                      selecting={selectingId === (item.id || item.symbol)}
                      onSelect={() => void handleSelect(item)}
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}

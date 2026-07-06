import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Newspaper, PenTool, ChevronRight, Loader2, Plus, X, ChevronDown, Hash, Share2, Target, Zap, TrendingUp, Pencil, Check, Sparkles, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../../contexts/AuthContext";
import { Modal } from "../../components/Modal";
import { Toast } from "../../components/Toast";
import type { CapitalKeywordItem } from "./types";
import { formatCreateDate } from "./types";
import { topicSourcePillClass } from "../../lib/topicSourcePill";
import { CapitalKeywordsApproveEmailModal } from "./capitalKeywordsApproveEmailModal";
import { CapitalKeywordsEditModal } from "./capitalKeywordsEditModal";
import { CapitalTopicCardSummary } from "../../components/CapitalTopicCardSummary";
import { ContentAreaLoader } from "../../components/ContentAreaLoader";

const LAZY_PAGE_SIZE = 12;

export default function CapitalKeywordsPage() {
  const { authFetch, role } = useAuth();
  const [items, setItems] = useState<CapitalKeywordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(LAZY_PAGE_SIZE);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const MAX_SOURCE_ARTICLES = 3;
  const [selectedNews, setSelectedNews] = useState<CapitalKeywordItem[]>([]);
  const [dropZoneActive, setDropZoneActive] = useState(false);
  const [additionalContext, setAdditionalContext] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<CapitalKeywordItem | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [unapprovingId, setUnapprovingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [generateTopic, setGenerateTopic] = useState("");
  const [generating, setGenerating] = useState(false);
  const SOURCE_OPTIONS = ["Macro Themes", "Hot Topics", "Stock Analysis"] as const;
  const [selectedSource, setSelectedSource] = useState<string>(SOURCE_OPTIONS[0]);
  const [approveEmailItems, setApproveEmailItems] = useState<CapitalKeywordItem[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleSaveEdit = async (payload: Partial<CapitalKeywordItem>) => {
    if (!editItem) return;
    try {
      const res = await authFetch(`/api/capitalkeywords/${editItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Update failed");
      const updated = await res.json();
      setItems((prev) => prev.map((i) => (i.id === editItem.id ? { ...i, ...updated } : i)));
      setEditItem(null);
    } catch (e) {
      console.error(e);
      alert((e as Error).message || "Failed to save");
    }
  };

  const handleApprove = async (item: CapitalKeywordItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.approve?.toLowerCase() === "approved") return;
    setApprovingId(item.id);
    try {
      const res = await authFetch(`/api/capitalkeywords/${item.id}/approve`, { method: "PATCH" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Approve failed");
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, approve: "Approved" } : i)));
      setApprovingId(null);
      showToast("Item approved successfully");
    } catch (err) {
      console.error(err);
      setApprovingId(null);
      alert((err as Error).message || "Failed to approve");
    }
  };

  const handleUnapprove = async (item: CapitalKeywordItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setUnapprovingId(item.id);
    try {
      const res = await authFetch(`/api/capitalkeywords/${item.id}/unapprove`, { method: "PATCH" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to clear approval");
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, approve: "" } : i)));
      setUnapprovingId(null);
      showToast("Approval cleared");
    } catch (err) {
      console.error(err);
      setUnapprovingId(null);
      alert((err as Error).message || "Failed to clear approval");
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await authFetch("/api/capitalkeywords/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: generateTopic, source: selectedSource }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `Generation failed (${res.status})`);
      }
      const data = await res.json();
      const newItems: CapitalKeywordItem[] = Array.isArray(data) ? data : [data];
      setItems((prev) => [...newItems.map((i) => ({ ...i, approve: "" })), ...prev]);
      setGenerateTopic("");
      showToast(`SEO topic generated and saved (${newItems.length})`);
    } catch (err) {
      console.error(err);
      alert((err as Error).message || "Failed to generate topic");
    } finally {
      setGenerating(false);
    }
  };

  const handleDragStart = (e: DragEvent, item: CapitalKeywordItem) => {
    if (e.dataTransfer) {
      e.dataTransfer.setData("application/json", JSON.stringify(item));
      e.dataTransfer.effectAllowed = "copy";
    }
  };

  const handleDropZoneDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDropZoneActive(true);
  };

  const handleDropZoneDragLeave = () => setDropZoneActive(false);

  const handleDropZoneDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDropZoneActive(false);
    try {
      const raw = e.dataTransfer.getData("application/json");
      if (raw) {
        const item = JSON.parse(raw) as CapitalKeywordItem;
        setSelectedNews((prev) => {
          if (prev.some((n) => n.id === item.id)) return prev;
          if (prev.length >= MAX_SOURCE_ARTICLES) return prev;
          return [...prev, item];
        });
      }
    } catch (_) {}
  };

  const removeSelected = (id: string) => {
    setSelectedNews((prev) => prev.filter((n) => n.id !== id));
  };

  const toggleSelectedId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const selectedItems = items.filter((i) => selectedIds.has(i.id));

  const fetchItems = useCallback(async (forceRefresh = false) => {
    setFetchError(null);
    if (forceRefresh) setRefreshing(true);
    try {
      const res = await authFetch("/api/capitalkeywords", { forceRefresh });
      if (res.ok) {
        const data = await res.json();
        setItems(Array.isArray(data) ? data : []);
        setVisibleCount(LAZY_PAGE_SIZE);
      } else {
        const err = await res.json().catch(() => ({}));
        setFetchError(err?.error || `Failed to load keywords (${res.status})`);
      }
    } catch (err) {
      console.error(err);
      setFetchError("Could not reach the server.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authFetch]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const displayNews = items;
  const visibleNews = displayNews.slice(0, visibleCount);
  const hasMore = visibleCount < displayNews.length;

  const loadMore = useCallback(() => {
    setVisibleCount((c) => Math.min(c + LAZY_PAGE_SIZE, displayNews.length));
  }, [displayNews.length]);

  useEffect(() => {
    if (!hasMore || !loadMoreRef.current) return;
    const el = loadMoreRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "100px", threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  return (
    <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col lg:flex-row gap-8">
        <aside className="lg:sticky lg:top-24 lg:self-start order-2 lg:order-1 flex flex-col">
          <h1 className="text-2xl font-bold text-slate-900 mb-4">SEO Topics</h1>
          {role === "admin" && (
            <div className="card p-4 mb-4 w-full lg:w-[28rem]">
              <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" /> Generate a new SEO Topic
              </h2>
              <div className="flex gap-2 mb-3">
                {SOURCE_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setSelectedSource(opt)}
                    className={`flex-1 px-2 py-2 rounded-lg text-xs font-semibold text-center transition-colors border ${
                      selectedSource === opt
                        ? "bg-primary text-white border-primary"
                        : "bg-white text-slate-600 border-slate-300 hover:border-slate-400 hover:bg-slate-50"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              <div className="space-y-2">
                <textarea
                  rows={4}
                  placeholder="Keywords or theme (long-term SEO topic ideas; leave blank for auto-cluster)…"
                  value={generateTopic}
                  onChange={(e) => setGenerateTopic(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && e.ctrlKey && !generating) { e.preventDefault(); handleGenerate(); } }}
                  disabled={generating}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white placeholder:text-slate-400 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-y min-h-[5rem] disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={generating}
                  className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-lg transition-colors disabled:opacity-50"
                >
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {generating ? "Generating..." : "Generate"}
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-2">
                Research & generate a SEO topic
              </p>
            </div>
          )}
        </aside>
        <main className="flex-1 min-w-0 order-1 lg:order-2">
          <div className="flex flex-wrap items-center justify-end gap-2 mb-4">
            {role === "admin" && selectedItems.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const batch = selectedItems.filter((i) => i.approve?.toLowerCase() !== "approved");
                    if (batch.length === 0) {
                      showToast("All selected items are already approved");
                      return;
                    }
                    setApproveEmailItems(batch);
                  }}
                  disabled={!!approvingId}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50"
                  title="Approve selected topics"
                >
                  <Check className="w-4 h-4" />
                  Approve selected ({selectedItems.length})
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  disabled={!!approvingId}
                  className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-300 rounded-lg transition-colors disabled:opacity-50"
                  title="Clear selection"
                >
                  Clear selection
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => fetchItems(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-primary bg-white border border-slate-300 rounded-lg transition-colors disabled:opacity-50"
              title="Refresh (bypass cache)"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          {loading ? (
            <ContentAreaLoader variant="main" message="Fetching latest updates..." />
          ) : fetchError ? (
            <div className="flex flex-col items-center justify-center py-20 text-center max-w-md mx-auto">
              <p className="text-slate-600 font-medium mb-2">Couldn’t load keywords</p>
              <p className="text-slate-500 text-sm mb-4">{fetchError}</p>
            </div>
          ) : displayNews.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Newspaper className="w-14 h-14 text-slate-200 mb-4" />
              <p className="text-slate-600 font-medium mb-1">
                No keywords found
              </p>
              <p className="text-slate-500 text-sm">
                Keywords will appear here once Airtable has items.
              </p>
            </div>
          ) : (
            <>
            <div className="grid grid-cols-1 gap-6">
              {visibleNews.map((item, idx) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e.nativeEvent, item)}
                >
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpandedId(expandedId === item.id ? null : item.id); } }}
                  aria-expanded={expandedId === item.id}
                  className="card hover:shadow-xl hover:shadow-primary/5 hover:bg-slate-50 transition-all duration-300 cursor-pointer overflow-hidden border border-slate-200 bg-white"
                >
                  <div className="p-4 md:p-6">
                    <div className="flex flex-row items-start gap-3">
                      {role === "admin" && (
                        <div className="shrink-0 pt-1" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(item.id)}
                            onChange={() => toggleSelectedId(item.id)}
                            className="rounded border-slate-300 text-primary focus:ring-primary"
                            aria-label={`Select ${item.title}`}
                          />
                        </div>
                      )}
                      <div className="min-w-0 flex-1 flex flex-col gap-3">
                      <div className="flex flex-col md:flex-row items-start gap-4">
                        <div className="shrink-0 w-full md:w-32 flex flex-row md:flex-col items-center md:items-center justify-between md:justify-start gap-2 md:gap-1 md:min-h-[4.5rem]">
                          <div className="flex flex-col items-start md:items-center gap-1">
                            {item.source ? (
                              <span className={topicSourcePillClass(item.source)} title={item.source}>
                                {item.source}
                              </span>
                            ) : null}
                            <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                              {item.createDate ? formatCreateDate(item.createDate) : "—"}
                            </span>
                          </div>
                          {item.approve?.toLowerCase() === "approved" && (
                            <button
                              type="button"
                              onClick={(e) => handleUnapprove(item, e)}
                              disabled={!!unapprovingId}
                              title="Click to clear approval"
                              className="md:mt-auto shrink-0 inline-flex items-center gap-1 px-2 py-1 md:py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700 border border-green-200 uppercase tracking-wider hover:bg-green-200 hover:border-green-300 transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              {unapprovingId === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Approved
                            </button>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 flex flex-row items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <h3 className="text-base md:text-lg font-bold text-slate-900 leading-tight">
                              {item.title}
                            </h3>
                            <div className="mt-0.5">
                              <CapitalTopicCardSummary
                                markdown={item.summary}
                                cardExpanded={expandedId === item.id}
                              />
                            </div>
                          </div>
                          <div className="shrink-0 flex flex-col md:flex-row items-center gap-2 md:gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => setEditItem(item)}
                              className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                              title="Edit"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            {item.approve?.toLowerCase() === "approved" ? (
                              <span
                                className="p-2 rounded-lg border border-green-200 bg-green-100 text-green-600"
                                title="Already approved"
                              >
                                <Check className="w-4 h-4" />
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setApproveEmailItems([item]);
                                }}
                                disabled={!!approvingId}
                                className="p-2 rounded-lg border border-green-600 bg-green-500 text-white hover:bg-green-600 transition-colors disabled:opacity-50"
                                title="Approve"
                              >
                                {approvingId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                              </button>
                            )}
                            <span className="p-1 rounded-full text-slate-400 pointer-events-none md:block hidden" aria-hidden>
                              <ChevronDown className={`w-5 h-5 transition-transform duration-300 ${expandedId === item.id ? "rotate-180" : ""}`} />
                            </span>
                            <span className="md:hidden block" aria-hidden>
                              <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-300 ${expandedId === item.id ? "rotate-180" : ""}`} />
                            </span>
                          </div>
                        </div>
                      </div>

                      <AnimatePresence>
                        {expandedId === item.id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3, ease: "easeInOut" }}
                            className="overflow-hidden"
                          >
                            <div className="pt-6 mt-6 border-t border-slate-100 space-y-6">
                              {item.socialHook && (
                                <div className="space-y-2">
                                  <label className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                    <Share2 className="w-3 h-3" /> Social Hook
                                  </label>
                                  <p className="text-sm text-slate-700 italic bg-slate-50 p-3 rounded-lg border border-slate-200">
                                    "{item.socialHook}"
                                  </p>
                                </div>
                              )}

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <label className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                    <Hash className="w-3 h-3" /> Keywords
                                  </label>
                                  <div className="flex flex-wrap gap-2">
                                    {[item.keyword1, item.keyword2, item.keyword3].filter(Boolean).map((k, i) => (
                                      <span key={i} className="px-2 py-1 rounded bg-secondary/50 text-slate-700 text-xs font-medium border border-slate-200">
                                        {k}
                                      </span>
                                    ))}
                                  </div>
                                </div>

                                {item.keywordTag && (
                                  <div className="space-y-2">
                                    <label className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                      <Target className="w-3 h-3" /> Keyword Tag
                                    </label>
                                    <span className="inline-block px-2 py-1 rounded bg-slate-100 text-slate-600 text-xs font-medium border border-slate-200">
                                      {item.keywordTag}
                                    </span>
                                  </div>
                                )}
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {item.psyTrigger && (
                                  <div className="space-y-2">
                                    <label className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                      <Zap className="w-3 h-3" /> Psy Trigger
                                    </label>
                                    <p className="text-xs text-slate-600 bg-amber-50/50 p-2 rounded border border-amber-100">
                                      {item.psyTrigger}
                                    </p>
                                  </div>
                                )}

                                {item.stockTag && (
                                  <div className="space-y-2">
                                    <label className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                      <TrendingUp className="w-3 h-3" /> Stock Tag
                                    </label>
                                    <span className="inline-block px-2 py-1 rounded bg-blue-50 text-blue-600 text-xs font-bold border border-blue-100">
                                      {item.stockTag}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      </div>
                    </div>
                  </div>
                </motion.div>
                </div>
              ))}
            </div>
            {hasMore && <div ref={loadMoreRef} className="h-10 flex items-center justify-center py-8" aria-hidden />}
            </>
          )}
        </main>
      </div>

      {approveEmailItems && (
        <CapitalKeywordsApproveEmailModal
          items={approveEmailItems}
          onClose={() => setApproveEmailItems(null)}
          onApproved={(ids) => {
            setItems((prev) => prev.map((i) => (ids.includes(i.id) ? { ...i, approve: "Approved" } : i)));
            clearSelection();
            showToast(`Approved ${ids.length} item(s)`);
          }}
          onSent={(sent, total) => {
            showToast(sent > 0 ? `Sent ${sent}/${total} emails.` : "Email sending failed or was blocked.");
          }}
        />
      )}

      {editItem && (
        <CapitalKeywordsEditModal
          item={editItem}
          onClose={() => setEditItem(null)}
          onSave={handleSaveEdit}
        />
      )}

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}

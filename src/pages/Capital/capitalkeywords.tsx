import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Newspaper, PenTool, ChevronRight, Loader2, Plus, X, ChevronDown, Hash, Share2, Target, Zap, TrendingUp, Pencil, Check, Sparkles, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../../contexts/AuthContext";
import type { CapitalKeywordItem } from "./types";
import { formatCreateDate } from "./types";

const LAZY_PAGE_SIZE = 12;

export default function CapitalKeywordsPage() {
  const { authFetch } = useAuth();
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
  const SOURCE_OPTIONS = ["宏觀主題", "熱門話題", "股票分析"] as const;
  const [selectedSource, setSelectedSource] = useState<string>(SOURCE_OPTIONS[0]);
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
      const newItem: CapitalKeywordItem = await res.json();
      setItems((prev) => [newItem, ...prev]);
      setGenerateTopic("");
      showToast("SEO topic generated and saved");
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

  const sourceNewsPanel = (
    <div className="card p-6 shrink-0 w-full lg:w-[28rem]">
      <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
        <Newspaper className="w-5 h-5 text-primary" /> Source Topics
      </h2>
      {selectedNews.length > 0 ? (
        <ul className="space-y-3">
          {selectedNews.map((item) => (
            <li key={item.id} className="flex gap-3 p-2 rounded-lg bg-slate-50/80 border border-slate-300">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-900 line-clamp-2 leading-tight">
                  {item.title}
                </p>
                <button
                  type="button"
                  onClick={() => removeSelected(item.id)}
                  className="text-[10px] text-slate-400 hover:text-red-500 mt-1"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {selectedNews.length < MAX_SOURCE_ARTICLES ? (
        <div
          onDragOver={handleDropZoneDragOver}
          onDragLeave={handleDropZoneDragLeave}
          onDrop={handleDropZoneDrop}
          className={`text-center border-2 border-dashed rounded-xl transition-all mt-3 ${
            dropZoneActive
              ? "border-primary bg-primary/5"
              : "border-slate-300 bg-slate-50/50"
          } ${
            selectedNews.length === 0
              ? "py-8 min-h-[7.5rem]"
              : selectedNews.length === 1
                ? "py-4 min-h-[4.5rem]"
                : "py-3 min-h-[3.5rem]"
          }`}
        >
          <Plus
            className={`text-slate-300 mx-auto mb-1 ${
              selectedNews.length === 0 ? "w-8 h-8" : selectedNews.length === 1 ? "w-6 h-6" : "w-5 h-5"
            }`}
          />
          <p className="text-sm text-slate-400 px-4">
            {selectedNews.length === 0
              ? "Drag articles here (up to 3) to begin research."
              : `Drag more (${selectedNews.length}/${MAX_SOURCE_ARTICLES})`}
          </p>
        </div>
      ) : null}
    </div>
  );

  const sidebarBottomBar = selectedNews.length > 0 && (
    <div className="mt-6 pt-4 border-t border-slate-300 space-y-2 w-full lg:w-[28rem]">
      <button
        onClick={() => navigate("/research", { state: { newsItem: selectedNews[0], additionalContext } })}
        className="w-full flex items-center justify-center gap-1.5 text-sm font-bold text-white bg-primary hover:bg-primary/90 py-2.5 px-4 rounded-lg transition-colors"
      >
        Research & Write <ChevronRight className="w-4 h-4" />
      </button>
      <button
        onClick={() => setSelectedNews([])}
        className="w-full text-xs text-slate-500 hover:text-primary font-medium"
      >
        Clear selection
      </button>
    </div>
  );

  const generationOptionsPanel = (
    <div className="card p-6 shrink-0 w-full lg:w-[28rem] mt-6">
      <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
        <PenTool className="w-5 h-5 text-primary" /> Generation Options
      </h2>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
            Additional Context
          </label>
          <textarea
            placeholder="e.g. Focus on the impact on tech stocks, or write in a more casual tone..."
            className="w-full h-32 p-3 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all resize-none"
            value={additionalContext}
            onChange={(e) => setAdditionalContext(e.target.value)}
          />
        </div>
        <p className="text-xs text-slate-400">
          This will be carried over when you go to Research & Write.
        </p>
      </div>
    </div>
  );

  return (
    <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col lg:flex-row gap-8">
        <aside className="lg:sticky lg:top-24 lg:self-start order-2 lg:order-1 flex flex-col">
          <h1 className="text-2xl font-bold text-slate-900 mb-4">SEO Topics</h1>
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
                placeholder="Enter a topic or leave blank for auto..."
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
        </aside>
        <main className="flex-1 min-w-0 order-1 lg:order-2">
          <div className="flex items-center justify-end mb-4">
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
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
              <p className="text-slate-500 animate-pulse">Fetching latest updates...</p>
            </div>
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
                  <div className="p-6">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-start gap-3">
                        <div className="shrink-0 w-32 flex flex-col items-center gap-1 min-h-[4.5rem]">
                          {item.source ? (
                            <span className="w-full inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-primary text-white uppercase tracking-wider truncate" title={item.source}>
                              {item.source}
                            </span>
                          ) : null}
                          <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider min-h-[1.25rem]">
                            {item.createDate ? formatCreateDate(item.createDate) : "—"}
                          </span>
                          {item.approve?.toLowerCase() === "approved" && (
                            <button
                              type="button"
                              onClick={(e) => handleUnapprove(item, e)}
                              disabled={!!unapprovingId}
                              title="Click to clear approval"
                              className="mt-auto shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700 border border-green-200 uppercase tracking-wider hover:bg-green-200 hover:border-green-300 transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              {unapprovingId === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Approved
                            </button>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <h3 className="text-lg font-bold text-slate-900 leading-tight">
                              {item.title}
                            </h3>
                            <p className="text-sm text-slate-600 leading-relaxed line-clamp-3">
                              {item.summary}
                            </p>
                          </div>
                          <div className="shrink-0 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
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
                                onClick={(e) => handleApprove(item, e)}
                                disabled={!!approvingId}
                                className="p-2 rounded-lg border border-green-600 bg-green-500 text-white hover:bg-green-600 transition-colors disabled:opacity-50"
                                title="Approve"
                              >
                                {approvingId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                              </button>
                            )}
                            <span className="p-1 rounded-full text-slate-400 pointer-events-none" aria-hidden>
                              <ChevronDown className={`w-5 h-5 transition-transform duration-300 ${expandedId === item.id ? "rotate-180" : ""}`} />
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
                </motion.div>
                </div>
              ))}
            </div>
            {hasMore && <div ref={loadMoreRef} className="h-10 flex items-center justify-center py-8" aria-hidden />}
            </>
          )}
        </main>
      </div>

      {editItem && (
        <EditModal
          item={editItem}
          onClose={() => setEditItem(null)}
          onSave={handleSaveEdit}
        />
      )}

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-5 py-3 rounded-xl bg-green-600 text-white text-sm font-semibold shadow-lg shadow-green-600/30"
          >
            <Check className="w-4 h-4" />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function EditModal({
  item,
  onClose,
  onSave,
}: {
  item: CapitalKeywordItem;
  onClose: () => void;
  onSave: (payload: Partial<CapitalKeywordItem>) => Promise<void>;
}) {
  const [source, setSource] = useState(item.source);
  const [title, setTitle] = useState(item.title);
  const [summary, setSummary] = useState(item.summary);
  const [socialHook, setSocialHook] = useState(item.socialHook);
  const [keyword1, setKeyword1] = useState(item.keyword1);
  const [keyword2, setKeyword2] = useState(item.keyword2);
  const [keyword3, setKeyword3] = useState(item.keyword3);
  const [keywordTag, setKeywordTag] = useState(item.keywordTag);
  const [psyTrigger, setPsyTrigger] = useState(item.psyTrigger);
  const [stockTag, setStockTag] = useState(item.stockTag);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSource(item.source);
    setTitle(item.title);
    setSummary(item.summary);
    setSocialHook(item.socialHook);
    setKeyword1(item.keyword1);
    setKeyword2(item.keyword2);
    setKeyword3(item.keyword3);
    setKeywordTag(item.keywordTag);
    setPsyTrigger(item.psyTrigger);
    setStockTag(item.stockTag);
  }, [item]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        source,
        title,
        summary,
        socialHook,
        keyword1,
        keyword2,
        keyword3,
        keywordTag,
        psyTrigger,
        stockTag,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Edit item"
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between shrink-0 px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">Edit item</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form id="edit-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Source</label>
            <input value={source} onChange={(e) => setSource(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Summary</label>
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg resize-none" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Social hook</label>
            <textarea value={socialHook} onChange={(e) => setSocialHook(e.target.value)} rows={2} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg resize-none" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Keyword 1</label>
              <input value={keyword1} onChange={(e) => setKeyword1(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Keyword 2</label>
              <input value={keyword2} onChange={(e) => setKeyword2(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Keyword 3</label>
              <input value={keyword3} onChange={(e) => setKeyword3(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Keyword tag</label>
            <input value={keywordTag} onChange={(e) => setKeywordTag(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Psy trigger</label>
            <input value={psyTrigger} onChange={(e) => setPsyTrigger(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Stock tag</label>
            <input value={stockTag} onChange={(e) => setStockTag(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
          </div>
        </form>
        <div className="shrink-0 flex justify-end gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            type="submit"
            form="edit-form"
            disabled={saving}
            className="px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

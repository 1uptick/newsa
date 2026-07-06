import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Newspaper, PenTool, ChevronRight, Loader2, Plus, X, Hash, Share2, Target, Zap, TrendingUp, MessageSquare, Check, Sparkles, XCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../../contexts/AuthContext";
import { Toast } from "../../components/Toast";
import type { CapitalKeywordItem } from "../Capital/types";
import { formatCreateDate } from "../Capital/types";
import { topicSourcePillClass } from "../../lib/topicSourcePill";
import { WrappingTextField } from "../../components/WrappingTextField";
import { TrendingBubbleChart } from "../../components/TrendingBubbleChart";
import { parseTrendingKeywords } from "../../lib/trendingKeywords";
import { ContentAreaLoader } from "../../components/ContentAreaLoader";

const LAZY_PAGE_SIZE = 12;

export default function OneUptickTopicsPage() {
  const { authFetch, role } = useAuth();
  const [items, setItems] = useState<CapitalKeywordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(LAZY_PAGE_SIZE);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const MAX_SOURCE_ARTICLES = 3;
  const [selectedNews, setSelectedNews] = useState<CapitalKeywordItem[]>([]);
  const [dropZoneActive, setDropZoneActive] = useState(false);
  const [additionalContext, setAdditionalContext] = useState("");
  const [selectedItem, setSelectedItem] = useState<CapitalKeywordItem | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [unapprovingId, setUnapprovingId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<"approve" | null>(null);
  const [commentsDraft, setCommentsDraft] = useState("");
  const [draftSource, setDraftSource] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftSummary, setDraftSummary] = useState("");
  const [draftSocialHook, setDraftSocialHook] = useState("");
  const [draftKeyword1, setDraftKeyword1] = useState("");
  const [draftKeyword2, setDraftKeyword2] = useState("");
  const [draftKeyword3, setDraftKeyword3] = useState("");
  const [draftKeywordTag, setDraftKeywordTag] = useState("");
  const [draftPsyTrigger, setDraftPsyTrigger] = useState("");
  const [draftStockTag, setDraftStockTag] = useState("");
  const [savingModal, setSavingModal] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [generateDropActive, setGenerateDropActive] = useState(false);
  const [generateTopic, setGenerateTopic] = useState("");
  const [generating, setGenerating] = useState(false);
  const SOURCE_OPTIONS = ["Macro Themes", "Hot Topics", "Stock Analysis"] as const;
  const [selectedSource, setSelectedSource] = useState<string>(SOURCE_OPTIONS[0]);
  type StatusFilter = "pending" | "approved" | "rejected";
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [trendView, setTrendView] = useState<"HK" | "Global">("HK");
  const [trendingData, setTrendingData] = useState<{ date: string; keywords: string } | null>(null);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const navigate = useNavigate();

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleSaveModal = async () => {
    if (!selectedItem) return;
    setSavingModal(true);
    try {
      const payload = {
        source: draftSource,
        title: draftTitle,
        summary: draftSummary,
        socialHook: draftSocialHook,
        keyword1: draftKeyword1,
        keyword2: draftKeyword2,
        keyword3: draftKeyword3,
        keywordTag: draftKeywordTag,
        psyTrigger: draftPsyTrigger,
        stockTag: draftStockTag,
        custom: commentsDraft,
      };
      const res = await authFetch(`/api/capitalkeywords/${selectedItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Update failed");
      const updated = await res.json();
      const id = selectedItem.id;
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...updated } : i)));
      setSelectedItem((prev) => (prev && prev.id === id ? { ...prev, ...updated } : prev));
      showToast("Saved");
    } catch (e) {
      console.error(e);
      alert((e as Error).message || "Failed to save");
    } finally {
      setSavingModal(false);
    }
  };

  const handleApprove = async (item: CapitalKeywordItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.status?.toLowerCase() === "approved") return;
    setApprovingId(item.id);
    try {
      const res = await authFetch(`/api/capitalkeywords/${item.id}/status-approve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: item.title, summary: item.summary ?? "" }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Approve failed");
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: "Approved" } : i)));
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
      const res = await authFetch(`/api/capitalkeywords/${item.id}/status-unapprove`, { method: "PATCH" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to clear approval");
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: "" } : i)));
      setUnapprovingId(null);
      showToast("Approval cleared");
    } catch (err) {
      console.error(err);
      setUnapprovingId(null);
      alert((err as Error).message || "Failed to clear approval");
    }
  };

  useEffect(() => {
    if (!selectedItem) return;
    setDraftSource(selectedItem.source ?? "");
    setDraftTitle(selectedItem.title ?? "");
    setDraftSummary(selectedItem.summary ?? "");
    setDraftSocialHook(selectedItem.socialHook ?? "");
    setDraftKeyword1(selectedItem.keyword1 ?? "");
    setDraftKeyword2(selectedItem.keyword2 ?? "");
    setDraftKeyword3(selectedItem.keyword3 ?? "");
    setDraftKeywordTag(selectedItem.keywordTag ?? "");
    setDraftPsyTrigger(selectedItem.psyTrigger ?? "");
    setDraftStockTag(selectedItem.stockTag ?? "");
    setCommentsDraft(selectedItem.custom ?? "");
  }, [selectedItem]);

  const handleApproveModal = async (item: CapitalKeywordItem) => {
    setActionLoading("approve");
    try {
      const patchRes = await authFetch(`/api/capitalkeywords/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: draftSource,
          title: draftTitle,
          summary: draftSummary,
          socialHook: draftSocialHook,
          keyword1: draftKeyword1,
          keyword2: draftKeyword2,
          keyword3: draftKeyword3,
          keywordTag: draftKeywordTag,
          psyTrigger: draftPsyTrigger,
          stockTag: draftStockTag,
          custom: commentsDraft,
        }),
      });
      if (!patchRes.ok) throw new Error((await patchRes.json().catch(() => ({}))).error || "Failed to save fields");

      const res = await authFetch(`/api/capitalkeywords/${item.id}/n8n-approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: draftTitle, summary: draftSummary ?? "" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          [err?.error, err?.hint, err?.detail].filter(Boolean).join(" — ") || "Approve failed"
        );
      }
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? {
                ...i,
                status: "Approved",
                source: draftSource,
                title: draftTitle,
                summary: draftSummary,
                socialHook: draftSocialHook,
                keyword1: draftKeyword1,
                keyword2: draftKeyword2,
                keyword3: draftKeyword3,
                keywordTag: draftKeywordTag,
                psyTrigger: draftPsyTrigger,
                stockTag: draftStockTag,
                custom: commentsDraft,
              }
            : i
        )
      );
      setSelectedItem(null);
      showToast("Item approved");
    } catch (err) {
      console.error(err);
      alert((err as Error).message || "Failed to approve");
    } finally {
      setActionLoading(null);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await authFetch("/api/capitalkeywords/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: generateTopic, source: selectedSource, company: "1uptick" }),
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

  useEffect(() => {
    const category = trendView === "HK" ? "HK_trend" : "Global_trend";
    const fetchTrending = async () => {
      setTrendingLoading(true);
      try {
        const res = await authFetch(`/api/trending-topics?category=${encodeURIComponent(category)}`);
        if (res.ok) {
          const data = await res.json();
          setTrendingData(data);
        } else {
          setTrendingData(null);
        }
      } catch {
        setTrendingData(null);
      } finally {
        setTrendingLoading(false);
      }
    };
    fetchTrending();
  }, [authFetch, trendView]);

  useEffect(() => {
    const fetchItems = async () => {
      setFetchError(null);
      try {
        // Use the server cache on mount; it is invalidated on every approve/reject/edit
        // (invalidateCapitalKeywordsListCaches), so navigations stay fresh without re-hitting Airtable.
        const res = await authFetch("/api/capitalkeywords?company=1uptick");
        if (res.ok) {
          const data = await res.json();
          setItems(Array.isArray(data) ? data : []);
          setVisibleCount(LAZY_PAGE_SIZE);
        } else {
          const err = await res.json().catch(() => ({}));
          setFetchError(err?.error || `Failed to load items (${res.status})`);
        }
      } catch (err) {
        console.error(err);
        setFetchError("Could not reach the server.");
      } finally {
        setLoading(false);
      }
    };
    fetchItems();
  }, [authFetch]);

  // Filtering only depends on `items`; memoize so scroll/visibleCount changes don't re-run three full passes.
  const displayNewsByStatus = useMemo(() => {
    const statusLower = (s: string | undefined) => (s ?? "").trim().toLowerCase();
    const approveLower = (s: string | undefined) => (s ?? "").trim().toLowerCase();
    return {
      pending: items.filter(
        (item) =>
          approveLower(item.approve) === "approved" &&
          statusLower(item.status) !== "approved" &&
          statusLower(item.status) !== "rejected"
      ),
      approved: items.filter((item) => statusLower(item.status) === "approved"),
      rejected: items.filter((item) => statusLower(item.status) === "rejected"),
    };
  }, [items]);
  const displayNews = displayNewsByStatus[statusFilter];
  const visibleNews = displayNews.slice(0, visibleCount);
  const hasMore = visibleCount < displayNews.length;

  useEffect(() => {
    setVisibleCount(LAZY_PAGE_SIZE);
  }, [statusFilter]);

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
        <aside className="lg:sticky lg:top-24 lg:self-start order-2 lg:order-1 flex flex-col w-full lg:w-[28rem] lg:min-h-[calc(100vh-5rem)] pb-12">
          <h1 className="text-2xl font-bold text-slate-900 mb-1 pb-2 shrink-0">Topics</h1>
          {role !== "admin" && (
            <p className="text-sm text-slate-600 mb-4">
              Review and approve the identified themes and topics to initiate our deep-dive research phase. Our specialized financial editorial team will subsequently produce high-authority content tailored for your audience.
            </p>
          )}
          <div className="flex flex-col flex-1 min-h-0">
            {role === "admin" && (
            <>
            <div
              className={`card p-4 w-full flex-[0_0_25%] min-h-0 overflow-auto shrink-0 transition-all duration-200 ${
                generateDropActive ? "ring-2 ring-primary border-primary bg-primary/5" : ""
              }`}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setGenerateDropActive(true); }}
              onDragLeave={() => setGenerateDropActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setGenerateDropActive(false);
                const keyword = e.dataTransfer.getData("text/plain");
                if (keyword) {
                  setGenerateTopic((prev) => prev ? `${prev}, ${keyword}` : keyword);
                  showToast(`"${keyword}" added to topic`);
                }
              }}
            >
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
            <div className="card p-4 w-full flex-1 min-h-0 flex flex-col overflow-hidden mt-4">
              <div className="flex items-center justify-between gap-2 mb-3 shrink-0">
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" /> Trending Keywords
                </h2>
                <div className="flex rounded-lg bg-slate-100 border border-slate-200 p-0.5">
                  <button
                    type="button"
                    onClick={() => setTrendView("HK")}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                      trendView === "HK" ? "bg-red-500 text-white shadow-sm" : "text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    HK
                  </button>
                  <button
                    type="button"
                    onClick={() => setTrendView("Global")}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                      trendView === "Global" ? "bg-blue-500 text-white shadow-sm" : "text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    Global
                  </button>
                </div>
              </div>
              {trendingLoading ? (
                <ContentAreaLoader variant="compact" size="sm" />
              ) : trendingData?.keywords ? (
                <>
                  <div className="relative flex-1 min-h-0 flex flex-col">
                    <TrendingBubbleChart items={parseTrendingKeywords(trendingData.keywords)} variant={trendView} />
                    {trendingData.date && (
                      <p className="absolute bottom-1 right-2 text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                        {formatCreateDate(trendingData.date)}
                      </p>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-2 shrink-0 leading-tight">
                    * Drag a bubble to the "Generate a new SEO Topic" box above to use the keyword to generate a new topic.
                  </p>
                </>
              ) : (
                <p className="text-sm text-slate-500 flex-1 flex items-center">
                  No trending data for {trendView === "HK" ? "HK" : "Global"}.
                </p>
              )}
            </div>
            </>
            )}
          </div>
        </aside>
        <main className="flex-1 min-w-0 order-1 lg:order-2">
          {loading ? (
            <ContentAreaLoader variant="main" message="Fetching latest updates..." />
          ) : fetchError ? (
            <div className="flex flex-col items-center justify-center py-20 text-center max-w-md mx-auto">
              <p className="text-slate-600 font-medium mb-2">Couldn&apos;t load items</p>
              <p className="text-slate-500 text-sm mb-4">{fetchError}</p>
            </div>
          ) : (
            <>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6 sm:justify-start">
              <div className="flex gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200 w-fit shrink-0">
                {(["pending", "approved", "rejected"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setStatusFilter(tab)}
                    className={`px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                      statusFilter === tab
                        ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent"
                    }`}
                  >
                    {tab === "pending" ? "Pending Approval" : tab === "approved" ? "Approved" : "Rejected"}
                  </button>
                ))}
              </div>
            </div>
            {displayNews.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Newspaper className="w-14 h-14 text-slate-200 mb-4" />
                <p className="text-slate-600 font-medium mb-1">
                  {statusFilter === "pending" ? "No items pending approval" : statusFilter === "approved" ? "No approved items" : "No rejected items"}
                </p>
                <p className="text-slate-500 text-sm">
                  {statusFilter === "pending" ? "Items awaiting review will appear here." : statusFilter === "approved" ? "Approved items will appear here." : "Rejected items will appear here."}
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
                  onClick={() => setSelectedItem(item)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedItem(item); } }}
                  className={`card transition-all duration-300 cursor-pointer overflow-hidden border bg-white ${
                    statusFilter === "pending"
                      ? "border-slate-200 hover:border-2 hover:border-[#f8b62d] hover:shadow-lg hover:shadow-[#f8b62d]/30 hover:bg-[#f8b62d]/10 hover:ring-2 hover:ring-[#f8b62d]"
                      : "border-slate-200 hover:border-2 hover:border-[#f8b62d] hover:shadow-xl hover:shadow-[#f8b62d]/20 hover:bg-[#f8b62d]/5 hover:ring-2 hover:ring-[#f8b62d]"
                  }`}
                >
                  <div className="p-4 md:p-6">
                    <div className="flex flex-col gap-3">
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
                          {item.status?.toLowerCase() === "approved" && (
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
                          {item.status?.toLowerCase() === "rejected" && (
                            <span className="md:mt-auto shrink-0 inline-flex items-center gap-1 px-2 py-1 md:py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200 uppercase tracking-wider">
                              <XCircle className="w-3 h-3" /> Rejected
                            </span>
                          )}
                        </div>
                          <div className={`flex-1 min-w-0 flex flex-row items-start gap-3 ${statusFilter !== "pending" ? "justify-between" : ""}`}>
                            <div className="min-w-0 space-y-1">
                              <h3 className="text-base md:text-lg font-bold text-slate-900 leading-tight">
                                {item.title}
                              </h3>
                              <p className="text-xs md:text-sm text-slate-600 leading-relaxed line-clamp-2 md:line-clamp-3">
                                {item.summary}
                              </p>
                            </div>
                          {statusFilter === "approved" && (
                          <div className="shrink-0 flex items-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={(e) => handleUnapprove(item, e)}
                              disabled={!!unapprovingId}
                              title="Clear approval (remove from Status)"
                              className="p-2 rounded-lg bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-500 transition-colors disabled:opacity-50"
                            >
                              {unapprovingId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                            </button>
                          </div>
                          )}
                          {statusFilter === "rejected" && (
                          <div className="shrink-0 flex items-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={(e) => handleUnapprove(item, e)}
                              disabled={!!unapprovingId}
                              title="Clear status (remove from Rejected)"
                              className="p-2 rounded-lg bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-500 transition-colors disabled:opacity-50"
                            >
                              {unapprovingId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                            </button>
                          </div>
                          )}
                        </div>
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
            </>
          )}
        </main>
      </div>

      <AnimatePresence>
        {selectedItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => !savingModal && !actionLoading && setSelectedItem(null)}
            role="dialog"
            aria-modal="true"
            aria-label="Topic details"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 shrink-0 px-6 py-4 border-b border-slate-200 bg-slate-50">
                <h3 className="text-sm font-semibold text-slate-800 min-w-0 flex-1 whitespace-normal break-words">
                  {draftTitle || "Untitled"}
                </h3>
                <button
                  type="button"
                  onClick={() => !savingModal && !actionLoading && setSelectedItem(null)}
                  disabled={!!savingModal || !!actionLoading}
                  className="p-2 rounded-lg hover:bg-slate-200 text-slate-600 transition-colors disabled:opacity-50"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                  Created {selectedItem.createDate ? formatCreateDate(selectedItem.createDate) : "—"}
                </p>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Source</label>
                  <WrappingTextField
                    value={draftSource}
                    onChange={(e) => setDraftSource(e.target.value)}
                    disabled={!!savingModal || !!actionLoading}
                    rows={2}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Title</label>
                  <WrappingTextField
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    disabled={!!savingModal || !!actionLoading}
                    rows={2}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Summary</label>
                  <WrappingTextField
                    value={draftSummary}
                    onChange={(e) => setDraftSummary(e.target.value)}
                    disabled={!!savingModal || !!actionLoading}
                    rows={4}
                  />
                </div>
                <div>
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                    <Share2 className="w-3 h-3" /> Social hook
                  </label>
                  <WrappingTextField
                    value={draftSocialHook}
                    onChange={(e) => setDraftSocialHook(e.target.value)}
                    disabled={!!savingModal || !!actionLoading}
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                      <Hash className="w-3 h-3" /> Keyword 1
                    </label>
                    <WrappingTextField
                      value={draftKeyword1}
                      onChange={(e) => setDraftKeyword1(e.target.value)}
                      disabled={!!savingModal || !!actionLoading}
                      rows={2}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Keyword 2</label>
                    <WrappingTextField
                      value={draftKeyword2}
                      onChange={(e) => setDraftKeyword2(e.target.value)}
                      disabled={!!savingModal || !!actionLoading}
                      rows={2}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Keyword 3</label>
                    <WrappingTextField
                      value={draftKeyword3}
                      onChange={(e) => setDraftKeyword3(e.target.value)}
                      disabled={!!savingModal || !!actionLoading}
                      rows={2}
                    />
                  </div>
                </div>
                <div>
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                    <Target className="w-3 h-3" /> Keyword tag
                  </label>
                  <WrappingTextField
                    value={draftKeywordTag}
                    onChange={(e) => setDraftKeywordTag(e.target.value)}
                    disabled={!!savingModal || !!actionLoading}
                    rows={2}
                  />
                </div>
                <div>
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                    <Zap className="w-3 h-3" /> Psy trigger
                  </label>
                  <WrappingTextField
                    value={draftPsyTrigger}
                    onChange={(e) => setDraftPsyTrigger(e.target.value)}
                    disabled={!!savingModal || !!actionLoading}
                    rows={2}
                  />
                </div>
                <div>
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                    <TrendingUp className="w-3 h-3" /> Stock tag
                  </label>
                  <WrappingTextField
                    value={draftStockTag}
                    onChange={(e) => setDraftStockTag(e.target.value)}
                    disabled={!!savingModal || !!actionLoading}
                    rows={2}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Comments</label>
                  <WrappingTextField
                    value={commentsDraft}
                    onChange={(e) => setCommentsDraft(e.target.value)}
                    disabled={!!savingModal || !!actionLoading}
                    placeholder="Add comments (saved with Save or when you Approve / Reject)"
                    rows={3}
                    className="bg-white placeholder:text-slate-400 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none min-h-[5rem]"
                  />
                </div>
              </div>

              <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50">
                <button
                  type="button"
                  onClick={() => handleSaveModal()}
                  disabled={!!savingModal || !!actionLoading}
                  className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-lg transition-colors disabled:opacity-50"
                >
                  {savingModal ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {savingModal ? "Saving…" : "Save"}
                </button>
                <div className="flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => handleApproveModal(selectedItem)}
                    disabled={!!actionLoading || !!savingModal}
                    className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {actionLoading === "approve" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Approve
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}

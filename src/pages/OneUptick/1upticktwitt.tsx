import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Newspaper, PenTool, ChevronRight, Loader2, Plus, X, Hash, Share2, Target, Zap, TrendingUp, MessageSquare, Check, Sparkles, XCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../../contexts/AuthContext";
import { Toast } from "../../components/Toast";
import type { CapitalKeywordItem } from "../Capital/types";
import { formatCreateDate } from "../Capital/types";
import { TrendingBubbleChart } from "../../components/TrendingBubbleChart";
import { parseTrendingKeywords } from "../../lib/trendingKeywords";
import { ContentAreaLoader } from "../../components/ContentAreaLoader";

const LAZY_PAGE_SIZE = 12;

type TwittGeneratedItem = {
  id: string;
  createdDate: string;
  ideas: string;
  image_url: string;
  x_en: string;
  x_jp: string;
  instagram_tc: string;
  facebook_tc: string;
};

export default function OneUptickTwittPage() {
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
  const [generatedContent, setGeneratedContent] = useState<{
    recordId: string | null;
    x_en: string;
    x_ja: string;
    ig_zh_hant: string;
    fb_zh_hant: string;
  } | null>(null);
  const [twittItems, setTwittItems] = useState<TwittGeneratedItem[]>([]);
  const [selectedTwittItem, setSelectedTwittItem] = useState<TwittGeneratedItem | null>(null);
  const [twittDraft, setTwittDraft] = useState<TwittGeneratedItem | null>(null);
  const [savingTwitt, setSavingTwitt] = useState(false);
  const [postingId, setPostingId] = useState<string | null>(null);
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
      const res = await authFetch("/api/oneuptick/twitt/generate-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: generateTopic }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `Generation failed (${res.status})`);
      }
      const data = await res.json();
      setGeneratedContent({
        recordId: data?.recordId ?? null,
        x_en: data?.x_en ?? "",
        x_ja: data?.x_ja ?? "",
        ig_zh_hant: data?.ig_zh_hant ?? "",
        fb_zh_hant: data?.fb_zh_hant ?? "",
      });
      const created: TwittGeneratedItem = data?.item ?? {
        id: data?.recordId ?? `tmp-${Date.now()}`,
        createdDate: new Date().toISOString(),
        ideas: generateTopic,
        image_url: "",
        x_en: data?.x_en ?? "",
        x_jp: data?.x_jp ?? data?.x_ja ?? "",
        instagram_tc: data?.instagram_tc ?? data?.ig_zh_hant ?? "",
        facebook_tc: data?.facebook_tc ?? data?.fb_zh_hant ?? "",
      };
      setTwittItems((prev) => [created, ...prev]);
      setGenerateTopic("");
      showToast("Content generated and saved");
    } catch (err) {
      console.error(err);
      alert((err as Error).message || "Failed to generate content");
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
        const res = await authFetch("/api/oneuptick/twitt/items", { forceRefresh: true });
        if (res.ok) {
          const data = await res.json();
          setTwittItems(Array.isArray(data) ? data : []);
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

  useEffect(() => {
    if (!selectedTwittItem) return;
    setTwittDraft({ ...selectedTwittItem });
  }, [selectedTwittItem]);

  const handleSaveTwitt = async () => {
    if (!twittDraft) return;
    setSavingTwitt(true);
    try {
      const res = await authFetch(`/api/oneuptick/twitt/items/${twittDraft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ideas: twittDraft.ideas,
          image_url: twittDraft.image_url,
          x_en: twittDraft.x_en,
          x_jp: twittDraft.x_jp,
          instagram_tc: twittDraft.instagram_tc,
          facebook_tc: twittDraft.facebook_tc,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to save");
      const updated: TwittGeneratedItem = await res.json();
      setTwittItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedTwittItem(updated);
      setTwittDraft(updated);
      showToast("Saved");
    } catch (err) {
      console.error(err);
      alert((err as Error).message || "Failed to save");
    } finally {
      setSavingTwitt(false);
    }
  };

  const handlePostTwitt = async (id: string) => {
    setPostingId(id);
    try {
      const res = await authFetch(`/api/oneuptick/twitt/items/${id}/post`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error([err?.error, err?.detail, err?.hint].filter(Boolean).join(" — ") || `Post failed (${res.status})`);
      }
      showToast("Posted to webhook");
    } catch (err) {
      console.error(err);
      alert((err as Error).message || "Post failed");
    } finally {
      setPostingId(null);
    }
  };

  const statusLower = (s: string | undefined) => (s ?? "").trim().toLowerCase();
  const approveLower = (s: string | undefined) => (s ?? "").trim().toLowerCase();
  const displayNewsByStatus = {
    pending: items.filter(
      (item) =>
        approveLower(item.approve) === "approved" &&
        statusLower(item.status) !== "approved" &&
        statusLower(item.status) !== "rejected"
    ),
    approved: items.filter((item) => statusLower(item.status) === "approved"),
    rejected: items.filter((item) => statusLower(item.status) === "rejected"),
  };
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
          <h1 className="text-2xl font-bold text-slate-900 mb-1 pb-2 shrink-0">Twitt</h1>
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
                <Sparkles className="w-5 h-5 text-primary" /> Generate content
              </h2>
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
              {generatedContent ? (
                <div className="mt-4 space-y-3">
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">X (EN)</p>
                    <pre className="whitespace-pre-wrap text-sm text-slate-800">{generatedContent.x_en}</pre>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">X (JA)</p>
                    <pre className="whitespace-pre-wrap text-sm text-slate-800">{generatedContent.x_ja}</pre>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Instagram (繁體中文)</p>
                    <pre className="whitespace-pre-wrap text-sm text-slate-800">{generatedContent.ig_zh_hant}</pre>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Facebook (繁體中文)</p>
                    <pre className="whitespace-pre-wrap text-sm text-slate-800">{generatedContent.fb_zh_hant}</pre>
                  </div>
                  {generatedContent.recordId ? (
                    <p className="text-[11px] text-slate-500">Saved to Airtable: {generatedContent.recordId}</p>
                  ) : null}
                </div>
              ) : null}
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
            <div className="p-4 md:p-6">
              <div className="mb-4">
                <h2 className="text-base font-bold text-slate-900">Generated Content</h2>
                <p className="text-sm text-slate-600">Click any item to open and edit.</p>
              </div>
              {twittItems.length === 0 ? (
                <div className="py-12 text-center">
                  <Newspaper className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                  <p className="text-slate-600 font-medium">No generated content yet</p>
                  <p className="text-slate-500 text-sm">Use the Generate content box on the left.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {twittItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedTwittItem(item)}
                      className="w-full text-left rounded-xl border border-slate-200 bg-white hover:border-primary/40 hover:shadow-md transition-all p-4"
                    >
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <p className="text-sm font-semibold text-slate-900 line-clamp-1">{item.ideas || "Untitled idea"}</p>
                        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <span className="text-[11px] text-slate-500">
                            {item.createdDate ? formatCreateDate(item.createdDate) : "—"}
                          </span>
                          <button
                            type="button"
                            onClick={() => handlePostTwitt(item.id)}
                            disabled={postingId === item.id}
                            className="px-2.5 py-1 text-[11px] font-semibold rounded-md bg-primary text-white hover:bg-primary-dark transition-colors disabled:opacity-50"
                          >
                            {postingId === item.id ? "Posting..." : "Post"}
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-slate-600 line-clamp-2">{item.x_en}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      <AnimatePresence>
        {selectedTwittItem && twittDraft && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => !savingTwitt && setSelectedTwittItem(null)}
            role="dialog"
            aria-modal="true"
            aria-label="Generated content details"
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
                <h3 className="text-sm font-semibold text-slate-800 truncate min-w-0 flex-1">
                  {twittDraft.ideas || "Untitled idea"}
                </h3>
                <button
                  type="button"
                  onClick={() => !savingTwitt && setSelectedTwittItem(null)}
                  disabled={savingTwitt}
                  className="p-2 rounded-lg hover:bg-slate-200 text-slate-600 transition-colors disabled:opacity-50"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                  Created {selectedTwittItem.createdDate ? formatCreateDate(selectedTwittItem.createdDate) : "—"}
                </p>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Idea</label>
                  <textarea
                    value={twittDraft.ideas}
                    onChange={(e) => setTwittDraft((prev) => (prev ? { ...prev, ideas: e.target.value } : prev))}
                    rows={2}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg resize-y"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">X (EN)</label>
                  <textarea
                    value={twittDraft.x_en}
                    onChange={(e) => setTwittDraft((prev) => (prev ? { ...prev, x_en: e.target.value } : prev))}
                    rows={4}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg resize-y"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Image URL</label>
                  <input
                    value={twittDraft.image_url}
                    onChange={(e) => setTwittDraft((prev) => (prev ? { ...prev, image_url: e.target.value } : prev))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">X (JP)</label>
                  <textarea
                    value={twittDraft.x_jp}
                    onChange={(e) => setTwittDraft((prev) => (prev ? { ...prev, x_jp: e.target.value } : prev))}
                    rows={4}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg resize-y"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Instagram (TC)</label>
                  <textarea
                    value={twittDraft.instagram_tc}
                    onChange={(e) => setTwittDraft((prev) => (prev ? { ...prev, instagram_tc: e.target.value } : prev))}
                    rows={5}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg resize-y"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Facebook (TC)</label>
                  <textarea
                    value={twittDraft.facebook_tc}
                    onChange={(e) => setTwittDraft((prev) => (prev ? { ...prev, facebook_tc: e.target.value } : prev))}
                    rows={5}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg resize-y"
                  />
                </div>
              </div>

              <div className="shrink-0 flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50">
                <button
                  type="button"
                  onClick={handleSaveTwitt}
                  disabled={savingTwitt}
                  className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-lg transition-colors disabled:opacity-50"
                >
                  {savingTwitt ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {savingTwitt ? "Saving..." : "Save"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}

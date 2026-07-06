import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Newspaper,
  PenTool,
  ChevronRight,
  Loader2,
  Plus,
  X,
  Hash,
  Share2,
  Target,
  Zap,
  TrendingUp,
  MessageSquare,
  Check,
  Sparkles,
  XCircle,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../../contexts/AuthContext";
import { useDebounce } from "../../lib/useDebounce";
import { Modal } from "../../components/Modal";
import { BrandedSpinner } from "../../components/BrandedSpinner";
import { ContentAreaLoader } from "../../components/ContentAreaLoader";
import { Toast } from "../../components/Toast";
import type { NewsItem } from "../../types";
import type { CapitalKeywordItem } from "../Capital/types";
import { formatCreateDate } from "../Capital/types";
import { audienceSegmentButtonClass, topicSourcePillClass } from "../../lib/topicSourcePill";
import { WrappingTextField } from "../../components/WrappingTextField";
import { TrendingBubbleChart } from "../../components/TrendingBubbleChart";
import { parseTrendingKeywords } from "../../lib/trendingKeywords";
import { isHostBlockingIframe } from "../../lib/iframeBlockingHosts";
import { parseHttpErrorJsonDetail } from "../../lib/parseHttpErrorJsonDetail";
import type { ArticleGenNotice } from "./atfxApprovalTypes";
import { LAZY_PAGE_SIZE, DRAWER_NEWS_CATEGORIES } from "./atfxApprovalTypes";
import {
  topicSnippetFromDataTransfer,
  topicFromNewsItem,
  getRecentTitlesForExcludeBySource,
} from "./atfxApprovalUtils";
import { InstitutionalBatchDial } from "./InstitutionalBatchDial";
import { AtfxTopicsTour } from "./AtfxTopicsTour";
import { groupNameToId } from "../../config/menu";

export default function AtfxApprovalPage() {
  const { authFetch, role, user, groupName, loading: authLoading } = useAuth();
  const pageMountedRef = useRef(true);
  useEffect(() => {
    pageMountedRef.current = true;
    return () => {
      pageMountedRef.current = false;
    };
  }, []);
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
  const [approveOptionsOpen, setApproveOptionsOpen] = useState(false);
  const [approveOptionsItem, setApproveOptionsItem] = useState<CapitalKeywordItem | null>(null);
  const [approveArticleLength, setApproveArticleLength] = useState<"700-800" | "1400-1500">("700-800");
  const [approveArticleStyle, setApproveArticleStyle] = useState<"paragraph" | "bullet">("paragraph");
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [unapprovingId, setUnapprovingId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<"approve" | "reject" | null>(null);
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
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Background article jobs after modal Approve (LLM + Airtable). */
  const [articleGenJobCount, setArticleGenJobCount] = useState(0);
  /** Completion popup after background generation finishes. */
  const [articleGenNotice, setArticleGenNotice] = useState<ArticleGenNotice | null>(null);
  /** Topics with a server-side draft (LLM done, Airtable not saved yet). */
  const [articleDraftIndex, setArticleDraftIndex] = useState<
    Record<string, { savedAt: string; articleType: string; topicTitle: string }>
  >({});
  const [modalArticleDraftMeta, setModalArticleDraftMeta] = useState<{
    savedAt: string;
    articleType: string;
    topicTitle: string;
  } | null>(null);
  const [publishDraftLoading, setPublishDraftLoading] = useState(false);
  const [generateDropActive, setGenerateDropActive] = useState(false);
  const [generateTopic, setGenerateTopic] = useState("");
  const [generating, setGenerating] = useState(false);
  /** AI-only fresh topics batch (institutional or retail auto); uses /api/capitalkeywords/generate. */
  const [generatingFreshTopics, setGeneratingFreshTopics] = useState(false);
  const [freshTopicsModalOpen, setFreshTopicsModalOpen] = useState(false);
  const [freshTopicsRunCount, setFreshTopicsRunCount] = useState<1 | 2 | 3>(1);
  const [freshTopicsAudience, setFreshTopicsAudience] = useState<"institutional" | "retail">(
    "institutional"
  );
  const [generateAudience, setGenerateAudience] = useState<"institutional" | "retail">("retail");
  type StatusFilter = "pending" | "approved" | "rejected";
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [trendView, setTrendView] = useState<"HK" | "Global">("HK");
  const [trendingData, setTrendingData] = useState<{ date: string; keywords: string } | null>(null);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [newsDrawerOpen, setNewsDrawerOpen] = useState(false);
  const [drawerNewsItems, setDrawerNewsItems] = useState<NewsItem[]>([]);
  const [drawerNewsLoading, setDrawerNewsLoading] = useState(false);
  const [drawerNewsRefreshing, setDrawerNewsRefreshing] = useState(false);
  const [drawerNewsError, setDrawerNewsError] = useState<string | null>(null);
  const [drawerNewsSearch, setDrawerNewsSearch] = useState("");
  /** Empty = no category filter (show all); toggling a button on narrows to that category. */
  const [drawerNewsCategories, setDrawerNewsCategories] = useState<Set<string>>(() => new Set());
  const [drawerNewsVisibleCount, setDrawerNewsVisibleCount] = useState(LAZY_PAGE_SIZE);
  const drawerNewsScrollRef = useRef<HTMLDivElement | null>(null);
  const drawerNewsLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const [drawerArticleModalUrl, setDrawerArticleModalUrl] = useState<string | null>(null);
  const [newsGenerateModalItem, setNewsGenerateModalItem] = useState<NewsItem | null>(null);
  const [newsModalAudience, setNewsModalAudience] = useState<"institutional" | "retail">("retail");
  /** News-row sparkles: which item id is running SEO generation (modal closes immediately; status in top nav). */
  const [generatingNewsItemId, setGeneratingNewsItemId] = useState<string | null>(null);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [manualAtfxTour, setManualAtfxTour] = useState(() => searchParams.has("atfxtour"));
  const audienceTourRef = useRef<HTMLDivElement>(null);
  const freshTopicsTourRef = useRef<HTMLButtonElement>(null);
  const seoTrendingTourRef = useRef<HTMLDivElement>(null);
  const trendingButtonTourRef = useRef<HTMLButtonElement>(null);
  const newsDrawerTourRef = useRef<HTMLDivElement>(null);
  const newsDrawerGenerateIconTourRef = useRef<HTMLButtonElement>(null);
  const topicCardTourRef = useRef<HTMLDivElement>(null);
  const topicEmptyTourRef = useRef<HTMLDivElement>(null);

  const isAtfxClient =
    !authLoading && role === "client" && groupNameToId(groupName) === "atfx";
  const debouncedDrawerNewsSearch = useDebounce(drawerNewsSearch, 300);

  const toggleDrawerNewsCategory = (cat: string) => {
    setDrawerNewsCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const showToast = useCallback((msg: string, durationMs = 3000) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, durationMs);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!articleGenNotice) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setArticleGenNotice(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [articleGenNotice]);

  const applyDropToGenerateTopic = (dt: DataTransfer) => {
    const snippet = topicSnippetFromDataTransfer(dt);
    if (!snippet) return;
    setGenerateTopic((prev) => (prev ? `${prev}, ${snippet}` : snippet));
    const short = snippet.length > 44 ? `${snippet.slice(0, 41)}…` : snippet;
    showToast(`"${short}" added to topic`);
  };

  const fetchDrawerNews = useCallback(
    async (forceRefresh: boolean) => {
      if (forceRefresh) setDrawerNewsRefreshing(true);
      else setDrawerNewsLoading(true);
      setDrawerNewsError(null);
      try {
        const res = await authFetch("/api/news", forceRefresh ? { forceRefresh: true } : undefined);
        if (res.ok) {
          const data = await res.json();
          const list: NewsItem[] = Array.isArray(data) ? data : [];
          list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          setDrawerNewsItems(list);
          setDrawerNewsVisibleCount(LAZY_PAGE_SIZE);
        } else {
          const err = await res.json().catch(() => ({}));
          setDrawerNewsError(err?.error || `Failed to load news (${res.status})`);
        }
      } catch {
        setDrawerNewsError("Could not reach the server.");
      } finally {
        setDrawerNewsLoading(false);
        setDrawerNewsRefreshing(false);
      }
    },
    [authFetch]
  );

  useEffect(() => {
    if (newsDrawerOpen) fetchDrawerNews(false);
  }, [newsDrawerOpen, fetchDrawerNews]);

  useEffect(() => {
    if (!newsDrawerOpen) {
      setDrawerNewsSearch("");
      setDrawerArticleModalUrl(null);
      setNewsGenerateModalItem(null);
    }
  }, [newsDrawerOpen]);

  useEffect(() => {
    setDrawerNewsVisibleCount(LAZY_PAGE_SIZE);
  }, [debouncedDrawerNewsSearch, drawerNewsCategories]);

  useEffect(() => {
    if (!newsDrawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (drawerArticleModalUrl) {
        setDrawerArticleModalUrl(null);
        return;
      }
      if (newsGenerateModalItem) {
        setNewsGenerateModalItem(null);
        return;
      }
      setNewsDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newsDrawerOpen, drawerArticleModalUrl, newsGenerateModalItem]);

  const filteredDrawerNews = useMemo(() => {
    const q = debouncedDrawerNewsSearch.trim().toLowerCase();
    return drawerNewsItems.filter((item) => {
      const matchSearch =
        !q ||
        (item.title && item.title.toLowerCase().includes(q)) ||
        (item.summary && item.summary.toLowerCase().includes(q)) ||
        (item.source && item.source.toLowerCase().includes(q));
      const matchCategory =
        drawerNewsCategories.size === 0 ||
        (item.category != null && item.category !== "" && drawerNewsCategories.has(item.category));
      return matchSearch && matchCategory;
    });
  }, [drawerNewsItems, debouncedDrawerNewsSearch, drawerNewsCategories]);

  const drawerVisibleNews = filteredDrawerNews.slice(0, drawerNewsVisibleCount);
  const drawerHasMoreNews = drawerNewsVisibleCount < filteredDrawerNews.length;

  const loadMoreDrawerNews = useCallback(() => {
    setDrawerNewsVisibleCount((c) => Math.min(c + LAZY_PAGE_SIZE, filteredDrawerNews.length));
  }, [filteredDrawerNews.length]);

  useEffect(() => {
    if (!newsDrawerOpen || !drawerHasMoreNews || !drawerNewsLoadMoreRef.current) return;
    const root = drawerNewsScrollRef.current;
    const el = drawerNewsLoadMoreRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMoreDrawerNews();
      },
      { root, rootMargin: "120px", threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [
    newsDrawerOpen,
    drawerHasMoreNews,
    loadMoreDrawerNews,
    filteredDrawerNews.length,
    drawerNewsVisibleCount,
    drawerNewsLoading,
  ]);

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

  const refreshArticleDraftsIndex = useCallback(async () => {
    try {
      const res = await authFetch("/api/capitalkeywords/article-drafts");
      if (!res.ok) return;
      const data = await res.json();
      const drafts = Array.isArray(data.drafts) ? data.drafts : [];
      const next: Record<string, { savedAt: string; articleType: string; topicTitle: string }> = {};
      for (const d of drafts) {
        if (d?.recordId && typeof d.savedAt === "string") {
          next[d.recordId] = {
            savedAt: d.savedAt,
            articleType: String(d.articleType ?? ""),
            topicTitle: String(d.topicTitle ?? ""),
          };
        }
      }
      setArticleDraftIndex(next);
    } catch {
      /* ignore */
    }
  }, [authFetch]);

  useEffect(() => {
    void refreshArticleDraftsIndex();
  }, [refreshArticleDraftsIndex]);

  useEffect(() => {
    if (!selectedItem?.id) {
      setModalArticleDraftMeta(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await authFetch(`/api/capitalkeywords/${selectedItem.id}/article-draft`);
        const j = await res.json();
        if (cancelled) return;
        if (j?.exists && typeof j.savedAt === "string") {
          setModalArticleDraftMeta({
            savedAt: j.savedAt,
            articleType: String(j.articleType ?? ""),
            topicTitle: String(j.topicTitle ?? ""),
          });
        } else {
          setModalArticleDraftMeta(null);
        }
      } catch {
        if (!cancelled) setModalArticleDraftMeta(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedItem?.id, authFetch]);

  const handlePublishSavedDraft = async () => {
    if (!selectedItem?.id) return;
    setPublishDraftLoading(true);
    void authFetch("/api/auth/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Publishing your saved article (no new writing)…" }),
    }).catch(() => {});
    try {
      const res = await authFetch(`/api/capitalkeywords/${selectedItem.id}/publish-article-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const text = await res.text().catch(() => "");
      let j: { error?: string; titleEn?: string; titleTc?: string; articleId?: string | null } = {};
      try {
        j = JSON.parse(text) as typeof j;
      } catch {
        /* ignore */
      }
      if (!res.ok) {
        showToast(`Publish failed: ${j.error || text.trim().slice(0, 200) || res.statusText}`);
        return;
      }
      const pubEn = (j.titleEn || "").trim();
      const pubTc = (j.titleTc || "").trim();
      showToast(`Published: ${pubEn || pubTc || "Article saved"}`);
      setModalArticleDraftMeta(null);
      setArticleGenNotice({
        variant: "success",
        title: "Article published",
        detail: pubEn || pubTc || "Saved from your server draft.",
        articleId: j.articleId ?? null,
        topicLabel: (selectedItem.title || "").trim().slice(0, 100) || "Topic",
        titleEn: pubEn || undefined,
        titleTc: pubTc || undefined,
      });
      await refreshArticleDraftsIndex();
    } catch (e) {
      showToast((e as Error).message || "Publish failed");
    } finally {
      setPublishDraftLoading(false);
    }
  };

  const handleApproveModal = async (
    item: CapitalKeywordItem,
    opts: { articleLength: "700-800" | "1400-1500"; articleStyle: "paragraph" | "bullet" }
  ) => {
    const genSnapshot = {
      recordId: item.id,
      title: draftTitle,
      summary: draftSummary ?? "",
      source: draftSource ?? "",
      topicLabel: (draftTitle || "Approved topic").trim().slice(0, 100),
    };

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

      const statusRes = await authFetch(`/api/capitalkeywords/${item.id}/status-approve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      });
      if (!statusRes.ok) {
        const err = await statusRes.json().catch(() => ({}));
        throw new Error(err?.error || "Failed to set status to Approved");
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
      showToast("Topic approved. Article is generating in the background — you can keep using the app.", 5200);

      setArticleGenJobCount((n) => n + 1);
      void authFetch("/api/auth/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message:
            "Article request sent — writing is running in the background. Watch the status bar for updates.",
        }),
      }).catch(() => {});
      void (async () => {
        try {
          const generateRes = await authFetch(`/api/capitalkeywords/${genSnapshot.recordId}/generate-article`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: genSnapshot.title,
              summary: genSnapshot.summary,
              source: genSnapshot.source,
              articleLength: opts.articleLength,
              articleStyle: opts.articleStyle,
            }),
          });
          const bodyText = await generateRes.text().catch(() => "");

          if (!pageMountedRef.current) return;

          if (!generateRes.ok) {
            const detail = parseHttpErrorJsonDetail(generateRes.status, bodyText);
            console.error("Article generation error:", generateRes.status, bodyText);
            const airtableFail = /airtable/i.test(detail);
            setArticleGenNotice({
              variant: "error",
              title: "Article generation failed",
              detail: airtableFail
                ? `${detail} If the AI part finished, a draft was saved — open this topic and use “Publish saved article to Airtable”.`
                : detail,
              topicLabel: genSnapshot.topicLabel,
            });
            return;
          }

          let result: {
            titleEn?: string;
            titleTc?: string;
            articleId?: string | null;
            thumbnailImagePrompt?: string;
            thumbnailImageModel?: string;
            thumbnailUrl?: string;
          } = {};
          try {
            result = JSON.parse(bodyText) as typeof result;
          } catch {
            /* non-JSON success is unexpected */
          }
          const genEn = (result.titleEn || "").trim();
          const genTc = (result.titleTc || "").trim();
          setArticleGenNotice({
            variant: "success",
            title: "Article ready",
            detail: genEn || genTc || "Your article was saved.",
            articleId: result.articleId ?? null,
            topicLabel: genSnapshot.topicLabel,
            titleEn: genEn || undefined,
            titleTc: genTc || undefined,
            thumbnailImagePrompt: (result.thumbnailImagePrompt || "").trim() || undefined,
            thumbnailImageModel: (result.thumbnailImageModel || "").trim() || undefined,
            thumbnailUrl: (result.thumbnailUrl || "").trim() || undefined,
          });
        } catch (e) {
          if (!pageMountedRef.current) return;
          setArticleGenNotice({
            variant: "error",
            title: "Article generation failed",
            detail: (e as Error).message || "Network error",
            topicLabel: genSnapshot.topicLabel,
          });
        } finally {
          if (pageMountedRef.current) {
            setArticleGenJobCount((n) => Math.max(0, n - 1));
            void refreshArticleDraftsIndex();
          }
        }
      })();
    } catch (err) {
      console.error(err);
      alert((err as Error).message || "Failed to approve");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectModal = async (item: CapitalKeywordItem) => {
    if (item.status?.toLowerCase() === "rejected") return;
    setActionLoading("reject");
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

      const res = await authFetch(`/api/capitalkeywords/${item.id}/status-reject`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: draftTitle, summary: draftSummary ?? "" }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Reject failed");

      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? {
                ...i,
                status: "Rejected",
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
      showToast("Item rejected");
    } catch (err) {
      console.error(err);
      alert((err as Error).message || "Failed to reject");
    } finally {
      setActionLoading(null);
    }
  };

  const runAtfxTopicGeneration = async (
    topic: string,
    audience: "institutional" | "retail",
    fromSidebar: boolean,
    /** When set, modal stays closed and this id shows a row spinner; server also drives top-nav activity. */
    newsItemIdForSpinner?: string | null,
    newsContext?: NewsItem | null
  ): Promise<boolean> => {
    const topicTrim = topic.trim();
    if (!topicTrim) {
      showToast(fromSidebar ? "Enter a topic to generate" : "Headline is empty — cannot generate.");
      return false;
    }
    if (fromSidebar) setGenerating(true);
    else if (newsItemIdForSpinner) setGeneratingNewsItemId(newsItemIdForSpinner);
    try {
      const excludeRecentTitles = getRecentTitlesForExcludeBySource(items, audience);
      const res = await authFetch("/api/capitalkeywords/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topicTrim,
          company: "atfx",
          audience,
          excludeRecentTitles,
          ...(newsItemIdForSpinner
            ? {
                topicFromNews: true,
                newsHeadline: (newsContext?.title ?? "").trim(),
                newsSummary: (newsContext?.summary ?? "").trim(),
                newsUrl: (newsContext?.url ?? "").trim(),
              }
            : fromSidebar
              ? { topicFromSidebar: true }
              : {}),
        }),
      });
      const bodyText = await res.text();
      if (!res.ok) {
        const detail = parseHttpErrorJsonDetail(res.status, bodyText);
        const hint =
          res.status === 409
            ? `${detail} You can edit the topic line and generate again, or pick a different theme.`
            : detail;
        showToast(hint, res.status === 409 ? 10_000 : 6000);
        return false;
      }
      const newItem = JSON.parse(bodyText) as CapitalKeywordItem;
      setItems((prev) => [newItem, ...prev]);
      if (fromSidebar) setGenerateTopic("");
      showToast("SEO topic generated and saved");
      return true;
    } catch (err) {
      console.error(err);
      showToast((err as Error).message || "Failed to generate topic", 6000);
      return false;
    } finally {
      if (fromSidebar) setGenerating(false);
      else if (newsItemIdForSpinner) setGeneratingNewsItemId(null);
    }
  };

  const handleGenerate = async () => {
    await runAtfxTopicGeneration(generateTopic, generateAudience, true);
  };

  const runFreshTopicsBatch = async (count: 1 | 2 | 3, audience: "institutional" | "retail") => {
    setFreshTopicsModalOpen(false);
    setGeneratingFreshTopics(true);
    const recentBaseline = getRecentTitlesForExcludeBySource(
      items,
      audience === "institutional" ? "institutional" : "retail"
    );
    const batchTitles: string[] = [];
    try {
      for (let i = 0; i < count; i++) {
        const excludeRecentTitles = [...new Set([...recentBaseline, ...batchTitles])];
        const requestyTopicModel =
          i === 1
            ? "google/gemini-2.5-flash"
            : i === 2
              ? "openai/gpt-4.1-mini"
              : undefined;
        const body =
          audience === "institutional"
            ? {
                company: "atfx" as const,
                audience: "institutional" as const,
                autoInstitutionalTopic: true,
                excludeRecentTitles,
                batchIndex: i,
                batchTotal: count,
                ...(requestyTopicModel ? { requestyTopicModel } : {}),
              }
            : {
                company: "atfx" as const,
                audience: "retail" as const,
                autoRetailTopic: true,
                excludeRecentTitles,
                batchIndex: i,
                batchTotal: count,
                ...(requestyTopicModel ? { requestyTopicModel } : {}),
              };
        const res = await authFetch("/api/capitalkeywords/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const bodyText = await res.text();
        if (!res.ok) {
          const detail = parseHttpErrorJsonDetail(res.status, bodyText);
          const hint =
            res.status === 409
              ? `${detail} Try again — the batch stopped at topic ${i + 1} of ${count}.`
              : detail;
          showToast(hint, res.status === 409 ? 10_000 : 6000);
          return;
        }
        const newItem = JSON.parse(bodyText) as CapitalKeywordItem;
        const nt = (newItem.title ?? "").trim();
        if (nt) batchTitles.push(nt);
        setItems((prev) => [newItem, ...prev]);
      }
      const label = audience === "institutional" ? "Institutional" : "Retail";
      showToast(
        count === 1
          ? `${label} topic generated and saved`
          : `${count} ${label.toLowerCase()} topics generated and saved`
      );
    } catch (err) {
      console.error(err);
      showToast((err as Error).message || "Failed to generate topic(s)", 6000);
    } finally {
      setGeneratingFreshTopics(false);
    }
  };

  const handleNewsModalGenerate = () => {
    if (!newsGenerateModalItem) return;
    const item = newsGenerateModalItem;
    const audience = newsModalAudience;
    setNewsGenerateModalItem(null);
    void runAtfxTopicGeneration(topicFromNewsItem(item), audience, false, item.id, item);
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
        const res = await authFetch("/api/capitalkeywords?company=atfx", { forceRefresh: true });
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

  // Filtering only depends on `items`; memoize so scroll/visibleCount/tab changes don't re-run three full passes.
  const displayNewsByStatus = useMemo(() => {
    const statusLower = (s: string | undefined) => (s ?? "").trim().toLowerCase();
    const isAtfxCompany = (item: CapitalKeywordItem) =>
      (item.company ?? "").trim().toLowerCase() === "atfx";
    return {
      pending: items.filter((item) => isAtfxCompany(item) && statusLower(item.status) === ""),
      approved: items.filter((item) => isAtfxCompany(item) && statusLower(item.status) === "approved"),
      rejected: items.filter((item) => isAtfxCompany(item) && statusLower(item.status) === "rejected"),
    };
  }, [items]);
  const displayNews = displayNewsByStatus[statusFilter];
  const visibleNews = displayNews.slice(0, visibleCount);
  const hasMore = visibleCount < displayNews.length;

  // Parse the trending keyword string once per change instead of on every render in JSX.
  const trendingKeywordItems = useMemo(
    () => (trendingData?.keywords ? parseTrendingKeywords(trendingData.keywords) : []),
    [trendingData?.keywords]
  );

  const openNewsDrawerForTour = useCallback(() => setNewsDrawerOpen(true), []);
  const closeNewsDrawerForTour = useCallback(() => setNewsDrawerOpen(false), []);

  const prepareApproveStepForTour = useCallback(() => {
    setNewsDrawerOpen(false);
    setStatusFilter("pending");
  }, []);

  useEffect(() => {
    if (!searchParams.has("atfxtour")) return;
    setManualAtfxTour(true);
    const next = new URLSearchParams(searchParams);
    next.delete("atfxtour");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

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
        {/* Aside first on all breakpoints so Generate + audience toggle are not below the full topic list on mobile/tablet */}
        <aside className="lg:sticky lg:top-24 lg:self-start order-1 flex flex-col w-full lg:w-[28rem] lg:min-h-[calc(100vh-5rem)] pb-12">
          <h1 className="text-2xl font-bold text-slate-900 mb-1 pb-2 shrink-0">Topics</h1>
          <div className="flex flex-col flex-1 min-h-0">
            <div ref={seoTrendingTourRef} className="flex flex-col flex-1 min-h-0">
            <div
              className={`card p-4 w-full shrink-0 transition-all duration-200 ${
                generateDropActive ? "ring-2 ring-primary border-primary bg-primary/5" : ""
              }`}
              onDragEnter={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
                setGenerateDropActive(true);
              }}
              onDragLeave={(e) => {
                const next = e.relatedTarget as Node | null;
                if (next && (e.currentTarget as HTMLElement).contains(next)) return;
                setGenerateDropActive(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setGenerateDropActive(false);
                applyDropToGenerateTopic(e.dataTransfer);
              }}
            >
              <div className="flex items-start justify-between gap-2 mb-4">
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2 min-w-0">
                  <Sparkles className="w-5 h-5 text-primary shrink-0" />{" "}
                  <span className="leading-tight">Generate a new SEO Topic</span>
                </h2>
                <button
                  ref={trendingButtonTourRef}
                  type="button"
                  onClick={() => setNewsDrawerOpen(true)}
                  className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold tracking-wide text-slate-800 bg-white hover:bg-primary/12 border border-primary transition-colors"
                  aria-expanded={newsDrawerOpen}
                  aria-controls="atfx-news-drawer"
                >
                  <Newspaper className="w-3.5 h-3.5 shrink-0" />
                  Trending
                </button>
              </div>
              <div ref={audienceTourRef} className="mb-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Content audience</p>
                <div className="flex rounded-lg bg-slate-100 border border-slate-200 p-0.5">
                  <button
                    type="button"
                    onClick={() => setGenerateAudience("institutional")}
                    className={`flex-1 px-2 py-2 rounded-md text-xs font-semibold transition-colors ${audienceSegmentButtonClass("institutional", generateAudience)}`}
                  >
                    Institutional
                  </button>
                  <button
                    type="button"
                    onClick={() => setGenerateAudience("retail")}
                    className={`flex-1 px-2 py-2 rounded-md text-xs font-semibold transition-colors ${audienceSegmentButtonClass("retail", generateAudience)}`}
                  >
                    Retail
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <textarea
                  rows={4}
                  placeholder="Enter the topic or theme to build the SEO angle around..."
                  value={generateTopic}
                  onChange={(e) => setGenerateTopic(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.ctrlKey && !generating && !generatingFreshTopics) {
                      e.preventDefault();
                      handleGenerate();
                    }
                  }}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "copy";
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "copy";
                    setGenerateDropActive(true);
                  }}
                  onDragLeave={(e) => {
                    const next = e.relatedTarget as Node | null;
                    if (next && (e.currentTarget as HTMLElement).contains(next)) return;
                    setGenerateDropActive(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setGenerateDropActive(false);
                    applyDropToGenerateTopic(e.dataTransfer);
                  }}
                  disabled={generating || generatingFreshTopics}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white placeholder:text-slate-400 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-y min-h-[5rem] disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={generating || generatingFreshTopics || !generateTopic.trim()}
                  className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-lg transition-colors disabled:opacity-50"
                >
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {generating ? "Generating..." : "Generate"}
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-2">
                Open <span className="font-semibold text-slate-500">News</span> to browse headlines, or drag trending bubbles here. Ctrl+Enter to generate.
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
                    <TrendingBubbleChart items={trendingKeywordItems} variant={trendView} />
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
            </div>
          </div>
        </aside>
        <main className="flex-1 min-w-0 order-2">
          {loading ? (
            <ContentAreaLoader variant="main" message="Fetching latest updates..." />
          ) : fetchError ? (
            <div className="flex flex-col items-center justify-center py-20 text-center max-w-md mx-auto">
              <p className="text-slate-600 font-medium mb-2">Couldn&apos;t load items</p>
              <p className="text-slate-500 text-sm mb-4">{fetchError}</p>
            </div>
          ) : (
            <>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6 sm:justify-between w-full">
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
              <button
                ref={freshTopicsTourRef}
                type="button"
                onClick={() => {
                  setFreshTopicsRunCount(1);
                  setFreshTopicsAudience("institutional");
                  setFreshTopicsModalOpen(true);
                }}
                disabled={generating || generatingFreshTopics || loading}
                title="Choose institutional or retail, then AI runs fresh research and generates SEO topics (saved as ATFX)."
                className="shrink-0 inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:pointer-events-none w-full sm:w-auto"
              >
                {generatingFreshTopics ? (
                  <Loader2 className="w-4 h-4 animate-spin shrink-0 text-white" />
                ) : (
                  <Sparkles className="w-4 h-4 shrink-0 text-white" />
                )}
                <span className="whitespace-normal sm:whitespace-nowrap text-left sm:text-center text-white">
                  {generatingFreshTopics ? "Generating…" : "Generate fresh topics"}
                </span>
              </button>
            </div>
            {displayNews.length === 0 ? (
              <div
                ref={topicEmptyTourRef}
                className="flex flex-col items-center justify-center py-20 text-center"
              >
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
                  ref={idx === 0 ? topicCardTourRef : undefined}
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
                            {articleDraftIndex[item.id] ? (
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200 uppercase tracking-wider"
                                title="AI article generated on server — publish from topic modal to finish Airtable save without new tokens"
                              >
                                Draft
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
                            <button
                              type="button"
                              onClick={(e) => handleUnapprove(item, e)}
                              disabled={!!unapprovingId}
                              title="Click to clear rejected status"
                              className="md:mt-auto shrink-0 inline-flex items-center gap-1 px-2 py-1 md:py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200 uppercase tracking-wider hover:bg-red-200 hover:border-red-300 transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              {unapprovingId === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />} Rejected
                            </button>
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
            onClick={() => !savingModal && !actionLoading && !publishDraftLoading && setSelectedItem(null)}
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
                  onClick={() => !savingModal && !actionLoading && !publishDraftLoading && setSelectedItem(null)}
                  disabled={!!savingModal || !!actionLoading || !!publishDraftLoading}
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

              {modalArticleDraftMeta ? (
                <div className="shrink-0 px-6 py-3 border-t border-amber-200 bg-amber-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="text-sm text-amber-950 min-w-0">
                    <span className="font-semibold">Saved AI article on server</span>
                    <span className="text-amber-900/90">
                      {" "}
                      — publish to Airtable without running the models again (no extra tokens).
                    </span>
                    <span className="block text-xs text-amber-800/90 mt-1 tabular-nums">
                      Saved {new Date(modalArticleDraftMeta.savedAt).toLocaleString()} · {modalArticleDraftMeta.articleType}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handlePublishSavedDraft()}
                    disabled={!!publishDraftLoading || !!savingModal || !!actionLoading}
                    className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-amber-700 text-white hover:bg-amber-800 transition-colors disabled:opacity-50"
                  >
                    {publishDraftLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Publish saved article to Airtable
                  </button>
                </div>
              ) : null}

              {statusFilter === "pending" ? (
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
                      onClick={() => handleRejectModal(selectedItem)}
                      disabled={!!actionLoading || !!savingModal || selectedItem.status?.toLowerCase() === "rejected"}
                      className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {actionLoading === "reject" ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setApproveOptionsItem(selectedItem);
                        setApproveOptionsOpen(true);
                      }}
                      disabled={!!actionLoading || !!savingModal}
                      className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {actionLoading === "approve" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      Approve
                    </button>
                  </div>
                </div>
              ) : null}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Modal
        open={approveOptionsOpen}
        onClose={() => {
          if (actionLoading) return;
          setApproveOptionsOpen(false);
          setApproveOptionsItem(null);
        }}
        title="Article options"
        closeDisabled={!!actionLoading}
        closeOnBackdrop={!actionLoading}
        maxWidth="max-w-xl"
      >
        <div className="p-4 sm:p-6">
          <div className="space-y-5">
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Article length</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="flex items-start gap-2 p-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer">
                  <input
                    type="radio"
                    name="atfx-article-length"
                    value="700-800"
                    checked={approveArticleLength === "700-800"}
                    onChange={() => setApproveArticleLength("700-800")}
                    className="mt-1"
                    disabled={!!actionLoading}
                  />
                  <span className="text-sm font-semibold text-slate-900">700–800 words</span>
                </label>
                <label className="flex items-start gap-2 p-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer">
                  <input
                    type="radio"
                    name="atfx-article-length"
                    value="1400-1500"
                    checked={approveArticleLength === "1400-1500"}
                    onChange={() => setApproveArticleLength("1400-1500")}
                    className="mt-1"
                    disabled={!!actionLoading}
                  />
                  <span className="text-sm font-semibold text-slate-900">1400–1500 words</span>
                </label>
              </div>
            </div>

            <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Article style</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="flex items-start gap-2 p-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer">
                  <input
                    type="radio"
                    name="atfx-article-style"
                    value="paragraph"
                    checked={approveArticleStyle === "paragraph"}
                    onChange={() => setApproveArticleStyle("paragraph")}
                    className="mt-1"
                    disabled={!!actionLoading}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-900">Narrative</span>
                    <span className="block text-xs text-slate-500">(Full-sentence paragraphs)</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 p-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer">
                  <input
                    type="radio"
                    name="atfx-article-style"
                    value="bullet"
                    checked={approveArticleStyle === "bullet"}
                    onChange={() => setApproveArticleStyle("bullet")}
                    className="mt-1"
                    disabled={!!actionLoading}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-900">Structured</span>
                    <span className="block text-xs text-slate-500">(Bullet points & key takeaways)</span>
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>
        <div className="px-4 sm:px-6 pb-5">
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                if (actionLoading) return;
                setApproveOptionsOpen(false);
                setApproveOptionsItem(null);
              }}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors disabled:opacity-50"
              disabled={!!actionLoading}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (!approveOptionsItem) return;
                setApproveOptionsOpen(false);
                void handleApproveModal(approveOptionsItem, {
                  articleLength: approveArticleLength,
                  articleStyle: approveArticleStyle,
                });
                setApproveOptionsItem(null);
              }}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-green-600 hover:bg-green-700 transition-colors disabled:opacity-50"
              disabled={!!actionLoading || !approveOptionsItem}
            >
              Continue & approve
            </button>
          </div>
        </div>
      </Modal>

      <AnimatePresence>
        {newsDrawerOpen && (
          <>
            {/* Clicks on the dimmed area close the drawer (panel sits above at z-76). */}
            <motion.div
              key="atfx-news-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[75] bg-black/35 pointer-events-auto"
              aria-hidden
              onClick={() => setNewsDrawerOpen(false)}
            />
            <motion.div
              ref={newsDrawerTourRef}
              id="atfx-news-drawer"
              key="atfx-news-panel"
              role="dialog"
              aria-modal="true"
              aria-label="Trending Articles"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "tween", duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
              className="fixed top-16 bottom-0 left-0 right-0 z-[76] w-full min-w-0 max-w-[100vw] overflow-x-hidden overflow-y-hidden bg-white shadow-2xl flex flex-col border-l border-slate-200 pointer-events-auto lg:left-[calc((100dvw-min(100dvw,1800px))/2+2rem+28rem+2rem)] lg:w-auto lg:max-w-none"
            >
              <div className="shrink-0 flex items-center justify-between gap-2 px-4 sm:px-6 lg:px-8 py-3 border-b border-slate-200 bg-slate-50">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 min-w-0">
                  <Newspaper className="w-5 h-5 text-primary shrink-0" />
                  <span className="truncate">Trending Articles</span>
                </h3>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => fetchDrawerNews(true)}
                    disabled={drawerNewsLoading || drawerNewsRefreshing}
                    className="p-2 rounded-lg text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-50"
                    title="Refresh news"
                    aria-label="Refresh news"
                  >
                    <RefreshCw className={`w-4 h-4 ${drawerNewsRefreshing ? "animate-spin" : ""}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewsDrawerOpen(false)}
                    className="p-2 rounded-lg text-slate-600 hover:bg-slate-200 transition-colors"
                    aria-label="Close trending articles panel"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="shrink-0 px-4 sm:px-6 lg:px-8 py-3 border-b border-slate-100 min-w-0">
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3 min-w-0">
                  <div className="flex shrink-0 flex-wrap gap-1.5 items-center" role="group" aria-label="Filter by category">
                    {DRAWER_NEWS_CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => toggleDrawerNewsCategory(cat)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                          drawerNewsCategories.has(cat)
                            ? "bg-secondary text-slate-800 border-slate-300"
                            : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200/80"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  <input
                    type="search"
                    value={drawerNewsSearch}
                    onChange={(e) => setDrawerNewsSearch(e.target.value)}
                    placeholder="Search headlines…"
                    className="min-w-0 flex-1 w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                    autoComplete="off"
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-2 leading-tight">
                  Click a headline to read (same as the News page). Use trending bubbles to drag keywords into Generate.
                </p>
              </div>
              <div
                ref={drawerNewsScrollRef}
                className="flex-1 min-h-0 min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain px-4 sm:px-6 lg:px-8 py-3"
              >
                {drawerNewsLoading && drawerNewsItems.length === 0 ? (
                  <ContentAreaLoader variant="drawer" message="Loading news…" />
                ) : drawerNewsError ? (
                  <div className="text-center py-12 px-2">
                    <p className="text-sm text-red-600 font-medium mb-2">{drawerNewsError}</p>
                    <button
                      type="button"
                      onClick={() => fetchDrawerNews(true)}
                      className="text-sm text-primary font-semibold hover:underline"
                    >
                      Try again
                    </button>
                  </div>
                ) : filteredDrawerNews.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 text-sm">
                    {drawerNewsItems.length === 0 ? "No articles yet." : "No articles match your search."}
                  </div>
                ) : (
                  <div className="grid w-full max-w-full min-w-0 justify-items-stretch grid-cols-1 min-[520px]:grid-cols-2 lg:[grid-template-columns:repeat(3,minmax(0,1fr))] gap-2 sm:gap-3 pb-4 [box-sizing:border-box]">
                    {drawerVisibleNews.map((item, idx) => (
                      <div key={item.id} className="min-w-0">
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: Math.min(idx * 0.015, 0.35) }}
                          className="card relative box-border group h-full min-w-0 max-w-full overflow-hidden flex flex-col p-2 sm:p-2.5 hover:shadow-md transition-shadow border border-slate-200"
                        >
                          <button
                            type="button"
                            className="absolute top-1.5 right-1.5 z-[1] w-[5.25rem] h-[3.25rem] sm:top-2 sm:right-2 sm:w-24 sm:h-14 shrink-0 rounded-md overflow-hidden bg-white flex items-center justify-center p-0 border-0 cursor-pointer disabled:opacity-50"
                            disabled={!item.url}
                            onClick={() => {
                              if (!item.url) return;
                              if (isHostBlockingIframe(item.url)) {
                                window.open(item.url, "_blank", "noopener,noreferrer");
                                return;
                              }
                              setDrawerArticleModalUrl(item.url);
                            }}
                            aria-label={item.title ? `Open article: ${item.title}` : "Open article"}
                          >
                            <img
                              src={item.thumbnail || `https://picsum.photos/seed/${item.id}/240/150`}
                              alt=""
                              className="w-full h-full max-w-full max-h-full object-contain pointer-events-none"
                              loading="lazy"
                              decoding="async"
                              width={96}
                              height={56}
                              draggable={false}
                              referrerPolicy="no-referrer"
                            />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setNewsModalAudience("retail");
                              setNewsGenerateModalItem(item);
                            }}
                            ref={idx === 0 ? newsDrawerGenerateIconTourRef : undefined}
                            className="absolute bottom-1.5 right-1.5 z-10 rounded-md p-1.5 text-primary hover:bg-primary/10 border border-slate-200 bg-white shadow-sm transition-colors sm:bottom-2 sm:right-2"
                            title="Generate ATFX SEO topic from this headline"
                            aria-label="Generate ATFX SEO topic from this headline"
                            disabled={generatingNewsItemId != null || generatingFreshTopics}
                          >
                            {generatingNewsItemId === item.id ? (
                              <Loader2 className="w-4 h-4 animate-spin text-primary" />
                            ) : (
                              <Sparkles className="w-4 h-4" />
                            )}
                          </button>
                          <div className="min-w-0 min-h-0 flex-1 flex flex-col gap-0.5 sm:gap-1 overflow-hidden pr-[calc(5.25rem+0.375rem)] sm:pr-[calc(6rem+0.5rem)]">
                              <div className="flex flex-wrap items-center gap-1 min-w-0">
                                {item.category ? (
                                  <span
                                    className="text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded text-white uppercase shrink-0"
                                    style={{ background: "linear-gradient(to right, #ff7900, #facc15)" }}
                                  >
                                    {item.category}
                                  </span>
                                ) : null}
                                {item.source ? (
                                  <span className="text-[9px] sm:text-[10px] text-slate-500 font-medium truncate min-w-0 max-w-full">
                                    {item.source}
                                  </span>
                                ) : null}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  if (!item.url) return;
                                  if (isHostBlockingIframe(item.url)) {
                                    window.open(item.url, "_blank", "noopener,noreferrer");
                                    return;
                                  }
                                  setDrawerArticleModalUrl(item.url);
                                }}
                                className="text-left w-full disabled:opacity-50"
                                disabled={!item.url}
                              >
                                <span className="text-[11px] sm:text-xs font-semibold text-slate-900 line-clamp-3 leading-snug break-words [overflow-wrap:anywhere] underline underline-offset-2 decoration-slate-300 group-hover:text-primary group-hover:decoration-primary">
                                  {item.title || "—"}
                                </span>
                              </button>
                              <p className="text-[10px] text-slate-400 mt-auto">
                                {item.date
                                  ? new Date(item.date).toLocaleString(undefined, {
                                      month: "short",
                                      day: "numeric",
                                      hour: "numeric",
                                      minute: "2-digit",
                                    })
                                  : ""}
                              </p>
                          </div>
                        </motion.div>
                      </div>
                    ))}
                    {drawerHasMoreNews ? (
                      <div
                        ref={drawerNewsLoadMoreRef}
                        className="col-span-full h-10 flex items-center justify-center py-4"
                        aria-hidden
                      >
                        <BrandedSpinner size="sm" className="opacity-60" />
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {drawerArticleModalUrl && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setDrawerArticleModalUrl(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Article preview"
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-[95vw] h-[92vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between shrink-0 px-4 py-3 border-b border-slate-300 bg-slate-50">
              <a
                href={drawerArticleModalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-primary hover:underline truncate max-w-[60%]"
              >
                Open in new tab
              </a>
              <button
                type="button"
                onClick={() => setDrawerArticleModalUrl(null)}
                className="p-2 rounded-lg hover:bg-slate-200 text-slate-600 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {isHostBlockingIframe(drawerArticleModalUrl) ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 bg-slate-50">
                <p className="text-slate-600 text-center max-w-md">
                  This article can&apos;t be shown in the preview because the site blocks embedding. Open it in a new tab to read.
                </p>
                <a
                  href={drawerArticleModalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-primary text-white font-semibold hover:bg-primary/90 transition-colors"
                >
                  Open in new tab
                </a>
              </div>
            ) : (
              <iframe
                src={drawerArticleModalUrl}
                title="Article"
                className="flex-1 w-full min-h-0 border-0"
                sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                referrerPolicy="no-referrer"
              />
            )}
          </div>
        </div>
      )}

      <Modal
        open={freshTopicsModalOpen}
        onClose={() => setFreshTopicsModalOpen(false)}
        title="Generate fresh topics"
        maxWidth="max-w-lg"
        footer={
          <>
            <button
              type="button"
              onClick={() => setFreshTopicsModalOpen(false)}
              className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void runFreshTopicsBatch(freshTopicsRunCount, freshTopicsAudience)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-lg transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              Generate {freshTopicsRunCount === 1 ? "1 topic" : `${freshTopicsRunCount} topics`}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4 p-4">
          <div>
            <p className="mb-2 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Audience
            </p>
            <div className="mx-auto flex max-w-sm rounded-lg border border-slate-200 bg-slate-100 p-0.5">
              <button
                type="button"
                role="radio"
                aria-checked={freshTopicsAudience === "institutional"}
                onClick={() => setFreshTopicsAudience("institutional")}
                className={`flex-1 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors ${audienceSegmentButtonClass("institutional", freshTopicsAudience)}`}
              >
                Institutional
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={freshTopicsAudience === "retail"}
                onClick={() => setFreshTopicsAudience("retail")}
                className={`flex-1 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors ${audienceSegmentButtonClass("retail", freshTopicsAudience)}`}
              >
                Retail
              </button>
            </div>
          </div>
          <div>
            <p className="mb-1 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Number of runs
            </p>
            <div className="mb-3 space-y-1 text-center text-sm leading-snug text-slate-600">
              <p>How many topics should AI generate?</p>
              <p>Each run uses a fresh research pass (max 3).</p>
            </div>
            <InstitutionalBatchDial value={freshTopicsRunCount} onChange={setFreshTopicsRunCount} />
          </div>
        </div>
      </Modal>

      <Modal
        open={!!newsGenerateModalItem}
        onClose={() => setNewsGenerateModalItem(null)}
        title="Generate a SEO topic"
        maxWidth="max-w-md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setNewsGenerateModalItem(null)}
              className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleNewsModalGenerate}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-lg transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              Generate
            </button>
          </>
        }
      >
        <div className="p-4 flex flex-col">
          <p className="text-sm text-slate-600 text-center">Choose the audience for this topic.</p>
          <p className="text-xs text-slate-500 text-center mt-1">
            Generation runs in the background. Watch progress in the status strip at the top of the page.
          </p>
          {newsGenerateModalItem ? (
            <p className="text-xs text-slate-800 line-clamp-4 font-medium bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 mt-5 mb-5">
              {topicFromNewsItem(newsGenerateModalItem)}
            </p>
          ) : null}
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 text-center">
              Content audience
            </p>
            <div className="flex rounded-lg bg-slate-100 border border-slate-200 p-0.5 my-5">
              <button
                type="button"
                onClick={() => setNewsModalAudience("institutional")}
                className={`flex-1 px-3 py-2 rounded-md text-xs font-semibold transition-colors ${audienceSegmentButtonClass("institutional", newsModalAudience)}`}
              >
                Institutional
              </button>
              <button
                type="button"
                onClick={() => setNewsModalAudience("retail")}
                className={`flex-1 px-3 py-2 rounded-md text-xs font-semibold transition-colors ${audienceSegmentButtonClass("retail", newsModalAudience)}`}
              >
                Retail
              </button>
            </div>
          </div>
        </div>
      </Modal>

      <Toast message={toast} onClose={() => setToast(null)} />

      {articleGenJobCount > 0 && (
        <div
          className="fixed bottom-6 left-6 z-[95] flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-lg border border-white/10"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="w-4 h-4 animate-spin shrink-0 text-primary" />
          <span>
            Generating article{articleGenJobCount > 1 ? `s (${articleGenJobCount})` : ""}…
          </span>
        </div>
      )}

      <AnimatePresence>
        {articleGenNotice && (
          <motion.div
            key="article-gen-notice"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="article-gen-notice-title"
            onClick={() => setArticleGenNotice(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ type: "spring", damping: 26, stiffness: 320 }}
              className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className={`px-5 py-4 flex items-start gap-3 ${
                  articleGenNotice.variant === "success" ? "bg-emerald-50 border-b border-emerald-100" : "bg-red-50 border-b border-red-100"
                }`}
              >
                {articleGenNotice.variant === "success" ? (
                  <div className="shrink-0 w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center">
                    <Check className="w-5 h-5 text-white" aria-hidden />
                  </div>
                ) : (
                  <div className="shrink-0 w-10 h-10 rounded-full bg-red-500 flex items-center justify-center">
                    <AlertCircle className="w-5 h-5 text-white" aria-hidden />
                  </div>
                )}
                <div className="min-w-0 pt-0.5">
                  <p id="article-gen-notice-title" className="text-base font-bold text-slate-900">
                    {articleGenNotice.title}
                  </p>
                  {articleGenNotice.topicLabel ? (
                    <p className="text-xs text-slate-500 mt-0.5 truncate" title={articleGenNotice.topicLabel}>
                      {articleGenNotice.topicLabel}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="px-5 py-4">
                {articleGenNotice.variant === "success" && (articleGenNotice.titleEn || articleGenNotice.titleTc) ? (
                  <div className="space-y-4">
                    {articleGenNotice.titleEn ? (
                      <p lang="en" className="text-sm text-slate-800 leading-relaxed break-words">
                        {articleGenNotice.titleEn}
                      </p>
                    ) : null}
                    {articleGenNotice.titleTc ? (
                      <p lang="zh-Hant" className="text-sm text-slate-800 leading-relaxed break-words">
                        {articleGenNotice.titleTc}
                      </p>
                    ) : null}
                    {articleGenNotice.thumbnailUrl ? (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                        <img
                          src={articleGenNotice.thumbnailUrl}
                          alt=""
                          className="w-full max-h-44 object-cover rounded-lg border border-slate-200 bg-white"
                          loading="lazy"
                        />
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-sm text-slate-700 leading-relaxed break-words">{articleGenNotice.detail}</p>
                )}
              </div>
              <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap justify-end gap-2">
                {articleGenNotice.variant === "success" && articleGenNotice.articleId ? (
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        sessionStorage.setItem("atfxOpenArticleId", articleGenNotice.articleId!);
                      } catch {
                        /* ignore quota / private mode */
                      }
                      setArticleGenNotice(null);
                      navigate("/atfx");
                    }}
                    className="px-4 py-2 rounded-lg text-sm font-semibold border border-slate-300 bg-white text-slate-800 hover:bg-slate-100 transition-colors"
                  >
                    View article
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setArticleGenNotice(null)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 transition-colors"
                >
                  OK
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AtfxTopicsTour
        refs={{
          audienceRef: audienceTourRef,
          freshTopicsRef: freshTopicsTourRef,
          seoTrendingRef: seoTrendingTourRef,
          trendingButtonRef: trendingButtonTourRef,
          newsDrawerRef: newsDrawerTourRef,
          newsDrawerGenerateIconRef: newsDrawerGenerateIconTourRef,
          topicCardRef: topicCardTourRef,
          topicEmptyRef: topicEmptyTourRef,
        }}
        enabled={!loading}
        autoTourEligible={isAtfxClient}
        tourUserId={user?.uid ?? null}
        manualOpen={manualAtfxTour}
        onOpenNewsDrawer={openNewsDrawerForTour}
        onCloseNewsDrawer={closeNewsDrawerForTour}
        onPrepareApproveStep={prepareApproveStepForTour}
      />
    </div>
  );
}

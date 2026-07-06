import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Newspaper, RefreshCw, Sparkles, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../contexts/AuthContext";
import { useDebounce } from "../lib/useDebounce";
import { isHostBlockingIframe } from "../lib/iframeBlockingHosts";
import type { NewsItem } from "../types";
import { DRAWER_NEWS_CATEGORIES, LAZY_PAGE_SIZE } from "../pages/ATFX/atfxApprovalTypes";
import { BrandedSpinner } from "./BrandedSpinner";
import { ContentAreaLoader } from "./ContentAreaLoader";

function newsItemThumbnailUrl(item: NewsItem): string {
  return item.thumbnail || `https://picsum.photos/seed/${item.id}/240/150`;
}

const THUMBNAIL_PRELOAD_BATCH = 8;

function preloadNewsThumbnails(list: NewsItem[], skipUrls?: Set<string>) {
  for (const item of list) {
    const url = newsItemThumbnailUrl(item);
    if (skipUrls?.has(url)) continue;
    skipUrls?.add(url);
    const img = new Image();
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.src = url;
  }
}

function scheduleIdleThumbnailPreload(
  list: NewsItem[],
  skipUrls: Set<string>,
  onCancel: (cancel: () => void) => void
) {
  let cancelled = false;
  let index = 0;

  const cancel = () => {
    cancelled = true;
  };

  const tick = () => {
    if (cancelled || index >= list.length) return;
    const end = Math.min(index + THUMBNAIL_PRELOAD_BATCH, list.length);
    preloadNewsThumbnails(list.slice(index, end), skipUrls);
    index = end;
    if (index < list.length && !cancelled) {
      if (typeof requestIdleCallback !== "undefined") {
        requestIdleCallback(tick, { timeout: 2000 });
      } else {
        window.setTimeout(tick, 60);
      }
    }
  };

  if (typeof requestIdleCallback !== "undefined") {
    requestIdleCallback(tick, { timeout: 1500 });
  } else {
    window.setTimeout(tick, 120);
  }

  onCancel(cancel);
}

function NewsItemThumbnail({
  item,
  onOpen,
}: {
  item: NewsItem;
  onOpen: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const src = newsItemThumbnailUrl(item);

  return (
    <button
      type="button"
      className="absolute top-1.5 right-1.5 z-[1] w-[5.25rem] h-[3.25rem] sm:top-2 sm:right-2 sm:w-24 sm:h-14 shrink-0 rounded-md overflow-hidden bg-white flex items-center justify-center p-0 border-0 cursor-pointer disabled:opacity-50"
      disabled={!item.url}
      onClick={onOpen}
      aria-label={item.title ? `Open article: ${item.title}` : "Open article"}
    >
      {!loaded ? <Loader2 className="w-4 h-4 animate-spin text-slate-400 shrink-0" aria-hidden /> : null}
      <img
        src={src}
        alt=""
        className={`w-full h-full max-w-full max-h-full object-contain pointer-events-none transition-opacity duration-200 ${
          loaded ? "opacity-100" : "opacity-0 absolute inset-0"
        }`}
        loading="lazy"
        decoding="async"
        width={96}
        height={56}
        draggable={false}
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
      />
    </button>
  );
}

export type AtfxTrendingNewsDrawerProps = {
  open: boolean;
  onClose: () => void;
  /** LG+ left offset so the panel aligns with the main canvas (not the chat column). */
  panelLeftClass?: string;
  variant?: "topics" | "research";
  onUseNews?: (item: NewsItem) => void;
  onGenerateTopic?: (item: NewsItem) => void;
  generatingNewsItemId?: string | null;
  generateDisabled?: boolean;
  drawerRef?: React.RefObject<HTMLDivElement | null>;
  generateIconRef?: React.RefObject<HTMLButtonElement | null>;
  /** When false, news prefetch and thumbnail preloading wait for the host page to finish booting. */
  pageEssentialsReady?: boolean;
};

export function AtfxTrendingNewsDrawer({
  open,
  onClose,
  panelLeftClass = "lg:left-[calc((100dvw-min(100dvw,1800px))/2+2rem+28rem+2rem)]",
  variant = "topics",
  onUseNews,
  onGenerateTopic,
  generatingNewsItemId = null,
  generateDisabled = false,
  drawerRef,
  generateIconRef,
  pageEssentialsReady = true,
}: AtfxTrendingNewsDrawerProps) {
  const { authFetch } = useAuth();
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categories, setCategories] = useState<Set<string>>(() => new Set());
  const [visibleCount, setVisibleCount] = useState(LAZY_PAGE_SIZE);
  const [articleModalUrl, setArticleModalUrl] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const preloadedThumbnailUrlsRef = useRef(new Set<string>());
  const newsFetchInFlightRef = useRef(false);
  const debouncedSearch = useDebounce(search, 300);

  const toggleCategory = (cat: string) => {
    setCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const fetchNews = useCallback(
    async (forceRefresh: boolean) => {
      if (newsFetchInFlightRef.current && !forceRefresh) return;
      newsFetchInFlightRef.current = true;
      if (forceRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await authFetch("/api/news", forceRefresh ? { forceRefresh: true } : undefined);
        if (res.ok) {
          const data = await res.json();
          const list: NewsItem[] = Array.isArray(data) ? data : [];
          list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          setItems(list);
          setVisibleCount(LAZY_PAGE_SIZE);
        } else {
          const err = await res.json().catch(() => ({}));
          setError(err?.error || `Failed to load news (${res.status})`);
        }
      } catch {
        setError("Could not reach the server.");
      } finally {
        newsFetchInFlightRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [authFetch]
  );

  useEffect(() => {
    if (!open || items.length > 0 || loading) return;
    void fetchNews(false);
  }, [open, items.length, loading, fetchNews]);

  useEffect(() => {
    if (!pageEssentialsReady || open || items.length > 0 || loading || refreshing) return;

    let cancelled = false;
    const warmCache = () => {
      if (cancelled || items.length > 0) return;
      void fetchNews(false);
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
  }, [pageEssentialsReady, open, items.length, loading, refreshing, fetchNews]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setArticleModalUrl(null);
    }
  }, [open]);

  useEffect(() => {
    setVisibleCount(LAZY_PAGE_SIZE);
  }, [debouncedSearch, categories]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (articleModalUrl) {
        setArticleModalUrl(null);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, articleModalUrl, onClose]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return items.filter((item) => {
      const matchSearch =
        !q ||
        (item.title && item.title.toLowerCase().includes(q)) ||
        (item.summary && item.summary.toLowerCase().includes(q)) ||
        (item.source && item.source.toLowerCase().includes(q));
      const matchCategory =
        categories.size === 0 ||
        (item.category != null && item.category !== "" && categories.has(item.category));
      return matchSearch && matchCategory;
    });
  }, [items, debouncedSearch, categories]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  useEffect(() => {
    if (!pageEssentialsReady || !open || loading || items.length === 0) return;

    const skipUrls = preloadedThumbnailUrlsRef.current;
    preloadNewsThumbnails(visible, skipUrls);

    const visibleIds = new Set(visible.map((item) => item.id));
    const rest = items.filter((item) => !visibleIds.has(item.id));
    if (rest.length === 0) return;

    let cancelIdle = () => {};
    scheduleIdleThumbnailPreload(rest, skipUrls, (cancel) => {
      cancelIdle = cancel;
    });
    return () => cancelIdle();
  }, [pageEssentialsReady, open, loading, items, visible, visibleCount]);

  const loadMore = useCallback(() => {
    setVisibleCount((c) => Math.min(c + LAZY_PAGE_SIZE, filtered.length));
  }, [filtered.length]);

  useEffect(() => {
    if (!open || !hasMore || !loadMoreRef.current) return;
    const root = scrollRef.current;
    const el = loadMoreRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { root, rootMargin: "120px", threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [open, hasMore, loadMore, filtered.length, visibleCount, loading]);

  const openArticlePreview = (url: string) => {
    if (isHostBlockingIframe(url)) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    setArticleModalUrl(url);
  };

  const handleHeadlineClick = (item: NewsItem) => {
    if (variant === "research") {
      onUseNews?.(item);
      return;
    }
    if (!item.url) return;
    openArticlePreview(item.url);
  };

  const helpText =
    variant === "research"
      ? "Click a headline to add it to the chat input, then press Send to start the report."
      : "Click a headline to read (same as the News page). Use trending bubbles to drag keywords into Generate.";

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="atfx-news-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[75] bg-black/35 pointer-events-auto"
              aria-hidden
              onClick={onClose}
            />
            <motion.div
              ref={drawerRef}
              id="atfx-news-drawer"
              key="atfx-news-panel"
              role="dialog"
              aria-modal="true"
              aria-label="Trending Articles"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "tween", duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
              className={`fixed top-16 bottom-0 left-0 right-0 z-[76] w-full min-w-0 max-w-[100vw] overflow-x-hidden overflow-y-hidden bg-white shadow-2xl flex flex-col border-l border-slate-200 pointer-events-auto ${panelLeftClass} lg:w-auto lg:max-w-none`}
            >
              <div className="shrink-0 flex items-center justify-between gap-2 px-4 sm:px-6 lg:px-8 py-3 border-b border-slate-200 bg-slate-50">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 min-w-0">
                  <Newspaper className="w-5 h-5 text-primary shrink-0" />
                  <span className="truncate">Trending Articles</span>
                </h3>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => void fetchNews(true)}
                    disabled={loading || refreshing}
                    className="p-2 rounded-lg text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-50"
                    title="Refresh news"
                    aria-label="Refresh news"
                  >
                    <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
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
                        onClick={() => toggleCategory(cat)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                          categories.has(cat)
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
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search headlines…"
                    className="min-w-0 flex-1 w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                    autoComplete="off"
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-2 leading-tight">{helpText}</p>
              </div>
              <div
                ref={scrollRef}
                className="flex-1 min-h-0 min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain px-4 sm:px-6 lg:px-8 py-3"
              >
                {loading && items.length === 0 ? (
                  <ContentAreaLoader variant="drawer" message="Loading news…" />
                ) : error ? (
                  <div className="text-center py-12 px-2">
                    <p className="text-sm text-red-600 font-medium mb-2">{error}</p>
                    <button
                      type="button"
                      onClick={() => void fetchNews(true)}
                      className="text-sm text-primary font-semibold hover:underline"
                    >
                      Try again
                    </button>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 text-sm">
                    {items.length === 0 ? "No articles yet." : "No articles match your search."}
                  </div>
                ) : (
                  <div className="grid w-full max-w-full min-w-0 justify-items-stretch grid-cols-1 min-[520px]:grid-cols-2 lg:[grid-template-columns:repeat(3,minmax(0,1fr))] gap-2 sm:gap-3 pb-4 [box-sizing:border-box]">
                    {visible.map((item, idx) => (
                      <div key={item.id} className="min-w-0">
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: Math.min(idx * 0.015, 0.35) }}
                          className="card relative box-border group h-full min-w-0 max-w-full overflow-hidden flex flex-col p-2 sm:p-2.5 hover:shadow-md transition-shadow border border-slate-200"
                        >
                          <NewsItemThumbnail
                            item={item}
                            onOpen={() => {
                              if (!item.url) return;
                              openArticlePreview(item.url);
                            }}
                          />
                          {variant === "topics" && onGenerateTopic ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onGenerateTopic(item);
                              }}
                              ref={idx === 0 ? generateIconRef : undefined}
                              className="absolute bottom-1.5 right-1.5 z-10 rounded-md p-1.5 text-primary hover:bg-primary/10 border border-slate-200 bg-white shadow-sm transition-colors sm:bottom-2 sm:right-2"
                              title="Generate ATFX SEO topic from this headline"
                              aria-label="Generate ATFX SEO topic from this headline"
                              disabled={generatingNewsItemId != null || generateDisabled}
                            >
                              {generatingNewsItemId === item.id ? (
                                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                              ) : (
                                <Sparkles className="w-4 h-4" />
                              )}
                            </button>
                          ) : null}
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
                              onClick={() => handleHeadlineClick(item)}
                              className="text-left w-full disabled:opacity-50"
                              disabled={variant === "topics" && !item.url}
                            >
                              <span className="text-[11px] sm:text-xs font-semibold text-slate-900 line-clamp-3 leading-snug break-words [overflow-wrap:anywhere] underline underline-offset-2 decoration-slate-300 group-hover:text-primary group-hover:decoration-primary">
                                {item.title || "—"}
                              </span>
                            </button>
                            {variant === "research" && item.summary ? (
                              <p className="text-[10px] text-slate-500 line-clamp-2 leading-snug break-words [overflow-wrap:anywhere]">
                                {item.summary}
                              </p>
                            ) : null}
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
                    {hasMore ? (
                      <div
                        ref={loadMoreRef}
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

      {articleModalUrl ? (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setArticleModalUrl(null)}
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
                href={articleModalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-primary hover:underline truncate max-w-[60%]"
              >
                Open in new tab
              </a>
              <button
                type="button"
                onClick={() => setArticleModalUrl(null)}
                className="p-2 rounded-lg hover:bg-slate-200 text-slate-600 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {isHostBlockingIframe(articleModalUrl) ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 bg-slate-50">
                <p className="text-slate-600 text-center max-w-md">
                  This article can&apos;t be shown in the preview because the site blocks embedding. Open it in a new tab to read.
                </p>
                <a
                  href={articleModalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-primary text-white font-semibold hover:bg-primary/90 transition-colors"
                >
                  Open in new tab
                </a>
              </div>
            ) : (
              <iframe
                src={articleModalUrl}
                title="Article"
                className="flex-1 w-full min-h-0 border-0"
                sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                referrerPolicy="no-referrer"
              />
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

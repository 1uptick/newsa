import React, { useState, useEffect, useRef, useCallback, memo } from "react";
import { useNavigate } from "react-router-dom";
import { Newspaper, PenTool, ChevronRight, Loader2, Plus, X, RefreshCw } from "lucide-react";
import { motion } from "motion/react";
import { useAuth } from "../contexts/AuthContext";
import { useDebounce } from "../lib/useDebounce";
import type { NewsItem } from "../types";

const LAZY_PAGE_SIZE = 12;

// Hosts that block embedding in iframes (X-Frame-Options / CSP). Show "Open in new tab" instead.
const IFRAME_BLOCKING_HOSTS = [
  "yahoo.com",
  "cnbc.com",
  "reuters.com",
  "bloomberg.com",
  "wsj.com",
  "ft.com",
  "economist.com",
  "bbc.com",
  "bbc.co.uk",
  "theguardian.com",
  "nytimes.com",
  "washingtonpost.com",
  "cnn.com",
  "npr.org",
  "axios.com",
  "politico.com",
  "marketwatch.com",
  "barrons.com",
  "seekingalpha.com",
  "investing.com",
  "businessinsider.com",
];

function isHostBlockingIframe(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return IFRAME_BLOCKING_HOSTS.some((blocked) => host === blocked || host.endsWith("." + blocked));
  } catch {
    return false;
  }
}

export default function Dashboard() {
  const { authFetch } = useAuth();
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(LAZY_PAGE_SIZE);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const MAX_SOURCE_ARTICLES = 3;
  const [selectedNews, setSelectedNews] = useState<NewsItem[]>([]);
  const [dropZoneActive, setDropZoneActive] = useState(false);
  const [additionalContext, setAdditionalContext] = useState("");
  const [articleModalUrl, setArticleModalUrl] = useState<string | null>(null);
  const ALLOWED_CATEGORIES = ["FX", "Commodities", "Global"] as const;
  const [filterCategories, setFilterCategories] = useState<Set<string>>(new Set(ALLOWED_CATEGORIES));
  const [filterSources, setFilterSources] = useState<Set<string>>(new Set());
  const [searchKeywords, setSearchKeywords] = useState("");
  const [sourcesList, setSourcesList] = useState<string[]>([]);
  const navigate = useNavigate();

  const toggleCategory = (cat: string) => {
    setFilterCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const toggleSource = (src: string) => {
    setFilterSources((prev) => {
      const next = new Set(prev);
      if (next.has(src)) next.delete(src);
      else next.add(src);
      return next;
    });
  };

  const handleDragStart = (e: DragEvent, item: NewsItem) => {
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
        const item = JSON.parse(raw) as NewsItem;
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

  const fetchNews = useCallback(async (forceRefresh = false) => {
    setFetchError(null);
    if (forceRefresh) setRefreshing(true);
    try {
      const res = await authFetch("/api/news", { forceRefresh });
      if (res.ok) {
        const data = await res.json();
        const items: NewsItem[] = Array.isArray(data) ? data : [];
        items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setNews(items);
        setVisibleCount(LAZY_PAGE_SIZE);
      } else {
        const err = await res.json().catch(() => ({}));
        setFetchError(err?.error || `Failed to load news (${res.status})`);
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
    fetchNews();
  }, [fetchNews]);

  useEffect(() => {
    const fetchSources = async () => {
      try {
        const res = await authFetch("/api/news/sources");
        if (res.ok) {
          const data = await res.json();
          setSourcesList(Array.isArray(data) ? data : []);
        }
      } catch (_) {
        setSourcesList([]);
      }
    };
    fetchSources();
  }, [authFetch]);

  const sources = sourcesList.length > 0 ? sourcesList : Array.from(new Set((news || []).map((n) => n.source).filter(Boolean))).sort();
  const debouncedSearch = useDebounce(searchKeywords, 300);
  const searchLower = debouncedSearch.trim().toLowerCase();
  const filteredNews = (news || []).filter((item) => {
    const matchSearch = !searchLower || (item.title && item.title.toLowerCase().includes(searchLower)) || (item.summary && item.summary.toLowerCase().includes(searchLower));
    const matchCategory = filterCategories.size === 0 || (item.category && filterCategories.has(item.category));
    const matchSource = filterSources.size === 0 || (item.source && filterSources.has(item.source));
    return matchSearch && matchCategory && matchSource;
  });
  const displayNews = filteredNews;
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
        <Newspaper className="w-5 h-5 text-primary" /> Source News
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
          {sourceNewsPanel}
          {generationOptionsPanel}
          {sidebarBottomBar}
        </aside>
        <main className="flex-1 min-w-0 order-1 lg:order-2">
          <header className="mb-6">
            <div className="space-y-4 p-4 rounded-xl bg-slate-50 border border-slate-300">
              <div className="flex items-center justify-between gap-4 mb-2">
                <span className="text-sm font-medium text-slate-600">Filters</span>
                <button
                  type="button"
                  onClick={() => fetchNews(true)}
                  disabled={refreshing}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-primary bg-white border border-slate-300 rounded-lg transition-colors disabled:opacity-50"
                  title="Refresh news (bypass cache)"
                >
                  <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
                  {refreshing ? "Refreshing..." : "Refresh"}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {ALLOWED_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      filterCategories.has(cat)
                        ? "bg-secondary text-slate-800 border border-slate-300"
                        : "bg-slate-100 text-slate-600 border border-slate-200"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {sources.map((src) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => toggleSource(src)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      filterSources.has(src)
                        ? "bg-secondary text-slate-800 border border-slate-300"
                        : "bg-slate-100 text-slate-600 border border-slate-200"
                    }`}
                  >
                    {src}
                  </button>
                ))}
              </div>
              <input
                type="search"
                placeholder="Search by keywords"
                value={searchKeywords}
                onChange={(e) => setSearchKeywords(e.target.value)}
                className="w-full px-4 py-2.5 text-sm border border-slate-300 rounded-lg bg-white text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              />
            </div>
          </header>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
              <p className="text-slate-500 animate-pulse">Fetching latest updates...</p>
            </div>
          ) : fetchError ? (
            <div className="flex flex-col items-center justify-center py-20 text-center max-w-md mx-auto">
              <p className="text-slate-600 font-medium mb-2">Couldn’t load news</p>
              <p className="text-slate-500 text-sm mb-4">{fetchError}</p>
              <p className="text-slate-400 text-xs">
                Check that Airtable is configured in .env and the server is running.
              </p>
            </div>
          ) : displayNews.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Newspaper className="w-14 h-14 text-slate-200 mb-4" />
              <p className="text-slate-600 font-medium mb-1">
                {news.length === 0 ? "No articles yet" : "No articles match the current filters"}
              </p>
              <p className="text-slate-500 text-sm">
                {news.length === 0 ? "News will appear here once Airtable has items." : "Try changing Category or Source above."}
              </p>
            </div>
          ) : (
            <>
            <div className="grid grid-cols-1 gap-4">
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
                  className="card group hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 cursor-grab active:cursor-grabbing"
                >
                  <div className="px-5 py-4 flex items-center gap-4">
                    <div className="w-[150px] h-20 shrink-0 rounded overflow-hidden bg-white flex items-center justify-center">
                      <img
                        src={item.thumbnail || `https://picsum.photos/seed/${item.id}/300/160`}
                        alt=""
                        className="w-full h-full object-contain"
                        loading="lazy"
                        decoding="async"
                        width={150}
                        height={80}
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {item.category && (
                          <span
                            className="text-xs font-bold px-2.5 py-1 rounded text-white uppercase tracking-wide shrink-0"
                            style={{ background: "linear-gradient(to right, #ff7900, #facc15)" }}
                          >
                            {item.category}
                          </span>
                        )}
                        <span className="text-sm text-slate-500 shrink-0">
                          {item.date ? new Date(item.date).toLocaleString(undefined, { month: "numeric", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—"}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (!item.url) return;
                          if (isHostBlockingIframe(item.url)) {
                            window.open(item.url, "_blank", "noopener,noreferrer");
                            return;
                          }
                          setArticleModalUrl(item.url);
                        }}
                        className="text-left w-full"
                      >
                        <h3 className="text-base font-semibold text-slate-900 line-clamp-2 group-hover:text-primary transition-colors underline underline-offset-2 decoration-slate-300 hover:decoration-primary">
                          {item.title || "—"}
                        </h3>
                      </button>
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

      {articleModalUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
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
                  This article can’t be shown in the preview because the site blocks embedding. Open it in a new tab to read.
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
      )}
    </div>
  );
}

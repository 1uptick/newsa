import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { Loader2, FileText, Plus, X, Trash2, BookOpen, Download, MoreVertical, ChevronLeft } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { getHtmlContent, escapeAttr, articleDownloadLeadHtml, articleDownloadPlainText } from "../../lib/html";
import { Modal } from "../../components/Modal";
import { ContentAreaLoader } from "../../components/ContentAreaLoader";

import {
  parseContentIntoBlocks,
  insertImageAfterBlockContent,
  replaceBlockAtIndex,
} from "../../lib/articleContentBlocks";
import { AtfxDetailEditor } from "./AtfxDetailEditor";
import type { AtfxArticleDetail, AtfxArticleItem } from "./atfxArticleTypes";
import { proseArticleClass } from "./atfxArticleTypes";

export type { AtfxArticleItem } from "./atfxArticleTypes";

/** Cap on the per-session article-detail cache (bodies can be large; evict oldest beyond this). */
const CONTENT_CACHE_MAX = 30;

export default function AtfxArticlePage() {
  const { authFetch } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [items, setItems] = useState<AtfxArticleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [articleDetail, setArticleDetail] = useState<AtfxArticleDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  /** Per-session cache of fetched article details keyed by id, so re-selecting a row is instant. */
  const contentCacheRef = useRef(new Map<string, AtfxArticleDetail>());
  /** The article id that `articleDetail` currently belongs to (guards cache writes during transitions). */
  const loadedContentIdRef = useRef<string | null>(null);
  const [languageTab, setLanguageTab] = useState<"tc" | "en">("tc");
  const [readModalOpen, setReadModalOpen] = useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const [uploadModal, setUploadModal] = useState<{ articleId: string; afterIndex: number; lang: "tc" | "en" } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editModal, setEditModal] = useState<{ articleId: string; blockIndex: number; html: string; lang: "tc" | "en" } | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [titleEditDraft, setTitleEditDraft] = useState<string | null>(null);
  const [savingTitle, setSavingTitle] = useState(false);
  const [listRefreshing, setListRefreshing] = useState(false);

  /** Tracks article ids we have already seen so polls can detect newly saved rows. */
  const knownIdsRef = useRef<Set<string>>(new Set());
  const searchQueryRef = useRef(searchQuery);
  useEffect(() => {
    searchQueryRef.current = searchQuery;
  }, [searchQuery]);

  useEffect(() => {
    authFetch("/api/atfx/sync", { method: "POST" }).catch(() => {});
  }, [authFetch]);

  useEffect(() => {
    setMobileActionsOpen(false);
  }, [selectedId, mobileDetailOpen]);

  useEffect(() => {
    if (mobileDetailOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [mobileDetailOpen]);

  useEffect(() => {
    setTitleEditDraft(null);
    setEditModal(null);
    setUploadModal(null);
  }, [languageTab]);

  useEffect(() => {
    setTitleEditDraft(null);
  }, [selectedId]);

  const fetchDetail = useCallback(
    async (articleId: string) => {
      const cached = contentCacheRef.current.get(articleId);
      if (cached) {
        setArticleDetail(cached);
        setDetailLoading(false);
        loadedContentIdRef.current = articleId;
        return;
      }
      setDetailLoading(true);
      try {
        const res = await authFetch(`/api/atfx/${articleId}/content`);
        if (res.ok) {
          const data = await res.json();
          const detail: AtfxArticleDetail = {
            titleTC: data.titleTC ?? "",
            titleEN: data.titleEN ?? "",
            excerptTC: data.excerptTC ?? "",
            excerptEN: data.excerptEN ?? "",
            contentTC: data.contentTC ?? "",
            contentEN: data.contentEN ?? "",
            thumbnailUrl: typeof data.thumbnailUrl === "string" ? data.thumbnailUrl : "",
          };
          setArticleDetail(detail);
          loadedContentIdRef.current = articleId;
          const cache = contentCacheRef.current;
          cache.set(articleId, detail);
          if (cache.size > CONTENT_CACHE_MAX) {
            const oldest = cache.keys().next().value;
            if (oldest !== undefined) cache.delete(oldest);
          }
        } else {
          setArticleDetail(null);
        }
      } catch {
        setArticleDetail(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [authFetch]
  );

  const fetchArticleListCore = useCallback(async (): Promise<AtfxArticleItem[]> => {
    const res = await authFetch("/api/atfx");
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error || "Failed to load data");
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }, [authFetch]);

  const applyListFromServer = useCallback(
    (rawList: AtfxArticleItem[], mode: "initial" | "poll") => {
      if (mode === "initial") {
        let list = rawList;
        let pendingOpen: string | null = null;
        try {
          const fromStorage = sessionStorage.getItem("atfxOpenArticleId");
          if (fromStorage?.trim()) {
            pendingOpen = fromStorage.trim();
            sessionStorage.removeItem("atfxOpenArticleId");
          }
        } catch {
          /* ignore */
        }
        const openId = (location.state as { openArticleId?: string } | null)?.openArticleId?.trim() || null;
        const targetId = pendingOpen || openId;
        if (targetId && !list.some((i) => i.id === targetId)) {
          list = [
            {
              id: targetId,
              createdDate: "",
              titleTC: "",
              excerptTC: "",
              titleEN: "",
              excerptEN: "",
            },
            ...list,
          ];
        }
        setItems(list);
        knownIdsRef.current = new Set(list.map((i) => i.id));
        if (targetId) {
          setSelectedId(targetId);
          if (openId) navigate("/atfx", { replace: true, state: {} });
        } else if (list.length > 0) {
          setSelectedId((prev) => (prev != null && list.some((i) => i.id === prev) ? prev : list[0].id));
        }
        return;
      }

      const prevIds = knownIdsRef.current;
      const list = rawList;
      const hasBrandNew = list.some((i) => !prevIds.has(i.id));
      setItems(list);
      if (hasBrandNew && !searchQueryRef.current.trim()) {
        const newestNew = list.find((i) => !prevIds.has(i.id))?.id;
        if (newestNew) setSelectedId(newestNew);
      } else {
        setSelectedId((prev) => (prev != null && list.some((i) => i.id === prev) ? prev : list[0]?.id ?? null));
      }
      knownIdsRef.current = new Set(list.map((i) => i.id));
    },
    [location.state, navigate]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      setLoading(true);
      try {
        const list = await fetchArticleListCore();
        if (cancelled) return;
        applyListFromServer(list, "initial");
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not reach the server.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchArticleListCore, applyListFromServer]);

  const pollArticleList = useCallback(async () => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    setListRefreshing(true);
    try {
      const list = await fetchArticleListCore();
      applyListFromServer(list, "poll");
    } catch {
      /* ignore transient poll errors */
    } finally {
      setListRefreshing(false);
    }
  }, [fetchArticleListCore, applyListFromServer]);

  /** After the first load, poll once soon so a just-finished article appears without waiting for the long interval. */
  useEffect(() => {
    if (loading || error) return;
    const t = window.setTimeout(() => void pollArticleList(), 4000);
    return () => clearTimeout(t);
  }, [loading, error, pollArticleList]);

  /** Keep the list fresh while this page is open (e.g. after background article generation). */
  useEffect(() => {
    const intervalMs = 12_000;
    const id = window.setInterval(() => void pollArticleList(), intervalMs);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void pollArticleList();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pollArticleList]);

  useEffect(() => {
    if (selectedId) fetchDetail(selectedId);
    else setArticleDetail(null);
  }, [selectedId, fetchDetail]);

  // Mirror in-place edits of the selected article into its cache entry (guarded to the loaded id so a
  // transition or failed fetch never writes stale/empty content). See 1uptickarticles for the rationale.
  useEffect(() => {
    if (!selectedId || detailLoading || articleDetail === null) return;
    if (loadedContentIdRef.current !== selectedId) return;
    contentCacheRef.current.set(selectedId, articleDetail);
  }, [selectedId, articleDetail, detailLoading]);

  useEffect(() => {
    setLanguageTab("tc");
  }, [selectedId]);

  const itemMatchesQuery = (item: AtfxArticleItem, q: string) => {
    if (!q) return true;
    const hay = `${item.titleTC} ${item.titleEN} ${item.excerptTC} ${item.excerptEN}`.toLowerCase();
    return hay.includes(q);
  };

  const filteredItems = useMemo(
    () => items.filter((item) => itemMatchesQuery(item, searchQuery.trim().toLowerCase())),
    [items, searchQuery]
  );

  const selectedItem = selectedId ? items.find((i) => i.id === selectedId) : null;

  const activeTitle = articleDetail ? (languageTab === "tc" ? articleDetail.titleTC : articleDetail.titleEN) : "";
  const activeExcerpt = articleDetail ? (languageTab === "tc" ? articleDetail.excerptTC : articleDetail.excerptEN) : "";
  const activeBody = articleDetail ? (languageTab === "tc" ? articleDetail.contentTC : articleDetail.contentEN) : "";

  const mobileActionsDropdown = selectedItem && articleDetail && !detailLoading && (
    <div
      className="absolute right-0 top-full mt-2 w-56 rounded-xl bg-white shadow-2xl border border-slate-200 py-1.5 z-[100] ring-1 ring-black ring-opacity-5 animate-in fade-in slide-in-from-top-2 duration-150"
      onMouseLeave={() => setMobileActionsOpen(false)}
    >
      <button
        type="button"
        onClick={() => {
          setReadModalOpen(true);
          setMobileActionsOpen(false);
        }}
        className="w-full text-left px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-primary transition-colors flex items-center gap-3"
      >
        <BookOpen className="w-4 h-4 text-slate-400" />
        View full article
      </button>
      <button
        type="button"
        onClick={() => {
          const body = getHtmlContent(activeBody || "");
          const title = activeTitle || "article";
          const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeAttr(title)}</title></head><body>${articleDownloadLeadHtml(title, activeExcerpt)}${body}</body></html>`;
          const blob = new Blob([fullHtml], { type: "text/html;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          const baseName = title.slice(0, 50).replace(/[<>:"/\\|?*]/g, "") || "article";
          a.download = `${baseName}.html`;
          a.click();
          URL.revokeObjectURL(url);
          setMobileActionsOpen(false);
        }}
        className="w-full text-left px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-primary transition-colors flex items-center gap-3"
      >
        <Download className="w-4 h-4 text-slate-400" />
        Download as HTML
      </button>
      <button
        type="button"
        onClick={() => {
          const body = getHtmlContent(activeBody || "");
          const title = activeTitle || "article";
          const text = articleDownloadPlainText(title, activeExcerpt, body);
          const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${title.slice(0, 50).replace(/[<>:"/\\|?*]/g, "") || "article"}.txt`;
          a.click();
          URL.revokeObjectURL(url);
          setMobileActionsOpen(false);
        }}
        className="w-full text-left px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-primary transition-colors flex items-center gap-3"
      >
        <FileText className="w-4 h-4 text-slate-400" />
        Download as plain text
      </button>
    </div>
  );

  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = q ? items.filter((i) => itemMatchesQuery(i, q)) : items;
    const stillVisible = selectedId && filtered.some((i) => i.id === selectedId);
    if (filtered.length > 0 && !stillVisible) setSelectedId(filtered[0].id);
  }, [searchQuery, items, selectedId]);

  const currentLangContent = (lang: "tc" | "en") =>
    articleDetail ? (lang === "tc" ? articleDetail.contentTC : articleDetail.contentEN) : "";

  if (loading) {
    return <ContentAreaLoader variant="page" constrained message="Loading..." pulseMessage={false} />;
  }

  if (error) {
    return (
      <div className="w-full max-w-[1800px] mx-auto px-4 py-20 text-center">
        <p className="text-slate-600 font-medium mb-2">Couldn&apos;t load ATFX articles</p>
        <p className="text-slate-500 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex flex-col h-[calc(100vh-8rem)] min-h-[480px] rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
        <header
          className="shrink-0 flex items-center justify-between gap-4 px-4 py-3 border-b border-primary-dark/30 z-[60]"
          style={{ background: "linear-gradient(to right, var(--color-primary), #facc15)" }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-lg font-bold text-white drop-shadow-sm">Articles</h2>
            {listRefreshing ? (
              <Loader2
                className="w-4 h-4 text-white/90 animate-spin shrink-0"
                aria-hidden
              />
            ) : null}
            <span className="sr-only" role="status">
              {listRefreshing ? "Checking for new articles" : ""}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {selectedItem && articleDetail && !detailLoading && (
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <div className="hidden lg:flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setReadModalOpen(true)}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-[#91e6f5] hover:border-[#91e6f5] transition-colors"
                  >
                    <BookOpen className="w-4 h-4" />
                    View full article
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const body = getHtmlContent(activeBody);
                      const title = activeTitle || "article";
                      const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeAttr(title)}</title></head><body>${articleDownloadLeadHtml(title, activeExcerpt)}${body}</body></html>`;
                      const blob = new Blob([fullHtml], { type: "text/html;charset=utf-8" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      const baseName = title.slice(0, 50).replace(/[<>:"/\\|?*]/g, "") || "article";
                      a.download = `${baseName}.html`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-[#91e6f5] hover:border-[#91e6f5] transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Download as HTML
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const body = getHtmlContent(activeBody || "");
                      const title = activeTitle || "article";
                      const text = articleDownloadPlainText(title, activeExcerpt, body);
                      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${title.slice(0, 50).replace(/[<>:"/\\|?*]/g, "") || "article"}.txt`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-[#91e6f5] hover:border-[#91e6f5] transition-colors"
                  >
                    <FileText className="w-4 h-4" />
                    Download as plain text
                  </button>
                </div>

                <div className="lg:hidden relative">
                  <button
                    type="button"
                    onClick={() => setMobileActionsOpen(!mobileActionsOpen)}
                    className="p-2 rounded-lg bg-white/20 text-white hover:bg-white/30 transition-colors"
                    aria-expanded={mobileActionsOpen}
                    aria-haspopup="true"
                    aria-label="Article actions"
                  >
                    <MoreVertical className="w-5 h-5" />
                  </button>
                  {mobileActionsOpen && mobileActionsDropdown}
                </div>
              </div>
            )}
          </div>
        </header>
        <div className="flex flex-col lg:flex-row flex-1 min-h-0 relative">
          <aside className="lg:w-[380px] shrink-0 flex flex-col border-r border-slate-200 bg-slate-50/50">
            <div className="p-3 border-b border-slate-200 bg-white">
              <label htmlFor="atfx-article-search" className="sr-only">
                Search articles
              </label>
              <input
                id="atfx-article-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search title or excerpt…"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredItems.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-sm">No items match your search.</div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {filteredItems.map((item) => {
                    const isSelected = item.id === selectedId;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedId(item.id);
                            setMobileDetailOpen(true);
                          }}
                          className={`w-full text-left px-3 py-4 transition-colors ${
                            isSelected ? "bg-secondary/75 hover:bg-secondary-dark/75 lg:bg-secondary/75" : "bg-white hover:bg-slate-50"
                          }`}
                        >
                          <p className="text-xs text-slate-600 mb-1">
                            {item.createdDate
                              ? new Date(item.createdDate).toLocaleDateString(undefined, { year: "numeric", month: "numeric", day: "numeric" })
                              : "—"}
                          </p>
                          <p className="font-semibold text-slate-900 mb-1">{item.titleTC?.trim() || "—"}</p>
                          <div
                            className={`text-sm text-slate-600 prose prose-sm prose-slate max-w-none ${proseArticleClass}`}
                            dangerouslySetInnerHTML={{ __html: getHtmlContent(item.excerptTC || "") }}
                          />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>

          <main className="hidden lg:flex flex-1 min-w-0 flex-col overflow-hidden bg-white">
            {selectedItem ? (
              <div className="flex-1 overflow-y-auto py-6 px-10 border-l border-slate-200">
                <AtfxDetailEditor
                  selectedItem={selectedItem}
                  languageTab={languageTab}
                  setLanguageTab={setLanguageTab}
                  detail={articleDetail}
                  loading={detailLoading}
                  authFetch={authFetch}
                  setArticleDetail={setArticleDetail}
                  setItems={setItems}
                  titleEditDraft={titleEditDraft}
                  setTitleEditDraft={setTitleEditDraft}
                  savingTitle={savingTitle}
                  setSavingTitle={setSavingTitle}
                  setEditModal={setEditModal}
                  setEditDraft={setEditDraft}
                  setUploadModal={setUploadModal}
                />
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500 py-20">
                <FileText className="w-14 h-14 mb-4 text-slate-200" />
                <p className="text-sm">Select an item from the list.</p>
              </div>
            )}
          </main>

          <AnimatePresence>
            {mobileDetailOpen && selectedItem && (
              <motion.main
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-white lg:hidden"
              >
                <header
                  className="shrink-0 flex items-center justify-between gap-4 px-4 py-3 border-b border-primary-dark/30"
                  style={{ background: "linear-gradient(to right, var(--color-primary), #facc15)" }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <button
                      type="button"
                      onClick={() => setMobileDetailOpen(false)}
                      className="p-1 rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors shrink-0"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <h2 className="text-lg font-bold text-white drop-shadow-sm truncate max-w-[200px]">{selectedItem.titleTC}</h2>
                  </div>
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setMobileActionsOpen(!mobileActionsOpen)}
                      className="p-2 rounded-lg bg-white/20 text-white hover:bg-white/30 transition-colors"
                    >
                      <MoreVertical className="w-5 h-5" />
                    </button>
                    {mobileActionsOpen && mobileActionsDropdown}
                  </div>
                </header>

                <div className="flex-1 overflow-y-auto py-6 px-4 border-slate-200">
                  <AtfxDetailEditor
                    selectedItem={selectedItem}
                    languageTab={languageTab}
                    setLanguageTab={setLanguageTab}
                    detail={articleDetail}
                    loading={detailLoading}
                    authFetch={authFetch}
                    setArticleDetail={setArticleDetail}
                    setItems={setItems}
                    titleEditDraft={titleEditDraft}
                    setTitleEditDraft={setTitleEditDraft}
                    savingTitle={savingTitle}
                    setSavingTitle={setSavingTitle}
                    setEditModal={setEditModal}
                    setEditDraft={setEditDraft}
                    setUploadModal={setUploadModal}
                  />
                </div>
              </motion.main>
            )}
          </AnimatePresence>
        </div>
      </div>

      {readModalOpen && articleDetail && selectedItem && (
        <Modal
          open
          onClose={() => setReadModalOpen(false)}
          title={languageTab === "tc" ? articleDetail.titleTC || "Articles" : articleDetail.titleEN || "Articles"}
          maxWidth="max-w-6xl"
          panelClassName="h-[85vh]"
          ariaLabel="View full article"
        >
          <div className="p-6 flex flex-col h-full min-h-0">
            <div className="shrink-0 mb-4">
              <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1 w-fit gap-1">
                <button
                  type="button"
                  onClick={() => setLanguageTab("tc")}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    languageTab === "tc" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Traditional Chinese
                </button>
                <button
                  type="button"
                  onClick={() => setLanguageTab("en")}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    languageTab === "en" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  English
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <header className="mb-8 pb-6 border-b border-slate-200">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-4">{activeTitle?.trim() || "—"}</h1>
                {activeExcerpt?.trim() ? (
                  <div
                    className="capital-detail html-content max-w-none [&_p]:text-slate-600"
                    dangerouslySetInnerHTML={{ __html: getHtmlContent(activeExcerpt) }}
                  />
                ) : null}
              </header>
              <div
                className="capital-detail html-content max-w-none min-h-[120px]"
                dangerouslySetInnerHTML={{ __html: getHtmlContent(activeBody) }}
              />
            </div>
          </div>
        </Modal>
      )}

      {uploadModal && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50"
          onClick={() => {
            setUploadModal(null);
            setUploadError(null);
          }}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">Add image</h3>
              <button
                type="button"
                onClick={() => {
                  setUploadModal(null);
                  setUploadError(null);
                }}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const input = form.querySelector<HTMLInputElement>('input[type="file"]');
                const file = input?.files?.[0];
                if (!file) {
                  setUploadError("Please choose an image file.");
                  return;
                }
                const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
                if (!allowedTypes.includes(file.type)) {
                  setUploadError("Please choose a JPEG, PNG, GIF, or WebP image.");
                  return;
                }
                const maxSizeBytes = 5 * 1024 * 1024;
                if (file.size > maxSizeBytes) {
                  setUploadError("Image must be 5MB or smaller.");
                  return;
                }
                setUploading(true);
                setUploadError(null);
                try {
                  const fd = new FormData();
                  fd.append("file", file);
                  const upRes = await authFetch("/api/atfx/upload-image", { method: "POST", body: fd });
                  if (!upRes.ok) {
                    const err = await upRes.json().catch(() => ({}));
                    throw new Error(err?.error ?? (upRes.status === 413 ? "Image must be 5MB or smaller." : "Upload failed"));
                  }
                  const { url } = await upRes.json();
                  const lang = uploadModal.lang;
                  const currentContent = currentLangContent(lang);
                  const contentBlocks = parseContentIntoBlocks(getHtmlContent(currentContent));
                  const newContent = insertImageAfterBlockContent(contentBlocks, uploadModal.afterIndex, url);
                  const patchRes = await authFetch(`/api/atfx/${uploadModal.articleId}/content`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ content: newContent, lang }),
                  });
                  if (!patchRes.ok) throw new Error("Failed to save");
                  setArticleDetail((prev) =>
                    prev ? (lang === "tc" ? { ...prev, contentTC: newContent } : { ...prev, contentEN: newContent }) : null
                  );
                  setUploadModal(null);
                } catch (err: unknown) {
                  setUploadError((err as Error)?.message ?? "Something went wrong.");
                } finally {
                  setUploading(false);
                }
              }}
            >
              <input
                type="file"
                name="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary file:text-white file:font-medium file:cursor-pointer cursor-pointer"
              />
              <p className="mt-2 text-xs text-slate-500">JPEG, PNG, GIF, or WebP. Maximum size: 5MB.</p>
              {uploadError && <p className="mt-2 text-sm text-red-600">{uploadError}</p>}
              <div className="mt-4 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setUploadModal(null);
                    setUploadError(null);
                  }}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="px-4 py-2 bg-primary text-white font-medium rounded-lg hover:bg-primary-dark disabled:opacity-50"
                >
                  {uploading ? "Uploading…" : "Upload"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editModal && articleDetail && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50"
          onClick={() => {
            setEditModal(null);
            setEditDraft("");
          }}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">Edit paragraph</h3>
              <button
                type="button"
                onClick={() => {
                  setEditModal(null);
                  setEditDraft("");
                }}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <textarea
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              className="w-full flex-1 min-h-[200px] p-3 rounded-lg border border-slate-200 text-slate-800 font-mono text-sm resize-y"
              placeholder="HTML content (e.g. <p>...</p>)"
              spellCheck={false}
            />
            <div className="mt-4 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setEditModal(null);
                  setEditDraft("");
                }}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!editModal) return;
                  setSavingEdit(true);
                  try {
                    const lang = editModal.lang;
                    const html = getHtmlContent(currentLangContent(lang));
                    const contentBlocks = parseContentIntoBlocks(html);
                    const newContent = replaceBlockAtIndex(contentBlocks, editModal.blockIndex, editDraft.trim() ? editDraft : "<p></p>");
                    const patchRes = await authFetch(`/api/atfx/${editModal.articleId}/content`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ content: newContent, lang }),
                    });
                    if (!patchRes.ok) throw new Error("Failed to save");
                    setArticleDetail((prev) =>
                      prev ? (lang === "tc" ? { ...prev, contentTC: newContent } : { ...prev, contentEN: newContent }) : null
                    );
                    setEditModal(null);
                    setEditDraft("");
                  } catch {
                    /* ignore */
                  } finally {
                    setSavingEdit(false);
                  }
                }}
                disabled={savingEdit}
                className="px-4 py-2 bg-primary text-white font-medium rounded-lg hover:bg-primary-dark disabled:opacity-50"
              >
                {savingEdit ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

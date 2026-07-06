import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { Loader2, FileText, Plus, X, Pencil, Trash2, BookOpen, Download, MoreVertical, ChevronLeft, Image, Rocket, Eraser } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useSetNavbarSupplement } from "../../contexts/NavbarSupplementContext";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import {
  getHtmlContent,
  escapeAttr,
  articleDownloadLeadHtml,
  articleDownloadPlainText,
  cleanWordPressBodyMarkdownArtifacts,
} from "../../lib/html";
import { Modal } from "../../components/Modal";
import { ContentAreaLoader } from "../../components/ContentAreaLoader";

import {
  CapitalArticleDetailView,
  type ArticleDetailEditModalPayload,
  type ArticleDetailUploadModalPayload,
} from "../Capital/CapitalArticleDetailView";
import type { CapitalItem } from "../Capital/capitalArticleTypes";
import {
  OneuptickArticleUploadModal,
  OneuptickArticleBlockEditModal,
} from "./oneuptickArticleEditorModals";

const proseOneuptickEnglish =
  "prose prose-slate max-w-none prose-headings:text-slate-900 prose-p:text-slate-600 prose-a:text-primary prose-strong:text-slate-800 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_table]:border [&_table]:border-slate-200 [&_img]:max-w-full [&_img]:h-auto";

/** Cap on the per-session article-body cache (bodies can be large; evict oldest beyond this). */
const CONTENT_CACHE_MAX = 30;

function OneuptickEnglishExcerptEditor({
  articleId,
  excerptHtml,
  authFetch,
  onSaved,
}: {
  articleId: string;
  excerptHtml: string;
  authFetch: (url: string, init?: RequestInit) => Promise<Response>;
  onSaved: (html: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (draft !== null) {
    return (
      <div className="mb-6 pb-6 border-b border-slate-200">
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Excerpt (English)
        </label>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full min-h-[120px] p-3 rounded-lg border border-slate-200 text-slate-800 font-mono text-sm resize-y"
          placeholder="HTML (e.g. <p>...</p>)"
          spellCheck={false}
        />
        <div className="flex gap-2 mt-2">
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                const res = await authFetch(`/api/oneuptick/articles/${articleId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ excerptEn: draft }),
                });
                if (res.ok) {
                  onSaved(draft);
                  setDraft(null);
                }
              } finally {
                setSaving(false);
              }
            }}
            className="px-3 py-1.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-dark disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setDraft(null)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group/excerpt mb-6 pb-6 border-b border-slate-200">
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Excerpt (English)</span>
        <button
          type="button"
          onClick={() => setDraft(excerptHtml)}
          className="shrink-0 inline-flex items-center gap-1 text-slate-500 text-xs font-medium opacity-90 group-hover/excerpt:opacity-100 hover:text-primary transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" /> Edit
        </button>
      </div>
      {excerptHtml.trim() ? (
        <div
          className={`${proseOneuptickEnglish} prose-p:text-slate-600`}
          dangerouslySetInnerHTML={{ __html: getHtmlContent(excerptHtml) }}
        />
      ) : (
        <p className="text-sm text-slate-400">No excerpt — click Edit to add.</p>
      )}
    </div>
  );
}

export default function OneUptickArticlesPage() {
  const { authFetch } = useAuth();
  const setCenterSupplement = useSetNavbarSupplement();
  const location = useLocation();
  const navigate = useNavigate();
  const [items, setItems] = useState<CapitalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [rightContent, setRightContent] = useState<string | null>(null);
  const [rightContentLoading, setRightContentLoading] = useState(false);
  /** English fields from Airtable (Title_en, Excerpt_EN, Article_en); null until first fetch for this article. */
  const [englishDetail, setEnglishDetail] = useState<{
    title: string;
    excerpt: string;
    article: string;
  } | null>(null);
  /**
   * Per-session cache of fetched article bodies keyed by id, so switching back to a previously-viewed
   * row is instant instead of refetching. Only populated from successful fetches; a sync effect below
   * keeps an entry fresh after in-place edits (all content mutations target the selected article).
   */
  const contentCacheRef = useRef(
    new Map<string, { content: string; englishDetail: { title: string; excerpt: string; article: string } }>()
  );
  /** The article id that `rightContent`/`englishDetail` currently belong to (guards cache writes during transitions). */
  const loadedContentIdRef = useRef<string | null>(null);
  const [detailLocaleTab, setDetailLocaleTab] = useState<"tc" | "en">("tc");
  const [uploadModal, setUploadModal] = useState<ArticleDetailUploadModalPayload | null>(null);
  const [editModal, setEditModal] = useState<ArticleDetailEditModalPayload | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [readModalOpen, setReadModalOpen] = useState(false);
  const [titleEditDraft, setTitleEditDraft] = useState<string | null>(null);
  const [savingTitle, setSavingTitle] = useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const [thumbnailModalOpen, setThumbnailModalOpen] = useState(false);
  const [thumbnailDraft, setThumbnailDraft] = useState("");
  const [savingThumbnail, setSavingThumbnail] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [cleaningContentArtifacts, setCleaningContentArtifacts] = useState(false);

  useEffect(() => {
    setMobileActionsOpen(false);
  }, [selectedId, mobileDetailOpen]);

  useBodyScrollLock(mobileDetailOpen);

  const fetchContent = useCallback(async (articleId: string) => {
    const cached = contentCacheRef.current.get(articleId);
    if (cached) {
      setRightContent(cached.content);
      setEnglishDetail(cached.englishDetail);
      setRightContentLoading(false);
      loadedContentIdRef.current = articleId;
      return;
    }
    setEnglishDetail(null);
    setRightContentLoading(true);
    try {
      const res = await authFetch(`/api/oneuptick/articles/${articleId}/content`);
      if (res.ok) {
        const data = await res.json();
        const content = data.content ?? "";
        const english = {
          title: typeof data.titleEn === "string" ? data.titleEn : "",
          excerpt: typeof data.excerptEn === "string" ? data.excerptEn : "",
          article: typeof data.contentEn === "string" ? data.contentEn : "",
        };
        setRightContent(content);
        setEnglishDetail(english);
        loadedContentIdRef.current = articleId;
        const cache = contentCacheRef.current;
        cache.set(articleId, { content, englishDetail: english });
        if (cache.size > CONTENT_CACHE_MAX) {
          const oldest = cache.keys().next().value;
          if (oldest !== undefined) cache.delete(oldest);
        }
      } else {
        setRightContent("");
        setEnglishDetail({ title: "", excerpt: "", article: "" });
      }
    } catch {
      setRightContent("");
      setEnglishDetail({ title: "", excerpt: "", article: "" });
    } finally {
      setRightContentLoading(false);
    }
  }, [authFetch]);

  // Keep the cached entry in sync with in-place edits. All content mutations on this page target the
  // selected article and update `rightContent`/`englishDetail`, so mirroring them here means a later
  // re-select shows the edited body without a refetch. The loaded-id guard ensures we only write when
  // the displayed content actually belongs to `selectedId` (never during a transition or after a failed
  // fetch, whose empty state must not be cached as if it were real content).
  useEffect(() => {
    if (!selectedId || rightContentLoading) return;
    if (rightContent === null || englishDetail === null) return;
    if (loadedContentIdRef.current !== selectedId) return;
    contentCacheRef.current.set(selectedId, { content: rightContent, englishDetail });
  }, [selectedId, rightContent, englishDetail, rightContentLoading]);

  useEffect(() => {
    const fetchItems = async () => {
      setError(null);
      try {
        const res = await authFetch("/api/oneuptick/articles");
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : [];
          setItems(list);
          const openId = (location.state as { openArticleId?: string } | null)?.openArticleId;
          if (openId && list.some((i: CapitalItem) => i.id === openId)) {
            setSelectedId(openId);
            navigate("/1uptick/articles", { replace: true, state: {} });
          } else if (list.length > 0) {
            setSelectedId(list[0].id);
          }
        } else {
          const err = await res.json().catch(() => ({}));
          const detail = [err?.error, err?.airtableError].filter(Boolean).join(" — ");
          setError(detail || "Failed to load data");
        }
      } catch (err) {
        console.error(err);
        setError("Could not reach the server.");
      } finally {
        setLoading(false);
      }
    };
    fetchItems();
  }, [authFetch]);

  useEffect(() => {
    setDetailLocaleTab("tc");
    if (selectedId) {
      // fetchContent resets/loads englishDetail itself (instant on a cache hit, null-then-fetch on a miss).
      fetchContent(selectedId);
    } else {
      setRightContent(null);
      setEnglishDetail(null);
    }
  }, [selectedId, fetchContent]);

  useEffect(() => {
    return () => setCenterSupplement(null);
  }, [setCenterSupplement]);

  useEffect(() => {
    setTitleEditDraft(null);
  }, [selectedId]);

  useEffect(() => {
    setTitleEditDraft(null);
  }, [detailLocaleTab]);

  useEffect(() => {
    setThumbnailModalOpen(false);
  }, [selectedId]);

  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          (item.title && item.title.toLowerCase().includes(q)) ||
          (item.excerpt && item.excerpt.toLowerCase().includes(q))
        );
      }),
    [items, searchQuery]
  );

  const selectedItem = selectedId ? items.find((i) => i.id === selectedId) : null;
  const thumbReady = Boolean(selectedItem?.thumb_url?.trim());

  useEffect(() => {
    if (loading) {
      setCenterSupplement("1uptick Articles · Loading…");
      return;
    }
    if (error) {
      setCenterSupplement("1uptick Articles · Could not load list");
      return;
    }
    if (!selectedItem) {
      setCenterSupplement("1uptick Articles · Select an article");
      return;
    }
    const statusStr = selectedItem.status?.trim() || "—";
    const publishRaw = selectedItem.publish_status;
    const hasSeparatePublish = publishRaw !== undefined;
    const publishStr = (typeof publishRaw === "string" ? publishRaw.trim() : "") || "—";
    setCenterSupplement(
      hasSeparatePublish
        ? `1uptick · Status: ${statusStr} · Publish status: ${publishStr}`
        : `1uptick · Publish status: ${statusStr}`
    );
  }, [loading, error, selectedItem, setCenterSupplement]);

  const englishPanelLoading = rightContentLoading || englishDetail === null;

  const localeTabs = (
    <div className="flex gap-0 mb-6 border-b border-slate-200" role="tablist" aria-label="Article language">
      <button
        type="button"
        role="tab"
        aria-selected={detailLocaleTab === "tc"}
        onClick={() => setDetailLocaleTab("tc")}
        className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
          detailLocaleTab === "tc"
            ? "border-primary text-primary"
            : "border-transparent text-slate-500 hover:text-slate-700"
        }`}
      >
        繁體中文
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={detailLocaleTab === "en"}
        onClick={() => setDetailLocaleTab("en")}
        className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
          detailLocaleTab === "en"
            ? "border-primary text-primary"
            : "border-transparent text-slate-500 hover:text-slate-700"
        }`}
      >
        English
      </button>
    </div>
  );

  const handlePublish = useCallback(async () => {
    if (!selectedItem) return;
    if (!selectedItem.thumb_url?.trim()) {
      window.alert("Set a thumbnail URL before publishing.");
      return;
    }
    setPublishing(true);
    try {
      const res = await authFetch(`/api/oneuptick/articles/${selectedItem.id}/publish`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `Publish failed (${res.status})`);
      }
    } catch (e) {
      window.alert((e as Error).message || "Publish failed");
    } finally {
      setPublishing(false);
      setMobileActionsOpen(false);
    }
  }, [authFetch, selectedItem]);

  const handleCleanMarkdownArtifacts = useCallback(async () => {
    if (!selectedItem || englishDetail === null || rightContentLoading) return;
    const tc = rightContent ?? "";
    const en = englishDetail.article ?? "";
    const newTc = cleanWordPressBodyMarkdownArtifacts(tc);
    const newEn = cleanWordPressBodyMarkdownArtifacts(en);
    if (newTc === tc && newEn === en) {
      window.alert("No markdown-style artifacts detected in the TC or EN article body.");
      return;
    }
    setCleaningContentArtifacts(true);
    try {
      if (newTc !== tc) {
        const res = await authFetch(`/api/oneuptick/articles/${selectedItem.id}/content`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: newTc }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error || `Saving TC body failed (${res.status})`);
        }
        setRightContent(newTc);
      }
      if (newEn !== en) {
        const res = await authFetch(`/api/oneuptick/articles/${selectedItem.id}/content`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: newEn, locale: "en" }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error || `Saving EN body failed (${res.status})`);
        }
        setEnglishDetail((d) => (d ? { ...d, article: newEn } : d));
      }
    } catch (e) {
      window.alert((e as Error).message || "Could not save cleaned content.");
    } finally {
      setCleaningContentArtifacts(false);
      setMobileActionsOpen(false);
    }
  }, [authFetch, selectedItem, englishDetail, rightContent, rightContentLoading]);

  const mobileActionsDropdown = selectedItem && englishDetail !== null && !rightContentLoading && (
    <div 
      className="absolute right-0 top-full mt-2 w-56 rounded-xl bg-white shadow-2xl border border-slate-200 py-1.5 z-[100] ring-1 ring-black ring-opacity-5 animate-in fade-in slide-in-from-top-2 duration-150"
      onMouseLeave={() => setMobileActionsOpen(false)}
    >
      {rightContent?.trim() ? (
        <button
          type="button"
          onClick={() => { setReadModalOpen(true); setMobileActionsOpen(false); }}
          className="w-full text-left px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-primary transition-colors flex items-center gap-3"
        >
          <BookOpen className="w-4 h-4 text-slate-400" />
          View full article
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => void handleCleanMarkdownArtifacts()}
        disabled={cleaningContentArtifacts}
        className="w-full text-left px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-primary transition-colors flex items-center gap-3 disabled:opacity-50"
      >
        {cleaningContentArtifacts ? (
          <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
        ) : (
          <Eraser className="w-4 h-4 text-slate-400" />
        )}
        Clean markdown (TC + EN)
      </button>
      {rightContent?.trim() ? (
        <button
          type="button"
          onClick={() => {
            const body = getHtmlContent(rightContent || "");
            const title = selectedItem?.title || "article";
            const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeAttr(title)}</title></head><body>${articleDownloadLeadHtml(title, selectedItem?.excerpt)}${body}</body></html>`;
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
      ) : null}
      {rightContent?.trim() ? (
        <button
          type="button"
          onClick={() => {
            const body = getHtmlContent(rightContent || "");
            const title = selectedItem?.title || "article";
            const text = articleDownloadPlainText(title, selectedItem?.excerpt, body);
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
      ) : null}
      <button
        type="button"
        onClick={() => {
          void handlePublish();
        }}
        disabled={publishing || !thumbReady}
        title={!thumbReady ? "Set a thumbnail URL before publishing" : undefined}
        className="w-full text-left px-4 py-3 text-sm font-medium text-red-700 hover:bg-red-50 transition-colors flex items-center gap-3 disabled:opacity-50"
      >
        {publishing ? <Loader2 className="w-4 h-4 text-red-600 animate-spin" /> : <Rocket className="w-4 h-4 text-red-600" />}
        Publish
      </button>
    </div>
  );

  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? items.filter(
          (i) =>
            (i.title && i.title.toLowerCase().includes(q)) ||
            (i.excerpt && i.excerpt.toLowerCase().includes(q))
        )
      : items;
    const stillVisible = selectedId && filtered.some((i) => i.id === selectedId);
    if (filtered.length > 0 && !stillVisible) setSelectedId(filtered[0].id);
  }, [searchQuery, items, selectedId]);

  if (loading) {
    return <ContentAreaLoader variant="page" constrained message="Loading..." pulseMessage={false} />;
  }

  if (error) {
    return (
      <div className="w-full max-w-[1800px] mx-auto px-4 py-20 text-center">
        <p className="text-slate-600 font-medium mb-2">Couldn't load 1uptick articles</p>
        <p className="text-slate-500 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex flex-col h-[calc(100vh-8rem)] min-h-[480px] rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
        {/* Top bar: Articles (left) · Thumbnail + actions (right) */}
        <header
          className="shrink-0 flex items-center justify-between gap-4 px-4 py-3 border-b border-primary-dark/30 z-[60]"
          style={{ background: "linear-gradient(to right, var(--color-primary), #facc15)" }}
        >
          <div className="flex items-center min-w-0">
            <h2 className="text-lg font-bold text-white drop-shadow-sm">Articles</h2>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end min-w-0">
            {selectedItem && (
              <button
                type="button"
                onClick={() => {
                  setThumbnailDraft(selectedItem.thumb_url ?? "");
                  setThumbnailModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium shadow-sm hover:bg-[#91e6f5] hover:border-[#91e6f5] transition-colors"
              >
                <Image className="w-4 h-4 shrink-0" aria-hidden />
                Thumbnail
              </button>
            )}
            {selectedItem && englishDetail !== null && !rightContentLoading && (
              <button
                type="button"
                onClick={() => void handleCleanMarkdownArtifacts()}
                disabled={cleaningContentArtifacts}
                title="Remove leaked \\n, /n, //n and light **markdown** from TC and EN article HTML, then save"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium shadow-sm hover:bg-[#91e6f5] hover:border-[#91e6f5] transition-colors disabled:opacity-50"
              >
                {cleaningContentArtifacts ? (
                  <Loader2 className="w-4 h-4 shrink-0 animate-spin" aria-hidden />
                ) : (
                  <Eraser className="w-4 h-4 shrink-0" aria-hidden />
                )}
                Clean markdown
              </button>
            )}
            {selectedItem && englishDetail !== null && !rightContentLoading && (
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {/* Desktop view actions */}
                <div className="hidden lg:flex items-center gap-2">
                {rightContent?.trim() ? (
                  <>
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
                        const body = getHtmlContent(rightContent);
                        const title = selectedItem?.title || "article";
                        const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeAttr(title)}</title></head><body>${articleDownloadLeadHtml(title, selectedItem?.excerpt)}${body}</body></html>`;
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
                        const body = getHtmlContent(rightContent || "");
                        const title = selectedItem?.title || "article";
                        const text = articleDownloadPlainText(title, selectedItem?.excerpt, body);
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
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handlePublish()}
                  disabled={publishing || !thumbReady}
                  title={!thumbReady ? "Set a thumbnail URL before publishing" : undefined}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-red-600 bg-red-600 text-white text-sm font-medium hover:bg-red-700 hover:border-red-700 transition-colors disabled:opacity-50"
                >
                  {publishing ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Rocket className="w-4 h-4 text-white" />}
                  Publish
                </button>
                </div>

                {/* Mobile view actions (hamburger) */}
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
        {/* Left: inbox list */}
        <aside className="lg:w-[380px] shrink-0 flex flex-col border-r border-slate-200 bg-slate-50/50">
          <div className="flex-1 overflow-y-auto">
            {filteredItems.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-sm">
                No items match your search.
              </div>
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
                          isSelected
                            ? "bg-secondary/75 hover:bg-secondary-dark/75 lg:bg-secondary/75"
                            : "bg-white hover:bg-slate-50"
                        }`}
                      >
                        <p className="font-semibold text-slate-900 mb-1">
                          {item.title || "—"}
                        </p>
                        <div
                          className="text-sm text-slate-600 prose prose-sm prose-slate max-w-none"
                          dangerouslySetInnerHTML={{ __html: getHtmlContent(item.excerpt || "") }}
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* Desktop Detail view (static) */}
        <main className="hidden lg:flex flex-1 min-w-0 flex-col overflow-hidden bg-white">
          {selectedItem ? (
            <div className="flex-1 overflow-y-auto py-6 px-10 border-l border-slate-200">
              {localeTabs}
              {detailLocaleTab === "tc" ? (
                <CapitalArticleDetailView
                  articleId={selectedItem.id}
                  displayTitle={selectedItem.title}
                  oneuptickLocale="tc"
                  titleEditDraft={titleEditDraft}
                  setTitleEditDraft={setTitleEditDraft}
                  savingTitle={savingTitle}
                  setSavingTitle={setSavingTitle}
                  patchTitle={(id, title) =>
                    authFetch(`/api/oneuptick/articles/${id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ title }),
                    })
                  }
                  patchContent={(id, content) =>
                    authFetch(`/api/oneuptick/articles/${id}/content`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ content }),
                    })
                  }
                  onTitleSaved={(newTitle) =>
                    setItems((prev) => prev.map((i) => (i.id === selectedItem.id ? { ...i, title: newTitle } : i)))
                  }
                  rightContentLoading={rightContentLoading}
                  rightContent={rightContent}
                  setEditModal={setEditModal}
                  setEditDraft={setEditDraft}
                  setUploadModal={setUploadModal}
                  setRightContent={setRightContent}
                />
              ) : englishPanelLoading ? (
                <ContentAreaLoader variant="panel" size="sm" message="Loading content..." pulseMessage={false} />
              ) : englishDetail != null ? (
                <CapitalArticleDetailView
                  articleId={selectedItem.id}
                  displayTitle={englishDetail.title}
                  oneuptickLocale="en"
                  middleSlot={
                    <OneuptickEnglishExcerptEditor
                      articleId={selectedItem.id}
                      excerptHtml={englishDetail.excerpt}
                      authFetch={authFetch}
                      onSaved={(html) => setEnglishDetail((d) => (d ? { ...d, excerpt: html } : d))}
                    />
                  }
                  titleEditDraft={titleEditDraft}
                  setTitleEditDraft={setTitleEditDraft}
                  savingTitle={savingTitle}
                  setSavingTitle={setSavingTitle}
                  patchTitle={(id, title) =>
                    authFetch(`/api/oneuptick/articles/${id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ titleEn: title }),
                    })
                  }
                  patchContent={(id, content) =>
                    authFetch(`/api/oneuptick/articles/${id}/content`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ content, locale: "en" }),
                    })
                  }
                  onTitleSaved={(newTitle) =>
                    setEnglishDetail((d) => (d ? { ...d, title: newTitle } : d))
                  }
                  rightContentLoading={false}
                  rightContent={englishDetail.article.trim() ? englishDetail.article : null}
                  setEditModal={setEditModal}
                  setEditDraft={setEditDraft}
                  setUploadModal={setUploadModal}
                  setRightContent={(c) =>
                    setEnglishDetail((d) => (d ? { ...d, article: c ?? "" } : d))
                  }
                />
              ) : null}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 py-20">
              <FileText className="w-14 h-14 mb-4 text-slate-200" />
              <p className="text-sm">Select an item from the list.</p>
            </div>
          )}
        </main>

        {/* Mobile Detail view (animated slide-up) */}
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
                  <h2 className="text-lg font-bold text-white drop-shadow-sm truncate max-w-[140px] sm:max-w-[200px]">
                    {selectedItem.title}
                  </h2>
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
                {localeTabs}
                {detailLocaleTab === "tc" ? (
                  <CapitalArticleDetailView
                    articleId={selectedItem.id}
                    displayTitle={selectedItem.title}
                    oneuptickLocale="tc"
                    titleEditDraft={titleEditDraft}
                    setTitleEditDraft={setTitleEditDraft}
                    savingTitle={savingTitle}
                  setSavingTitle={setSavingTitle}
                    patchTitle={(id, title) =>
                      authFetch(`/api/oneuptick/articles/${id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ title }),
                      })
                    }
                    patchContent={(id, content) =>
                      authFetch(`/api/oneuptick/articles/${id}/content`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ content }),
                      })
                    }
                    onTitleSaved={(newTitle) =>
                      setItems((prev) => prev.map((i) => (i.id === selectedItem.id ? { ...i, title: newTitle } : i)))
                    }
                    rightContentLoading={rightContentLoading}
                    rightContent={rightContent}
                    setEditModal={setEditModal}
                    setEditDraft={setEditDraft}
                    setUploadModal={setUploadModal}
                    setRightContent={setRightContent}
                  />
                ) : englishPanelLoading ? (
                  <ContentAreaLoader variant="panel" size="sm" message="Loading content..." pulseMessage={false} />
                ) : englishDetail != null ? (
                  <CapitalArticleDetailView
                    articleId={selectedItem.id}
                    displayTitle={englishDetail.title}
                    oneuptickLocale="en"
                    middleSlot={
                      <OneuptickEnglishExcerptEditor
                        articleId={selectedItem.id}
                        excerptHtml={englishDetail.excerpt}
                        authFetch={authFetch}
                        onSaved={(html) => setEnglishDetail((d) => (d ? { ...d, excerpt: html } : d))}
                      />
                    }
                    titleEditDraft={titleEditDraft}
                    setTitleEditDraft={setTitleEditDraft}
                    savingTitle={savingTitle}
                  setSavingTitle={setSavingTitle}
                    patchTitle={(id, title) =>
                      authFetch(`/api/oneuptick/articles/${id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ titleEn: title }),
                      })
                    }
                    patchContent={(id, content) =>
                      authFetch(`/api/oneuptick/articles/${id}/content`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ content, locale: "en" }),
                      })
                    }
                    onTitleSaved={(newTitle) =>
                      setEnglishDetail((d) => (d ? { ...d, title: newTitle } : d))
                    }
                    rightContentLoading={false}
                    rightContent={englishDetail.article.trim() ? englishDetail.article : null}
                    setEditModal={setEditModal}
                    setEditDraft={setEditDraft}
                    setUploadModal={setUploadModal}
                    setRightContent={(c) =>
                      setEnglishDetail((d) => (d ? { ...d, article: c ?? "" } : d))
                    }
                  />
                ) : null}
              </div>
            </motion.main>
          )}
        </AnimatePresence>
        </div>
      </div>

      {readModalOpen && rightContent && selectedItem && (
        <Modal
          open
          onClose={() => setReadModalOpen(false)}
          title={selectedItem.title || "Articles"}
          maxWidth="max-w-6xl"
          panelClassName="h-[85vh]"
          ariaLabel="View full article"
        >
          <div className="p-6">
            <header className="mb-8 pb-6 border-b border-slate-200">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-4">
                {selectedItem.title?.trim() || "—"}
              </h1>
              {selectedItem.excerpt?.trim() ? (
                <div
                  className="prose prose-slate max-w-none prose-headings:text-slate-900 prose-p:text-slate-600 prose-a:text-primary prose-strong:text-slate-800 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_table]:border [&_table]:border-slate-200 [&_img]:max-w-full [&_img]:h-auto"
                  dangerouslySetInnerHTML={{ __html: getHtmlContent(selectedItem.excerpt) }}
                />
              ) : null}
            </header>
            <div
              className="prose prose-slate max-w-none prose-headings:text-slate-900 prose-p:text-slate-700 prose-a:text-primary prose-strong:text-slate-900 prose-strong:font-semibold [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-6 [&_h1]:mb-4 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-6 [&_h2]:mb-3 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2 [&_h4]:text-base [&_h4]:font-semibold [&_h4]:mt-3 [&_h4]:mb-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_table]:border [&_table]:border-slate-200 [&_img]:max-w-full [&_img]:h-auto"
              dangerouslySetInnerHTML={{ __html: getHtmlContent(rightContent) }}
            />
          </div>
        </Modal>
      )}

      {thumbnailModalOpen && selectedItem && (
        <Modal
          open
          onClose={() => !savingThumbnail && setThumbnailModalOpen(false)}
          title="Thumbnail"
          maxWidth="max-w-lg"
          closeOnBackdrop={!savingThumbnail}
          closeDisabled={savingThumbnail}
          ariaLabel="Edit thumb_url"
          footer={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => !savingThumbnail && setThumbnailModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-100 transition-colors disabled:opacity-50"
                disabled={savingThumbnail}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!selectedItem || savingThumbnail) return;
                  setSavingThumbnail(true);
                  try {
                    const res = await authFetch(`/api/oneuptick/articles/${selectedItem.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ thumb_url: thumbnailDraft.trim() }),
                    });
                    if (!res.ok) {
                      const err = await res.json().catch(() => ({}));
                      throw new Error(err?.error || "Failed to save");
                    }
                    setItems((prev) =>
                      prev.map((i) =>
                        i.id === selectedItem.id ? { ...i, thumb_url: thumbnailDraft.trim() } : i
                      )
                    );
                    setThumbnailModalOpen(false);
                  } catch (e) {
                    console.error(e);
                  } finally {
                    setSavingThumbnail(false);
                  }
                }}
                disabled={savingThumbnail}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {savingThumbnail ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Save
              </button>
            </div>
          }
        >
          <div className="p-4 flex flex-col gap-2">
            <label htmlFor="oneuptick-thumb-url" className="text-sm font-medium text-slate-700">
              thumb_url
            </label>
            <input
              id="oneuptick-thumb-url"
              type="text"
              value={thumbnailDraft}
              onChange={(e) => setThumbnailDraft(e.target.value)}
              placeholder="https://…"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-900 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
              disabled={savingThumbnail}
              autoComplete="off"
            />
          </div>
        </Modal>
      )}

      <OneuptickArticleUploadModal
        payload={uploadModal}
        onClose={() => setUploadModal(null)}
        apiBase="/api/oneuptick/articles"
        authFetch={authFetch}
        getRawArticle={(isEn) => (isEn ? englishDetail?.article ?? "" : rightContent || "")}
        applyContent={(isEn, newContent) =>
          isEn
            ? setEnglishDetail((d) => (d ? { ...d, article: newContent } : d))
            : setRightContent(newContent)
        }
      />

      <OneuptickArticleBlockEditModal
        payload={editModal}
        draft={editDraft}
        setDraft={setEditDraft}
        onClose={() => { setEditModal(null); setEditDraft(""); }}
        apiBase="/api/oneuptick/articles"
        authFetch={authFetch}
        getRawArticle={(isEn) => (isEn ? englishDetail?.article ?? "" : rightContent || "")}
        applyContent={(isEn, newContent) =>
          isEn
            ? setEnglishDetail((d) => (d ? { ...d, article: newContent } : d))
            : setRightContent(newContent)
        }
      />

    </div>
  );
}

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { Loader2, FileText, Plus, X, Pencil, Trash2, BookOpen, Download, MoreVertical, ChevronLeft, Mail } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { getHtmlContent, externalizeLinksInSanitizedHtml, articleDownloadPlainText, downloadArticleAsHtml } from "../../lib/html";
import { Modal } from "../../components/Modal";
import { ContentAreaLoader } from "../../components/ContentAreaLoader";

import {
  parseContentIntoBlocks,
  insertImageAfterBlockContent,
  replaceBlockAtIndex,
} from "../../lib/articleContentBlocks";
import { NotifyArticlesModal, type NotifyArticlesModalConfig } from "../../components/NotifyArticlesModal";
import { CapitalArticleDetailView } from "./CapitalArticleDetailView";
import { CapitalExcerptEditor } from "./CapitalExcerptEditor";
import type { CapitalItem } from "./capitalArticleTypes";
import { parseHttpErrorJsonDetail } from "../../lib/parseHttpErrorJsonDetail";

export type { CapitalItem } from "./capitalArticleTypes";

/** Cap on the per-session article-body cache (bodies can be large; evict oldest beyond this). */
const CONTENT_CACHE_MAX = 30;

const CAPITAL_NOTIFY_CONFIG: NotifyArticlesModalConfig = {
  modalTitle: "Notify users about Capital Articles",
  description:
    "Send a notification email to selected recipients about Capital Articles. They will receive a link to sign in and view the portal.",
  ariaLabel: "Select recipients and send Capital Articles notification",
  recipientsUrl: "/api/capitalkeywords/email-recipients",
  notifyUrl: "/api/capital/notify-articles",
  usersColumnTitle: "Capital group users",
  usersColumnHint: "Select users to notify",
  emptyUsersMessage: "No capital group users with email.",
};

export default function CapitalArticlePage() {
  const { authFetch, role } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [items, setItems] = useState<CapitalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [rightContent, setRightContent] = useState<string | null>(null);
  const [rightContentLoading, setRightContentLoading] = useState(false);
  /** Per-session cache of fetched article bodies keyed by id, so re-selecting a row is instant. */
  const contentCacheRef = useRef(new Map<string, string>());
  /** The article id that `rightContent` currently belongs to (guards cache writes during transitions). */
  const loadedContentIdRef = useRef<string | null>(null);
  const [uploadModal, setUploadModal] = useState<{ articleId: string; afterIndex: number } | null>(null);
  const [uploadAlt, setUploadAlt] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editModal, setEditModal] = useState<{ articleId: string; blockIndex: number; html: string } | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [readModalOpen, setReadModalOpen] = useState(false);
  const [titleEditDraft, setTitleEditDraft] = useState<string | null>(null);
  const [savingTitle, setSavingTitle] = useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const [reviseModalOpen, setReviseModalOpen] = useState(false);
  const [reviseComment, setReviseComment] = useState("");
  const [savingRevise, setSavingRevise] = useState(false);
  const [sendArticlesModalOpen, setSendArticlesModalOpen] = useState(false);

  useEffect(() => {
    authFetch("/api/capital/sync", { method: "POST" }).catch(() => {});
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

  const fetchContent = useCallback(async (articleId: string) => {
    const cached = contentCacheRef.current.get(articleId);
    if (cached !== undefined) {
      setRightContent(cached);
      setRightContentLoading(false);
      loadedContentIdRef.current = articleId;
      return;
    }
    setRightContentLoading(true);
    try {
      const res = await authFetch(`/api/capital/${articleId}/content`);
      if (res.ok) {
        const data = await res.json();
        const content = data.content ?? "";
        setRightContent(content);
        loadedContentIdRef.current = articleId;
        const cache = contentCacheRef.current;
        cache.set(articleId, content);
        if (cache.size > CONTENT_CACHE_MAX) {
          const oldest = cache.keys().next().value;
          if (oldest !== undefined) cache.delete(oldest);
        }
        if (typeof data.comments === "string") {
          setItems((prev) => prev.map((i) => (i.id === articleId ? { ...i, comments: data.comments } : i)));
        }
      } else {
        setRightContent("");
      }
    } catch {
      setRightContent("");
    } finally {
      setRightContentLoading(false);
    }
  }, [authFetch]);

  // Mirror in-place edits of the selected article into its cache entry (guarded to the loaded id so a
  // transition or failed fetch never writes stale/empty content). See 1uptickarticles for the rationale.
  useEffect(() => {
    if (!selectedId || rightContentLoading || rightContent === null) return;
    if (loadedContentIdRef.current !== selectedId) return;
    contentCacheRef.current.set(selectedId, rightContent);
  }, [selectedId, rightContent, rightContentLoading]);

  useEffect(() => {
    const fetchItems = async () => {
      setError(null);
      try {
        const res = await authFetch("/api/capital", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : [];
          setItems(list);
          const openId = (location.state as { openArticleId?: string } | null)?.openArticleId;
          if (openId && list.some((i: CapitalItem) => i.id === openId)) {
            setSelectedId(openId);
            navigate("/capital", { replace: true, state: {} });
          } else if (list.length > 0) {
            setSelectedId(list[0].id);
          }
        } else {
          const err = await res.json().catch(() => ({}));
          setError(err?.error || "Failed to load data");
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
    if (selectedId) fetchContent(selectedId);
    else setRightContent(null);
  }, [selectedId, fetchContent]);

  useEffect(() => {
    setTitleEditDraft(null);
  }, [selectedId]);

  const filteredItems = items.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (item.title && item.title.toLowerCase().includes(q)) ||
      (item.excerpt && item.excerpt.toLowerCase().includes(q))
    );
  });

  const selectedItem = selectedId ? items.find((i) => i.id === selectedId) : null;

  const excerptEditorSlot = selectedItem ? (
    <CapitalExcerptEditor
      articleId={selectedItem.id}
      excerptHtml={selectedItem.excerpt ?? ""}
      authFetch={authFetch}
      onSaved={(html) =>
        setItems((prev) => prev.map((i) => (i.id === selectedItem.id ? { ...i, excerpt: html } : i)))
      }
    />
  ) : null;

  const mobileActionsDropdown = selectedItem && rightContent && !rightContentLoading && (
    <div 
      className="absolute right-0 top-full mt-2 w-56 rounded-xl bg-white shadow-2xl border border-slate-200 py-1.5 z-[100] ring-1 ring-black ring-opacity-5 animate-in fade-in slide-in-from-top-2 duration-150"
      onMouseLeave={() => setMobileActionsOpen(false)}
    >
      <button
        type="button"
        onClick={() => { setReadModalOpen(true); setMobileActionsOpen(false); }}
        className="w-full text-left px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-primary transition-colors flex items-center gap-3"
      >
        <BookOpen className="w-4 h-4 text-slate-400" />
        View full article
      </button>
      <button
        type="button"
        onClick={() => {
          setReviseComment(selectedItem?.comments ?? "");
          setReviseModalOpen(true);
          setMobileActionsOpen(false);
        }}
        className="w-full text-left px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-primary transition-colors flex items-center gap-3"
      >
        <Pencil className="w-4 h-4 text-slate-400" />
        Revise
      </button>
      <button
        type="button"
        onClick={() => {
          if (!selectedItem || !rightContent) return;
          downloadArticleAsHtml(selectedItem.title || "article", selectedItem.excerpt, rightContent);
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
    return <ContentAreaLoader variant="page" constrained message="Loading..." />;
  }

  if (error) {
    return (
      <div className="w-full max-w-[1800px] mx-auto px-4 py-20 text-center">
        <p className="text-slate-600 font-medium mb-2">Couldn't load capital data</p>
        <p className="text-slate-500 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex flex-col h-[calc(100vh-8rem)] min-h-[480px] rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
        {/* Combined header: Articles (left) + action buttons (right) */}
        <header
          className="shrink-0 flex items-center justify-between gap-4 px-4 py-3 border-b border-primary-dark/30 z-[60]"
          style={{ background: "linear-gradient(to right, var(--color-primary), #facc15)" }}
        >
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-white drop-shadow-sm">Articles</h2>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {role === "admin" && (
              <button
                type="button"
                onClick={() => setSendArticlesModalOpen(true)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/40 bg-white/20 text-white text-sm font-medium hover:bg-white/30 transition-colors"
              >
                <Mail className="w-4 h-4" />
                Notify
              </button>
            )}
            {selectedItem && rightContent && !rightContentLoading && (
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {/* Desktop view actions */}
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
                    setReviseComment(selectedItem?.comments ?? "");
                    setReviseModalOpen(true);
                  }}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-[#91e6f5] hover:border-[#91e6f5] transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                  Revise
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!selectedItem || !rightContent) return;
                    downloadArticleAsHtml(selectedItem.title || "article", selectedItem.excerpt, rightContent);
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
                        <p className="text-xs text-slate-600 mb-1">
                          {item.createdDate ? new Date(item.createdDate).toLocaleDateString(undefined, { year: "numeric", month: "numeric", day: "numeric" }) : "—"}
                        </p>
                        <p className="font-semibold text-slate-900 mb-1">
                          {item.title || "—"}
                        </p>
                        <div
                          className="text-sm text-slate-600 prose prose-sm prose-slate max-w-none"
                          dangerouslySetInnerHTML={{
                            __html: externalizeLinksInSanitizedHtml(getHtmlContent(item.excerpt || "")),
                          }}
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
              <CapitalArticleDetailView
                articleId={selectedItem.id}
                displayTitle={selectedItem.title}
                titleEditDraft={titleEditDraft}
                setTitleEditDraft={setTitleEditDraft}
                savingTitle={savingTitle}
                setSavingTitle={setSavingTitle}
                patchTitle={(id, title) =>
                  authFetch(`/api/capital/${id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ title }),
                  })
                }
                patchContent={(id, content) =>
                  authFetch(`/api/capital/${id}/content`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ content }),
                  })
                }
                onTitleSaved={(newTitle) =>
                  setItems((prev) => prev.map((i) => (i.id === selectedItem.id ? { ...i, title: newTitle } : i)))
                }
                middleSlot={excerptEditorSlot}
                rightContentLoading={rightContentLoading}
                rightContent={rightContent}
                setEditModal={setEditModal}
                setEditDraft={setEditDraft}
                setUploadModal={setUploadModal}
                setRightContent={setRightContent}
              />
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
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMobileDetailOpen(false)}
                    className="p-1 rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <h2 className="text-lg font-bold text-white drop-shadow-sm truncate max-w-[200px]">
                    {selectedItem.title}
                  </h2>
                </div>
                <div className="relative">
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
                <CapitalArticleDetailView
                  articleId={selectedItem.id}
                  displayTitle={selectedItem.title}
                  titleEditDraft={titleEditDraft}
                  setTitleEditDraft={setTitleEditDraft}
                  savingTitle={savingTitle}
                  setSavingTitle={setSavingTitle}
                  patchTitle={(id, title) =>
                    authFetch(`/api/capital/${id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ title }),
                    })
                  }
                  patchContent={(id, content) =>
                    authFetch(`/api/capital/${id}/content`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ content }),
                    })
                  }
                  onTitleSaved={(newTitle) =>
                    setItems((prev) => prev.map((i) => (i.id === selectedItem.id ? { ...i, title: newTitle } : i)))
                  }
                  middleSlot={excerptEditorSlot}
                  rightContentLoading={rightContentLoading}
                  rightContent={rightContent}
                  setEditModal={setEditModal}
                  setEditDraft={setEditDraft}
                  setUploadModal={setUploadModal}
                  setRightContent={setRightContent}
                />
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
          <div className="p-6" lang="zh-Hant">
            <header className="mb-8 pb-6 border-b border-slate-200">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-4">
                {selectedItem.title?.trim() || "—"}
              </h1>
              {selectedItem.excerpt?.trim() ? (
                <div
                  className="capital-detail html-content max-w-none [&_p]:text-slate-600"
                  dangerouslySetInnerHTML={{
                    __html: externalizeLinksInSanitizedHtml(getHtmlContent(selectedItem.excerpt)),
                  }}
                />
              ) : null}
            </header>
            <div
              className="capital-detail html-content max-w-none min-h-[120px] [&_img]:block [&_img]:mx-auto"
              dangerouslySetInnerHTML={{ __html: externalizeLinksInSanitizedHtml(getHtmlContent(rightContent)) }}
            />
          </div>
        </Modal>
      )}

      {reviseModalOpen && selectedItem && (
        <Modal
          open
          onClose={() => setReviseModalOpen(false)}
          title="Revise"
          maxWidth="max-w-2xl"
          minHeight="min-h-[320px]"
          closeDisabled={savingRevise}
          footer={
            <>
              <button
                type="button"
                onClick={() => !savingRevise && setReviseModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-100 transition-colors disabled:opacity-50"
                disabled={savingRevise}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!selectedItem || savingRevise) return;
                  setSavingRevise(true);
                  try {
                    const res = await authFetch(`/api/capital/${selectedItem.id}/comments`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ comments: reviseComment }),
                    });
                    if (res.ok) {
                      setItems((prev) => prev.map((i) => (i.id === selectedItem.id ? { ...i, comments: reviseComment } : i)));
                      setReviseModalOpen(false);
                    }
                  } finally {
                    setSavingRevise(false);
                  }
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                disabled={savingRevise}
              >
                {savingRevise ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Save
              </button>
            </>
          }
        >
          <div className="p-4 flex flex-col gap-4">
            <label htmlFor="revise-comment" className="text-sm font-medium text-slate-700">Rewrite instructions</label>
            <textarea
              id="revise-comment"
              value={reviseComment}
              onChange={(e) => setReviseComment(e.target.value)}
              placeholder="Enter your comment..."
              rows={8}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              disabled={savingRevise}
            />
          </div>
        </Modal>
      )}

      {uploadModal && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50"
          onClick={() => { setUploadModal(null); setUploadError(null); setUploadAlt(""); }}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">Add image</h3>
              <button
                type="button"
                onClick={() => { setUploadModal(null); setUploadError(null); setUploadAlt(""); }}
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
                if (!uploadAlt.trim()) {
                  setUploadError("Please enter descriptive alt text for the image.");
                  return;
                }
                const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
                if (!allowedTypes.includes(file.type)) {
                  setUploadError("Please choose a JPEG, PNG, GIF, or WebP image.");
                  return;
                }
                const maxSizeBytes = 5 * 1024 * 1024; // 5MB
                if (file.size > maxSizeBytes) {
                  setUploadError("Image must be 5MB or smaller.");
                  return;
                }
                setUploading(true);
                setUploadError(null);
                try {
                  const fd = new FormData();
                  fd.append("file", file);
                  const upRes = await authFetch("/api/capital/upload-image", { method: "POST", body: fd });
                  if (!upRes.ok) {
                    const errText = await upRes.text();
                    throw new Error(parseHttpErrorJsonDetail(upRes.status, errText));
                  }
                  const { url } = await upRes.json();
                  const currentContent = rightContent || "";
                  const contentBlocks = parseContentIntoBlocks(getHtmlContent(currentContent));
                  const newContent = insertImageAfterBlockContent(contentBlocks, uploadModal.afterIndex, url, {
                    centered: true,
                    alt: uploadAlt.trim(),
                  });
                  const patchRes = await authFetch(`/api/capital/${uploadModal.articleId}/content`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ content: newContent }),
                  });
                  if (!patchRes.ok) {
                    const errText = await patchRes.text();
                    throw new Error(parseHttpErrorJsonDetail(patchRes.status, errText));
                  }
                  setRightContent(newContent);
                  setUploadModal(null);
                  setUploadAlt("");
                } catch (err: any) {
                  setUploadError(err?.message ?? "Something went wrong.");
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
              <label htmlFor="capital-upload-alt" className="mt-4 block text-sm font-medium text-slate-700">
                Image alt text <span className="text-red-600">*</span>
              </label>
              <input
                id="capital-upload-alt"
                type="text"
                value={uploadAlt}
                onChange={(e) => setUploadAlt(e.target.value)}
                placeholder='例如：50日與200日移動平均線形成黃金交叉的恒生指數走勢圖'
                className="mt-1 block w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
              <p className="mt-1 text-xs text-slate-500">描述性 alt 文字，供螢幕閱讀器與 SEO 使用。</p>
              <p className="mt-2 text-xs text-slate-500">JPEG, PNG, GIF, or WebP. Maximum size: 5MB.</p>
              {uploadError && <p className="mt-2 text-sm text-red-600">{uploadError}</p>}
              <div className="mt-4 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => { setUploadModal(null); setUploadError(null); setUploadAlt(""); }}
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

      {editModal && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50"
          onClick={() => { setEditModal(null); setEditDraft(""); }}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">Edit paragraph</h3>
              <button
                type="button"
                onClick={() => { setEditModal(null); setEditDraft(""); }}
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
                onClick={() => { setEditModal(null); setEditDraft(""); }}
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
                    const html = getHtmlContent(rightContent || "");
                    const contentBlocks = parseContentIntoBlocks(html);
                    const newContent = replaceBlockAtIndex(contentBlocks, editModal.blockIndex, editDraft.trim() ? editDraft : "<p></p>");
                    const patchRes = await authFetch(`/api/capital/${editModal.articleId}/content`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ content: newContent }),
                    });
                    if (!patchRes.ok) throw new Error("Failed to save");
                    setRightContent(newContent);
                    setEditModal(null);
                    setEditDraft("");
                  } catch {
                    /* could set error state */
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

      {sendArticlesModalOpen && (
        <NotifyArticlesModal config={CAPITAL_NOTIFY_CONFIG}
          onClose={() => setSendArticlesModalOpen(false)}
          articleTitle={selectedItem?.title}
          articleId={selectedItem?.id}
        />
      )}
    </div>
  );
}

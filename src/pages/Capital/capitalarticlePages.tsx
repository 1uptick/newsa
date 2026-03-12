import React, { useState, useEffect, useCallback } from "react";
import { Loader2, FileText, Plus, X, Pencil, Trash2, BookOpen, Download } from "lucide-react";
import DOMPurify from "dompurify";
import { useAuth } from "../../contexts/AuthContext";

function decodeHtmlEntities(encoded: string): string {
  if (!encoded || typeof encoded !== "string") return "";
  return encoded
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["p", "div", "span", "br", "strong", "b", "em", "i", "u", "a", "img", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "pre", "code", "table", "thead", "tbody", "tr", "th", "td", "hr", "section", "article"],
    ALLOWED_ATTR: ["href", "src", "alt", "title", "class", "style", "target", "rel", "width", "height"],
    ALLOW_DATA_ATTR: false,
  });
}

function getHtmlContent(raw: string): string {
  if (!raw || typeof raw !== "string") return "";
  const trimmed = raw.trim();
  const html = trimmed.startsWith("<") ? raw : decodeHtmlEntities(raw);
  return sanitizeHtml(html);
}

function htmlToPlainText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const text = doc.body.textContent ?? "";
  return text.replace(/\s+/g, " ").trim();
}

type ContentBlock = { type: "p"; html: string } | { type: "img"; html: string } | { type: "other"; html: string };

const EDITABLE_TAGS = new Set(["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "section", "article", "blockquote"]);

function parseContentIntoBlocks(content: string): ContentBlock[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body>${content}</body>`, "text/html");
  const blocks: ContentBlock[] = [];
  doc.body.childNodes.forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      const tag = el.tagName.toLowerCase();
      const html = el.outerHTML;
      if (tag === "img") {
        blocks.push({ type: "img", html });
      } else if (EDITABLE_TAGS.has(tag)) {
        const isEmptyP = tag === "p" && !(el.textContent ?? "").trim();
        if (isEmptyP) return;
        blocks.push({ type: "p", html });
      } else {
        blocks.push({ type: "other", html });
      }
    } else if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) blocks.push({ type: "other", html: text });
    }
  });
  return blocks;
}

function blocksToContent(blocks: ContentBlock[]): string {
  return blocks.map((b) => b.html).join("");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function insertImageAfterBlockContent(blocks: ContentBlock[], afterIndex: number, imageUrl: string): string {
  const img = `<img src="${escapeAttr(imageUrl)}" alt="" loading="lazy" decoding="async" style="max-width:100%;height:auto;display:block;margin:1rem 0;" />`;
  const newBlocks: ContentBlock[] = [
    ...blocks.slice(0, afterIndex + 1),
    { type: "img", html: img },
    ...blocks.slice(afterIndex + 1),
  ];
  return blocksToContent(newBlocks);
}

function removeBlockAtIndex(blocks: ContentBlock[], index: number): string {
  const newBlocks = blocks.filter((_, i) => i !== index);
  return blocksToContent(newBlocks);
}

function replaceBlockAtIndex(blocks: ContentBlock[], index: number, newHtml: string): string {
  const block = blocks[index];
  if (!block) return blocksToContent(blocks);
  const newBlocks = [...blocks];
  newBlocks[index] = { ...block, html: newHtml };
  return blocksToContent(newBlocks);
}

export interface CapitalItem {
  id: string;
  createdDate: string;
  title: string;
  excerpt: string;
  calculation: string;
}

export default function CapitalArticlePage() {
  const { authFetch } = useAuth();
  const [items, setItems] = useState<CapitalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [rightContent, setRightContent] = useState<string | null>(null);
  const [rightContentLoading, setRightContentLoading] = useState(false);
  const [uploadModal, setUploadModal] = useState<{ articleId: string; afterIndex: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editModal, setEditModal] = useState<{ articleId: string; blockIndex: number; html: string } | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [readModalOpen, setReadModalOpen] = useState(false);
  const [titleEditDraft, setTitleEditDraft] = useState<string | null>(null);
  const [savingTitle, setSavingTitle] = useState(false);

  useEffect(() => {
    authFetch("/api/capital/sync", { method: "POST" }).catch(() => {});
  }, [authFetch]);

  const fetchContent = useCallback(async (articleId: string) => {
    setRightContentLoading(true);
    try {
      const res = await authFetch(`/api/capital/${articleId}/content`);
      if (res.ok) {
        const data = await res.json();
        setRightContent(data.content ?? "");
      } else {
        setRightContent("");
      }
    } catch {
      setRightContent("");
    } finally {
      setRightContentLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    const fetchItems = async () => {
      setError(null);
      try {
        const res = await authFetch("/api/capital");
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : [];
          setItems(list);
          if (list.length > 0 && !selectedId) setSelectedId(list[0].id);
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
    return (
      <div className="w-full max-w-[1800px] mx-auto px-4 py-20 flex flex-col items-center justify-center">
        <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
        <p className="text-slate-500">Loading...</p>
      </div>
    );
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
        {/* Combined header: SEO Articles (left) + action buttons (right) */}
        <header
          className="shrink-0 flex items-center justify-between gap-4 px-4 py-3 border-b border-primary-dark/30"
          style={{ background: "linear-gradient(to right, var(--color-primary), #facc15)" }}
        >
          <h2 className="text-lg font-bold text-white drop-shadow-sm">SEO Articles</h2>
          {selectedItem && rightContent && !rightContentLoading && (
            <div className="flex items-center gap-2 flex-wrap justify-end">
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
                  const html = getHtmlContent(rightContent);
                  const title = selectedItem?.title || "article";
                  const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeAttr(title)}</title></head><body>${html}</body></html>`;
                  const blob = new Blob([fullHtml], { type: "text/plain;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${title.slice(0, 50).replace(/[<>:"/\\|?*]/g, "") || "article"}.txt`;
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
                  const html = getHtmlContent(rightContent || "");
                  const text = htmlToPlainText(html);
                  const title = selectedItem?.title || "article";
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
          )}
        </header>
        <div className="flex flex-col lg:flex-row flex-1 min-h-0">
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
                        onClick={() => setSelectedId(item.id)}
                        className={`w-full text-left px-4 py-4 transition-colors ${
                          isSelected
                            ? "bg-secondary/75 hover:bg-secondary-dark/75"
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

        {/* Right: detail (content from Supabase or Airtable, with add-image gaps) */}
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden bg-white">
          {selectedItem ? (
            <>
              <div className="flex-1 overflow-y-auto py-6 px-14 lg:px-20 border-l border-slate-200">
              {/* Editable title at top of right column */}
              <div className="mb-6">
                {titleEditDraft !== null ? (
                  <div className="flex flex-col gap-2">
                    <input
                      type="text"
                      value={titleEditDraft}
                      onChange={(e) => setTitleEditDraft(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-900 font-semibold text-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                      placeholder="Article title"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          if (!selectedItem) return;
                          setSavingTitle(true);
                          try {
                            const res = await authFetch(`/api/capital/${selectedItem.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ title: titleEditDraft.trim() || selectedItem.title }),
                            });
                            if (res.ok) {
                              setItems((prev) =>
                                prev.map((i) =>
                                  i.id === selectedItem.id ? { ...i, title: titleEditDraft.trim() || selectedItem.title } : i
                                )
                              );
                              setTitleEditDraft(null);
                            }
                          } finally {
                            setSavingTitle(false);
                          }
                        }}
                        disabled={savingTitle}
                        className="px-3 py-1.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-dark disabled:opacity-50"
                      >
                        {savingTitle ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setTitleEditDraft(null)}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="group/ttl flex items-start gap-2">
                    <h1 className="text-xl font-bold text-slate-900 leading-tight flex-1 min-w-0">
                      {selectedItem?.title || "—"}
                    </h1>
                    <button
                      type="button"
                      onClick={() => setTitleEditDraft(selectedItem?.title ?? "")}
                      className="shrink-0 inline-flex items-center gap-1 text-slate-500 text-xs font-medium opacity-80 group-hover/ttl:opacity-100 hover:text-primary transition-colors"
                      aria-label="Edit title"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                  </div>
                )}
              </div>
              {rightContentLoading ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
                  <p className="text-slate-500 text-sm">Loading content...</p>
                </div>
              ) : rightContent ? (
                (() => {
                  const html = getHtmlContent(rightContent);
                  const contentBlocks = parseContentIntoBlocks(html);
                  if (contentBlocks.length === 0) {
                    return (
                      <div
                        className="capital-detail html-content prose prose-slate max-w-none prose-headings:text-slate-900 prose-p:text-slate-700 prose-a:text-primary [&_table]:border [&_table]:border-slate-200 [&_img]:max-w-full [&_img]:h-auto"
                        dangerouslySetInnerHTML={{ __html: html }}
                      />
                    );
                  }
                  return (
                    <div className="capital-detail html-content prose prose-slate max-w-none prose-headings:text-slate-900 prose-p:text-slate-700 prose-a:text-primary [&_table]:border [&_table]:border-slate-200 [&_img]:max-w-full [&_img]:h-auto">
                      {contentBlocks.map((block, i) => (
                        <React.Fragment key={i}>
                          {block.type === "p" ? (
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={() => {
                                setEditModal({ articleId: selectedItem.id, blockIndex: i, html: block.html });
                                setEditDraft(block.html);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  setEditModal({ articleId: selectedItem.id, blockIndex: i, html: block.html });
                                  setEditDraft(block.html);
                                }
                              }}
                              className="cursor-pointer rounded px-1 -mx-1 hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-colors group/para"
                            >
                              <div dangerouslySetInnerHTML={{ __html: block.html }} />
                              <span className="inline-flex items-center gap-1 text-slate-600 text-xs mt-1 opacity-90 group-hover/para:opacity-100 transition-opacity">
                                <Pencil className="w-3.5 h-3.5" /> Edit
                              </span>
                            </div>
                          ) : block.type === "img" ? (
                            <div className="relative group/img my-2">
                              <div dangerouslySetInnerHTML={{ __html: block.html }} />
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!selectedItem) return;
                                  const newContent = removeBlockAtIndex(contentBlocks, i);
                                  try {
                                    const patchRes = await authFetch(`/api/capital/${selectedItem.id}/content`, {
                                      method: "PATCH",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ content: newContent }),
                                    });
                                    if (patchRes.ok) setRightContent(newContent);
                                  } catch {
                                    /* ignore */
                                  }
                                }}
                                className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded bg-black/60 text-white text-xs opacity-0 group-hover/img:opacity-100 hover:bg-red-600 transition-all"
                                aria-label="Remove image"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Remove
                              </button>
                            </div>
                          ) : (
                            <div dangerouslySetInnerHTML={{ __html: block.html }} />
                          )}
                          <div
                            className="group relative min-h-[28px] flex items-center justify-center my-1 rounded border border-transparent hover:border-slate-200 hover:bg-slate-50/80 transition-colors"
                            onMouseDown={(e) => e.preventDefault()}
                          >
                            <button
                              type="button"
                              onClick={() => setUploadModal({ articleId: selectedItem.id, afterIndex: i })}
                              className="opacity-90 hover:opacity-100 flex items-center justify-center w-8 h-8 rounded-full bg-white border border-slate-300 text-slate-600 hover:bg-primary hover:text-white hover:border-primary transition-all shadow-sm"
                              aria-label="Add image"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        </React.Fragment>
                      ))}
                    </div>
                  );
                })()
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                  <FileText className="w-12 h-12 mb-3 text-slate-300" />
                  <p className="text-sm">No content for this item.</p>
                </div>
              )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 py-20">
              <FileText className="w-14 h-14 mb-4 text-slate-200" />
              <p className="text-sm">Select an item from the list.</p>
            </div>
          )}
        </main>
        </div>
      </div>

      {readModalOpen && rightContent && selectedItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setReadModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="View full article"
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between shrink-0 px-4 py-3 border-b border-slate-300 bg-slate-50">
              <h3 className="text-sm font-semibold text-slate-800 truncate max-w-[70%]">{selectedItem.title || "Articles"}</h3>
              <button
                type="button"
                onClick={() => setReadModalOpen(false)}
                className="p-2 rounded-lg hover:bg-slate-200 text-slate-600 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div
              className="flex-1 overflow-y-auto p-6 prose prose-slate max-w-none prose-headings:text-slate-900 prose-p:text-slate-700 prose-a:text-primary prose-strong:text-slate-900 prose-strong:font-semibold [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-6 [&_h1]:mb-4 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-6 [&_h2]:mb-3 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2 [&_h4]:text-base [&_h4]:font-semibold [&_h4]:mt-3 [&_h4]:mb-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_table]:border [&_table]:border-slate-200 [&_img]:max-w-full [&_img]:h-auto"
              dangerouslySetInnerHTML={{ __html: getHtmlContent(rightContent) }}
            />
          </div>
        </div>
      )}

      {uploadModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => { setUploadModal(null); setUploadError(null); }}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">Add image</h3>
              <button
                type="button"
                onClick={() => { setUploadModal(null); setUploadError(null); }}
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
                setUploading(true);
                setUploadError(null);
                try {
                  const fd = new FormData();
                  fd.append("file", file);
                  const upRes = await authFetch("/api/capital/upload-image", { method: "POST", body: fd });
                  if (!upRes.ok) {
                    const err = await upRes.json().catch(() => ({}));
                    throw new Error(err?.error ?? "Upload failed");
                  }
                  const { url } = await upRes.json();
                  const currentContent = rightContent || "";
                  const contentBlocks = parseContentIntoBlocks(getHtmlContent(currentContent));
                  const newContent = insertImageAfterBlockContent(contentBlocks, uploadModal.afterIndex, url);
                  const patchRes = await authFetch(`/api/capital/${uploadModal.articleId}/content`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ content: newContent }),
                  });
                  if (!patchRes.ok) throw new Error("Failed to save");
                  setRightContent(newContent);
                  setUploadModal(null);
                } catch (err: any) {
                  setUploadError(err?.message ?? "Something went wrong.");
                } finally {
                  setUploading(false);
                }
              }}
            >
              <input
                type="file"
                accept="image/*"
                className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary file:text-white file:font-medium file:cursor-pointer cursor-pointer"
              />
              {uploadError && <p className="mt-2 text-sm text-red-600">{uploadError}</p>}
              <div className="mt-4 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => { setUploadModal(null); setUploadError(null); }}
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
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
    </div>
  );
}

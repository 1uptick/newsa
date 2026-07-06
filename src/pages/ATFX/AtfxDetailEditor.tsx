import React from "react";
import { Loader2, FileText, ImageIcon, Pencil, Plus, Trash2 } from "lucide-react";
import { getHtmlContent } from "../../lib/html";
import { parseContentIntoBlocks, removeBlockAtIndex } from "../../lib/articleContentBlocks";
import type { AtfxArticleDetail, AtfxArticleItem } from "./atfxArticleTypes";
import { proseArticleClass } from "./atfxArticleTypes";
import { ContentAreaLoader } from "../../components/ContentAreaLoader";

export function AtfxDetailEditor({
  selectedItem,
  languageTab,
  setLanguageTab,
  detail,
  loading,
  authFetch,
  setArticleDetail,
  setItems,
  titleEditDraft,
  setTitleEditDraft,
  savingTitle,
  setSavingTitle,
  setEditModal,
  setEditDraft,
  setUploadModal,
}: {
  selectedItem: AtfxArticleItem;
  languageTab: "tc" | "en";
  setLanguageTab: (t: "tc" | "en") => void;
  detail: AtfxArticleDetail | null;
  loading: boolean;
  authFetch: (url: string, init?: RequestInit) => Promise<Response>;
  setArticleDetail: React.Dispatch<React.SetStateAction<AtfxArticleDetail | null>>;
  setItems: React.Dispatch<React.SetStateAction<AtfxArticleItem[]>>;
  titleEditDraft: string | null;
  setTitleEditDraft: (v: string | null) => void;
  savingTitle: boolean;
  setSavingTitle: (v: boolean) => void;
  setEditModal: (v: { articleId: string; blockIndex: number; html: string; lang: "tc" | "en" } | null) => void;
  setEditDraft: (v: string) => void;
  setUploadModal: (v: { articleId: string; afterIndex: number; lang: "tc" | "en" } | null) => void;
}) {
  const activeTitle = detail ? (languageTab === "tc" ? detail.titleTC : detail.titleEN) : "";
  const rightContent = detail ? (languageTab === "tc" ? detail.contentTC : detail.contentEN) : "";

  const [thumbDraft, setThumbDraft] = React.useState("");
  const [editingThumb, setEditingThumb] = React.useState(false);
  const [savingThumb, setSavingThumb] = React.useState(false);

  React.useEffect(() => {
    if (!detail) return;
    setThumbDraft((detail.thumbnailUrl || "").trim());
    setEditingThumb(false);
  }, [selectedItem.id, detail?.thumbnailUrl]);

  const patchContent = async (newHtml: string) => {
    const patchRes = await authFetch(`/api/atfx/${selectedItem.id}/content`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: newHtml, lang: languageTab }),
    });
    if (patchRes.ok) {
      setArticleDetail((prev) =>
        prev
          ? languageTab === "tc"
            ? { ...prev, contentTC: newHtml }
            : { ...prev, contentEN: newHtml }
          : null
      );
    }
  };

  return (
    <div className="space-y-4">
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
                  const fallback = activeTitle;
                  const nextTitle = titleEditDraft.trim() || fallback;
                  setSavingTitle(true);
                  try {
                    const res = await authFetch(`/api/atfx/${selectedItem.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ title: nextTitle, lang: languageTab }),
                    });
                    if (res.ok) {
                      setItems((prev) =>
                        prev.map((i) =>
                          i.id === selectedItem.id
                            ? languageTab === "tc"
                              ? { ...i, titleTC: nextTitle }
                              : { ...i, titleEN: nextTitle }
                            : i
                        )
                      );
                      setArticleDetail((prev) =>
                        prev
                          ? languageTab === "tc"
                            ? { ...prev, titleTC: nextTitle }
                            : { ...prev, titleEN: nextTitle }
                          : null
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
            <h1 className="text-xl font-bold text-slate-900 leading-tight flex-1 min-w-0">{activeTitle || "—"}</h1>
            <button
              type="button"
              onClick={() => setTitleEditDraft(activeTitle ?? "")}
              className="shrink-0 inline-flex items-center gap-1 text-slate-500 text-xs font-medium opacity-80 group-hover/ttl:opacity-100 hover:text-primary transition-colors"
              aria-label="Edit title"
            >
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
          </div>
        )}
      </div>

      {!loading && detail ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <ImageIcon className="w-4 h-4 text-slate-500 shrink-0" aria-hidden />
              Thumbnail URL
            </div>
            {!editingThumb ? (
              <button
                type="button"
                onClick={() => {
                  setThumbDraft((detail.thumbnailUrl || "").trim());
                  setEditingThumb(true);
                }}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-primary"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
            ) : null}
          </div>
          {editingThumb ? (
            <div className="space-y-2">
              <input
                type="url"
                value={thumbDraft}
                onChange={(e) => setThumbDraft(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                placeholder="https://…"
                autoComplete="off"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={savingThumb}
                  onClick={async () => {
                    const next = thumbDraft.trim();
                    if (next && !/^https?:\/\//i.test(next)) {
                      window.alert("Please enter a URL that starts with http:// or https://");
                      return;
                    }
                    setSavingThumb(true);
                    try {
                      const res = await authFetch(`/api/atfx/${selectedItem.id}/thumbnail`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ thumbnailUrl: next }),
                      });
                      if (res.ok) {
                        const data = (await res.json().catch(() => ({}))) as { thumbnailUrl?: string };
                        const saved = typeof data.thumbnailUrl === "string" ? data.thumbnailUrl : next;
                        setArticleDetail((prev) => (prev ? { ...prev, thumbnailUrl: saved } : null));
                        setThumbDraft(saved);
                        setEditingThumb(false);
                      } else {
                        const err = await res.json().catch(() => ({}));
                        window.alert((err as { error?: string })?.error || "Could not save thumbnail URL");
                      }
                    } finally {
                      setSavingThumb(false);
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-dark disabled:opacity-50"
                >
                  {savingThumb ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  disabled={savingThumb}
                  onClick={() => {
                    setThumbDraft((detail.thumbnailUrl || "").trim());
                    setEditingThumb(false);
                  }}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : detail.thumbnailUrl?.trim() ? (
            <div className="space-y-2">
              <img
                src={detail.thumbnailUrl.trim()}
                alt=""
                className="max-h-36 w-auto max-w-full rounded-lg border border-slate-200 bg-white object-contain"
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              <p className="text-xs text-slate-600 break-all">{detail.thumbnailUrl.trim()}</p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No thumbnail URL. Click Edit to add one.</p>
          )}
        </div>
      ) : null}

      {loading ? (
        <ContentAreaLoader variant="panel" size="sm" message="Loading content..." pulseMessage={false} />
      ) : rightContent ? (
        (() => {
          const html = getHtmlContent(rightContent);
          const contentBlocks = parseContentIntoBlocks(html);
          if (contentBlocks.length === 0) {
            return (
              <div
                className={`capital-detail html-content ${proseArticleClass}`}
                dangerouslySetInnerHTML={{ __html: html }}
              />
            );
          }
          return (
            <div className={`capital-detail html-content ${proseArticleClass}`}>
              {contentBlocks.map((block, i) => (
                <React.Fragment key={`${languageTab}-${selectedItem.id}-${i}`}>
                  {block.type === "p" ? (
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setEditModal({ articleId: selectedItem.id, blockIndex: i, html: block.html, lang: languageTab });
                        setEditDraft(block.html);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setEditModal({ articleId: selectedItem.id, blockIndex: i, html: block.html, lang: languageTab });
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
                          const newContent = removeBlockAtIndex(contentBlocks, i);
                          await patchContent(newContent);
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
                      onClick={() => setUploadModal({ articleId: selectedItem.id, afterIndex: i, lang: languageTab })}
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
  );
}

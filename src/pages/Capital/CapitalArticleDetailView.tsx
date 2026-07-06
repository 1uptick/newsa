import React from "react";
import { Loader2, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { getHtmlContent, externalizeLinksInSanitizedHtml } from "../../lib/html";
import { parseContentIntoBlocks, removeBlockAtIndex } from "../../lib/articleContentBlocks";
import { ContentAreaLoader } from "../../components/ContentAreaLoader";
const proseCapitalDetail =
  "capital-detail html-content prose prose-slate max-w-none prose-headings:text-slate-900 prose-p:text-slate-700 prose-a:text-primary [&_table]:border [&_table]:border-slate-200 [&_img]:max-w-full [&_img]:h-auto [&_img]:block [&_img]:mx-auto";

export type ArticleDetailEditModalPayload = {
  articleId: string;
  blockIndex: number;
  html: string;
  locale?: "tc" | "en";
};

export type ArticleDetailUploadModalPayload = {
  articleId: string;
  afterIndex: number;
  locale?: "tc" | "en";
};

export function CapitalArticleDetailView({
  articleId,
  displayTitle,
  titleEditDraft,
  setTitleEditDraft,
  savingTitle,
  setSavingTitle,
  patchTitle,
  patchContent,
  onTitleSaved,
  rightContentLoading,
  rightContent,
  setEditModal,
  setEditDraft,
  setUploadModal,
  setRightContent,
  oneuptickLocale,
  middleSlot,
}: {
  articleId: string;
  displayTitle: string;
  titleEditDraft: string | null;
  setTitleEditDraft: (v: string | null) => void;
  savingTitle: boolean;
  setSavingTitle: (v: boolean) => void;
  patchTitle: (id: string, title: string) => Promise<Response>;
  patchContent: (id: string, content: string) => Promise<Response>;
  onTitleSaved: (newTitle: string) => void;
  rightContentLoading: boolean;
  rightContent: string | null;
  setEditModal: (v: ArticleDetailEditModalPayload | null) => void;
  setEditDraft: (v: string) => void;
  setUploadModal: (v: ArticleDetailUploadModalPayload | null) => void;
  setRightContent: (v: string | null) => void;
  /** When set (1uptick only), paragraph edit / image upload modals include this locale. */
  oneuptickLocale?: "tc" | "en";
  middleSlot?: React.ReactNode;
}) {
  const modalLocale = oneuptickLocale ? { locale: oneuptickLocale } : {};

  return (
    <>
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
                  const nextTitle = titleEditDraft.trim() || displayTitle;
                  setSavingTitle(true);
                  try {
                    const res = await patchTitle(articleId, nextTitle);
                    if (res.ok) {
                      onTitleSaved(nextTitle);
                      setTitleEditDraft(null);
                    } else {
                      const err = await res.json().catch(() => ({}));
                      const msg = typeof err?.error === "string" ? err.error : `Could not save title (${res.status})`;
                      alert(msg);
                    }
                  } catch {
                    alert("Could not save title — network error.");
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
              {displayTitle?.trim() || "—"}
            </h1>
            <button
              type="button"
              onClick={() => setTitleEditDraft(displayTitle ?? "")}
              className="shrink-0 inline-flex items-center gap-1 text-slate-500 text-xs font-medium opacity-80 group-hover/ttl:opacity-100 hover:text-primary transition-colors"
              aria-label="Edit title"
            >
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
          </div>
        )}
      </div>
      {middleSlot}
      {rightContentLoading ? (
        <ContentAreaLoader variant="panel" size="sm" message="Loading content..." pulseMessage={false} />
      ) : rightContent ? (
        (() => {
          const html = getHtmlContent(rightContent);
          const contentBlocks = parseContentIntoBlocks(html);
          if (contentBlocks.length === 0) {
            return (
              <div className={proseCapitalDetail} lang="zh-Hant" dangerouslySetInnerHTML={{ __html: externalizeLinksInSanitizedHtml(html) }} />
            );
          }
          return (
            <div className={proseCapitalDetail} lang="zh-Hant">
              {contentBlocks.map((block, i) => (
                <React.Fragment key={i}>
                  {block.type === "img" ? (
                    <div className="relative group/img my-2 flex justify-center">
                      <div dangerouslySetInnerHTML={{ __html: externalizeLinksInSanitizedHtml(block.html) }} />
                      <button
                        type="button"
                        onClick={async () => {
                          const newContent = removeBlockAtIndex(contentBlocks, i);
                          try {
                            const patchRes = await patchContent(articleId, newContent);
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
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setEditModal({ articleId, blockIndex: i, html: block.html, ...modalLocale });
                        setEditDraft(block.html);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setEditModal({ articleId, blockIndex: i, html: block.html, ...modalLocale });
                          setEditDraft(block.html);
                        }
                      }}
                      className="cursor-pointer rounded px-1 -mx-1 hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-colors group/para"
                    >
                      <div dangerouslySetInnerHTML={{ __html: externalizeLinksInSanitizedHtml(block.html) }} />
                      <span className="inline-flex items-center gap-1 text-slate-600 text-xs mt-1 opacity-90 group-hover/para:opacity-100 transition-opacity">
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </span>
                    </div>
                  )}
                  <div
                    className="group relative min-h-[28px] flex items-center justify-center my-1 rounded border border-transparent hover:border-slate-200 hover:bg-slate-50/80 transition-colors"
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    <button
                      type="button"
                      onClick={() => setUploadModal({ articleId, afterIndex: i, ...modalLocale })}
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
    </>
  );
}

import React, { useState } from "react";
import { X } from "lucide-react";
import { getHtmlContent } from "../../lib/html";
import {
  parseContentIntoBlocks,
  insertImageAfterBlockContent,
  replaceBlockAtIndex,
} from "../../lib/articleContentBlocks";
import type {
  ArticleDetailUploadModalPayload,
  ArticleDetailEditModalPayload,
} from "../Capital/CapitalArticleDetailView";

type AuthFetch = (url: string, init?: RequestInit) => Promise<Response>;

const IMAGE_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

type SharedModalProps = {
  /** API base for the article resource, e.g. "/api/oneuptick/articles" or "/api/oneuptick/seo/articles". */
  apiBase: string;
  authFetch: AuthFetch;
  /** Current raw article HTML for the locale being edited (en → English body, else the primary body). */
  getRawArticle: (isEn: boolean) => string;
  /** Apply the newly-saved body back into page state for the given locale. */
  applyContent: (isEn: boolean, newContent: string) => void;
};

/**
 * Insert an uploaded image after a block. Shared by the 1uptick Articles and SEO pages, which had
 * byte-identical copies differing only by `apiBase`. Owns its own upload progress/error state.
 */
export function OneuptickArticleUploadModal({
  payload,
  onClose,
  apiBase,
  authFetch,
  getRawArticle,
  applyContent,
}: SharedModalProps & {
  payload: ArticleDetailUploadModalPayload | null;
  onClose: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  if (!payload) return null;

  const close = () => {
    setUploadError(null);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50"
      onClick={close}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900">Add image</h3>
          <button
            type="button"
            onClick={close}
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
            const input = form.querySelector('input[type="file"]') as HTMLInputElement | null;
            const file = input?.files?.[0];
            if (!file) {
              setUploadError("Please choose an image file.");
              return;
            }
            if (!IMAGE_ALLOWED_TYPES.includes(file.type)) {
              setUploadError("Please choose a JPEG, PNG, GIF, or WebP image.");
              return;
            }
            if (file.size > IMAGE_MAX_BYTES) {
              setUploadError("Image must be 5MB or smaller.");
              return;
            }
            setUploading(true);
            setUploadError(null);
            try {
              const fd = new FormData();
              fd.append("file", file);
              const upRes = await authFetch(`${apiBase}/${payload.articleId}/upload-image`, {
                method: "POST",
                body: fd,
              });
              if (!upRes.ok) {
                const err = await upRes.json().catch(() => ({}));
                throw new Error(
                  err?.error ?? (upRes.status === 413 ? "Image must be 5MB or smaller." : "Upload failed")
                );
              }
              const { url } = await upRes.json();
              const isEn = payload.locale === "en";
              const contentBlocks = parseContentIntoBlocks(getHtmlContent(getRawArticle(isEn)));
              const newContent = insertImageAfterBlockContent(contentBlocks, payload.afterIndex, url);
              const patchRes = await authFetch(`${apiBase}/${payload.articleId}/content`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(isEn ? { content: newContent, locale: "en" } : { content: newContent }),
              });
              if (!patchRes.ok) throw new Error("Failed to save");
              applyContent(isEn, newContent);
              close();
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
            <button type="button" onClick={close} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">
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
  );
}

/**
 * Edit a single content block's raw HTML. Shared by the 1uptick Articles and SEO pages. The working
 * draft is controlled by the page (the detail view seeds it when opening); save state is internal.
 */
export function OneuptickArticleBlockEditModal({
  payload,
  draft,
  setDraft,
  onClose,
  apiBase,
  authFetch,
  getRawArticle,
  applyContent,
}: SharedModalProps & {
  payload: ArticleDetailEditModalPayload | null;
  draft: string;
  setDraft: (v: string) => void;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);

  if (!payload) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-900">Edit paragraph</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full flex-1 min-h-[200px] p-3 rounded-lg border border-slate-200 text-slate-800 font-mono text-sm resize-y"
          placeholder="HTML content (e.g. <p>...</p>)"
          spellCheck={false}
        />
        <div className="mt-4 flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">
            Cancel
          </button>
          <button
            type="button"
            onClick={async () => {
              setSaving(true);
              try {
                const isEn = payload.locale === "en";
                const contentBlocks = parseContentIntoBlocks(getHtmlContent(getRawArticle(isEn)));
                const newContent = replaceBlockAtIndex(
                  contentBlocks,
                  payload.blockIndex,
                  draft.trim() ? draft : "<p></p>"
                );
                const patchRes = await authFetch(`${apiBase}/${payload.articleId}/content`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(isEn ? { content: newContent, locale: "en" } : { content: newContent }),
                });
                if (!patchRes.ok) throw new Error("Failed to save");
                applyContent(isEn, newContent);
                onClose();
              } catch {
                /* ignore */
              } finally {
                setSaving(false);
              }
            }}
            disabled={saving}
            className="px-4 py-2 bg-primary text-white font-medium rounded-lg hover:bg-primary-dark disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

import React, { useState } from "react";
import { Pencil } from "lucide-react";
import { getHtmlContent, externalizeLinksInSanitizedHtml } from "../../lib/html";

const proseCapitalExcerpt =
  "prose prose-slate max-w-none prose-p:text-slate-600 prose-a:text-primary [&_img]:max-w-full [&_img]:h-auto";

export function CapitalExcerptEditor({
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
          Description
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
                const res = await authFetch(`/api/capital/${articleId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ excerpt: draft }),
                });
                if (res.ok) {
                  onSaved(draft);
                  setDraft(null);
                } else {
                  const err = await res.json().catch(() => ({}));
                  const msg = typeof err?.error === "string" ? err.error : `Could not save description (${res.status})`;
                  alert(msg);
                }
              } catch {
                alert("Could not save description — network error.");
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
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Description</span>
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
          className={proseCapitalExcerpt}
          lang="zh-Hant"
          dangerouslySetInnerHTML={{
            __html: externalizeLinksInSanitizedHtml(getHtmlContent(excerptHtml)),
          }}
        />
      ) : (
        <p className="text-sm text-slate-400">No description — click Edit to add.</p>
      )}
    </div>
  );
}

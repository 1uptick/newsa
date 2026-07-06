import React, { useEffect, useState } from "react";
import { Pencil, X } from "lucide-react";
import type { CapitalKeywordItem } from "../../Capital/types";

type TopicCustomizeModalProps = {
  item: CapitalKeywordItem;
  onClose: () => void;
  onSave: (patch: Partial<CapitalKeywordItem>) => void | Promise<void>;
};

export function TopicCustomizeModal({ item, onClose, onSave }: TopicCustomizeModalProps) {
  const [title, setTitle] = useState(item.title);
  const [summary, setSummary] = useState(item.summary);
  const [socialHook, setSocialHook] = useState(item.socialHook);
  const [keyword1, setKeyword1] = useState(item.keyword1);
  const [keyword2, setKeyword2] = useState(item.keyword2);
  const [keyword3, setKeyword3] = useState(item.keyword3);
  const [keywordTag, setKeywordTag] = useState(item.keywordTag);
  const [psyTrigger, setPsyTrigger] = useState(item.psyTrigger);
  const [stockTag, setStockTag] = useState(item.stockTag);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(item.title);
    setSummary(item.summary);
    setSocialHook(item.socialHook);
    setKeyword1(item.keyword1);
    setKeyword2(item.keyword2);
    setKeyword3(item.keyword3);
    setKeywordTag(item.keywordTag);
    setPsyTrigger(item.psyTrigger);
    setStockTag(item.stockTag);
  }, [item]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        summary: summary.trim(),
        socialHook: socialHook.trim(),
        keyword1: keyword1.trim(),
        keyword2: keyword2.trim(),
        keyword3: keyword3.trim(),
        keywordTag: keywordTag.trim(),
        psyTrigger: psyTrigger.trim(),
        stockTag: stockTag.trim(),
        custom: "yes",
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Customize topic"
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between shrink-0 px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2 min-w-0">
            <Pencil className="w-5 h-5 text-[#ff7900] shrink-0" aria-hidden />
            <h2 className="text-lg font-bold text-slate-900 truncate">Customize topic</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <form id="topic-customize-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          <p className="text-xs text-slate-500">
            Adjust the brief before starting your article. Changes apply to this session only.
          </p>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Title
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Summary
            </label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Social hook
            </label>
            <textarea
              value={socialHook}
              onChange={(e) => setSocialHook(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg resize-none"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                Keyword 1
              </label>
              <input
                value={keyword1}
                onChange={(e) => setKeyword1(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                Keyword 2
              </label>
              <input
                value={keyword2}
                onChange={(e) => setKeyword2(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                Keyword 3
              </label>
              <input
                value={keyword3}
                onChange={(e) => setKeyword3(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                Keyword tag
              </label>
              <input
                value={keywordTag}
                onChange={(e) => setKeywordTag(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                Stock tag
              </label>
              <input
                value={stockTag}
                onChange={(e) => setStockTag(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Psychology trigger
            </label>
            <input
              value={psyTrigger}
              onChange={(e) => setPsyTrigger(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
        </form>
        <div className="shrink-0 flex justify-end gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="topic-customize-form"
            disabled={saving || !title.trim()}
            className="px-4 py-2 text-sm font-semibold text-white bg-[#ff7900] hover:bg-[#e66d00] rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

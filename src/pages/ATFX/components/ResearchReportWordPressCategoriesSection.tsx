import React, { useState } from "react";
import { FolderOpen, Plus, Trash2 } from "lucide-react";
import {
  createWordPressCategory,
  wordPressCategoryDisplayLabel,
  type AtfxWordPressCategory,
} from "../../../lib/atfxResearchWordPressSettings";

type ResearchReportWordPressCategoriesSectionProps = {
  categories: AtfxWordPressCategory[];
  onChange: (categories: AtfxWordPressCategory[]) => void;
};

function categoryRowClass() {
  return "rounded-lg border border-slate-200 bg-white p-2.5 space-y-2";
}

export function ResearchReportWordPressCategoriesSection({
  categories,
  onChange,
}: ResearchReportWordPressCategoriesSectionProps) {
  const [draftLabel, setDraftLabel] = useState("");
  const [draftCategoryId, setDraftCategoryId] = useState("");

  const addCategory = () => {
    const categoryId = draftCategoryId.trim();
    if (!categoryId) return;
    if (categories.some((c) => c.categoryId === categoryId)) return;
    onChange([...categories, createWordPressCategory(categoryId, draftLabel)]);
    setDraftLabel("");
    setDraftCategoryId("");
  };

  const removeCategory = (id: string) => {
    onChange(categories.filter((c) => c.id !== id));
  };

  const updateCategory = (id: string, patch: Partial<Pick<AtfxWordPressCategory, "label" | "categoryId">>) => {
    onChange(
      categories.map((c) =>
        c.id === id
          ? {
              ...c,
              label: patch.label !== undefined ? patch.label : c.label,
              categoryId: patch.categoryId !== undefined ? patch.categoryId.trim() : c.categoryId,
            }
          : c
      )
    );
  };

  return (
    <section className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-sm">
      <div className="mb-3">
        <h3 className="text-xs font-bold text-slate-800 tracking-wide flex items-center gap-1.5">
          <FolderOpen className="w-3.5 h-3.5 text-[#ff7900]" aria-hidden />
          WordPress categories
        </h3>
        <p className="text-[11px] text-slate-500 mt-1">
          Category slug (e.g. <code className="font-mono">forex-news</code>) or numeric ID from WordPress → Posts →
          Categories.
        </p>
      </div>

      {categories.length > 0 ? (
        <div className="space-y-2 mb-3">
          {categories.map((category) => (
            <div key={category.id} className={categoryRowClass()}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] font-semibold text-slate-700 truncate">
                  {wordPressCategoryDisplayLabel(category)}
                </p>
                <button
                  type="button"
                  onClick={() => removeCategory(category.id)}
                  className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
                  aria-label={`Remove ${wordPressCategoryDisplayLabel(category)}`}
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden />
                </button>
              </div>
              <input
                type="text"
                value={category.label}
                onChange={(e) => updateCategory(category.id, { label: e.target.value })}
                placeholder="Label (optional)"
                className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-[#ff7900]"
              />
              <input
                type="text"
                value={category.categoryId}
                onChange={(e) => updateCategory(category.id, { categoryId: e.target.value })}
                placeholder="Category slug or ID"
                className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-mono text-slate-900 outline-none focus:border-[#ff7900]"
              />
            </div>
          ))}
        </div>
      ) : null}

      <div className={`${categoryRowClass()} border-dashed`}>
        <input
          type="text"
          value={draftLabel}
          onChange={(e) => setDraftLabel(e.target.value)}
          placeholder="Label (optional)"
          className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-[#ff7900]"
        />
        <input
          type="text"
          value={draftCategoryId}
          onChange={(e) => setDraftCategoryId(e.target.value)}
          placeholder="Category slug or ID"
          className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-mono text-slate-900 outline-none focus:border-[#ff7900]"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCategory();
            }
          }}
        />
        <button
          type="button"
          onClick={addCategory}
          disabled={!draftCategoryId.trim()}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold text-[#ff7900] border border-[#ff7900]/30 hover:bg-orange-50 disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden />
          Add category
        </button>
      </div>
    </section>
  );
}

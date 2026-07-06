import React, { useEffect, useMemo, useState } from "react";
import { Modal } from "../../../components/Modal";
import {
  i18nTabLanguages,
  languageTranslatingLabel,
  REPORT_LANGUAGE_OPTIONS,
  type ReportI18nContent,
  type ReportLanguage,
} from "../../../lib/atfxResearchReportOptions";
import {
  wordPressCategoryDisplayLabel,
  type AtfxWordPressCategory,
} from "../../../lib/atfxResearchWordPressSettings";

type ResearchReportPublishModalProps = {
  open: boolean;
  reportTitle: string;
  reportI18n: ReportI18nContent;
  categories: AtfxWordPressCategory[];
  onClose: () => void;
  onPublish: (locale: ReportLanguage, categoryId: string) => void | Promise<void>;
};

function optionClass(active: boolean, disabled: boolean) {
  return [
    "w-full rounded-xl border p-3 text-left transition-all",
    disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
    active && !disabled
      ? "border-[#ff7900] bg-gradient-to-br from-orange-50 to-white shadow-md ring-2 ring-[#ff7900]/20"
      : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm",
  ].join(" ");
}

export function ResearchReportPublishModal({
  open,
  reportTitle,
  reportI18n,
  categories,
  onClose,
  onPublish,
}: ResearchReportPublishModalProps) {
  const [selectedLocale, setSelectedLocale] = useState<ReportLanguage | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const availableLocales = useMemo(() => i18nTabLanguages(reportI18n), [reportI18n]);

  const languageOptions = useMemo(
    () => REPORT_LANGUAGE_OPTIONS.filter((o) => availableLocales.includes(o.value)),
    [availableLocales]
  );

  useEffect(() => {
    if (!open) {
      setSelectedLocale(null);
      setSelectedCategoryId(null);
      return;
    }
    if (!selectedLocale && availableLocales.length === 1) {
      setSelectedLocale(availableLocales[0]);
    }
    if (!selectedCategoryId && categories.length === 1) {
      setSelectedCategoryId(categories[0].categoryId);
    }
  }, [open, availableLocales, categories, selectedLocale, selectedCategoryId]);

  const handleClose = () => {
    setSelectedLocale(null);
    setSelectedCategoryId(null);
    onClose();
  };

  const handlePublish = () => {
    if (!selectedLocale || !selectedCategoryId) return;
    const locale = selectedLocale;
    const categoryId = selectedCategoryId;
    handleClose();
    void onPublish(locale, categoryId);
  };

  const canPublish = Boolean(selectedLocale && selectedCategoryId);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Publish to WordPress"
      maxWidth="max-w-md"
      footer={
        <>
          <button
            type="button"
            onClick={handleClose}
            className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePublish}
            disabled={!canPublish}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg bg-[#ff7900] text-white hover:bg-[#e56d00] disabled:opacity-50"
          >
            Publish
          </button>
        </>
      }
    >
      <div className="p-4 space-y-5">
        <p className="text-sm text-slate-600">
          Publish{" "}
          <span className="font-semibold text-slate-900">{reportTitle || "this article"}</span> to your
          WordPress site.
        </p>

        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Language</p>
          {languageOptions.length === 0 ? (
            <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              No article content is available yet. Generate or translate a version first.
            </p>
          ) : (
            <div className="space-y-2">
              {languageOptions.map((option) => {
                const active = selectedLocale === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSelectedLocale(option.value)}
                    className={optionClass(active, false)}
                    aria-pressed={active}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-900">{option.label}</p>
                      <p className="text-[11px] text-slate-500 shrink-0 text-right">
                        {languageTranslatingLabel(option.value)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Category</p>
          {categories.length === 0 ? (
            <p className="text-sm text-slate-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              No WordPress categories configured. Open the settings panel (gear icon) to add categories first.
            </p>
          ) : (
            <div className="space-y-2">
              {categories.map((category) => {
                const active = selectedCategoryId === category.categoryId;
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setSelectedCategoryId(category.categoryId)}
                    className={optionClass(active, false)}
                    aria-pressed={active}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-900 min-w-0 truncate">
                        {wordPressCategoryDisplayLabel(category)}
                      </p>
                      <p className="text-[11px] text-slate-500 font-mono shrink-0 text-right">
                        {category.categoryId}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

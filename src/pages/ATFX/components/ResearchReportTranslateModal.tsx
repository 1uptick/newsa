import React, { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "../../../components/Modal";
import {
  missingReportTranslationLocales,
  hasReportTranslation,
  REPORT_LANGUAGE_OPTIONS,
  type ReportI18nContent,
  type ReportTranslateLocale,
} from "../../../lib/atfxResearchReportOptions";

type ResearchReportTranslateModalProps = {
  open: boolean;
  reportTitle: string;
  reportI18n: ReportI18nContent;
  translatingLocales?: ReportTranslateLocale[];
  onClose: () => void;
  onTranslate: (locale: ReportTranslateLocale, options?: { force?: boolean }) => void;
};

const TRANSLATE_OPTIONS = REPORT_LANGUAGE_OPTIONS.filter((o) => o.value !== "en");

function localeOptionClass(active: boolean, disabled: boolean) {
  return [
    "w-full rounded-xl border p-3 text-left transition-all",
    disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
    active && !disabled
      ? "border-[#ff7900] bg-gradient-to-br from-orange-50 to-white shadow-md ring-2 ring-[#ff7900]/20"
      : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm",
  ].join(" ");
}

export function ResearchReportTranslateModal({
  open,
  reportTitle,
  reportI18n,
  translatingLocales = [],
  onClose,
  onTranslate,
}: ResearchReportTranslateModalProps) {
  const [selected, setSelected] = useState<ReportTranslateLocale | null>(null);

  const missingLocales = useMemo(
    () => missingReportTranslationLocales(reportI18n),
    [reportI18n]
  );

  const handleClose = () => {
    setSelected(null);
    onClose();
  };

  const handleTranslate = () => {
    if (!selected) return;
    const force = hasReportTranslation(reportI18n, selected);
    onTranslate(selected, force ? { force: true } : undefined);
    setSelected(null);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Translate Research Article"
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
            onClick={handleTranslate}
            disabled={!selected}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg bg-[#ff7900] text-white hover:bg-[#e56d00] disabled:opacity-50"
          >
            {selected && hasReportTranslation(reportI18n, selected) ? "Re-translate" : "Translate"}
          </button>
        </>
      }
    >
      <div className="p-4 space-y-4">
        <p className="text-sm text-slate-600">
          Translate{" "}
          <span className="font-semibold text-slate-900">{reportTitle || "this article"}</span> from
          English into the selected language.
        </p>

        {missingLocales.length === 0 ? (
          <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            All languages are translated. Select one below to re-translate and replace the existing version.
          </p>
        ) : null}
        <div className="space-y-2">
          {TRANSLATE_OPTIONS.map((option) => {
            const locale = option.value as ReportTranslateLocale;
            const alreadyTranslated = hasReportTranslation(reportI18n, locale);
            const isTranslating = translatingLocales.includes(locale);
            const disabled = isTranslating;
            const active = selected === locale;

            return (
              <button
                key={option.value}
                type="button"
                disabled={disabled}
                onClick={() => setSelected(locale)}
                className={localeOptionClass(active, disabled)}
                aria-pressed={active}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{option.label}</p>
                    {option.hint ? (
                      <p className="text-[11px] text-slate-500 mt-0.5">{option.hint}</p>
                    ) : null}
                  </div>
                  {isTranslating ? (
                    <Loader2 className="w-4 h-4 animate-spin text-slate-400 shrink-0" aria-hidden />
                  ) : alreadyTranslated ? (
                    <span className="text-[10px] font-semibold text-amber-700 shrink-0">Re-translate</span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

export function researchReportIsTranslating(translatingLocales: ReportTranslateLocale[]): boolean {
  return translatingLocales.length > 0;
}

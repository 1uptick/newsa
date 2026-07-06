import React, { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "../Modal";
import {
  QUICK_ANALYSIS_AUTO_TRANSLATE_OPTIONS,
  hasQuickAnalysisTranslation,
  quickAnalysisMissingTranslationLocales,
  type QuickAnalysisTranslateLocale,
} from "../../lib/atfxQuickAnalysisLocale";
import type { QuickAnalysisSession } from "./AtfxQuickAnalysisSidebar";

type AtfxQuickAnalysisTranslateModalProps = {
  open: boolean;
  session: QuickAnalysisSession | null;
  translatingLocales?: QuickAnalysisTranslateLocale[];
  onClose: () => void;
  onTranslate: (locale: QuickAnalysisTranslateLocale) => void;
};

function localeOptionClass(active: boolean, disabled: boolean) {
  return [
    "w-full rounded-xl border p-3 text-left transition-all",
    disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
    active && !disabled
      ? "border-[#ff7900] bg-gradient-to-br from-orange-50 to-white shadow-md ring-2 ring-[#ff7900]/20"
      : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm",
  ].join(" ");
}

export function AtfxQuickAnalysisTranslateModal({
  open,
  session,
  translatingLocales = [],
  onClose,
  onTranslate,
}: AtfxQuickAnalysisTranslateModalProps) {
  const [selected, setSelected] = useState<QuickAnalysisTranslateLocale | null>(null);

  const missingLocales = useMemo(() => {
    if (!session) return [] as QuickAnalysisTranslateLocale[];
    return quickAnalysisMissingTranslationLocales(session);
  }, [session]);

  const handleClose = () => {
    setSelected(null);
    onClose();
  };

  const handleTranslate = () => {
    if (!selected) return;
    onTranslate(selected);
    setSelected(null);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Translate Quick Analysis"
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
            disabled={!selected || missingLocales.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg bg-[#ff7900] text-white hover:bg-[#e56d00] disabled:opacity-50"
          >
            Translate
          </button>
        </>
      }
    >
      <div className="p-4 space-y-4">
        {session ? (
          <p className="text-sm text-slate-600">
            Translate <span className="font-semibold text-slate-900">{session.displayName}</span> from English
            into the selected language.
          </p>
        ) : null}

        {missingLocales.length === 0 ? (
          <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            This quick analysis already has all available translations.
          </p>
        ) : (
          <div className="space-y-2">
            {QUICK_ANALYSIS_AUTO_TRANSLATE_OPTIONS.map((option) => {
              const alreadyTranslated = session ? hasQuickAnalysisTranslation(session, option.value) : false;
              const isTranslating = translatingLocales.includes(option.value);
              const disabled = alreadyTranslated || isTranslating;
              const active = selected === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => setSelected(option.value)}
                  className={localeOptionClass(active, disabled)}
                  aria-pressed={active}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{option.label}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{option.hint}</p>
                    </div>
                    {isTranslating ? (
                      <Loader2 className="w-4 h-4 animate-spin text-slate-400 shrink-0" aria-hidden />
                    ) : alreadyTranslated ? (
                      <span className="text-[10px] font-semibold text-emerald-600 shrink-0">Done</span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}

      </div>
    </Modal>
  );
}

export function quickAnalysisIsTranslating(session: QuickAnalysisSession): boolean {
  return (session.translatingLocales?.length ?? 0) > 0;
}

export { quickAnalysisMissingTranslationLocales } from "../../lib/atfxQuickAnalysisLocale";

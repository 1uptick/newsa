import React, { useEffect } from "react";
import { Sparkles, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { audienceSegmentButtonClass } from "../../../lib/topicSourcePill";
import { InstitutionalBatchDial } from "../InstitutionalBatchDial";

export type FreshTopicsPickerSheetProps = {
  open: boolean;
  onClose: () => void;
  onGenerate: () => void;
  runCount: 1 | 2 | 3;
  onRunCountChange: (count: 1 | 2 | 3) => void;
  audience: "institutional" | "retail";
  onAudienceChange: (audience: "institutional" | "retail") => void;
  generating?: boolean;
};

export function FreshTopicsPickerSheet({
  open,
  onClose,
  onGenerate,
  runCount,
  onRunCountChange,
  audience,
  onAudienceChange,
  generating = false,
}: FreshTopicsPickerSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !generating) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, generating]);

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            key="fresh-topics-picker-backdrop"
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-[25] bg-slate-900/25 pointer-events-auto border-0 p-0 cursor-default"
            aria-label="Close fresh topics panel"
            onClick={generating ? undefined : onClose}
            disabled={generating}
          />
          <motion.div
            id="fresh-topics-picker-sheet"
            key="fresh-topics-picker-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Generate fresh topics"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "tween", duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
            className="absolute bottom-0 left-0 right-0 z-[26] flex max-h-[min(72vh,85%)] min-h-[320px] flex-col overflow-hidden rounded-t-2xl border-t border-slate-200 bg-white shadow-[0_-12px_40px_rgba(15,23,42,0.18)] pointer-events-auto"
          >
            <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 min-w-0">
                <Sparkles className="w-5 h-5 text-[#ff7900] shrink-0" />
                <span className="truncate">Generate fresh topics</span>
              </h3>
              <button
                type="button"
                onClick={onClose}
                disabled={generating}
                className="p-2 rounded-lg text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-50"
                aria-label="Close fresh topics panel"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4">
              <div className="flex flex-col gap-4">
                <div>
                  <p className="mb-2 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Audience
                  </p>
                  <div className="mx-auto flex max-w-sm rounded-lg border border-slate-200 bg-slate-100 p-0.5">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={audience === "institutional"}
                      onClick={() => onAudienceChange("institutional")}
                      disabled={generating}
                      className={`flex-1 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${audienceSegmentButtonClass("institutional", audience)}`}
                    >
                      Institutional
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={audience === "retail"}
                      onClick={() => onAudienceChange("retail")}
                      disabled={generating}
                      className={`flex-1 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${audienceSegmentButtonClass("retail", audience)}`}
                    >
                      Retail
                    </button>
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Number of runs
                  </p>
                  <div className="mb-3 space-y-1 text-center text-sm leading-snug text-slate-600">
                    <p>How many topics should we generate?</p>
                    <p>Each run uses a fresh research pass (max 3).</p>
                  </div>
                  <InstitutionalBatchDial value={runCount} onChange={onRunCountChange} />
                </div>
              </div>
            </div>

            <div className="shrink-0 flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-200 bg-slate-50">
              <button
                type="button"
                onClick={onClose}
                disabled={generating}
                className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onGenerate}
                disabled={generating}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-[#ff7900] hover:bg-[#e66d00] rounded-lg transition-colors disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                Generate {runCount === 1 ? "1 topic" : `${runCount} topics`}
              </button>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}

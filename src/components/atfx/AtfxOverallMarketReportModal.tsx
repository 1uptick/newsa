import React, { useCallback, useEffect, useState } from "react";
import { Modal } from "../Modal";
import {
  OVERALL_MARKET_SEGMENT_OPTIONS,
  type OverallMarketSegment,
} from "../../lib/atfxOverallMarketReport";

type AtfxOverallMarketReportModalProps = {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onGenerate: (segments: OverallMarketSegment[]) => void;
};

export function AtfxOverallMarketReportModal({
  open,
  busy,
  onClose,
  onGenerate,
}: AtfxOverallMarketReportModalProps) {
  const [selected, setSelected] = useState<OverallMarketSegment | null>(null);

  useEffect(() => {
    if (!open) setSelected(null);
  }, [open]);

  const selectSegment = useCallback((id: OverallMarketSegment) => {
    setSelected(id);
  }, []);

  const handleClose = useCallback(() => {
    if (busy) return;
    onClose();
  }, [busy, onClose]);

  const handleGenerate = useCallback(() => {
    if (!selected || busy) return;
    onGenerate([selected]);
  }, [busy, onGenerate, selected]);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Overall market report"
      maxWidth="max-w-lg"
      closeDisabled={busy}
      footer={
        <>
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={busy || !selected}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-[#ff7900] hover:bg-[#e66d00] rounded-lg transition-colors disabled:opacity-50"
          >
            Generate report
          </button>
        </>
      }
    >
      <div className="p-4 text-sm text-slate-700 space-y-4">
        <p>
          Select one market. We will generate an overview for the{" "}
          <strong>last completed trading session</strong> and save it in your Quick Analysis history.
        </p>

        <div className="space-y-2" role="radiogroup" aria-label="Market category">
          {OVERALL_MARKET_SEGMENT_OPTIONS.map((opt) => {
            const checked = selected === opt.id;
            return (
              <label
                key={opt.id}
                className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                  checked
                    ? "border-[#ff7900] bg-orange-50/80 ring-1 ring-[#ff7900]/25"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name="overall-market-segment"
                  className="mt-0.5 h-4 w-4 border-slate-300 text-[#ff7900] focus:ring-[#ff7900]"
                  checked={checked}
                  disabled={busy}
                  onChange={() => selectSegment(opt.id)}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-900">{opt.label}</span>
                  <span className="mt-0.5 block text-xs text-slate-500 leading-snug">{opt.description}</span>
                </span>
              </label>
            );
          })}
        </div>

        {!selected ? (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Select one market to continue.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

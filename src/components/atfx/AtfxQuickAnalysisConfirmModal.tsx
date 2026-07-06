import React from "react";
import { Modal } from "../Modal";
import {
  QUICK_ANALYSIS_LOOKBACK_OPTIONS,
  type QuickAnalysisLookback,
} from "../../lib/atfxQuickAnalysisLookback";
import type { QuickAnalysisTarget } from "../../pages/ATFX/hooks/useAtfxQuickAnalysisWorkspace";

type AtfxQuickAnalysisConfirmModalProps = {
  open: boolean;
  pendingTarget: QuickAnalysisTarget | null;
  lookback: QuickAnalysisLookback;
  busy: boolean;
  onLookbackChange: (value: QuickAnalysisLookback) => void;
  onClose: () => void;
  onConfirm: () => void;
};

export function AtfxQuickAnalysisConfirmModal({
  open,
  pendingTarget,
  lookback,
  busy,
  onLookbackChange,
  onClose,
  onConfirm,
}: AtfxQuickAnalysisConfirmModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Run Quick Analysis?"
      maxWidth="max-w-md"
      closeDisabled={busy}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-[#ff7900] hover:bg-[#e66d00] rounded-lg transition-colors disabled:opacity-50"
          >
            Run analysis
          </button>
        </>
      }
    >
      <div className="p-4 text-sm text-slate-700 space-y-4">
        {pendingTarget ? (
          <>
            <p>
              Generate a quick market snapshot and driver report for{" "}
              <strong>{pendingTarget.displayName}</strong>?
            </p>

            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Time window</p>
              <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Analysis time window">
                {QUICK_ANALYSIS_LOOKBACK_OPTIONS.map((opt) => {
                  const selected = lookback === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => onLookbackChange(opt.value)}
                      className={`px-2 py-2 rounded-lg border text-xs font-semibold transition-colors ${
                        selected
                          ? "border-[#ff7900] bg-orange-50 text-[#ff7900]"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                      aria-pressed={selected}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <p className="text-xs text-slate-500">
              Uses price data and news for the selected window. On weekends and before the next session open,{" "}
              <strong>24h / 48h</strong> align to the last completed trading session(s) (e.g. Friday), not empty
              calendar hours. Results appear in the left panel.
            </p>
          </>
        ) : null}
      </div>
    </Modal>
  );
}

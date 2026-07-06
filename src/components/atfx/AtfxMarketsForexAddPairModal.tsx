import React from "react";
import { Modal } from "../Modal";
import type { ForexTableKind } from "../../lib/atfxForexTableOrder";

type AtfxMarketsForexAddPairModalProps = {
  kind: ForexTableKind | null;
  input: string;
  error: string | null;
  onInputChange: (value: string) => void;
  onClearError: () => void;
  onClose: () => void;
  onSubmit: () => void;
};

export function AtfxMarketsForexAddPairModal({
  kind,
  input,
  error,
  onInputChange,
  onClearError,
  onClose,
  onSubmit,
}: AtfxMarketsForexAddPairModalProps) {
  return (
    <Modal
      open={kind != null}
      onClose={onClose}
      title={kind === "major" ? "Add major pair" : "Add cross pair"}
      maxWidth="max-w-sm"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            className="px-4 py-2 text-sm font-semibold text-white bg-[#ff7900] hover:bg-[#e66d00] rounded-lg transition-colors"
          >
            Add pair
          </button>
        </>
      }
    >
      <div className="p-4 space-y-3">
        <p className="text-sm text-slate-600">
          Enter a currency pair as <span className="font-mono">EUR/USD</span> or{" "}
          <span className="font-mono">EURUSD</span>.
        </p>
        <input
          type="text"
          value={input}
          onChange={(e) => {
            onInputChange(e.target.value);
            if (error) onClearError();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSubmit();
          }}
          placeholder="e.g. EUR/GBP"
          className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-mono focus:ring-2 focus:ring-[#ff7900]/30 focus:border-[#ff7900] outline-none"
          autoFocus
        />
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </div>
    </Modal>
  );
}

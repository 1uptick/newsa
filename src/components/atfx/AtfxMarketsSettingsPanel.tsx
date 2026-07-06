import React from "react";
import { Globe, X } from "lucide-react";
import { AtfxMarketsTelegramChannelsSection } from "./AtfxMarketsTelegramChannelsSection";
import {
  QUICK_ANALYSIS_AUTO_TRANSLATE_OPTIONS,
  toggleQuickAnalysisAutoTranslate,
  type QuickAnalysisTranslateLocale,
} from "../../lib/atfxQuickAnalysisLocale";
import type { AtfxTelegramChannel } from "../../lib/atfxQuickAnalysisTelegramSettings";

type AtfxMarketsSettingsPanelProps = {
  open: boolean;
  autoTranslateLocales: QuickAnalysisTranslateLocale[];
  onAutoTranslateChange: (locales: QuickAnalysisTranslateLocale[]) => void;
  telegramChannels: AtfxTelegramChannel[];
  onTelegramChannelsChange: (channels: AtfxTelegramChannel[]) => void;
  onClose: () => void;
};

function localeChipClass(active: boolean) {
  return [
    "w-full rounded-xl border p-3 text-left transition-all",
    active
      ? "border-[#ff7900] bg-gradient-to-br from-orange-50 to-white shadow-md ring-2 ring-[#ff7900]/20"
      : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm",
  ].join(" ");
}

export function AtfxMarketsSettingsPanel({
  open,
  autoTranslateLocales,
  onAutoTranslateChange,
  telegramChannels,
  onTelegramChannelsChange,
  onClose,
}: AtfxMarketsSettingsPanelProps) {
  return (
    <>
      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-900/25"
          aria-label="Close settings"
          onClick={onClose}
        />
      ) : null}

      <div
        id="atfx-markets-settings-panel"
        className={`fixed top-16 bottom-0 right-0 z-50 w-[min(100%,320px)] flex flex-col bg-white border-l border-slate-200 shadow-2xl transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "translate-x-full pointer-events-none"
        }`}
        aria-hidden={!open}
      >
        <div className="shrink-0 px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2 bg-slate-50/80">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Globe className="w-4 h-4 text-[#ff7900]" aria-hidden />
            Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-200/80 transition-colors"
            aria-label="Close settings panel"
          >
            <X className="w-4 h-4" aria-hidden />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          <section className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-sm">
            <div className="mb-3">
              <h3 className="text-xs font-bold text-slate-800 tracking-wide">Auto-translate Quick Analysis</h3>
            </div>

            <div className="space-y-2">
              {QUICK_ANALYSIS_AUTO_TRANSLATE_OPTIONS.map((option) => {
                const active = autoTranslateLocales.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      onAutoTranslateChange(toggleQuickAnalysisAutoTranslate(autoTranslateLocales, option.value))
                    }
                    className={localeChipClass(active)}
                    aria-pressed={active}
                  >
                    <p className="text-sm font-semibold text-slate-900">{option.label}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{option.hint}</p>
                  </button>
                );
              })}
            </div>
          </section>

          <AtfxMarketsTelegramChannelsSection
            channels={telegramChannels}
            onChange={onTelegramChannelsChange}
          />
        </div>
      </div>
    </>
  );
}

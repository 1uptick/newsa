import React, { useMemo, useState } from "react";
import { Send } from "lucide-react";
import { Modal } from "../Modal";
import {
  hasQuickAnalysisReportForLocale,
  QUICK_ANALYSIS_SEND_LANGUAGE_OPTIONS,
  quickAnalysisSendLanguageLabel,
  type QuickAnalysisSendLocale,
} from "../../lib/atfxQuickAnalysisLocale";
import {
  telegramChannelDisplayLabel,
  type AtfxTelegramChannel,
} from "../../lib/atfxQuickAnalysisTelegramSettings";
import type { QuickAnalysisSession } from "./AtfxQuickAnalysisSidebar";
import { isOverallMarketReportSymbol } from "../../lib/atfxOverallMarketReport";

type AtfxQuickAnalysisTelegramModalProps = {
  open: boolean;
  session: QuickAnalysisSession | null;
  channels: AtfxTelegramChannel[];
  onClose: () => void;
  onSend: (payload: {
    locale: QuickAnalysisSendLocale;
    channel: AtfxTelegramChannel;
  }) => void | Promise<void>;
  onOpenSettings?: () => void;
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

export function AtfxQuickAnalysisTelegramModal({
  open,
  session,
  channels,
  onClose,
  onSend,
  onOpenSettings,
}: AtfxQuickAnalysisTelegramModalProps) {
  const [selectedLocale, setSelectedLocale] = useState<QuickAnalysisSendLocale>("en");
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const availableLocales = useMemo(() => {
    if (!session) return [] as QuickAnalysisSendLocale[];
    return QUICK_ANALYSIS_SEND_LANGUAGE_OPTIONS.filter((o) =>
      hasQuickAnalysisReportForLocale(session, o.value)
    ).map((o) => o.value);
  }, [session]);

  const selectableLanguageOptions = useMemo(() => {
    if (!session) return [];
    return QUICK_ANALYSIS_SEND_LANGUAGE_OPTIONS.filter((o) =>
      hasQuickAnalysisReportForLocale(session, o.value)
    );
  }, [session]);

  const isOverallReport = session ? isOverallMarketReportSymbol(session.symbol) : false;

  const selectedChannel = channels.find((c) => c.id === selectedChannelId) ?? null;

  const handleClose = () => {
    setError(null);
    onClose();
  };

  const handleSend = () => {
    if (!selectedChannel || !session) return;
    if (!hasQuickAnalysisReportForLocale(session, selectedLocale)) return;
    onSend({ locale: selectedLocale, channel: selectedChannel });
    setError(null);
    onClose();
  };

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    if (availableLocales.includes("en")) setSelectedLocale("en");
    else if (availableLocales[0]) setSelectedLocale(availableLocales[0]);
    setSelectedChannelId(channels[0]?.id ?? null);
  }, [open, session?.id, availableLocales, channels]);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Send to Telegram"
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
            onClick={handleSend}
            disabled={!selectedChannel || channels.length === 0 || availableLocales.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg bg-[#ff7900] text-white hover:bg-[#e56d00] disabled:opacity-50"
          >
            <Send className="w-4 h-4" aria-hidden />
            Send
          </button>
        </>
      }
    >
      <div className="p-4 space-y-4">
        {session ? (
          <p className="text-sm text-slate-600">
            Send <span className="font-semibold text-slate-900">{session.displayName}</span>{" "}
            {isOverallReport ? "overall market report" : "quick analysis"} to a Telegram channel.
          </p>
        ) : null}

        {channels.length === 0 ? (
          <div className="text-sm text-slate-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 space-y-2">
            <p>No Telegram channels configured yet.</p>
            {onOpenSettings ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSettings();
                }}
                className="text-xs font-semibold text-[#ff7900] hover:underline"
              >
                Open Settings to add a channel
              </button>
            ) : null}
          </div>
        ) : null}

        <div>
          <h4 className="text-xs font-bold text-slate-800 mb-2">Language version</h4>
          {selectableLanguageOptions.length === 0 ? (
            <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              No report content is available to send yet.
            </p>
          ) : (
            <div className="space-y-2">
              {selectableLanguageOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSelectedLocale(option.value)}
                  className={optionClass(selectedLocale === option.value, false)}
                  aria-pressed={selectedLocale === option.value}
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{option.label}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{option.tabLabel}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {channels.length > 0 ? (
          <div>
            <h4 className="text-xs font-bold text-slate-800 mb-2">Telegram channel</h4>
            <div className="space-y-2">
              {channels.map((channel) => (
                <button
                  key={channel.id}
                  type="button"
                  onClick={() => setSelectedChannelId(channel.id)}
                  className={optionClass(selectedChannelId === channel.id, false)}
                  aria-pressed={selectedChannelId === channel.id}
                >
                  <p className="text-sm font-semibold text-slate-900">{telegramChannelDisplayLabel(channel)}</p>
                  <p className="text-[11px] font-mono text-slate-500 mt-0.5">{channel.channelId}</p>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {selectedLocale && session ? (
          <p className="text-[10px] text-slate-500">
            Will send: {quickAnalysisSendLanguageLabel(selectedLocale)}
            {selectedChannel ? ` → ${telegramChannelDisplayLabel(selectedChannel)}` : ""}
          </p>
        ) : null}

        {error ? (
          <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-2.5 py-2">{error}</p>
        ) : null}
      </div>
    </Modal>
  );
}

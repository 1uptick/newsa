import React, { useState } from "react";
import { Plus, Send, Trash2 } from "lucide-react";
import {
  createTelegramChannel,
  telegramChannelDisplayLabel,
  type AtfxTelegramChannel,
} from "../../lib/atfxQuickAnalysisTelegramSettings";

type AtfxMarketsTelegramChannelsSectionProps = {
  channels: AtfxTelegramChannel[];
  onChange: (channels: AtfxTelegramChannel[]) => void;
};

function channelRowClass() {
  return "rounded-lg border border-slate-200 bg-white p-2.5 space-y-2";
}

export function AtfxMarketsTelegramChannelsSection({
  channels,
  onChange,
}: AtfxMarketsTelegramChannelsSectionProps) {
  const [draftLabel, setDraftLabel] = useState("");
  const [draftChannelId, setDraftChannelId] = useState("");

  const addChannel = () => {
    const channelId = draftChannelId.trim();
    if (!channelId) return;
    if (channels.some((c) => c.channelId === channelId)) return;
    onChange([...channels, createTelegramChannel(channelId, draftLabel)]);
    setDraftLabel("");
    setDraftChannelId("");
  };

  const removeChannel = (id: string) => {
    onChange(channels.filter((c) => c.id !== id));
  };

  const updateChannel = (id: string, patch: Partial<Pick<AtfxTelegramChannel, "label" | "channelId">>) => {
    onChange(
      channels.map((c) =>
        c.id === id
          ? {
              ...c,
              label: patch.label !== undefined ? patch.label : c.label,
              channelId: patch.channelId !== undefined ? patch.channelId.trim() : c.channelId,
            }
          : c
      )
    );
  };

  return (
    <section className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-sm">
      <div className="mb-3">
        <h3 className="text-xs font-bold text-slate-800 tracking-wide flex items-center gap-1.5">
          <Send className="w-3.5 h-3.5 text-[#ff7900]" aria-hidden />
          Telegram channels
        </h3>
      </div>

      {channels.length > 0 ? (
        <div className="space-y-2 mb-3">
          {channels.map((channel) => (
            <div key={channel.id} className={channelRowClass()}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] font-semibold text-slate-700 truncate">
                  {telegramChannelDisplayLabel(channel)}
                </p>
                <button
                  type="button"
                  onClick={() => removeChannel(channel.id)}
                  className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
                  aria-label={`Remove ${telegramChannelDisplayLabel(channel)}`}
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden />
                </button>
              </div>
              <input
                type="text"
                value={channel.label}
                onChange={(e) => updateChannel(channel.id, { label: e.target.value })}
                placeholder="Label (optional)"
                className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-[#ff7900]"
              />
              <input
                type="text"
                value={channel.channelId}
                onChange={(e) => updateChannel(channel.id, { channelId: e.target.value })}
                placeholder="@channel or -100…"
                className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-mono text-slate-900 outline-none focus:border-[#ff7900]"
              />
            </div>
          ))}
        </div>
      ) : null}

      <div className={`${channelRowClass()} border-dashed`}>
        <input
          type="text"
          value={draftLabel}
          onChange={(e) => setDraftLabel(e.target.value)}
          placeholder="Label (optional)"
          className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-[#ff7900]"
        />
        <input
          type="text"
          value={draftChannelId}
          onChange={(e) => setDraftChannelId(e.target.value)}
          placeholder="@channel or -100…"
          className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-mono text-slate-900 outline-none focus:border-[#ff7900]"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addChannel();
            }
          }}
        />
        <button
          type="button"
          onClick={addChannel}
          disabled={!draftChannelId.trim()}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold text-[#ff7900] border border-[#ff7900]/30 hover:bg-orange-50 disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden />
          Add channel
        </button>
      </div>
    </section>
  );
}

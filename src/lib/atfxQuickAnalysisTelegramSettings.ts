export type AtfxTelegramChannel = {
  id: string;
  /** Optional label shown in the send modal, e.g. "ATFX EN channel". */
  label: string;
  /** Telegram channel id: @channelusername or -100xxxxxxxxxx */
  channelId: string;
};

export const ATFX_TELEGRAM_CHANNELS_STORAGE_KEY = "atfx.markets.telegramChannels";

function newChannelId(): string {
  return `tg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function readStoredTelegramChannels(): AtfxTelegramChannel[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ATFX_TELEGRAM_CHANNELS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const row = item as Record<string, unknown>;
        const channelId = typeof row.channelId === "string" ? row.channelId.trim() : "";
        if (!channelId) return null;
        return {
          id: typeof row.id === "string" && row.id.trim() ? row.id.trim() : newChannelId(),
          label: typeof row.label === "string" ? row.label.trim() : "",
          channelId,
        } satisfies AtfxTelegramChannel;
      })
      .filter((row): row is AtfxTelegramChannel => row != null);
  } catch {
    return [];
  }
}

export function writeStoredTelegramChannels(channels: AtfxTelegramChannel[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ATFX_TELEGRAM_CHANNELS_STORAGE_KEY, JSON.stringify(channels));
  } catch {
    /* ignore */
  }
}

export function createTelegramChannel(channelId: string, label = ""): AtfxTelegramChannel {
  return {
    id: newChannelId(),
    label: label.trim(),
    channelId: channelId.trim(),
  };
}

export function telegramChannelDisplayLabel(channel: AtfxTelegramChannel): string {
  return channel.label.trim() || channel.channelId;
}

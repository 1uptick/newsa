export async function sendQuickAnalysisToTelegram(
  authFetch: (url: string, opts?: RequestInit & { forceRefresh?: boolean }) => Promise<Response>,
  payload: {
    channelId: string;
    report: string;
    displayName: string;
    symbol?: string;
    chartImageUrl?: string;
    languageLabel?: string;
  }
): Promise<void> {
  const res = await authFetch("/api/atfx/markets/quick-analysis/telegram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean };
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : `Telegram send failed (${res.status})`);
  }
}

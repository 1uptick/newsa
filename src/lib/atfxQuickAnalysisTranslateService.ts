import type { QuickAnalysisTranslateLocale, QuickAnalysisTranslationPayload } from "./atfxQuickAnalysisLocale";
import type { BrokerageTokenBalance } from "./brokerageTokens";

export type QuickAnalysisTranslateResponse = {
  report: string;
  tokenBalance?: BrokerageTokenBalance;
};

export async function translateQuickAnalysisReport(
  authFetch: (url: string, opts?: RequestInit & { forceRefresh?: boolean }) => Promise<Response>,
  report: string,
  locale: QuickAnalysisTranslateLocale,
  analysisId?: string
): Promise<{ report: string; tokenBalance?: BrokerageTokenBalance }> {
  const res = await authFetch("/api/atfx/markets/quick-analysis/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      report,
      locale,
      ...(analysisId ? { analysisId } : {}),
    }),
  });

  const data = (await res.json().catch(() => ({}))) as QuickAnalysisTranslateResponse & { error?: string };
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : `Translation failed (${res.status})`);
  }
  if (typeof data.report !== "string" || !data.report.trim()) {
    throw new Error("Translation returned empty content.");
  }
  return { report: data.report, tokenBalance: data.tokenBalance };
}

export async function saveQuickAnalysisTranslations(
  authFetch: (url: string, opts?: RequestInit & { forceRefresh?: boolean }) => Promise<Response>,
  id: string,
  translations: QuickAnalysisTranslationPayload
): Promise<void> {
  const res = await authFetch(`/api/atfx/markets/quick-analysis/${encodeURIComponent(id)}/translations`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(translations),
  });

  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : `Failed to save translations (${res.status})`);
  }
}

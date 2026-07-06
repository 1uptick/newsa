import { apiUrl } from "./api";
import type { ReportI18nContent, ReportLocaleBundle, ReportTranslateLocale } from "./atfxResearchReportOptions";
import type { BrokerageTokenBalance } from "./brokerageTokens";

export type ResearchReportTranslateResponse = {
  locale: ReportTranslateLocale;
  bundle: ReportLocaleBundle;
  report_i18n: ReportI18nContent;
  cached?: boolean;
  tokenBalance?: BrokerageTokenBalance;
};

type ResearchReportTranslateStreamEvent =
  | { type: "progress"; message: string }
  | { type: "partial"; html: string; locale: ReportTranslateLocale }
  | {
      type: "done";
      locale: ReportTranslateLocale;
      bundle: ReportLocaleBundle;
      report_i18n: ReportI18nContent;
      cached?: boolean;
      tokenBalance?: BrokerageTokenBalance;
    }
  | { type: "error"; error: string };

export type StreamResearchReportTranslateHandlers = {
  onProgress?: (message: string) => void;
  onPartial?: (html: string, locale: ReportTranslateLocale) => void;
  signal?: AbortSignal;
};

export async function streamResearchReportTranslate(
  idToken: string,
  reportId: string,
  locale: ReportTranslateLocale,
  handlers: StreamResearchReportTranslateHandlers = {},
  options?: { force?: boolean }
): Promise<ResearchReportTranslateResponse> {
  const response = await fetch(apiUrl(`/api/atfx/research-report/${encodeURIComponent(reportId)}/translate/stream`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
      Accept: "text/event-stream",
    },
    body: JSON.stringify({ locale, force: options?.force === true }),
    signal: handlers.signal,
  });

  if (!response.ok) {
    let detail = "";
    try {
      const j = await response.json();
      detail = (j as { error?: string }).error || JSON.stringify(j);
    } catch {
      detail = await response.text().catch(() => "");
    }
    throw new Error(detail || `Translation failed (${response.status})`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("Translation stream has no body");

  const decoder = new TextDecoder();
  let buffer = "";
  let done: Extract<ResearchReportTranslateStreamEvent, { type: "done" }> | null = null;
  let streamError: string | null = null;

  const dispatch = (raw: string) => {
    if (!raw || raw.startsWith(":") || !raw.startsWith("data:")) return;
    const payload = raw.slice(5).trim();
    if (!payload) return;
    let evt: ResearchReportTranslateStreamEvent;
    try {
      evt = JSON.parse(payload) as ResearchReportTranslateStreamEvent;
    } catch {
      return;
    }
    switch (evt.type) {
      case "progress":
        handlers.onProgress?.(evt.message);
        break;
      case "partial":
        handlers.onPartial?.(evt.html, evt.locale);
        break;
      case "done":
        done = evt;
        break;
      case "error":
        streamError = evt.error || "Translation failed";
        break;
    }
  };

  try {
    while (true) {
      const { value, done: streamDone } = await reader.read();
      if (streamDone) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        for (const line of rawEvent.split("\n")) dispatch(line);
      }
    }
    if (buffer.trim()) {
      for (const line of buffer.split("\n")) dispatch(line);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }

  if (streamError) throw new Error(streamError);
  if (!done?.bundle?.report_html?.trim()) {
    throw new Error("Translation ended without content.");
  }

  return {
    locale: done.locale,
    bundle: done.bundle,
    report_i18n: done.report_i18n,
    cached: done.cached,
    tokenBalance: done.tokenBalance,
  };
}

/** Non-streaming fallback (used only if stream endpoint is unavailable). */
export async function translateResearchReportLocale(
  authFetch: (url: string, opts?: RequestInit & { forceRefresh?: boolean }) => Promise<Response>,
  reportId: string,
  locale: ReportTranslateLocale
): Promise<ResearchReportTranslateResponse> {
  const res = await authFetch(`/api/atfx/research-report/${encodeURIComponent(reportId)}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locale }),
  });

  const data = (await res.json().catch(() => ({}))) as ResearchReportTranslateResponse & { error?: string };
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : `Translation failed (${res.status})`);
  }
  if (!data.bundle?.report_html?.trim()) {
    throw new Error("Translation returned empty content.");
  }
  return data;
}

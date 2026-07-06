import { apiUrl } from "./api";
import type { ReportI18nContent, ReportLanguage, ReportOutputOptions } from "./atfxResearchReportOptions";

export type PipelineStage = "planning" | "research" | "writing" | "translating";

export type ResearchStreamEvent =
  | { type: "phase"; message: string }
  | { type: "stage_start"; stage: PipelineStage; message: string }
  | { type: "stage_complete"; stage: PipelineStage; display_text: string }
  | { type: "stage_delta"; stage: PipelineStage; delta: string }
  | { type: "tool_start"; name: string; detail?: string }
  | { type: "tool_result"; name: string; summary: string; detail?: string }
  | { type: "delta"; delta: string }
  | { type: "report_preview"; html: string; language?: ReportLanguage }
  | {
      type: "done";
      reply: string;
      title: string;
      report_html: string;
      report_i18n?: ReportI18nContent;
      seo_excerpt?: string;
      thumbnail_url?: string;
      tool_events: Array<{ name: string; summary: string; detail?: string }>;
      message: {
        id: string;
        role: string;
        content: string;
        tool_events?: Array<{ name: string; summary: string }> | null;
        created_at: string;
      };
      pipeline_messages?: Array<{
        id: string;
        role: string;
        content: string;
        tool_events?: Array<{ name: string; summary: string }> | null;
        created_at: string;
      }>;
    }
  | { type: "error"; error: string };

export type StreamResearchChatHandlers = {
  onPhase?: (message: string) => void;
  onStageStart?: (stage: PipelineStage, message: string) => void;
  onStageComplete?: (stage: PipelineStage, displayText: string) => void;
  onStageDelta?: (stage: PipelineStage, delta: string) => void;
  onToolStart?: (name: string, detail?: string) => void;
  onToolResult?: (name: string, summary: string, detail?: string) => void;
  onDelta?: (delta: string) => void;
  onReportPreview?: (html: string, language?: ReportLanguage) => void;
  onDone?: (event: Extract<ResearchStreamEvent, { type: "done" }>) => void;
  onError?: (error: string) => void;
  signal?: AbortSignal;
};

export async function streamResearchReportChat(
  idToken: string,
  reportId: string,
  message: string,
  options: ReportOutputOptions,
  handlers: StreamResearchChatHandlers = {},
  displayMessage?: string
): Promise<Extract<ResearchStreamEvent, { type: "done" }>> {
  const response = await fetch(apiUrl(`/api/atfx/research-report/${reportId}/chat/stream`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      message,
      options,
      ...(displayMessage?.trim() ? { display_message: displayMessage.trim() } : {}),
    }),
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
    const err = detail || `Stream failed (${response.status})`;
    handlers.onError?.(err);
    throw new Error(err);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("Stream response has no body");

  const decoder = new TextDecoder();
  let buffer = "";
  let done: Extract<ResearchStreamEvent, { type: "done" }> | null = null;
  let streamError: string | null = null;

  const dispatch = (raw: string) => {
    if (!raw || raw.startsWith(":")) return;
    if (!raw.startsWith("data:")) return;
    const payload = raw.slice(5).trim();
    if (!payload) return;
    let evt: ResearchStreamEvent;
    try {
      evt = JSON.parse(payload) as ResearchStreamEvent;
    } catch {
      return;
    }
    switch (evt.type) {
      case "phase":
        handlers.onPhase?.(evt.message);
        break;
      case "stage_start":
        handlers.onStageStart?.(evt.stage, evt.message);
        break;
      case "stage_complete":
        handlers.onStageComplete?.(evt.stage, evt.display_text);
        break;
      case "stage_delta":
        handlers.onStageDelta?.(evt.stage, evt.delta);
        break;
      case "tool_start":
        handlers.onToolStart?.(evt.name, evt.detail);
        break;
      case "tool_result":
        handlers.onToolResult?.(evt.name, evt.summary, evt.detail);
        break;
      case "delta":
        handlers.onDelta?.(evt.delta);
        break;
      case "report_preview":
        handlers.onReportPreview?.(evt.html, evt.language);
        break;
      case "done":
        done = evt;
        handlers.onDone?.(evt);
        break;
      case "error":
        streamError = evt.error || "Stream failed";
        handlers.onError?.(streamError);
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

  if (streamError) {
    throw new Error(streamError);
  }
  if (!done) {
    const err = "Stream ended without a done event";
    handlers.onError?.(err);
    throw new Error(err);
  }
  return done;
}

/** Pull the reply field from partial streamed JSON for live chat display. */
export function extractStreamingReplyPreview(raw: string): string {
  const replyMatch = raw.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (replyMatch) {
    try {
      return JSON.parse(`"${replyMatch[1]}"`) as string;
    } catch {
      return replyMatch[1].replace(/\\n/g, "\n");
    }
  }
  if (raw.trim().startsWith("{")) return "";
  return raw;
}

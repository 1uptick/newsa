import {
  REPORT_HORIZON_OPTIONS,
  PACE_PRESETS,
  audienceDisplayLabel,
  languageTabLabel,
  styleDisplayLabel,
  type ReportI18nContent,
  type ReportOutputOptions,
} from "../../lib/atfxResearchReportOptions";
import type { ResearchToolEvent } from "../../lib/atfxResearchToolLabels";

import type { ReportLanguage } from "../../lib/atfxResearchReportOptions";

export type ReportListItem = {
  id: string;
  title: string;
  updated_at: string;
  created_at: string;
  languages?: ReportLanguage[];
  owner_uid?: string;
  owner_email?: string | null;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  tool_events?: ResearchToolEvent[] | null;
  created_at: string;
};

export type TopicPanelProgressEntry = {
  id: string;
  ts: string;
  message: string;
};

export const DEFAULT_REPORT_TITLE = "Untitled report";
export const PROSE_REPORT = "atfx-report-canvas html-content";

/** Minimal styles so downloaded .html matches the in-app canvas (charts, tables, prose). */
export const RESEARCH_REPORT_DOWNLOAD_CSS = `
body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; line-height: 1.65; color: #1e293b; max-width: 52rem; margin: 0 auto; padding: 1.5rem; }
.atfx-report-canvas.html-content h1 { font-size: 1.75rem; font-weight: 700; margin: 0 0 1rem; color: #0f172a; }
.atfx-report-canvas.html-content h2 { font-size: 1.25rem; font-weight: 700; margin: 1.5rem 0 0.75rem; color: #0f172a; }
.atfx-report-canvas.html-content h4 { font-size: 1rem; font-weight: 600; margin: 1rem 0 0.5rem; }
.atfx-report-canvas.html-content p { margin: 0 0 1rem; }
.atfx-report-canvas.html-content ul, .atfx-report-canvas.html-content ol { margin: 0 0 1rem; padding-left: 1.5rem; }
.atfx-report-canvas.html-content table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.875rem; }
.atfx-report-canvas.html-content th, .atfx-report-canvas.html-content td { border: 1px solid #e2e8f0; padding: 0.5rem 0.75rem; text-align: left; }
.atfx-report-canvas.html-content th { background: #f8fafc; font-weight: 600; }
.atfx-report-canvas.html-content img { max-width: 100%; height: auto; display: block; margin: 1rem auto; border-radius: 0.5rem; }
.atfx-report-canvas.html-content .atfx-econ-charts-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.5rem; margin: 1rem 0; }
.atfx-report-canvas.html-content .atfx-econ-charts-grid__cell { padding: 0.75rem; border: 1px solid #e2e8f0; border-radius: 0.5rem; background: #f8fafc; }
.atfx-report-canvas.html-content .atfx-econ-chart-solo { display: block; width: min(500px, 65%); margin: 1rem auto; padding: 0.75rem; border: 1px solid #e2e8f0; border-radius: 0.5rem; background: #f8fafc; }
.atfx-report-canvas.html-content a { color: #ff7900; text-decoration: underline; }
.atfx-report-canvas.html-content strong { font-weight: 700; color: #0f172a; }
`;

export function buildResearchReportDownloadDocument(title: string, bodyHtml: string): string {
  const safeTitle = (title || DEFAULT_REPORT_TITLE)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${safeTitle}</title>
<style>${RESEARCH_REPORT_DOWNLOAD_CSS}</style>
</head>
<body>
<div class="${PROSE_REPORT}">
${bodyHtml}
</div>
</body>
</html>`;
}

export function researchReportDownloadFilename(title: string, lang: ReportLanguage): string {
  const suffix = lang === "en" ? "" : `-${lang}`;
  const base = (title || "research-report").replace(/[^\w\s-]/g, "").trim().slice(0, 60) || "research-report";
  return `${base}${suffix}.html`;
}

export function canDeleteOwnedHistoryItem(
  ownerUid: string | null | undefined,
  currentUserUid: string | null | undefined
): boolean {
  if (!currentUserUid) return false;
  if (!ownerUid) return true;
  return ownerUid === currentUserUid;
}

export function historyOwnerLabel(email: string | null | undefined): string | null {
  const trimmed = email?.trim();
  return trimmed || null;
}

export function isEmptyWorkspace(
  reportI18n: ReportI18nContent,
  messages: ChatMessage[],
  title: string
): boolean {
  const hasHtml = Object.values(reportI18n).some((b) => (b?.report_html ?? "").trim());
  return !hasHtml && messages.length === 0 && title.trim() === DEFAULT_REPORT_TITLE;
}

export function historyListTitle(title: string): string {
  return title.trim() === DEFAULT_REPORT_TITLE ? "New draft" : title;
}

/** Rewrites legacy server progress strings until API is redeployed. */
export function friendlyTopicGenMessage(message: string): string {
  const t = message.trim();
  if (/^Topic selected:/i.test(t)) {
    return t.replace(/^Topic selected:/i, "Topic ready:");
  }
  if (/Generating retail SEO topic \(AI research\)/i.test(t)) {
    return "Generating retail SEO topic…";
  }
  if (/the model reply wasn't quite right/i.test(t)) {
    return "Almost there — that draft wasn't quite right. Please try again.";
  }
  if (/direction claim contradicts live market/i.test(t)) {
    return "Headline didn't match live price direction — trying a catalyst-focused angle…";
  }
  const regen = t.match(/^Regenerating \(attempt (\d+)\/(\d+)\)/i);
  if (regen) {
    return `Finding a fresh angle — idea ${regen[1]} of ${regen[2]}…`;
  }
  const attempting = t.match(/attempt(?:ing|)\s+(\d+)\/(\d+)/i);
  if (attempting) {
    return `Exploring another story idea (${attempting[1]} of ${attempting[2]})…`;
  }
  return message;
}

export function topicProgressEntriesChanged(
  prev: TopicPanelProgressEntry[],
  next: TopicPanelProgressEntry[]
): boolean {
  if (prev.length !== next.length) return true;
  if (prev.length === 0) return false;
  return (
    prev[0]?.id !== next[0]?.id ||
    prev[prev.length - 1]?.id !== next[next.length - 1]?.id ||
    prev[prev.length - 1]?.message !== next[next.length - 1]?.message
  );
}

export function settingsSummary(options: ReportOutputOptions): string {
  const style = styleDisplayLabel(options.style, options.customStyleName);
  const audience = audienceDisplayLabel(options.audience);
  const pace = PACE_PRESETS[options.pace]?.label ?? options.pace;
  const horizon =
    REPORT_HORIZON_OPTIONS.find((o) => o.value === options.horizon)?.label ?? options.horizon;
  const langs = options.languages.map((l) => languageTabLabel(l)).join(", ");
  return `${style} · ${audience} · ${pace} · ${horizon} · ${langs}`;
}

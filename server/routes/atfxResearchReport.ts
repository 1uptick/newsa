import express from "express";
import type { Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authenticateToken, requireAtfxAccess } from "../auth.js";
import { config } from "../config.js";
import { runResearchPipeline, formatPlanDisplay, formatResearchBubbleContent, type ResearchToolEvent } from "../atfxResearchPipeline.js";
import {
  normalizeReportOutputOptions,
  parseReportLanguage,
  parseReportTranslateLocale,
  type ReportLanguage,
  type ReportTranslateLocale,
} from "../atfxResearchReportOptions.js";
import { parseReportI18n, translateExcerptOnly, translateResearchReport, type TranslateProgressCallbacks } from "../atfxResearchTranslate.js";
import { isWordPressConfigured, publishResearchReportToWordPress } from "../atfxResearchWordPress.js";
import { injectCalendarTableFromBrief } from "../atfxReportTableHtml.js";
import { refreshReportChartEmbeds } from "../atfxReportHtmlNormalize.js";
import { refreshMissingEconomicCharts } from "../atfxReportEconomicChartRefresh.js";
import { runGetFmpEconomicCalendar } from "../atfxResearchFmpTools.js";
import { buildResearchReportMeta } from "../atfxResearchReportMeta.js";
import { isoDateOffset } from "../atfxResearchReportOptions.js";
import {
  BROKERAGE_ATFX,
  assertBrokerageTokensAvailable,
  finalizeBrokerageUsage,
  getBrokerageTokenBalance,
  runWithBrokerageUsageContext,
  runWithBrokerageUsageTracking,
  isBrokerageTokenError,
  brokerageTokenErrorResponse,
  type BrokerageTokenBalance,
} from "../brokerageTokenBilling.js";
import { respondBrokerageTokenError, withBrokerageTokenBilling } from "../brokerageTokenRouteHelpers.js";
import { detectCalendarCountries, MAX_ECONOMIC_CHARTS } from "../contentChartPlanner.js";
import { resolveAtfxHistoryUids } from "../atfxGroupScope.js";

type RegisterAtfxResearchReportDeps = {
  supabase: SupabaseClient | null;
};

type DbMessage = {
  id: string;
  role: string;
  content: string;
  tool_events?: unknown;
  created_at: string;
};

const FRESH_TOPICS_BATCH_EVENT = "fresh_topics_batch";
const FRESH_TOPICS_USER_RE = /^Generate fresh topics\b/i;

type StoredTopic = {
  id: string;
  title: string;
  source?: string;
  summary?: string;
  socialHook?: string;
  keyword1?: string;
  keyword2?: string;
  keyword3?: string;
  keywordTag?: string;
  psyTrigger?: string;
  stockTag?: string;
  createDate?: string;
  status?: string;
  approve?: string;
  custom?: string;
  company?: string;
};

function normalizeStoredTopic(value: unknown): StoredTopic | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  const title = typeof o.title === "string" ? o.title.trim() : "";
  if (!id || !title) return null;
  const str = (key: string) => (typeof o[key] === "string" ? String(o[key]) : "");
  return {
    id,
    title,
    source: str("source"),
    summary: str("summary"),
    socialHook: str("socialHook"),
    keyword1: str("keyword1"),
    keyword2: str("keyword2"),
    keyword3: str("keyword3"),
    keywordTag: str("keywordTag"),
    psyTrigger: str("psyTrigger"),
    stockTag: str("stockTag"),
    createDate: str("createDate"),
    status: str("status"),
    approve: str("approve"),
    custom: str("custom"),
    company: str("company") || undefined,
  };
}

function freshTopicsContent(topics: StoredTopic[]): string {
  if (topics.length === 0) return "Fresh topics";
  if (topics.length === 1) {
    const title = topics[0]?.title?.trim();
    return title ? `Fresh topic: ${title}` : "Fresh topic generated";
  }
  return `Fresh topics generated (${topics.length})`;
}

function freshTopicsHistoryTitle(topics: StoredTopic[]): string {
  const first = topics[0]?.title?.trim();
  if (!first) return "Fresh topics";
  if (topics.length === 1) return first.length > 120 ? `${first.slice(0, 117)}…` : first;
  const suffix = topics.length > 1 ? ` (+${topics.length - 1} more)` : "";
  const max = 120 - suffix.length;
  const clipped = first.length > max ? `${first.slice(0, Math.max(max - 1, 20))}…` : first;
  return `${clipped}${suffix}`;
}

function isFreshTopicsToolMessage(row: DbMessage): boolean {
  if (row.role !== "tool" || !Array.isArray(row.tool_events)) return false;
  return row.tool_events.some(
    (event) =>
      event &&
      typeof event === "object" &&
      !Array.isArray(event) &&
      (event as Record<string, unknown>).name === FRESH_TOPICS_BATCH_EVENT
  );
}

async function syncFreshTopicsSession(
  supabase: NonNullable<RegisterAtfxResearchReportDeps["supabase"]>,
  reportId: string,
  userRequest: string | null,
  topics: StoredTopic[]
): Promise<{ title: string; updated_at: string; messages: DbMessage[] }> {
  const now = new Date().toISOString();
  const { data: rows, error: listErr } = await supabase
    .from("atfx_research_report_messages")
    .select("id, role, content, tool_events, created_at")
    .eq("report_id", reportId)
    .order("created_at", { ascending: true });
  if (listErr) throw listErr;

  const existing = (Array.isArray(rows) ? rows : []) as DbMessage[];
  const topicsRow = existing.find(isFreshTopicsToolMessage);
  const trimmedUserRequest = userRequest?.trim() ?? "";
  const hasUserRequest = Boolean(trimmedUserRequest);
  const hasUserRow = existing.some(
    (row) => row.role === "user" && FRESH_TOPICS_USER_RE.test(String(row.content ?? "").trim())
  );

  if (hasUserRequest && !hasUserRow) {
    const { error: userErr } = await supabase.from("atfx_research_report_messages").insert({
      report_id: reportId,
      role: "user",
      content: trimmedUserRequest,
    });
    if (userErr) throw userErr;
  }

  const toolEvents = [
    {
      name: FRESH_TOPICS_BATCH_EVENT,
      summary: topics.length === 1 ? "1 topic" : `${topics.length} topics`,
      topics,
    },
  ];
  const toolContent = freshTopicsContent(topics);

  if (topicsRow) {
    const { error: updErr } = await supabase
      .from("atfx_research_report_messages")
      .update({ content: toolContent, tool_events: toolEvents })
      .eq("id", topicsRow.id);
    if (updErr) throw updErr;
  } else if (topics.length > 0) {
    const { error: insErr } = await supabase.from("atfx_research_report_messages").insert({
      report_id: reportId,
      role: "tool",
      content: toolContent,
      tool_events: toolEvents,
    });
    if (insErr) throw insErr;
  }

  const title = freshTopicsHistoryTitle(topics);
  const { error: reportErr } = await supabase
    .from("atfx_research_reports")
    .update({ title, updated_at: now })
    .eq("id", reportId);
  if (reportErr) throw reportErr;

  const { data: refreshed, error: refreshErr } = await supabase
    .from("atfx_research_report_messages")
    .select("id, role, content, tool_events, created_at")
    .eq("report_id", reportId)
    .order("created_at", { ascending: true });
  if (refreshErr) throw refreshErr;

  return {
    title,
    updated_at: now,
    messages: (Array.isArray(refreshed) ? refreshed : []) as DbMessage[],
  };
}

const SSE_KEEPALIVE_MS = 15_000;
const RESEARCH_CHAT_DEDUP_MS = 5000;
const researchChatInFlight = new Set<string>();

function storedUserMessageContent(displayMessage: string, message: string): string {
  return (displayMessage || message).trim();
}

function isDuplicateUserMessage(priorMessages: DbMessage[], userContent: string): boolean {
  const recent = [...priorMessages].reverse().find((m) => m.role === "user");
  if (!recent) return false;
  const age = Date.now() - new Date(recent.created_at).getTime();
  if (age > RESEARCH_CHAT_DEDUP_MS) return false;
  return String(recent.content ?? "").trim() === userContent;
}

function rejectResearchChat(
  res: Response,
  stream: boolean,
  status: number,
  error: string
): void {
  if (stream) {
    res.status(status);
    writeSse(res, { type: "error", error });
    res.end();
  } else {
    res.status(status).json({ error });
  }
}

function writeSse(res: Response, data: Record<string, unknown>): void {
  if (res.writableEnded) return;
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  const flush = (res as Response & { flush?: () => void }).flush;
  if (typeof flush === "function") flush.call(res);
}

function writeSseKeepalive(res: Response): void {
  if (res.writableEnded) return;
  res.write(": keepalive\n\n");
  const flush = (res as Response & { flush?: () => void }).flush;
  if (typeof flush === "function") flush.call(res);
}

function startSseKeepalive(res: Response): () => void {
  const timer = setInterval(() => writeSseKeepalive(res), SSE_KEEPALIVE_MS);
  return () => clearInterval(timer);
}

function calendarTextFromBrief(brief: unknown): string {
  if (!brief || typeof brief !== "object") return "";
  const o = brief as { calendar_text?: unknown };
  return typeof o.calendar_text === "string" ? o.calendar_text : "";
}

function isMissingColumnError(err: unknown): boolean {
  const msg = String((err as { message?: string; details?: string })?.message ?? err ?? "").toLowerCase();
  const details = String((err as { details?: string })?.details ?? "").toLowerCase();
  const combined = `${msg} ${details}`;
  return combined.includes("does not exist") && combined.includes("column");
}

async function fetchFreshCalendarText(report: RefreshableReport): Promise<string> {
  const fromDate = isoDateOffset(0);
  const toDate = (() => {
    const d = new Date(`${fromDate}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 21);
    return d.toISOString().slice(0, 10);
  })();

  const plan = report.research_plan as { instruments?: string[] } | undefined;
  const instruments = Array.isArray(plan?.instruments) ? plan.instruments : [];
  const title = typeof report.title === "string" ? report.title : "";
  const countries = detectCalendarCountries(`${title}\n${instruments.join(" ")}`, instruments);

  try {
    return await runGetFmpEconomicCalendar({
      fromDate,
      toDate,
      importance: "high",
      ...(countries.length ? { countries } : {}),
    });
  } catch (err) {
    console.warn("[atfx/research-report] fresh calendar fetch failed:", err);
    return "";
  }
}

function calendarCountriesFromReport(report: RefreshableReport): string[] {
  const plan = report.research_plan as { instruments?: string[] } | undefined;
  const instruments = Array.isArray(plan?.instruments) ? plan.instruments : [];
  const title = typeof report.title === "string" ? report.title : "";
  return detectCalendarCountries(`${title}\n${instruments.join(" ")}`, instruments);
}

function refreshReportCalendarHtml(
  html: string,
  calendarText: string,
  allowedCountries?: string[]
): string {
  if (!html?.trim() || !calendarText.trim()) return html;
  return injectCalendarTableFromBrief(html, calendarText, allowedCountries);
}

type RefreshableReport = {
  id?: string;
  title?: string | null;
  report_html?: string | null;
  report_html_i18n?: unknown;
  research_plan?: unknown;
  research_brief?: unknown;
  seo_excerpt?: string | null;
  thumbnail_url?: string | null;
};

async function persistReportRefresh(
  supabase: NonNullable<RegisterAtfxResearchReportDeps["supabase"]>,
  reportId: string,
  updates: Record<string, unknown>
): Promise<void> {
  if (!Object.keys(updates).length) return;

  let err = (await supabase.from("atfx_research_reports").update(updates).eq("id", reportId)).error;
  if (err && isMissingColumnError(err)) {
    const fallback: Record<string, unknown> = { updated_at: updates.updated_at };
    if (updates.report_html !== undefined) fallback.report_html = updates.report_html;
    if (updates.title !== undefined) fallback.title = updates.title;
    err = (await supabase.from("atfx_research_reports").update(fallback).eq("id", reportId)).error;
    if (!err) {
      console.warn(
        "[atfx/research-report] Optional columns missing — saved title/report_html only. " +
          "Run supabase/alter_atfx_research_reports_migrations.sql in Supabase SQL Editor."
      );
    }
  }
  if (err) throw err;
}

async function ensureReportMetaIfMissing<T extends RefreshableReport>(
  report: T,
  supabase: NonNullable<RegisterAtfxResearchReportDeps["supabase"]>,
  reportId: string
): Promise<T> {
  const htmlForMeta =
    (typeof report.report_html === "string" && report.report_html.trim()) ||
    parseReportI18n(report.report_html_i18n).en?.report_html?.trim() ||
    "";
  const needsThumb = !(typeof report.thumbnail_url === "string" && report.thumbnail_url.trim());
  const needsSeo = !(typeof report.seo_excerpt === "string" && report.seo_excerpt.trim());
  if (!htmlForMeta || (!needsThumb && !needsSeo)) return report;

  const title =
    (typeof report.title === "string" && report.title.trim()) ||
    parseReportI18n(report.report_html_i18n).en?.title?.trim() ||
    DEFAULT_REPORT_TITLE;

  try {
    const meta = await buildResearchReportMeta(supabase as { storage?: unknown }, title, htmlForMeta);
    const next = { ...report } as T;
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (needsSeo && meta.seo_excerpt?.trim()) {
      (next as RefreshableReport).seo_excerpt = meta.seo_excerpt;
      updates.seo_excerpt = meta.seo_excerpt;
    }
    if (needsThumb && meta.thumbnail_url?.trim()) {
      (next as RefreshableReport).thumbnail_url = meta.thumbnail_url;
      updates.thumbnail_url = meta.thumbnail_url;
    }

    if (Object.keys(updates).length > 1) {
      await persistReportRefresh(supabase, reportId, updates);
    }
    return next;
  } catch (err) {
    console.warn("[atfx/research-report] meta backfill failed:", err);
    return report;
  }
}

async function refreshReportPayload<T extends RefreshableReport>(
  report: T,
  supabase?: RegisterAtfxResearchReportDeps["supabase"],
  reportId?: string
): Promise<T> {
  const freshCalendar = await fetchFreshCalendarText(report);
  const calendarText = freshCalendar.trim() || calendarTextFromBrief(report.research_brief);
  const calendarCountries = calendarCountriesFromReport(report);

  const originalHtml = typeof report.report_html === "string" ? report.report_html : "";
  const originalI18nJson = JSON.stringify(parseReportI18n(report.report_html_i18n));

  const title =
    (typeof report.title === "string" && report.title.trim()) ||
    parseReportI18n(report.report_html_i18n).en?.title ||
    "Untitled report";

  let briefEconEmbeds: string[] =
    report.research_brief &&
    typeof report.research_brief === "object" &&
    Array.isArray((report.research_brief as { econ_chart_embeds?: unknown }).econ_chart_embeds)
      ? (report.research_brief as { econ_chart_embeds: unknown[] }).econ_chart_embeds
          .filter((s): s is string => typeof s === "string" && s.startsWith("data:image"))
          .slice(0, MAX_ECONOMIC_CHARTS)
      : [];

  const refreshHtml = async (html: string): Promise<string> => {
    if (!html?.trim()) return html;
    let out = html;
    if (calendarText.trim()) {
      out = refreshReportCalendarHtml(out, calendarText, calendarCountries);
    }
    out = refreshReportChartEmbeds(out, {
      ...(report.research_brief && typeof report.research_brief === "object"
        ? report.research_brief
        : {}),
      econ_chart_embeds: briefEconEmbeds,
    });
    const econ = await refreshMissingEconomicCharts(out, title, report.research_brief, report.research_plan);
    if (econ.changed) {
      out = econ.html;
      briefEconEmbeds = econ.econEmbeds;
    }
    return out;
  };

  const next = { ...report } as T;

  if (typeof next.report_html === "string" && next.report_html.trim()) {
    next.report_html = await refreshHtml(next.report_html);
  }

  const i18n = parseReportI18n(next.report_html_i18n);
  if (Object.keys(i18n).length) {
    const refreshed: typeof i18n = {};
    for (const [lang, bundle] of Object.entries(i18n)) {
      refreshed[lang as keyof typeof i18n] = {
        ...bundle,
        report_html: await refreshHtml(bundle.report_html),
      };
    }
    next.report_html_i18n = refreshed;
  }

  if (briefEconEmbeds.length && report.research_brief && typeof report.research_brief === "object") {
    next.research_brief = {
      ...(report.research_brief as Record<string, unknown>),
      econ_chart_embeds: briefEconEmbeds,
    };
  }

  const htmlChanged =
    (typeof next.report_html === "string" ? next.report_html : "") !== originalHtml ||
    JSON.stringify(parseReportI18n(next.report_html_i18n)) !== originalI18nJson;

  const htmlForMeta =
    (typeof next.report_html === "string" && next.report_html.trim()) ||
    parseReportI18n(next.report_html_i18n).en?.report_html ||
    "";

  let seoExcerpt = typeof report.seo_excerpt === "string" ? report.seo_excerpt : "";
  let thumbnailUrl = typeof report.thumbnail_url === "string" ? report.thumbnail_url : "";
  let metaChanged = false;

  if (htmlForMeta && (!seoExcerpt.trim() || !thumbnailUrl.trim())) {
    try {
      const meta = await buildResearchReportMeta(supabase as { storage?: unknown }, title, htmlForMeta);
      if (!seoExcerpt.trim() && meta.seo_excerpt) {
        seoExcerpt = meta.seo_excerpt;
        metaChanged = true;
      }
      if (!thumbnailUrl.trim() && meta.thumbnail_url) {
        thumbnailUrl = meta.thumbnail_url;
        metaChanged = true;
      }
    } catch (err) {
      console.warn("[atfx/research-report] meta refresh failed:", err);
    }
  }

  next.seo_excerpt = seoExcerpt;
  next.thumbnail_url = thumbnailUrl;

  if (supabase && reportId && (htmlChanged || metaChanged || freshCalendar.trim())) {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (htmlChanged) {
      if (typeof next.report_html === "string") updates.report_html = next.report_html;
      if (next.report_html_i18n) updates.report_html_i18n = next.report_html_i18n;
    }
    if (freshCalendar.trim() && report.research_brief && typeof report.research_brief === "object") {
      updates.research_brief = {
        ...(report.research_brief as Record<string, unknown>),
        calendar_text: freshCalendar,
      };
    }
    if (briefEconEmbeds.length) {
      updates.research_brief = {
        ...((updates.research_brief as Record<string, unknown> | undefined) ??
          (report.research_brief && typeof report.research_brief === "object"
            ? (report.research_brief as Record<string, unknown>)
            : {})),
        econ_chart_embeds: briefEconEmbeds,
      };
    }
    if (metaChanged) {
      if (seoExcerpt.trim()) updates.seo_excerpt = seoExcerpt;
      if (thumbnailUrl.trim()) updates.thumbnail_url = thumbnailUrl;
    }
    try {
      await persistReportRefresh(supabase, reportId, updates);
    } catch (err) {
      console.warn("[atfx/research-report] refresh persist failed:", err);
    }
  }

  return next;
}

function sanitizeReportHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/javascript:/gi, "");
}

/** Extract partial report HTML from streamed JSON when available. */
function extractStreamingReportHtml(raw: string): string | null {
  const key = '"report_html"';
  const idx = raw.indexOf(key);
  if (idx === -1) return null;
  const after = raw.slice(idx + key.length);
  const colon = after.indexOf(":");
  if (colon === -1) return null;
  const rest = after.slice(colon + 1).trimStart();
  if (!rest.startsWith('"')) return null;
  let out = "";
  let escaped = false;
  for (let i = 1; i < rest.length; i++) {
    const ch = rest[i];
    if (escaped) {
      if (ch === "n") out += "\n";
      else if (ch === "t") out += "\t";
      else if (ch === "r") out += "\r";
      else out += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      return out.length > 12 ? out : null;
    }
    out += ch;
  }
  return out.length > 24 ? out : null;
}

function uidFromReq(req: express.Request): string {
  return (req as express.Request & { uid?: string }).uid ?? "";
}

const DEFAULT_REPORT_TITLE = "Untitled report";

async function reportMessageCount(
  supabase: NonNullable<RegisterAtfxResearchReportDeps["supabase"]>,
  reportId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("atfx_research_report_messages")
    .select("id", { count: "exact", head: true })
    .eq("report_id", reportId);
  if (error) throw error;
  return count ?? 0;
}

async function isEmptyDraftReport(
  supabase: NonNullable<RegisterAtfxResearchReportDeps["supabase"]>,
  report: { id: string; title?: string | null; report_html?: string | null }
): Promise<boolean> {
  if (String(report.title ?? "").trim() !== DEFAULT_REPORT_TITLE) return false;
  if (String(report.report_html ?? "").trim()) return false;
  return (await reportMessageCount(supabase, report.id)) === 0;
}

async function findReusableEmptyDraft(
  supabase: NonNullable<RegisterAtfxResearchReportDeps["supabase"]>,
  uid: string
): Promise<{ id: string; title: string; report_html: string; created_at: string; updated_at: string } | null> {
  const { data, error } = await supabase
    .from("atfx_research_reports")
    .select("id, title, report_html, created_at, updated_at")
    .eq("firebase_uid", uid)
    .eq("title", DEFAULT_REPORT_TITLE)
    .order("updated_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  for (const row of data ?? []) {
    if (await isEmptyDraftReport(supabase, row)) {
      return row as { id: string; title: string; report_html: string; created_at: string; updated_at: string };
    }
  }
  return null;
}

/** Keep one empty draft (newest); delete the rest. Returns number deleted. */
async function pruneDuplicateEmptyDrafts(
  supabase: NonNullable<RegisterAtfxResearchReportDeps["supabase"]>,
  uid: string,
  keepId?: string
): Promise<number> {
  const { data, error } = await supabase
    .from("atfx_research_reports")
    .select("id, title, report_html, updated_at")
    .eq("firebase_uid", uid)
    .eq("title", DEFAULT_REPORT_TITLE)
    .order("updated_at", { ascending: false });
  if (error) throw error;

  const emptyIds: string[] = [];
  for (const row of data ?? []) {
    if (await isEmptyDraftReport(supabase, row)) emptyIds.push(row.id);
  }
  if (emptyIds.length <= 1) return 0;

  const keep = keepId && emptyIds.includes(keepId) ? keepId : emptyIds[0];
  const deleteIds = emptyIds.filter((id) => id !== keep);
  if (deleteIds.length === 0) return 0;

  const { error: delErr } = await supabase.from("atfx_research_reports").delete().in("id", deleteIds);
  if (delErr) throw delErr;
  return deleteIds.length;
}

const BASE_REPORT_COLUMNS = "id, title, report_html";
const EXTENDED_REPORT_COLUMNS =
  "id, title, report_html, report_html_i18n, output_options, research_plan, research_brief, seo_excerpt, thumbnail_url";

type ReportAccessRow = {
  id: string;
  firebase_uid: string;
  title: string;
  report_html: string;
  output_options?: unknown;
  research_plan?: unknown;
  research_brief?: unknown;
  report_html_i18n?: unknown;
  seo_excerpt?: string | null;
  thumbnail_url?: string | null;
};

/** English canvas HTML for pipeline edits — report_html column or report_html_i18n.en fallback. */
function resolveReportCanvasHtml(report: {
  report_html?: string | null;
  report_html_i18n?: unknown;
}): string {
  const direct = typeof report.report_html === "string" ? report.report_html.trim() : "";
  if (direct) return direct;
  return parseReportI18n(report.report_html_i18n).en?.report_html?.trim() || "";
}

async function fetchReportAccessRow(
  supabase: NonNullable<RegisterAtfxResearchReportDeps["supabase"]>,
  reportId: string
): Promise<ReportAccessRow | null> {
  let result = await supabase
    .from("atfx_research_reports")
    .select(`${EXTENDED_REPORT_COLUMNS}, firebase_uid`)
    .eq("id", reportId)
    .maybeSingle();

  if (result.error && isMissingColumnError(result.error)) {
    result = await supabase
      .from("atfx_research_reports")
      .select(`${BASE_REPORT_COLUMNS}, firebase_uid`)
      .eq("id", reportId)
      .maybeSingle();
  }

  if (result.error) throw result.error;
  return result.data as ReportAccessRow | null;
}

async function assertReportGroupAccess(
  supabase: NonNullable<RegisterAtfxResearchReportDeps["supabase"]>,
  reportId: string,
  groupUids: string[]
): Promise<Omit<ReportAccessRow, "firebase_uid"> | null> {
  const row = await fetchReportAccessRow(supabase, reportId);
  if (!row || !groupUids.includes(row.firebase_uid)) return null;
  const { firebase_uid: _owner, ...report } = row;
  return report;
}

async function assertReportOwnerOnly(
  supabase: NonNullable<RegisterAtfxResearchReportDeps["supabase"]>,
  reportId: string,
  uid: string
): Promise<{ id: string } | null> {
  const row = await fetchReportAccessRow(supabase, reportId);
  if (!row || row.firebase_uid !== uid) return null;
  return { id: row.id };
}

async function persistChatResult(
  supabase: NonNullable<RegisterAtfxResearchReportDeps["supabase"]>,
  reportId: string,
  report: {
    title: string;
    report_html: string;
    report_html_i18n?: unknown;
    seo_excerpt?: string | null;
    thumbnail_url?: string | null;
  },
  agentResult: {
    reply: string;
    title?: string;
    report_html?: string;
    tool_events: ResearchToolEvent[];
    output_options?: unknown;
    research_plan?: unknown;
    research_brief?: unknown;
    report_i18n?: ReturnType<typeof parseReportI18n>;
    pipeline_display?: { planning: string; research: string; writing: string };
  }
) {
  let reportHtml = report.report_html;
  let title = report.title;
  let reportHtmlI18n = parseReportI18n(report.report_html_i18n);

  if (agentResult.report_i18n && Object.keys(agentResult.report_i18n).length > 0) {
    const sanitized: Record<string, { title: string; report_html: string; seo_excerpt?: string }> = {};
    for (const [lang, bundle] of Object.entries(agentResult.report_i18n)) {
      if (!bundle?.report_html?.trim()) continue;
      sanitized[lang] = {
        title: (bundle.title || title).slice(0, 200),
        report_html: sanitizeReportHtml(bundle.report_html.trim()),
        ...(bundle.seo_excerpt?.trim() ? { seo_excerpt: bundle.seo_excerpt.trim().slice(0, 500) } : {}),
      };
    }
    reportHtmlI18n = sanitized;
    if (sanitized.en) {
      reportHtml = sanitized.en.report_html;
      title = sanitized.en.title;
    }
  } else if (agentResult.report_html?.trim()) {
    reportHtml = sanitizeReportHtml(agentResult.report_html.trim());
    if (agentResult.title?.trim()) title = agentResult.title.trim().slice(0, 200);
    reportHtmlI18n = { ...reportHtmlI18n, en: { title, report_html: reportHtml } };
  } else if (agentResult.title?.trim()) {
    title = agentResult.title.trim().slice(0, 200);
  }

  if (agentResult.research_brief) {
    if (reportHtml?.trim()) {
      reportHtml = refreshReportChartEmbeds(reportHtml, agentResult.research_brief);
    }
    if (Object.keys(reportHtmlI18n).length > 0) {
      const hydrated: typeof reportHtmlI18n = {};
      for (const [lang, bundle] of Object.entries(reportHtmlI18n)) {
        if (!bundle) continue;
        const html = bundle.report_html?.trim()
          ? refreshReportChartEmbeds(bundle.report_html, agentResult.research_brief)
          : bundle.report_html;
        hydrated[lang as keyof typeof reportHtmlI18n] = { ...bundle, report_html: html };
      }
      reportHtmlI18n = hydrated;
      if (hydrated.en?.report_html) reportHtml = hydrated.en.report_html;
    }
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (agentResult.report_html?.trim() || agentResult.report_i18n?.en) updates.report_html = reportHtml;
  if (agentResult.title?.trim() || agentResult.report_i18n?.en) updates.title = title;
  if (agentResult.report_i18n && Object.keys(reportHtmlI18n).length > 0) {
    updates.report_html_i18n = reportHtmlI18n;
  }
  if (agentResult.output_options) updates.output_options = agentResult.output_options;
  if (agentResult.research_plan) updates.research_plan = agentResult.research_plan;
  if (agentResult.research_brief) updates.research_brief = agentResult.research_brief;

  let seoExcerpt = typeof report.seo_excerpt === "string" ? report.seo_excerpt : "";
  let thumbnailUrl = typeof report.thumbnail_url === "string" ? report.thumbnail_url : "";

  if (updates.report_html && typeof updates.report_html === "string" && updates.report_html.trim()) {
    try {
      const meta = await buildResearchReportMeta(supabase as { storage?: unknown }, title, reportHtml);
      if (meta.seo_excerpt) {
        seoExcerpt = meta.seo_excerpt;
        updates.seo_excerpt = seoExcerpt;
        if (reportHtmlI18n.en) {
          reportHtmlI18n = {
            ...reportHtmlI18n,
            en: { ...reportHtmlI18n.en, seo_excerpt: seoExcerpt },
          };
          updates.report_html_i18n = reportHtmlI18n;
        }
      }
      if (meta.thumbnail_url) {
        thumbnailUrl = meta.thumbnail_url;
        updates.thumbnail_url = thumbnailUrl;
      }
    } catch (err) {
      console.warn("[atfx/research-report] SEO/thumbnail generation failed:", err);
    }
  }

  let updErr = (await supabase.from("atfx_research_reports").update(updates).eq("id", reportId)).error;
  if (updErr && isMissingColumnError(updErr)) {
    const fallback: Record<string, unknown> = { updated_at: updates.updated_at };
    if (updates.report_html !== undefined) fallback.report_html = updates.report_html;
    if (updates.title !== undefined) fallback.title = updates.title;
    updErr = (await supabase.from("atfx_research_reports").update(fallback).eq("id", reportId)).error;
    if (updErr) throw updErr;
    console.warn(
      "[atfx/research-report] Optional columns missing — saved title/report_html only. " +
        "Run supabase/alter_atfx_research_reports_migrations.sql in Supabase SQL Editor."
    );
  } else if (updErr) {
    throw updErr;
  }

  const pipelineRows: DbMessage[] = [];
  const log = agentResult.pipeline_display;
  const plan = agentResult.research_plan as Parameters<typeof formatPlanDisplay>[0] | undefined;
  const brief = agentResult.research_brief as Parameters<typeof formatResearchBubbleContent>[0] | undefined;
  const options = agentResult.output_options;

  const planningContent =
    log?.planning?.trim() ||
    (plan && options ? formatPlanDisplay(plan, normalizeReportOutputOptions(options)) : "");
  if (planningContent.trim()) {
    const { data: row, error: planErr } = await supabase
      .from("atfx_research_report_messages")
      .insert({
        report_id: reportId,
        role: "tool",
        content: planningContent.trim(),
        tool_events: [{ name: "pipeline_stage", summary: "planning" }],
      })
      .select("id, role, content, tool_events, created_at")
      .single();
    if (planErr) throw planErr;
    if (row) pipelineRows.push(row as DbMessage);
  }

  const researchContent =
    log?.research?.trim() || (brief ? formatResearchBubbleContent(brief) : "");
  if (researchContent.trim()) {
    const researchTools = agentResult.tool_events.map((t) => ({
      name: t.name,
      summary: t.summary,
      ...(t.detail ? { detail: t.detail } : {}),
    }));
    const { data: row, error: researchErr } = await supabase
      .from("atfx_research_report_messages")
      .insert({
        report_id: reportId,
        role: "tool",
        content: researchContent.trim(),
        tool_events: [{ name: "pipeline_stage", summary: "research" }, ...researchTools],
      })
      .select("id, role, content, tool_events, created_at")
      .single();
    if (researchErr) throw researchErr;
    if (row) pipelineRows.push(row as DbMessage);
  }

  const { data: assistantRow, error: asstErr } = await supabase
    .from("atfx_research_report_messages")
    .insert({
      report_id: reportId,
      role: "assistant",
      content: agentResult.reply,
      tool_events: agentResult.tool_events.length > 0 ? agentResult.tool_events : null,
    })
    .select("id, role, content, tool_events, created_at")
    .single();
  if (asstErr) throw asstErr;

  return { title, reportHtml, reportHtmlI18n, assistantRow, pipelineRows, seoExcerpt, thumbnailUrl };
}

type TranslateReportResult = {
  locale: ReportTranslateLocale;
  bundle: { title: string; report_html: string; seo_excerpt?: string };
  report_i18n: ReturnType<typeof parseReportI18n>;
  cached: boolean;
  tokenBalance?: BrokerageTokenBalance;
};

async function persistReportI18n(
  supabase: NonNullable<RegisterAtfxResearchReportDeps["supabase"]>,
  reportId: string,
  nextI18n: ReturnType<typeof parseReportI18n>
): Promise<void> {
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    report_html_i18n: nextI18n,
  };

  const updErr = (await supabase.from("atfx_research_reports").update(updates).eq("id", reportId)).error;
  if (updErr && isMissingColumnError(updErr)) {
    throw new Error(
      "report_html_i18n column is missing — run supabase/alter_atfx_research_reports_migrations.sql in Supabase SQL Editor."
    );
  }
  if (updErr) throw updErr;
}

async function executeReportTranslation(
  supabase: NonNullable<RegisterAtfxResearchReportDeps["supabase"]>,
  reportId: string,
  groupUids: string[],
  actingUserUid: string,
  locale: ReportTranslateLocale,
  callbacks?: TranslateProgressCallbacks,
  options?: { force?: boolean }
): Promise<TranslateReportResult> {
  const report = await assertReportGroupAccess(supabase, reportId, groupUids);
  if (!report) throw new Error("Report not found");

  const i18n = parseReportI18n(report.report_html_i18n);
  const titleEn =
    i18n.en?.title?.trim() ||
    (typeof report.title === "string" ? report.title.trim() : "") ||
    DEFAULT_REPORT_TITLE;
  const htmlEn = i18n.en?.report_html?.trim() || String(report.report_html ?? "").trim();
  const excerptEn =
    i18n.en?.seo_excerpt?.trim() ||
    (typeof report.seo_excerpt === "string" ? report.seo_excerpt.trim() : "");

  if (!htmlEn) {
    throw new Error("English report content is required before translation.");
  }

  const needsExcerpt =
    Boolean(excerptEn) && (!i18n[locale]?.seo_excerpt?.trim() || options?.force === true);

  if (!options?.force && i18n[locale]?.report_html?.trim()) {
    if (!needsExcerpt) {
      return {
        locale,
        bundle: i18n[locale]!,
        report_i18n: i18n,
        cached: true,
      };
    }

    callbacks?.onProgress?.(`Translating SEO excerpt to ${locale.toUpperCase()}…`);
    const seo_excerpt = await withBrokerageTokenBilling(
      BROKERAGE_ATFX,
      "translation",
      () => translateExcerptOnly(excerptEn, locale),
      {
        firebaseUid: actingUserUid,
        referenceId: reportId,
        ensureBilledOnSuccess: (result) => Boolean(result?.trim()),
        fallbackModel: "research-report-translate",
      }
    );

    const bundle = { ...i18n[locale]!, seo_excerpt };
    const nextI18n = { ...i18n, [locale]: bundle };
    await persistReportI18n(supabase, reportId, nextI18n);

    const tokenBalance = await getBrokerageTokenBalance(BROKERAGE_ATFX);
    return { locale, bundle, report_i18n: nextI18n, cached: false, tokenBalance };
  }

  const started = Date.now();
  console.log(
    `[atfx/research-report] translate start id=${reportId} locale=${locale} htmlChars=${htmlEn.length}${options?.force ? " force" : ""}`
  );

  const bundle = await withBrokerageTokenBilling(
    BROKERAGE_ATFX,
    "translation",
    () => translateResearchReport(titleEn, htmlEn, locale, callbacks),
    {
      firebaseUid: actingUserUid,
      referenceId: reportId,
      ensureBilledOnSuccess: (result) => Boolean(result?.report_html?.trim()),
      fallbackModel: "research-report-translate",
    }
  );

  console.log(
    `[atfx/research-report] translate done id=${reportId} locale=${locale} ${((Date.now() - started) / 1000).toFixed(1)}s`
  );

  let seo_excerpt: string | undefined;
  if (excerptEn) {
    callbacks?.onProgress?.(`Translating SEO excerpt to ${locale.toUpperCase()}…`);
    seo_excerpt = await translateExcerptOnly(excerptEn, locale);
  }

  const sanitized = {
    title: bundle.title.slice(0, 200),
    report_html: sanitizeReportHtml(bundle.report_html.trim()),
    ...(seo_excerpt?.trim() ? { seo_excerpt: seo_excerpt.trim() } : {}),
  };
  const nextI18n = {
    ...i18n,
    en: i18n.en ?? { title: titleEn, report_html: htmlEn },
    [locale]: sanitized,
  };

  await persistReportI18n(supabase, reportId, nextI18n);

  const tokenBalance = await getBrokerageTokenBalance(BROKERAGE_ATFX);
  return { locale, bundle: sanitized, report_i18n: nextI18n, cached: false, tokenBalance };
}

const REPORT_LIST_LANGS = new Set<ReportLanguage>(["en", "tc", "sc", "th", "vi"]);

function normalizeReportListLanguages(raw: unknown): ReportLanguage[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (lang): lang is ReportLanguage =>
      typeof lang === "string" && REPORT_LIST_LANGS.has(lang as ReportLanguage)
  );
}

type AtfxHistoryGroup = Awaited<ReturnType<typeof resolveAtfxHistoryUids>>;

async function filterListableReportItems(
  supabase: NonNullable<RegisterAtfxResearchReportDeps["supabase"]>,
  items: Array<{
    id: string;
    title: string;
    updated_at: string;
    created_at: string;
    languages: ReportLanguage[];
    owner_uid: string;
    owner_email: string | null;
  }>
): Promise<typeof items> {
  const draftIdsNeedingMessages: string[] = [];
  for (const row of items) {
    if (row.languages.length > 0) continue;
    if (String(row.title ?? "").trim() !== DEFAULT_REPORT_TITLE) continue;
    draftIdsNeedingMessages.push(row.id);
  }

  const draftIdsWithMessages = new Set<string>();
  if (draftIdsNeedingMessages.length > 0) {
    const { data, error } = await supabase
      .from("atfx_research_report_messages")
      .select("report_id")
      .in("report_id", draftIdsNeedingMessages);
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.report_id) draftIdsWithMessages.add(String(row.report_id));
    }
  }

  return items.filter((row) => {
    if (row.languages.length > 0) return true;
    if (String(row.title ?? "").trim() !== DEFAULT_REPORT_TITLE) return true;
    return draftIdsWithMessages.has(row.id);
  });
}

export async function fetchResearchReportListItems(
  supabase: NonNullable<RegisterAtfxResearchReportDeps["supabase"]>,
  group: AtfxHistoryGroup
): Promise<
  Array<{
    id: string;
    title: string;
    updated_at: string;
    created_at: string;
    languages: ReportLanguage[];
    owner_uid: string;
    owner_email: string | null;
  }>
> {
  const { data: rpcData, error: rpcError } = await supabase.rpc("atfx_research_report_list", {
    uids: group.uids,
  });

  if (!rpcError && Array.isArray(rpcData)) {
    const mapped = rpcData.map((row: Record<string, unknown>) => ({
      id: String(row.id),
      title: String(row.title ?? "Untitled report"),
      updated_at: String(row.updated_at),
      created_at: String(row.created_at),
      languages: normalizeReportListLanguages(row.languages),
      owner_uid: String(row.firebase_uid),
      owner_email: group.emailByUid.get(String(row.firebase_uid)) ?? null,
    }));
    return filterListableReportItems(supabase, mapped);
  }

  if (rpcError) {
    console.warn("[atfx/research-report] list rpc fallback:", rpcError.message);
  }

  const { data, error } = await supabase
    .from("atfx_research_reports")
    .select("id, title, updated_at, created_at, firebase_uid")
    .in("firebase_uid", group.uids)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  const mapped = rows.map((row) => ({
    id: row.id,
    title: row.title,
    updated_at: row.updated_at,
    created_at: row.created_at,
    languages: [] as ReportLanguage[],
    owner_uid: row.firebase_uid,
    owner_email: group.emailByUid.get(row.firebase_uid) ?? null,
  }));
  return filterListableReportItems(supabase, mapped);
}

export function registerAtfxResearchReportRoutes(
  apiRouter: express.Router,
  deps: RegisterAtfxResearchReportDeps
): void {
  const { supabase } = deps;

  apiRouter.use("/atfx/research-report", authenticateToken, requireAtfxAccess);

  apiRouter.get("/atfx/research-report", async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (!supabase) return res.status(503).json({ error: "Database not configured." });
    const uid = uidFromReq(req);
    try {
      const group = await resolveAtfxHistoryUids(supabase as unknown as SupabaseClient, uid);
      res.json(await fetchResearchReportListItems(supabase, group));
    } catch (err: unknown) {
      console.error("[atfx/research-report] list error:", err);
      res.status(500).json({ error: (err as Error)?.message ?? "Failed to list reports" });
    }
  });

  apiRouter.post("/atfx/research-report", async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (!supabase) return res.status(503).json({ error: "Database not configured." });
    const uid = uidFromReq(req);

    if (req.body?.action === "sync_fresh_topics") {
      const reportId =
        typeof req.body?.report_id === "string" ? req.body.report_id.trim() : "";
      if (!reportId) return res.status(400).json({ error: "report_id is required" });
      const userRequest =
        typeof req.body?.user_request === "string" ? req.body.user_request.trim() : null;
      const rawTopics = Array.isArray(req.body?.topics) ? req.body.topics : [];
      const topics = rawTopics
        .map(normalizeStoredTopic)
        .filter((item: StoredTopic | null): item is StoredTopic => item != null);
      try {
        const group = await resolveAtfxHistoryUids(supabase as unknown as SupabaseClient, uid);
        const report = await assertReportGroupAccess(supabase, reportId, group.uids);
        if (!report) return res.status(404).json({ error: "Report not found" });
        const result = await syncFreshTopicsSession(supabase, reportId, userRequest, topics);
        return res.json(result);
      } catch (err: unknown) {
        console.error("[atfx/research-report] fresh-topics sync error:", err);
        return res
          .status(500)
          .json({ error: (err as Error)?.message ?? "Failed to save fresh topics" });
      }
    }

    const title =
      typeof req.body?.title === "string" && req.body.title.trim()
        ? req.body.title.trim().slice(0, 200)
        : DEFAULT_REPORT_TITLE;
    const forceNew = req.body?.forceNew === true;
    const reuseEmpty = req.body?.reuseEmpty !== false;
    try {
      if (!forceNew && reuseEmpty) {
        const existing = await findReusableEmptyDraft(supabase, uid);
        if (existing) {
          await pruneDuplicateEmptyDrafts(supabase, uid, existing.id);
          return res.status(200).json(existing);
        }
      }

      const { data, error } = await supabase
        .from("atfx_research_reports")
        .insert({ firebase_uid: uid, title })
        .select("id, title, report_html, created_at, updated_at")
        .single();
      if (error) throw error;
      await pruneDuplicateEmptyDrafts(supabase, uid, data.id);
      res.status(201).json(data);
    } catch (err: unknown) {
      console.error("[atfx/research-report] create error:", err);
      res.status(500).json({ error: (err as Error)?.message ?? "Failed to create report" });
    }
  });

  apiRouter.get("/atfx/research-report/:id", async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (!supabase) return res.status(503).json({ error: "Database not configured." });
    const uid = uidFromReq(req);
    const { id } = req.params;
    try {
      const group = await resolveAtfxHistoryUids(supabase as unknown as SupabaseClient, uid);
      const report = await assertReportGroupAccess(supabase, id, group.uids);
      if (!report) return res.status(404).json({ error: "Report not found" });

      const lite =
        req.query.lite === "1" ||
        req.query.lite === "true" ||
        req.query.lite === "yes";
      const enriched = lite
        ? report
        : await ensureReportMetaIfMissing(report, supabase, id);

      const { data: messages, error: msgErr } = await supabase
        .from("atfx_research_report_messages")
        .select("id, role, content, tool_events, created_at")
        .eq("report_id", id)
        .order("created_at", { ascending: true });
      if (msgErr) throw msgErr;

      const payload = {
        ...enriched,
        messages: Array.isArray(messages) ? messages : [],
      };

      const refresh =
        req.query.refresh === "1" ||
        req.query.refresh === "true" ||
        req.query.refresh === "yes";
      if (refresh) {
        res.json(await refreshReportPayload(payload, supabase, id));
        return;
      }

      res.json(payload);
    } catch (err: unknown) {
      console.error("[atfx/research-report] get error:", err);
      res.status(500).json({ error: (err as Error)?.message ?? "Failed to load report" });
    }
  });

  apiRouter.delete("/atfx/research-report/:id", async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (!supabase) return res.status(503).json({ error: "Database not configured." });
    const uid = uidFromReq(req);
    const { id } = req.params;
    try {
      const report = await assertReportOwnerOnly(supabase, id, uid);
      if (!report) return res.status(404).json({ error: "Report not found" });

      const { error } = await supabase.from("atfx_research_reports").delete().eq("id", id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (err: unknown) {
      console.error("[atfx/research-report] delete error:", err);
      res.status(500).json({ error: (err as Error)?.message ?? "Failed to delete report" });
    }
  });

  const handleChat = async (
    req: express.Request,
    res: express.Response,
    stream: boolean
  ): Promise<void> => {
    if (!supabase) {
      if (stream) {
        res.status(503);
        writeSse(res, { type: "error", error: "Database not configured." });
        res.end();
      } else {
        res.status(503).json({ error: "Database not configured." });
      }
      return;
    }
    if (!config.requesty.apiKey) {
      const err = "Research report chat is not available (LLM not configured).";
      if (stream) {
        res.status(503);
        writeSse(res, { type: "error", error: err });
        res.end();
      } else {
        res.status(503).json({ error: err });
      }
      return;
    }

    const uid = uidFromReq(req);
    const { id } = req.params;
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    const displayMessage =
      typeof req.body?.display_message === "string" ? req.body.display_message.trim() : "";
    const outputOptions = normalizeReportOutputOptions(req.body?.options);
    if (!message) {
      if (stream) {
        res.status(400);
        writeSse(res, { type: "error", error: "message is required" });
        res.end();
      } else {
        res.status(400).json({ error: "message is required" });
      }
      return;
    }

    try {
      await assertBrokerageTokensAvailable(BROKERAGE_ATFX);
    } catch (preErr: unknown) {
      if (isBrokerageTokenError(preErr)) {
        respondBrokerageTokenError(res, preErr);
        return;
      }
      throw preErr;
    }

    let stopKeepalive: (() => void) | null = null;
    if (stream) {
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();
      writeSse(res, { type: "phase", message: "Starting…" });
      stopKeepalive = startSseKeepalive(res);
    }

    try {
      const group = await resolveAtfxHistoryUids(supabase as unknown as SupabaseClient, uid);
      const report = await assertReportGroupAccess(supabase, id, group.uids);
      if (!report) {
        if (stream) {
          writeSse(res, { type: "error", error: "Report not found" });
          res.end();
        } else {
          res.status(404).json({ error: "Report not found" });
        }
        return;
      }

      const { data: priorRows, error: priorErr } = await supabase
        .from("atfx_research_report_messages")
        .select("id, role, content, tool_events, created_at")
        .eq("report_id", id)
        .order("created_at", { ascending: true });
      if (priorErr) throw priorErr;
      const priorMessages = (Array.isArray(priorRows) ? priorRows : []) as DbMessage[];

      const userContent = storedUserMessageContent(displayMessage, message);
      if (researchChatInFlight.has(id)) {
        rejectResearchChat(
          res,
          stream,
          409,
          "A generation is already in progress for this report. Wait for it to finish before sending again."
        );
        return;
      }
      if (isDuplicateUserMessage(priorMessages, userContent)) {
        rejectResearchChat(res, stream, 409, "This message was just submitted.");
        return;
      }

      researchChatInFlight.add(id);
      try {
      await supabase.from("atfx_research_report_messages").insert({
        report_id: id,
        role: "user",
        content: userContent,
      });

      let rawStream = "";

      const pipelineSink = stream
        ? {
            stageStart: (stage: string, msg: string) => {
              writeSse(res, { type: "stage_start", stage, message: msg });
              writeSse(res, { type: "phase", message: msg });
            },
            stageComplete: (stage: string, displayText: string) => {
              writeSse(res, { type: "stage_complete", stage, display_text: displayText });
            },
            stageDelta: (stage: string, delta: string) => {
              writeSse(res, { type: "stage_delta", stage, delta });
            },
            toolStart: (name: string, detail?: string) =>
              writeSse(res, { type: "tool_start", name, ...(detail ? { detail } : {}) }),
            toolResult: (name: string, summary: string, detail?: string) =>
              writeSse(res, { type: "tool_result", name, summary, ...(detail ? { detail } : {}) }),
            delta: (delta: string) => {
              rawStream += delta;
              writeSse(res, { type: "delta", delta });
              const partialHtml = extractStreamingReportHtml(rawStream);
              if (partialHtml) {
                writeSse(res, { type: "report_preview", html: partialHtml, language: "en" });
              }
            },
            reportPreview: (language: string, html: string) => {
              writeSse(res, { type: "report_preview", html, language });
            },
          }
        : undefined;

      const {
        result: { agentResult, title, reportHtml, reportHtmlI18n, assistantRow, pipelineRows, seoExcerpt, thumbnailUrl },
        accumulator,
      } = await runWithBrokerageUsageTracking(() =>
        runWithBrokerageUsageContext({ source: "research_report", firebaseUid: uid, referenceId: id }, async () => {
          const canvasHtml = resolveReportCanvasHtml(report);
          const pipelineResult = await runResearchPipeline(message, canvasHtml, outputOptions, pipelineSink);
          const persisted = await persistChatResult(supabase, id, report, pipelineResult);
          return { agentResult: pipelineResult, ...persisted };
        })
      );

      await finalizeBrokerageUsage(BROKERAGE_ATFX, accumulator, { firebaseUid: uid, defaultSource: "research_report" });

      if (stream) {
        writeSse(res, {
          type: "done",
          reply: agentResult.reply,
          title,
          report_html: reportHtml,
          report_i18n: reportHtmlI18n,
          seo_excerpt: seoExcerpt || undefined,
          thumbnail_url: thumbnailUrl || undefined,
          tool_events: agentResult.tool_events,
          pipeline_messages: pipelineRows,
          message: assistantRow,
        });
        res.end();
      } else {
        res.json({
          reply: agentResult.reply,
          title,
          report_html: reportHtml,
          report_i18n: reportHtmlI18n,
          seo_excerpt: seoExcerpt || undefined,
          thumbnail_url: thumbnailUrl || undefined,
          tool_events: agentResult.tool_events,
          message: assistantRow,
        });
      }
      } finally {
        researchChatInFlight.delete(id);
      }
    } catch (err: unknown) {
      if (respondBrokerageTokenError(res, err)) {
        if (stream && !res.writableEnded) res.end();
        return;
      }
      console.error("[atfx/research-report] chat error:", err);
      const msg = (err as Error)?.message ?? "Chat failed";
      if (stream) {
        writeSse(res, { type: "error", error: msg });
        res.end();
      } else {
        res.status(500).json({ error: msg });
      }
    } finally {
      stopKeepalive?.();
    }
  };

  apiRouter.post("/atfx/research-report/:id/fresh-topics/sync", async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (!supabase) return res.status(503).json({ error: "Database not configured." });
    const uid = uidFromReq(req);
    const { id } = req.params;
    const userRequest =
      typeof req.body?.user_request === "string" ? req.body.user_request.trim() : null;
    const rawTopics = Array.isArray(req.body?.topics) ? req.body.topics : [];
    const topics = rawTopics
      .map(normalizeStoredTopic)
      .filter((item: StoredTopic | null): item is StoredTopic => item != null);

    try {
      const group = await resolveAtfxHistoryUids(supabase as unknown as SupabaseClient, uid);
      const report = await assertReportGroupAccess(supabase, id, group.uids);
      if (!report) return res.status(404).json({ error: "Report not found" });

      const result = await syncFreshTopicsSession(supabase, id, userRequest, topics);
      res.json(result);
    } catch (err: unknown) {
      console.error("[atfx/research-report] fresh-topics sync error:", err);
      res.status(500).json({ error: (err as Error)?.message ?? "Failed to save fresh topics" });
    }
  });

  apiRouter.post("/atfx/research-report/:id/chat", (req, res) => {
    void handleChat(req, res, false);
  });

  apiRouter.post("/atfx/research-report/:id/chat/stream", (req, res) => {
    void handleChat(req, res, true);
  });

  apiRouter.post("/atfx/research-report/:id/translate", async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (!supabase) return res.status(503).json({ error: "Database not configured." });
    if (!config.requesty.apiKey) {
      return res.status(503).json({ error: "Translation is not available (LLM not configured)." });
    }

    const uid = uidFromReq(req);
    const { id } = req.params;
    const localeRaw = typeof req.body?.locale === "string" ? req.body.locale : "";
    const locale = parseReportTranslateLocale(localeRaw);
    const force = req.body?.force === true;

    if (!locale) {
      return res.status(400).json({ error: 'locale must be "tc", "sc", "th", or "vi"' });
    }

    try {
      const group = await resolveAtfxHistoryUids(supabase as unknown as SupabaseClient, uid);
      const result = await executeReportTranslation(supabase, id, group.uids, uid, locale, undefined, { force });
      res.json({
        locale: result.locale,
        bundle: result.bundle,
        report_i18n: result.report_i18n,
        cached: result.cached,
        tokenBalance: result.tokenBalance,
      });
    } catch (err: unknown) {
      if (respondBrokerageTokenError(res, err)) return;
      console.error("[atfx/research-report] translate error:", err);
      const msg = (err as Error)?.message ?? "Translation failed";
      const status =
        msg.includes("not configured") || msg.includes("not available") || msg.includes("column is missing")
          ? 503
          : msg.includes("not found")
            ? 404
            : msg.includes("required before translation")
              ? 400
              : 500;
      res.status(status).json({ error: msg });
    }
  });

  apiRouter.post("/atfx/research-report/:id/translate/stream", async (req, res) => {
    if (!supabase) {
      res.status(503);
      writeSse(res, { type: "error", error: "Database not configured." });
      res.end();
      return;
    }
    if (!config.requesty.apiKey) {
      res.status(503);
      writeSse(res, { type: "error", error: "Translation is not available (LLM not configured)." });
      res.end();
      return;
    }

    const uid = uidFromReq(req);
    const { id } = req.params;
    const localeRaw = typeof req.body?.locale === "string" ? req.body.locale : "";
    const locale = parseReportTranslateLocale(localeRaw);
    const force = req.body?.force === true;

    if (!locale) {
      res.status(400);
      writeSse(res, { type: "error", error: 'locale must be "tc", "sc", "th", or "vi"' });
      res.end();
      return;
    }

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const stopKeepalive = startSseKeepalive(res);

    try {
      const group = await resolveAtfxHistoryUids(supabase as unknown as SupabaseClient, uid);
      const result = await executeReportTranslation(supabase, id, group.uids, uid, locale, {
        onProgress: (message) => writeSse(res, { type: "progress", message }),
        onPartialHtml: (html) => writeSse(res, { type: "partial", html, locale }),
      }, { force });

      writeSse(res, {
        type: "done",
        locale: result.locale,
        bundle: result.bundle,
        report_i18n: result.report_i18n,
        cached: result.cached,
        tokenBalance: result.tokenBalance,
      });
      res.end();
    } catch (err: unknown) {
      if (isBrokerageTokenError(err)) {
        writeSse(res, { type: "error", ...brokerageTokenErrorResponse(err) });
        res.end();
        return;
      }
      console.error("[atfx/research-report] translate stream error:", err);
      writeSse(res, { type: "error", error: (err as Error)?.message ?? "Translation failed" });
      res.end();
    } finally {
      stopKeepalive();
    }
  });

  apiRouter.post("/atfx/research-report/:id/publish", async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (!supabase) return res.status(503).json({ error: "Database not configured." });

    const wpConfig = config.atfxWordPress;
    if (!isWordPressConfigured(wpConfig)) {
      return res.status(503).json({
        error:
          "WordPress is not configured. Set ATFX_WORDPRESS_SITE_URL, ATFX_WORDPRESS_USERNAME, and ATFX_WORDPRESS_APP_PASSWORD.",
      });
    }

    const uid = uidFromReq(req);
    const { id } = req.params;
    const localeRaw = typeof req.body?.locale === "string" ? req.body.locale : "";
    const locale = parseReportLanguage(localeRaw);
    const category =
      typeof req.body?.category === "string" ? req.body.category.trim() : String(req.body?.category ?? "").trim();

    if (!locale) {
      return res.status(400).json({ error: 'locale must be "en", "tc", "sc", "th", or "vi"' });
    }
    if (!category) {
      return res.status(400).json({ error: "category is required" });
    }

    try {
      const group = await resolveAtfxHistoryUids(supabase as unknown as SupabaseClient, uid);
      const report = await assertReportGroupAccess(supabase, id, group.uids);
      if (!report) return res.status(404).json({ error: "Report not found" });

      const i18n = parseReportI18n(report.report_html_i18n);
      if (report.report_html?.trim() && !i18n.en) {
        i18n.en = {
          title: typeof report.title === "string" ? report.title : DEFAULT_REPORT_TITLE,
          report_html: report.report_html,
        };
      }

      const bundle = i18n[locale];
      const reportHtml = bundle?.report_html?.trim() ?? "";
      const title =
        bundle?.title?.trim() ||
        (typeof report.title === "string" ? report.title.trim() : "") ||
        DEFAULT_REPORT_TITLE;

      if (!reportHtml) {
        return res.status(400).json({
          error: `No article content for locale "${locale}". Generate or translate that language first.`,
        });
      }

      const seoExcerpt =
        bundle?.seo_excerpt?.trim() ||
        (typeof report.seo_excerpt === "string" ? report.seo_excerpt.trim() : "");
      const thumbnailUrl = typeof report.thumbnail_url === "string" ? report.thumbnail_url.trim() : "";

      const result = await publishResearchReportToWordPress(wpConfig, {
        locale,
        category,
        title,
        reportHtml,
        seoExcerpt: seoExcerpt || undefined,
        thumbnailUrl: thumbnailUrl || undefined,
      });

      res.json({
        ok: true,
        post_id: result.postId,
        post_url: result.postUrl,
        edit_url: result.editUrl,
        featured_media_id: result.featuredMediaId,
      });
    } catch (err: unknown) {
      console.error("[atfx/research-report] publish error:", err);
      const wpErr = err as { status?: number; message?: string; detail?: string; hint?: string };
      const status =
        wpErr.status === 503 ? 503 : wpErr.status === 404 ? 404 : wpErr.status === 401 || wpErr.status === 403 ? 502 : 500;
      res.status(status).json({
        error: wpErr.message ?? "Publish failed",
        ...(wpErr.detail ? { detail: wpErr.detail } : {}),
        ...(wpErr.hint ? { hint: wpErr.hint } : {}),
      });
    }
  });
}

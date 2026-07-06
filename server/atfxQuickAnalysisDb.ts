import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AtfxQuickAnalysisResult } from "./atfxQuickAnalysis.js";
import { parseQuickAnalysisLookback } from "./atfxQuickAnalysisLookback.js";

const ARTICLE_IMAGES_BUCKET = "article-images";
const LIST_LIMIT = 50;

const QA_SUMMARY_COLUMNS =
  "id, firebase_uid, symbol, display_name, change_pct, last_close, chart_image_url, chart_caption, chart_interval, lookback, created_at";

export type AtfxQuickAnalysisSummaryRow = {
  id: string;
  firebase_uid: string;
  symbol: string;
  display_name: string;
  change_pct: number | null;
  last_close: number | null;
  chart_image_url: string | null;
  chart_caption: string | null;
  chart_interval: string | null;
  lookback: string | null;
  created_at: string;
};

export type AtfxQuickAnalysisRow = {
  id: string;
  firebase_uid: string;
  symbol: string;
  display_name: string;
  report: string;
  change_pct: number | null;
  last_close: number | null;
  chart_image_url: string | null;
  chart_caption: string | null;
  chart_interval: string | null;
  lookback: string | null;
  report_tc: string | null;
  report_sc: string | null;
  report_th: string | null;
  report_vi: string | null;
  created_at: string;
};

function isMissingTableError(err: unknown): boolean {
  const msg = String((err as { message?: string; code?: string })?.message ?? err ?? "").toLowerCase();
  const code = String((err as { code?: string })?.code ?? "");
  return code === "42P01" || (msg.includes("does not exist") && msg.includes("atfx_quick_analyses"));
}

function isMissingColumnError(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message ?? err ?? "").toLowerCase();
  const code = String((err as { code?: string })?.code ?? "");
  if (code === "PGRST204") return true;
  return msg.includes("column") && (msg.includes("does not exist") || msg.includes("could not find"));
}

async function uploadChartIfDataUrl(
  supabase: SupabaseClient,
  uid: string,
  rowId: string,
  chartImageUrl: string | undefined
): Promise<string | null | undefined> {
  if (!chartImageUrl) return undefined;
  if (!chartImageUrl.startsWith("data:image/")) return chartImageUrl;

  const match = chartImageUrl.match(/^data:image\/(\w+);base64,(.+)$/s);
  if (!match) return undefined;

  const imageType = match[1].toLowerCase();
  const ext = imageType === "jpeg" ? "jpg" : imageType;
  const buffer = Buffer.from(match[2], "base64");
  const objectPath = `atfx-quick-analysis/${uid}/${rowId}.${ext}`;

  const { data, error } = await supabase.storage.from(ARTICLE_IMAGES_BUCKET).upload(objectPath, buffer, {
    contentType: `image/${imageType}`,
    upsert: true,
  });

  if (error) {
    console.warn("[atfx/quick-analysis] chart upload failed:", error.message);
    return null;
  }

  const { data: urlData } = supabase.storage.from(ARTICLE_IMAGES_BUCKET).getPublicUrl(data.path);
  return urlData.publicUrl;
}

/** Persist one Quick Analysis run for a user. Returns row id or null if save skipped/failed. */
export async function saveAtfxQuickAnalysis(
  supabase: SupabaseClient,
  uid: string,
  result: AtfxQuickAnalysisResult
): Promise<{ id: string; chartImageUrl?: string } | null> {
  if (!result.report?.trim()) return null;

  const rowId = randomUUID();
  const symbol = result.symbol.trim().toUpperCase();
  const createdAt = Number.isFinite(result.timestamp) ? new Date(result.timestamp).toISOString() : new Date().toISOString();

  const chartUrl = await uploadChartIfDataUrl(supabase, uid, rowId, result.chartImageUrl);
  const lookback = parseQuickAnalysisLookback(result.lookback);

  const baseRow = {
    id: rowId,
    firebase_uid: uid,
    symbol,
    display_name: result.displayName.trim() || symbol,
    report: result.report,
    change_pct: result.changePct ?? null,
    last_close: result.lastClose ?? null,
    chart_image_url: chartUrl ?? null,
    chart_caption: result.chartCaption ?? null,
    chart_interval: result.chartInterval ?? null,
    lookback,
    report_tc: result.reportTc?.trim() || null,
    report_sc: result.reportSc?.trim() || null,
    report_th: result.reportTh?.trim() || null,
    report_vi: result.reportVi?.trim() || null,
    created_at: createdAt,
  };

  let { error } = await supabase.from("atfx_quick_analyses").insert(baseRow);
  if (error && isMissingColumnError(error)) {
    const { report_th: _th, report_vi: _vi, ...withoutThVi } = baseRow;
    ({ error } = await supabase.from("atfx_quick_analyses").insert(withoutThVi));
  }
  if (error && isMissingColumnError(error)) {
    const { report_tc: _tc, report_sc: _sc, report_th: _th, report_vi: _vi, ...withoutTranslations } = baseRow;
    ({ error } = await supabase.from("atfx_quick_analyses").insert(withoutTranslations));
  }
  if (error && isMissingColumnError(error)) {
    const { lookback: _lb, report_tc: _tc, report_sc: _sc, report_th: _th, report_vi: _vi, ...minimalRow } = baseRow;
    ({ error } = await supabase.from("atfx_quick_analyses").insert(minimalRow));
    if (!error) {
      console.warn(
        "[atfx/quick-analysis] optional columns missing — run supabase migration SQL in Supabase SQL Editor."
      );
    }
  }

  if (error) {
    if (isMissingTableError(error)) {
      console.warn(
        "[atfx/quick-analysis] atfx_quick_analyses table missing — run supabase/atfx_quick_analyses.sql in Supabase SQL Editor."
      );
    } else {
      console.error("[atfx/quick-analysis] save failed:", error.message);
    }
    return null;
  }

  return {
    id: rowId,
    chartImageUrl: chartUrl ?? undefined,
  };
}

export async function listAtfxQuickAnalyses(
  supabase: SupabaseClient,
  uids: string[],
  limit = LIST_LIMIT
): Promise<AtfxQuickAnalysisRow[]> {
  const uniqueUids = [...new Set(uids.filter(Boolean))];
  if (uniqueUids.length === 0) return [];

  const { data, error } = await supabase
    .from("atfx_quick_analyses")
    .select("*")
    .in("firebase_uid", uniqueUids)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }

  return (data ?? []) as AtfxQuickAnalysisRow[];
}

export async function listAtfxQuickAnalysisSummaries(
  supabase: SupabaseClient,
  uids: string[],
  limit = LIST_LIMIT
): Promise<AtfxQuickAnalysisSummaryRow[]> {
  const uniqueUids = [...new Set(uids.filter(Boolean))];
  if (uniqueUids.length === 0) return [];

  const { data, error } = await supabase
    .from("atfx_quick_analyses")
    .select(QA_SUMMARY_COLUMNS)
    .in("firebase_uid", uniqueUids)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }

  return (data ?? []) as AtfxQuickAnalysisSummaryRow[];
}

export async function getAtfxQuickAnalysisById(
  supabase: SupabaseClient,
  uids: string[],
  id: string
): Promise<AtfxQuickAnalysisRow | null> {
  const uniqueUids = [...new Set(uids.filter(Boolean))];
  const trimmedId = id.trim();
  if (uniqueUids.length === 0 || !trimmedId) return null;

  const { data, error } = await supabase
    .from("atfx_quick_analyses")
    .select("*")
    .eq("id", trimmedId)
    .in("firebase_uid", uniqueUids)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }

  return (data as AtfxQuickAnalysisRow | null) ?? null;
}

export function rowToQuickAnalysisSummary(
  row: AtfxQuickAnalysisSummaryRow,
  ownerEmail?: string | null
): AtfxQuickAnalysisResult & { id: string } {
  const ts = Date.parse(row.created_at);
  return {
    id: row.id,
    success: true,
    symbol: row.symbol,
    displayName: row.display_name,
    report: "",
    timestamp: Number.isFinite(ts) ? ts : Date.now(),
    changePct: row.change_pct ?? undefined,
    lastClose: row.last_close ?? undefined,
    chartImageUrl: row.chart_image_url ?? undefined,
    chartCaption: row.chart_caption ?? undefined,
    chartInterval: row.chart_interval ?? undefined,
    lookback: parseQuickAnalysisLookback(row.lookback),
    owner_uid: row.firebase_uid,
    owner_email: ownerEmail ?? null,
  };
}

export function rowToQuickAnalysisResult(row: AtfxQuickAnalysisRow): AtfxQuickAnalysisResult & { id: string } {
  const ts = Date.parse(row.created_at);
  return {
    id: row.id,
    success: true,
    symbol: row.symbol,
    displayName: row.display_name,
    report: row.report,
    timestamp: Number.isFinite(ts) ? ts : Date.now(),
    changePct: row.change_pct ?? undefined,
    lastClose: row.last_close ?? undefined,
    chartImageUrl: row.chart_image_url ?? undefined,
    chartCaption: row.chart_caption ?? undefined,
    chartInterval: row.chart_interval ?? undefined,
    lookback: parseQuickAnalysisLookback(row.lookback),
    reportTc: row.report_tc ?? undefined,
    reportSc: row.report_sc ?? undefined,
    reportTh: row.report_th ?? undefined,
    reportVi: row.report_vi ?? undefined,
  };
}

export type QuickAnalysisTranslationUpdate = {
  reportTc?: string;
  reportSc?: string;
  reportTh?: string;
  reportVi?: string;
};

export async function updateAtfxQuickAnalysisTranslations(
  supabase: SupabaseClient,
  allowedUids: string[],
  rowId: string,
  translations: QuickAnalysisTranslationUpdate
): Promise<boolean> {
  const uniqueUids = [...new Set(allowedUids.filter(Boolean))];
  if (uniqueUids.length === 0) return false;
  const patch: Record<string, string | null> = {};
  if (typeof translations.reportTc === "string" && translations.reportTc.trim()) {
    patch.report_tc = translations.reportTc.trim();
  }
  if (typeof translations.reportSc === "string" && translations.reportSc.trim()) {
    patch.report_sc = translations.reportSc.trim();
  }
  if (typeof translations.reportTh === "string" && translations.reportTh.trim()) {
    patch.report_th = translations.reportTh.trim();
  }
  if (typeof translations.reportVi === "string" && translations.reportVi.trim()) {
    patch.report_vi = translations.reportVi.trim();
  }
  if (Object.keys(patch).length === 0) return false;

  const { error } = await supabase
    .from("atfx_quick_analyses")
    .update(patch)
    .eq("id", rowId)
    .in("firebase_uid", uniqueUids);

  if (error) {
    if (isMissingColumnError(error)) {
      console.warn("[atfx/quick-analysis] translation columns missing — run alter_atfx_quick_analyses_translations.sql");
      return false;
    }
    console.error("[atfx/quick-analysis] translation update failed:", error.message);
    return false;
  }

  return true;
}

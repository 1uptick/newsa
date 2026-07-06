/**
 * ATFX Markets — Quick Analysis (indices).
 * Ported from 1uptick quickAnalysisCallable: FMP OHLC snapshot + Perplexity drivers → markdown report.
 */

import { createHash } from "crypto";
import { cache, CACHE_KEYS } from "./cache.js";
import { captureLlmUsage, getBrokerageUsageContext, parseOpenAiChatUsage } from "./brokerageTokenBilling.js";
import { config } from "./config.js";
import { generateChartImage } from "./atfxMarketData.js";
import { formatAtfxPriceChartFileName } from "./atfxChartNaming.js";
import { fmpQuickAnalysisChartSymbolCandidates } from "./fmpQuickAnalysisChartSymbol.js";
import { stripCitationMarkers } from "./stripLlmCitations.js";
import {
  parseQuickAnalysisLookback,
  type QuickAnalysisLookback,
} from "./atfxQuickAnalysisLookback.js";
import {
  resolveQuickAnalysisTradingWindow,
  type ResolvedQuickAnalysisWindow,
} from "./atfxQuickAnalysisTradingWindow.js";

const FMP_BASE = "https://financialmodelingprep.com/stable";
const CACHE_TTL_SECONDS = 24 * 60 * 60;
const LARGE_MOVE_THRESHOLD_PCT = 3;
const QUICK_ANALYSIS_MAX_KEY_DRIVERS = 3;
const FETCH_TIMEOUT_MS = 90_000;

export type QuickAnalysisProgressStep =
  | "price"
  | "snapshot"
  | "chart"
  | "drivers"
  | "report";

export type QuickAnalysisProgressSink = {
  phase?: (message: string, step?: QuickAnalysisProgressStep) => void;
  stepComplete?: (step: QuickAnalysisProgressStep) => void;
  chart?: (payload: {
    chartImageUrl: string;
    chartCaption?: string;
    chartInterval?: string;
  }) => void;
  partialReport?: (report: string) => void;
  meta?: (payload: {
    changePct?: number;
    lastClose?: number;
    resolvedWindowLabel?: string;
    dataAsOfLabel?: string;
  }) => void;
};

export interface AtfxQuickAnalysisResult {
  success: boolean;
  symbol: string;
  displayName: string;
  report: string;
  timestamp: number;
  /** Supabase row id when persisted */
  id?: string;
  lookback?: QuickAnalysisLookback;
  changePct?: number;
  lastClose?: number;
  /** Trading-aware window label, e.g. "Last trading session · Fri, Jun 12, 2026" */
  resolvedWindowLabel?: string;
  dataAsOfLabel?: string;
  /** Branded Chart-IMG PNG (ATFX banner + orange/navy candles), same as research reports. */
  chartImageUrl?: string;
  chartCaption?: string;
  chartInterval?: string;
  error?: string;
  reportTc?: string;
  reportSc?: string;
  reportTh?: string;
  reportVi?: string;
  owner_uid?: string;
  owner_email?: string | null;
}

interface OhlcBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface MarketSnapshot {
  symbol: string;
  displayName: string;
  lookback: QuickAnalysisLookback;
  priorClose: number;
  lastClose: number;
  changePct: number;
  changePctStr: string;
  dailyEodTail: Array<{ date: string; open: number; high: number; low: number; close: number }>;
  dataWindowEndMs?: number;
  dataWindowStartMs?: number;
  marketStatus?: "open" | "closed";
  resolvedWindow: ResolvedQuickAnalysisWindow;
  snapshotHash: string;
}

interface DriverResult {
  keyDrivers: string[];
  marketContext: string;
  forwardLook: string;
}

const inFlight = new Map<string, Promise<AtfxQuickAnalysisResult>>();

function getFmpKey(): string | null {
  return config.fmp.apiKey?.trim() || null;
}

function numOHLC(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

function fmpCandleDateToUtcMs(date: string): number {
  const t = Date.parse(String(date).replace(" ", "T"));
  return Number.isFinite(t) ? t : 0;
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  const abs = Math.abs(value);
  const decimals = abs >= 100 ? 2 : abs >= 1 ? 2 : 4;
  return value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function extractJsonPayload(raw: string): string {
  const trimmed = String(raw ?? "").trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) return fencedMatch[1].trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) return trimmed.slice(firstBrace, lastBrace + 1);
  return trimmed;
}

async function fetchWithTimeout(url: string, init: RequestInit, label: string): Promise<Response> {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw new Error(`${label} timed out`);
    throw e;
  } finally {
    clearTimeout(tid);
  }
}

async function fetch1hCandles(symbol: string, apiKey: string): Promise<OhlcBar[]> {
  const url = `${FMP_BASE}/historical-chart/1hour?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}&limit=168`;
  try {
    const res = await fetchWithTimeout(url, {}, "FMP 1h chart");
    if (!res.ok) return [];
    const json = await res.json();
    if (json?.["Error Message"]) return [];
    const raw = Array.isArray(json) ? json : json?.historical ?? [];
    return raw
      .map((c: Record<string, unknown>) => ({
        time: c.date ? Math.floor(fmpCandleDateToUtcMs(String(c.date)) / 1000) : 0,
        open: parseFloat(String(c.open)) || 0,
        high: parseFloat(String(c.high)) || 0,
        low: parseFloat(String(c.low)) || 0,
        close: parseFloat(String(c.close)) || 0,
      }))
      .filter((c: OhlcBar) => c.time > 0 && c.close > 0)
      .sort((a: OhlcBar, b: OhlcBar) => a.time - b.time);
  } catch {
    return [];
  }
}

async function fetchDailyCandles(symbol: string, apiKey: string): Promise<OhlcBar[]> {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 120);
  const from = start.toISOString().slice(0, 10);
  const to = end.toISOString().slice(0, 10);
  const url = `${FMP_BASE}/historical-price-eod/full?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}&apikey=${apiKey}`;
  try {
    const res = await fetchWithTimeout(url, {}, "FMP daily EOD");
    if (!res.ok) return [];
    const json = await res.json();
    if (json?.["Error Message"]) return [];
    const raw = Array.isArray(json) ? json : json?.historical ?? [];
    return raw
      .map((c: Record<string, unknown>) => ({
        time: c.date ? Math.floor(fmpCandleDateToUtcMs(String(c.date)) / 1000) : 0,
        open: parseFloat(String(c.open)) || 0,
        high: parseFloat(String(c.high)) || 0,
        low: parseFloat(String(c.low)) || 0,
        close: parseFloat(String(c.close)) || 0,
      }))
      .filter((c: OhlcBar) => c.time > 0 && c.close > 0)
      .sort((a: OhlcBar, b: OhlcBar) => a.time - b.time);
  } catch {
    return [];
  }
}

async function fetchChartData(normalizedSymbol: string, apiKey: string): Promise<{ candles1h: OhlcBar[]; candles1d: OhlcBar[] }> {
  const candidates = fmpQuickAnalysisChartSymbolCandidates(normalizedSymbol, "indices");
  for (const sym of candidates) {
    const [candles1h, candles1d] = await Promise.all([fetch1hCandles(sym, apiKey), fetchDailyCandles(sym, apiKey)]);
    if (candles1h.length > 0 || candles1d.length > 0) {
      return { candles1h, candles1d };
    }
  }
  return { candles1h: [], candles1d: [] };
}

function computeDailyChangeFromEod(candles1d: OhlcBar[]): {
  priorClose: number;
  lastClose: number;
  sessionOpen: number;
  changePct: number;
} | null {
  if (candles1d.length < 2) return null;
  const prev = candles1d[candles1d.length - 2];
  const last = candles1d[candles1d.length - 1];
  const priorClose = numOHLC(prev?.close);
  const lastClose = numOHLC(last?.close);
  const sessionOpen = numOHLC(last?.open);
  if (!(priorClose > 0) || !(lastClose > 0)) return null;
  return {
    priorClose,
    lastClose,
    sessionOpen: Number.isFinite(sessionOpen) && sessionOpen > 0 ? sessionOpen : lastClose,
    changePct: ((lastClose - priorClose) / priorClose) * 100,
  };
}

function computeDailySessionHeadline(
  candles1h: OhlcBar[],
  candles1d: OhlcBar[]
): { priorClose: number; lastClose: number; changePct: number; dataWindowEndMs?: number } | null {
  const fromEod = computeDailyChangeFromEod(candles1d);
  if (fromEod) {
    const last = candles1d[candles1d.length - 1];
    return {
      priorClose: fromEod.priorClose,
      lastClose: fromEod.lastClose,
      changePct: fromEod.changePct,
      dataWindowEndMs: last?.time ? last.time * 1000 : undefined,
    };
  }

  if (candles1h.length >= 2) {
    const recent = candles1h.slice(-24);
    const first = recent[0];
    const latest = recent[recent.length - 1];
    const priorClose = numOHLC(first.open) || numOHLC(first.close);
    const lastClose = numOHLC(latest.close);
    if (priorClose > 0 && lastClose > 0) {
      return {
        priorClose,
        lastClose,
        changePct: ((lastClose - priorClose) / priorClose) * 100,
        dataWindowEndMs: latest.time ? latest.time * 1000 : undefined,
      };
    }
  }

  if (candles1d.length >= 2) {
    const prev = candles1d[candles1d.length - 2];
    const last = candles1d[candles1d.length - 1];
    const priorClose = numOHLC(prev.close);
    const lastClose = numOHLC(last.close);
    if (priorClose > 0 && lastClose > 0) {
      return {
        priorClose,
        lastClose,
        changePct: ((lastClose - priorClose) / priorClose) * 100,
        dataWindowEndMs: last.time ? last.time * 1000 : undefined,
      };
    }
  }

  return null;
}

function buildMarketSnapshot(
  normalizedSymbol: string,
  displayName: string,
  candles1h: OhlcBar[],
  candles1d: OhlcBar[],
  lookback: QuickAnalysisLookback
): MarketSnapshot | null {
  const headline = computeDailySessionHeadline(candles1h, candles1d);
  if (!headline) return null;

  const resolvedWindow = resolveQuickAnalysisTradingWindow(
    normalizedSymbol,
    lookback,
    candles1h,
    candles1d
  );

  const changePctStr =
    headline.changePct >= 0 ? `+${headline.changePct.toFixed(2)}%` : `${headline.changePct.toFixed(2)}%`;

  const barCount = resolvedWindow.dailyOhlcBarsForPrompt;
  const dailyTailSource =
    candles1d.length >= barCount
      ? candles1d.slice(-barCount)
      : candles1d.length > 0
        ? candles1d.slice(-Math.min(barCount, candles1d.length))
        : candles1h.slice(-Math.min(2, candles1h.length));

  const dailyEodTail = dailyTailSource
    .map((bar) => ({
      date: bar.time ? new Date(bar.time * 1000).toISOString().slice(0, 10) : "",
      open: numOHLC(bar.open),
      high: numOHLC(bar.high),
      low: numOHLC(bar.low),
      close: numOHLC(bar.close),
    }))
    .filter((b) => b.date && Number.isFinite(b.close));

  const hashPayload = {
    symbol: normalizedSymbol,
    displayName,
    lookback,
    priorClose: headline.priorClose,
    lastClose: headline.lastClose,
    changePct: Number(headline.changePct.toFixed(4)),
    windowStartMs: resolvedWindow.windowStartMs,
    windowEndMs: resolvedWindow.windowEndMs,
  };

  return {
    symbol: normalizedSymbol,
    displayName,
    lookback,
    priorClose: headline.priorClose,
    lastClose: headline.lastClose,
    changePct: headline.changePct,
    changePctStr,
    dailyEodTail,
    dataWindowEndMs: resolvedWindow.asOfMs,
    dataWindowStartMs: resolvedWindow.windowStartMs,
    marketStatus: resolvedWindow.marketStatus,
    resolvedWindow,
    snapshotHash: createHash("sha256").update(JSON.stringify(hashPayload)).digest("hex").slice(0, 16),
  };
}

function buildQuickSnapshotBlock(snapshot: MarketSnapshot): string {
  const direction = snapshot.changePct >= 0 ? "▲" : "▼";
  const changeAbs = snapshot.lastClose - snapshot.priorClose;
  const changeAbsStr = `${changeAbs >= 0 ? "+" : ""}${formatPrice(changeAbs)}`;
  return [
    "**Quick Snapshot**",
    `- Last close: **${formatPrice(snapshot.lastClose)}** ${direction} ${snapshot.changePctStr} (${changeAbsStr} vs prior close ${formatPrice(snapshot.priorClose)})`,
  ].join("\n");
}

function buildSafeMinimalReport(snapshot: MarketSnapshot): string {
  const moveQualifier = Math.abs(snapshot.changePct) >= LARGE_MOVE_THRESHOLD_PCT ? "a sharp move" : "a move";
  return [
    buildQuickSnapshotBlock(snapshot),
    "**Market drivers**\nNo sufficiently fresh, instrument-specific catalyst is available right now.",
    `**What to watch next**\nWatch whether ${moveQualifier} extends in the next session.`,
  ].join("\n\n");
}

function renderReport(snapshot: MarketSnapshot, drivers: DriverResult): string {
  const driverBullets = drivers.keyDrivers.map((d) => `- ${stripCitationMarkers(d.trim())}`).join("\n");
  const report = [
    buildQuickSnapshotBlock(snapshot),
    `**Market drivers**\n${driverBullets}`,
    drivers.marketContext ? `**Market context**\n${stripCitationMarkers(drivers.marketContext.trim())}` : null,
    `**What to watch next**\n${stripCitationMarkers(
      (drivers.forwardLook || "Investors will watch whether the move persists into the next session.").trim()
    )}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return stripCitationMarkers(report);
}

function extractMessageText(json: { choices?: Array<{ message?: { content?: unknown } }> }): string {
  const c = json?.choices?.[0]?.message?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return c
      .map((part: unknown) =>
        part && typeof part === "object" && "text" in part && typeof (part as { text?: unknown }).text === "string"
          ? (part as { text: string }).text
          : ""
      )
      .join("");
  }
  return "";
}

async function callPerplexityDrivers(snapshot: MarketSnapshot): Promise<DriverResult | null> {
  const win = snapshot.resolvedWindow;
  const searchTerm = snapshot.displayName || snapshot.symbol;
  const asOfDateStr = formatLongDateForPrompt(win.asOfMs);
  const dailyOhlcBlock = snapshot.dailyEodTail.length
    ? snapshot.dailyEodTail.map((b) => `${b.date}: O ${b.open} H ${b.high} L ${b.low} C ${b.close}`).join("\n")
    : "(daily EOD candles unavailable)";

  const closedNote = win.closedMarketNote
    ? `\nImportant: ${win.closedMarketNote}`
    : "";

  const marketStateLine =
    win.marketStatus === "closed"
      ? `Market status: closed (data as of ${win.dataAsOfLabel}).`
      : `Market status: open or recently active (data as of ${win.dataAsOfLabel}).`;

  const userPrompt = `Analyze the market instrument ${searchTerm}. Include broader market drivers, sector rotation, and macro factors where relevant.

Context: Price data as of ${asOfDateStr}. ${marketStateLine}
Focus on news and events from ${win.newsWindowLabel} only — verify drivers against developments in ${win.driverVerificationWindow}, not older history unless still directly relevant.${closedNote}

Reference price (daily session): last close ${snapshot.lastClose} (${snapshot.changePctStr} vs prior close ${snapshot.priorClose}).

Recent daily OHLC (for context):
${dailyOhlcBlock}

Provide:
1. Exactly ${QUICK_ANALYSIS_MAX_KEY_DRIVERS} key market drivers for ${searchTerm} — point form, grounded in real events from ${win.driverVerificationWindow}
2. A 1-sentence market context summary covering ${win.newsWindowLabel}
3. A 1-sentence forward look for the next session or catalyst

Format your response as JSON:
{
  "keyDrivers": ["driver1", "driver2", "driver3"],
  "marketContext": "one sentence",
  "forwardLook": "one sentence"
}`;

  const systemPrompt =
    "You are a financial market analyst. Provide a concise quick market overview in valid JSON format only. No explanations outside the JSON.";

  const requestyKey = config.requesty.apiKey?.trim();
  const perplexityKey = config.perplexity.apiKey?.trim();

  const attempts: Array<{ url: string; key: string; model: string }> = [];
  if (requestyKey) {
    attempts.push({
      url: config.requesty.chatCompletionsUrl,
      key: requestyKey,
      model: config.requesty.atfxResearchNewsModel || "perplexity/sonar-pro",
    });
  }
  if (perplexityKey) {
    attempts.push({
      url: config.perplexity.chatCompletionsUrl,
      key: perplexityKey,
      model: "sonar",
    });
  }

  for (const { url, key, model } of attempts) {
    try {
      const body: Record<string, unknown> = {
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0,
        search_recency_filter: win.searchRecencyFilter,
      };

      const res = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
            ...(url.includes("requesty") ? { "HTTP-Referer": config.appBaseUrl, "X-Title": "Newsa ATFX Quick Analysis" } : {}),
          },
          body: JSON.stringify(body),
        },
        "Quick analysis research"
      );

      const raw = await res.text();
      if (!res.ok) continue;

      const json = JSON.parse(raw) as { choices?: Array<{ message?: { content?: unknown } }> };
      const usageMeta = getBrokerageUsageContext();
      if (usageMeta) {
        const endpoint = url.includes("requesty") ? "requesty" : "perplexity";
        const usage = parseOpenAiChatUsage(json, endpoint, model);
        if (usage) {
          captureLlmUsage(usage, {
            ...usageMeta,
            perplexityRequestCount: endpoint === "perplexity" ? 1 : undefined,
          });
        }
      }

      const content = extractMessageText(json);
      const parsed = JSON.parse(extractJsonPayload(content)) as {
        keyDrivers?: string[];
        marketContext?: string;
        forwardLook?: string;
      };

      const drivers = Array.isArray(parsed.keyDrivers)
        ? parsed.keyDrivers.map((d) => String(d ?? "").trim()).filter((d) => d.length > 8)
        : [];
      if (drivers.length === 0) continue;

      return {
        keyDrivers: drivers.slice(0, QUICK_ANALYSIS_MAX_KEY_DRIVERS),
        marketContext: String(parsed.marketContext ?? "").trim(),
        forwardLook: String(parsed.forwardLook ?? "").trim(),
      };
    } catch {
      /* try next provider */
    }
  }

  return null;
}

function formatLongDateForPrompt(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function cacheKey(symbol: string, lookback: QuickAnalysisLookback): string {
  return `${CACHE_KEYS.ATFX_QUICK_ANALYSIS(symbol)}:${lookback}`;
}

type CachedEntry = AtfxQuickAnalysisResult & { snapshotHash?: string };

function readCache(symbol: string, lookback: QuickAnalysisLookback, snapshotHash?: string): AtfxQuickAnalysisResult | null {
  const hit = cache.get<CachedEntry>(cacheKey(symbol, lookback));
  if (!hit?.data?.report?.trim()) return null;
  if (snapshotHash && hit.data.snapshotHash && hit.data.snapshotHash !== snapshotHash) return null;
  return hit.data;
}

async function generateQuickAnalysis(
  symbol: string,
  displayName: string,
  lookback: QuickAnalysisLookback,
  forceRefresh = false,
  sink?: QuickAnalysisProgressSink
): Promise<AtfxQuickAnalysisResult> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const label = displayName.trim() || normalizedSymbol;
  const fmpKey = getFmpKey();
  if (!fmpKey) {
    return {
      success: false,
      symbol: normalizedSymbol,
      displayName: label,
      report: "",
      timestamp: Date.now(),
      error: "FMP API key not configured",
    };
  }

  sink?.phase?.("Loading price data…", "price");
  const { candles1h, candles1d } = await fetchChartData(normalizedSymbol, fmpKey);
  sink?.stepComplete?.("price");

  sink?.phase?.("Building session snapshot…", "snapshot");
  const snapshot = buildMarketSnapshot(normalizedSymbol, label, candles1h, candles1d, lookback);
  if (!snapshot) {
    return {
      success: false,
      symbol: normalizedSymbol,
      displayName: label,
      report: "",
      timestamp: Date.now(),
      error: "Could not load price data for this index",
    };
  }

  sink?.meta?.({
    changePct: snapshot.changePct,
    lastClose: snapshot.lastClose,
    resolvedWindowLabel: snapshot.resolvedWindow.resolvedWindowLabel,
    dataAsOfLabel: snapshot.resolvedWindow.dataAsOfLabel,
  });
  sink?.partialReport?.(buildQuickSnapshotBlock(snapshot));
  sink?.stepComplete?.("snapshot");

  if (!forceRefresh) {
    const cached = readCache(normalizedSymbol, lookback, snapshot.snapshotHash);
    if (cached) {
      sink?.phase?.("Using cached analysis…", "report");
      if (!cached.chartImageUrl && config.chartImg.apiKey) {
        const chartInterval = candles1h.length > 0 ? "1h" : "1D";
        sink?.phase?.("Fetching chart…", "chart");
        const chartImageUrl = await generateChartImage(normalizedSymbol, chartInterval);
        if (chartImageUrl) {
          const caption = formatAtfxPriceChartFileName(normalizedSymbol, chartInterval);
          sink?.chart?.({ chartImageUrl, chartCaption: caption, chartInterval });
          sink?.stepComplete?.("chart");
          const enriched: CachedEntry = {
            ...cached,
            chartImageUrl,
            chartCaption: caption,
            chartInterval,
          };
          cache.set(cacheKey(normalizedSymbol, lookback), enriched, CACHE_TTL_SECONDS);
          sink?.partialReport?.(enriched.report);
          sink?.stepComplete?.("report");
          return enriched;
        }
      }
      if (cached.chartImageUrl) {
        sink?.chart?.({
          chartImageUrl: cached.chartImageUrl,
          chartCaption: cached.chartCaption,
          chartInterval: cached.chartInterval,
        });
        sink?.stepComplete?.("chart");
      }
      sink?.partialReport?.(cached.report);
      sink?.stepComplete?.("report");
      return cached;
    }
  }

  const chartInterval = candles1h.length > 0 ? "1h" : "1D";

  const chartPromise = (async () => {
    sink?.phase?.("Rendering ATFX chart…", "chart");
    const chartImageUrl = await generateChartImage(normalizedSymbol, chartInterval);
    if (chartImageUrl) {
      const caption = formatAtfxPriceChartFileName(normalizedSymbol, chartInterval);
      sink?.chart?.({ chartImageUrl, chartCaption: caption, chartInterval });
    }
    sink?.stepComplete?.("chart");
    return chartImageUrl;
  })();

  const driversPromise = (async () => {
    sink?.phase?.("Researching market drivers…", "drivers");
    const drivers = await callPerplexityDrivers(snapshot);
    sink?.stepComplete?.("drivers");
    return drivers;
  })();

  const [drivers, chartImageUrl] = await Promise.all([driversPromise, chartPromise]);

  sink?.phase?.("Composing report…", "report");
  const report = drivers ? renderReport(snapshot, drivers) : buildSafeMinimalReport(snapshot);
  sink?.partialReport?.(report);
  sink?.stepComplete?.("report");

  const result: CachedEntry = {
    success: true,
    symbol: normalizedSymbol,
    displayName: label,
    lookback,
    report,
    timestamp: Date.now(),
    changePct: snapshot.changePct,
    lastClose: snapshot.lastClose,
    resolvedWindowLabel: snapshot.resolvedWindow.resolvedWindowLabel,
    dataAsOfLabel: snapshot.resolvedWindow.dataAsOfLabel,
    snapshotHash: snapshot.snapshotHash,
    chartImageUrl: chartImageUrl ?? undefined,
    chartCaption: chartImageUrl ? formatAtfxPriceChartFileName(normalizedSymbol, chartInterval) : undefined,
    chartInterval,
  };

  cache.set(cacheKey(normalizedSymbol, lookback), result, CACHE_TTL_SECONDS);
  return result;
}

export async function runAtfxQuickAnalysis(
  symbol: string,
  displayName: string,
  opts?: { forceRefresh?: boolean; lookback?: QuickAnalysisLookback; onProgress?: QuickAnalysisProgressSink }
): Promise<AtfxQuickAnalysisResult> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const lookback = parseQuickAnalysisLookback(opts?.lookback);
  const dedupKey = `${normalizedSymbol}:${lookback}:${opts?.forceRefresh ? "1" : "0"}`;
  const existing = inFlight.get(dedupKey);
  if (existing) return existing;

  const promise = generateQuickAnalysis(
    symbol,
    displayName,
    lookback,
    opts?.forceRefresh,
    opts?.onProgress
  ).finally(() => {
    if (inFlight.get(dedupKey) === promise) inFlight.delete(dedupKey);
  });
  inFlight.set(dedupKey, promise);
  return promise;
}

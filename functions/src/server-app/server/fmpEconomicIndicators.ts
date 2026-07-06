/**
 * FMP /stable/economic-indicators fetch with 90-day pagination.
 */

import { config } from "./config.js";

const FMP_BASE = "https://financialmodelingprep.com/stable";
const MAX_RANGE_DAYS = 89;

export type EconomicDataPoint = { date: string; value: number };

export const ECONOMIC_INDICATOR_LABELS: Record<string, string> = {
  unemploymentRate: "US Unemployment Rate",
  CPI: "US Consumer Price Index",
  inflationRate: "US Inflation Rate",
  GDP: "US GDP",
  initialClaims: "US Initial Jobless Claims",
  totalNonfarmPayroll: "US Nonfarm Payrolls",
  retailSales: "US Retail Sales",
  consumerSentiment: "US Consumer Sentiment",
  federalFunds: "US Federal Funds Rate",
};

const ALLOWED_INDICATORS = new Set(Object.keys(ECONOMIC_INDICATOR_LABELS));

function fmpApiKey(): string {
  const key = config.fmp.apiKey?.trim();
  if (!key) throw new Error("FMP_API_KEY is not configured on the server.");
  return key;
}

async function fmpFetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`FMP HTTP ${res.status}: ${text.slice(0, 300) || "request failed"}`);
  }
  const data = await res.json();
  if (data && typeof data === "object" && "Error Message" in (data as Record<string, unknown>)) {
    throw new Error(String((data as Record<string, unknown>)["Error Message"]));
  }
  return data;
}

function parseIsoDate(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

function isoFromDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addUtcDays(iso: string, days: number): string {
  const d = parseIsoDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return isoFromDate(d);
}

function monthsAgoIso(months: number): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - months);
  return isoFromDate(d);
}

export function normalizeEconomicIndicatorName(raw: unknown): string | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  if (ALLOWED_INDICATORS.has(s)) return s;
  const lower = s.toLowerCase();
  for (const key of ALLOWED_INDICATORS) {
    if (key.toLowerCase() === lower) return key;
  }
  return null;
}

function extractValue(row: Record<string, unknown>, indicatorName: string): number | null {
  const candidates = [row.value, row[indicatorName], row.close, row.rate];
  for (const v of candidates) {
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function parseRows(data: unknown, indicatorName: string): EconomicDataPoint[] {
  const arr = Array.isArray(data) ? data : data && typeof data === "object" ? [data] : [];
  const points: EconomicDataPoint[] = [];
  for (const item of arr as Record<string, unknown>[]) {
    const date = String(item.date ?? item.period ?? "").slice(0, 10);
    const value = extractValue(item, indicatorName);
    if (date && value != null) points.push({ date, value });
  }
  return points;
}

function mergePoints(chunks: EconomicDataPoint[][]): EconomicDataPoint[] {
  const byDate = new Map<string, number>();
  for (const chunk of chunks) {
    for (const p of chunk) byDate.set(p.date, p.value);
  }
  return [...byDate.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function dateRanges(fromDate: string, toDate: string): Array<{ from: string; to: string }> {
  const ranges: Array<{ from: string; to: string }> = [];
  let cursor = fromDate;
  while (cursor <= toDate) {
    const windowEnd = addUtcDays(cursor, MAX_RANGE_DAYS);
    const to = windowEnd < toDate ? windowEnd : toDate;
    ranges.push({ from: cursor, to });
    if (to >= toDate) break;
    cursor = addUtcDays(to, 1);
  }
  return ranges;
}

const seriesCache = new Map<string, { storedAt: number; points: EconomicDataPoint[] }>();
const SERIES_CACHE_TTL_MS = 60 * 60_000;

export async function fetchEconomicIndicatorSeries(
  indicatorName: string,
  fromDate: string,
  toDate: string
): Promise<EconomicDataPoint[]> {
  const cacheKey = `${indicatorName}:${fromDate}:${toDate}`;
  const hit = seriesCache.get(cacheKey);
  if (hit && Date.now() - hit.storedAt < SERIES_CACHE_TTL_MS) return hit.points;

  const key = fmpApiKey();
  const ranges = dateRanges(fromDate, toDate);

  const chunks = await Promise.all(
    ranges.map(async ({ from, to }) => {
      const params = new URLSearchParams({ name: indicatorName, from, to, apikey: key });
      const url = `${FMP_BASE}/economic-indicators?${params.toString()}`;
      const data = await fmpFetchJson(url);
      return parseRows(data, indicatorName);
    })
  );

  const points = mergePoints(chunks);
  seriesCache.set(cacheKey, { storedAt: Date.now(), points });
  return points;
}

export function resolveIndicatorDateRange(args: {
  fromDate?: string;
  toDate?: string;
  months?: unknown;
}): { fromDate: string; toDate: string } {
  const toDate =
    typeof args.toDate === "string" && args.toDate.trim() ? args.toDate.trim() : isoFromDate(new Date());
  const rawMonths = typeof args.months === "number" ? args.months : Number(args.months);
  const months = Math.max(1, Math.min(60, Math.floor(Number.isFinite(rawMonths) ? rawMonths : 12)));
  const fromDate =
    typeof args.fromDate === "string" && args.fromDate.trim()
      ? args.fromDate.trim()
      : monthsAgoIso(months);
  return { fromDate, toDate };
}

export function formatEconomicIndicatorText(
  indicatorName: string,
  points: EconomicDataPoint[],
  fromDate: string,
  toDate: string,
  cacheHit = false
): string {
  const label = ECONOMIC_INDICATOR_LABELS[indicatorName] ?? indicatorName;
  if (!points.length) {
    return `Economic indicator ${label} (${fromDate} to ${toDate}): no data found.`;
  }

  const latest = points[points.length - 1];
  const prior = points.length > 1 ? points[points.length - 2] : null;
  const delta = prior != null ? latest.value - prior.value : null;
  const trend =
    delta == null ? "n/a" : delta > 0 ? "rising" : delta < 0 ? "falling" : "flat";

  const tableRows = points.map((p) => `${p.date}|${p.value}`);
  const recentLines = points.slice(-8).map((p, i) => `${i + 1}. ${p.date} — ${p.value}`);

  return [
    `${label} (${indicatorName}) ${fromDate} to ${toDate}${cacheHit ? " (cached)" : ""}:`,
    `Latest: ${latest.value} (${latest.date})${prior ? ` | Prior: ${prior.value} (${prior.date})` : ""} | Trend: ${trend}`,
    `ECON_SERIES_TABLE (columns: Date | Value):`,
    `date|value`,
    ...tableRows,
    "",
    "Recent readings:",
    recentLines.join("\n"),
  ].join("\n");
}

/** Fetch treasury 10Y yield series for line charts. */
export async function fetchTreasury10YSeries(fromDate: string, toDate: string): Promise<EconomicDataPoint[]> {
  const cacheKey = `treasury10Y:${fromDate}:${toDate}`;
  const hit = seriesCache.get(cacheKey);
  if (hit && Date.now() - hit.storedAt < SERIES_CACHE_TTL_MS) return hit.points;

  const key = fmpApiKey();
  const params = new URLSearchParams({ from: fromDate, to: toDate, apikey: key });
  const url = `${FMP_BASE}/treasury-rates?${params.toString()}`;
  const data = await fmpFetchJson(url);
  const arr = Array.isArray(data) ? data : [];
  const points: EconomicDataPoint[] = [];
  for (const row of arr as Record<string, unknown>[]) {
    const date = String(row.date ?? "").slice(0, 10);
    const value = typeof row.year10 === "number" ? row.year10 : Number(row.year10);
    if (date && Number.isFinite(value)) points.push({ date, value });
  }
  points.sort((a, b) => a.date.localeCompare(b.date));

  seriesCache.set(cacheKey, { storedAt: Date.now(), points });
  return points;
}

export function isTreasuryIndicator(name: string): boolean {
  return name === "treasury10Y" || name === "treasury2Y";
}

export async function fetchMacroSeries(
  indicatorName: string,
  fromDate: string,
  toDate: string
): Promise<EconomicDataPoint[]> {
  if (indicatorName === "treasury10Y") {
    return fetchTreasury10YSeries(fromDate, toDate);
  }
  if (indicatorName === "treasury2Y") {
    const key = fmpApiKey();
    const params = new URLSearchParams({ from: fromDate, to: toDate, apikey: key });
    const url = `${FMP_BASE}/treasury-rates?${params.toString()}`;
    const data = await fmpFetchJson(url);
    const arr = Array.isArray(data) ? data : [];
    return (arr as Record<string, unknown>[])
      .map((row) => {
        const date = String(row.date ?? "").slice(0, 10);
        const value = typeof row.year2 === "number" ? row.year2 : Number(row.year2);
        return date && Number.isFinite(value) ? { date, value } : null;
      })
      .filter((p): p is EconomicDataPoint => p != null)
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  return fetchEconomicIndicatorSeries(indicatorName, fromDate, toDate);
}

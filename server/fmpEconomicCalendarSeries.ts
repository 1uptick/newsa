/**
 * Build time-series from FMP economic-calendar release actuals (non-US macro).
 */

import { config } from "./config.js";
import type { EconomicDataPoint } from "./fmpEconomicIndicators.js";

const FMP_BASE = "https://financialmodelingprep.com/stable";
const MAX_RANGE_DAYS = 89;

const seriesCache = new Map<string, { storedAt: number; points: EconomicDataPoint[] }>();
const SERIES_CACHE_TTL_MS = 60 * 60_000;

function fmpApiKey(): string {
  const key = config.fmp.apiKey?.trim();
  if (!key) throw new Error("FMP_API_KEY is not configured on the server.");
  return key;
}

function parseIsoDate(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`);
}

function isoFromDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addUtcDays(iso: string, days: number): string {
  const d = parseIsoDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return isoFromDate(d);
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

function parseActual(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const cleaned = raw.replace(/[%+,]/g, "").trim();
    const n = Number(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function eventDateIso(raw: unknown): string {
  return String(raw ?? "").slice(0, 10);
}

/**
 * Fetch calendar release actuals as a chartable series.
 * Filters by country + event regex; optionally narrows to one headline release family.
 */
export async function fetchCalendarReleaseSeries(args: {
  country: string;
  eventPattern: RegExp;
  preferEventPrefix?: string;
  fromDate: string;
  toDate: string;
}): Promise<EconomicDataPoint[]> {
  const country = args.country.trim().toUpperCase();
  const cacheKey = `${country}:${args.eventPattern.source}:${args.preferEventPrefix ?? ""}:${args.fromDate}:${args.toDate}`;
  const hit = seriesCache.get(cacheKey);
  if (hit && Date.now() - hit.storedAt < SERIES_CACHE_TTL_MS) return hit.points;

  const key = fmpApiKey();
  const ranges = dateRanges(args.fromDate, args.toDate);

  const chunks = await Promise.all(
    ranges.map(async ({ from, to }) => {
      const params = new URLSearchParams({ from, to, apikey: key });
      const url = `${FMP_BASE}/economic-calendar?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`FMP calendar HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    })
  );

  let events = chunks.flat() as Record<string, unknown>[];
  events = events.filter((e) => String(e.country ?? "").toUpperCase() === country);
  events = events.filter((e) => args.eventPattern.test(String(e.event ?? e.name ?? "")));

  if (args.preferEventPrefix) {
    const prefix = args.preferEventPrefix;
    const preferred = events.filter((e) => String(e.event ?? "").startsWith(prefix));
    if (preferred.length) events = preferred;
  }

  const byDate = new Map<string, EconomicDataPoint>();
  for (const e of events) {
    const date = eventDateIso(e.date);
    const value = parseActual(e.actual);
    if (!date || value == null) continue;
    byDate.set(date, { date, value });
  }

  const points = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  seriesCache.set(cacheKey, { storedAt: Date.now(), points });
  return points;
}

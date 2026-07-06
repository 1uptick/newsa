/**
 * FMP tool handlers for the ATFX Research Report chat agent.
 * Adapted from 1uptick coach fmpTools (plain-text results for OpenAI tool loop).
 */

import { config } from "./config.js";
import { resolveCoachSymbol } from "./coachSymbolResolver.js";
import { resolveFmpSymbol } from "./chartSymbolHelpers.js";
import { aliasCandidatesForCategory } from "./fmpSymbolAliases.js";
import {
  fetchEconomicIndicatorSeries,
  formatEconomicIndicatorText,
  normalizeEconomicIndicatorName,
  resolveIndicatorDateRange,
} from "./fmpEconomicIndicators.js";

const FMP_BASE = "https://financialmodelingprep.com/stable";

interface CacheEntry<T> {
  storedAt: number;
  value: T;
}

class ToolTtlCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();

  constructor(
    private readonly maxEntries: number,
    private readonly ttlMs: number
  ) {}

  get(key: string): T | null {
    const hit = this.entries.get(key);
    if (!hit) return null;
    if (Date.now() - hit.storedAt > this.ttlMs) {
      this.entries.delete(key);
      return null;
    }
    return hit.value;
  }

  set(key: string, value: T): void {
    while (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    this.entries.set(key, { storedAt: Date.now(), value });
  }
}

async function withToolCache<T>(
  cache: ToolTtlCache<T>,
  key: string,
  loader: () => Promise<T>
): Promise<{ value: T; cacheHit: boolean }> {
  const hit = cache.get(key);
  if (hit != null) return { value: hit, cacheHit: true };
  const value = await loader();
  cache.set(key, value);
  return { value, cacheHit: false };
}

const quoteCache = new ToolTtlCache<unknown>(250, 30_000);
const calendarCache = new ToolTtlCache<unknown>(80, 180_000);
const ratesCache = new ToolTtlCache<unknown>(80, 300_000);
const companyProfileCache = new ToolTtlCache<unknown>(250, 24 * 60 * 60_000);
const financialStatementCache = new ToolTtlCache<unknown>(250, 6 * 60 * 60_000);
const ratiosCache = new ToolTtlCache<unknown>(250, 6 * 60 * 60_000);
const technicalIndicatorCache = new ToolTtlCache<unknown>(250, 60_000);
const economicIndicatorCache = new ToolTtlCache<unknown>(80, 60 * 60_000);

function fmpApiKey(): string {
  const key = config.fmp.apiKey?.trim();
  if (!key) throw new Error("FMP_API_KEY is not configured on the server.");
  return key;
}

const FMP_FETCH_TIMEOUT_MS = 20_000;

async function fmpFetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FMP_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`FMP HTTP ${res.status}: ${text.slice(0, 300) || "request failed"}`);
    }
    const data = await res.json();
    if (data && typeof data === "object" && "Error Message" in (data as Record<string, unknown>)) {
      throw new Error(String((data as Record<string, unknown>)["Error Message"]));
    }
    return data;
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new Error(`FMP request timed out after ${FMP_FETCH_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function rows(data: unknown, limit = 20): Record<string, unknown>[] {
  const arr = Array.isArray(data) ? data : data && typeof data === "object" ? [data] : [];
  return (arr as Record<string, unknown>[]).slice(0, limit);
}

export function normalizeFmpSymbol(raw: unknown): string {
  return resolveFmpSymbol(raw);
}

function fmpQuoteSymbolCandidates(raw: unknown): string[] {
  const rawStr = typeof raw === "string" ? raw.trim() : "";
  if (!rawStr) return [];
  const resolved = resolveCoachSymbol(rawStr);
  const base = resolved.fmpSymbol;
  if (!base) return [];
  const aliases = aliasCandidatesForCategory(base, resolved.terminal);
  const out: string[] = [];
  for (const s of [base, ...aliases]) {
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

function isoDateOffset(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatMaybe(value: unknown): string {
  if (value == null || value === "") return "n/a";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "n/a";
  return String(value);
}

function eventDateIso(raw: unknown): string {
  return String(raw ?? "").slice(0, 10);
}

/** Human-readable calendar date for report tables (e.g. "Jun 17" or "Sep 11, 2026"). */
export function formatCalendarDisplayDate(raw: unknown, referenceYear?: number): string {
  const iso = eventDateIso(raw);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return formatMaybe(raw);
  const d = new Date(`${iso}T12:00:00Z`);
  const ref = referenceYear ?? new Date().getUTCFullYear();
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };
  if (d.getUTCFullYear() !== ref) opts.year = "numeric";
  return d.toLocaleDateString("en-US", opts);
}

function impactRank(impact: unknown): number {
  const s = String(impact ?? "").toLowerCase();
  if (s.includes("high")) return 3;
  if (s.includes("medium")) return 2;
  if (s.includes("low")) return 1;
  return 0;
}

function isHighImpactEvent(impact: unknown): boolean {
  return impactRank(impact) >= 3;
}

const CALENDAR_TABLE_LOOKAHEAD_DAYS = 21;
const CALENDAR_TABLE_MAX_ROWS = 8;

function selectCalendarTableEvents(
  events: Record<string, unknown>[],
  fromDate: string
): Record<string, unknown>[] {
  const highImpact = events.filter((e) => isHighImpactEvent(e.impact ?? e.importance));
  const windowEnd = (() => {
    const d = new Date(`${fromDate}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + CALENDAR_TABLE_LOOKAHEAD_DAYS);
    return d.toISOString().slice(0, 10);
  })();

  const sorted = [...highImpact].sort((a, b) => {
    const da = eventDateIso(a.date);
    const db = eventDateIso(b.date);
    if (da !== db) return da.localeCompare(db);
    return impactRank(b.impact ?? b.importance) - impactRank(a.impact ?? a.importance);
  });

  const nearTerm = sorted.filter((e) => {
    const d = eventDateIso(e.date);
    return d >= fromDate && d <= windowEnd;
  });

  const pool = nearTerm.length ? nearTerm : sorted.filter((e) => eventDateIso(e.date) >= fromDate);
  const byDay = new Map<string, Record<string, unknown>[]>();
  for (const e of pool) {
    const day = eventDateIso(e.date);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(e);
  }

  const seen = new Set<string>();
  const picked: Record<string, unknown>[] = [];

  for (const day of [...byDay.keys()].sort()) {
    const dayEvents = byDay.get(day)!.sort(
      (a, b) => impactRank(b.impact ?? b.importance) - impactRank(a.impact ?? a.importance)
    );
    for (const e of dayEvents.slice(0, 2)) {
      const key = `${day}|${String(e.event ?? e.name ?? "").trim().toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      picked.push(e);
      if (picked.length >= CALENDAR_TABLE_MAX_ROWS) break;
    }
    if (picked.length >= CALENDAR_TABLE_MAX_ROWS) break;
  }

  if (picked.length) return picked;

  return [];
}

function formatMoney(value: unknown): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return formatMaybe(value);
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000_000) return `${(n / 1_000_000_000_000).toFixed(2)}T`;
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export async function runGetFmpQuote(args: Record<string, unknown>): Promise<string> {
  const candidates = fmpQuoteSymbolCandidates(args.symbol);
  if (candidates.length === 0) return "Error: symbol is required for get_fmp_quote.";

  try {
    const key = fmpApiKey();
    let first: Record<string, unknown> | undefined;
    let symbol = candidates[0];
    let cacheHit = false;

    for (const candidate of candidates) {
      const url = `${FMP_BASE}/quote?symbol=${encodeURIComponent(candidate)}&apikey=${key}`;
      const result = await withToolCache(quoteCache, candidate, () => fmpFetchJson(url));
      cacheHit = result.cacheHit;
      const row = rows(result.value, 1)[0];
      if (row) {
        first = row;
        symbol = candidate;
        break;
      }
    }

    if (!first) return `No live quote found for ${candidates.join(" / ")}.`;
    return [
      `Quote for ${formatMaybe(first.symbol ?? symbol)}${cacheHit ? " (cached)" : ""}:`,
      `Name: ${formatMaybe(first.name)}`,
      `Price: ${formatMaybe(first.price)}`,
      `Change: ${formatMaybe(first.change)} (${formatMaybe(first.changesPercentage ?? first.changePercentage)}%)`,
      `Open: ${formatMaybe(first.open)} | High: ${formatMaybe(first.dayHigh)} | Low: ${formatMaybe(first.dayLow)} | Previous close: ${formatMaybe(first.previousClose)}`,
      `Volume: ${formatMaybe(first.volume)} | Exchange: ${formatMaybe(first.exchange)}`,
    ].join("\n");
  } catch (e) {
    return `Quote fetch failed: ${(e as Error).message}`;
  }
}

export async function runGetFmpEconomicCalendar(args: Record<string, unknown>): Promise<string> {
  const fromDate =
    typeof args.fromDate === "string" && args.fromDate.trim() ? args.fromDate.trim() : isoDateOffset(-1);
  const toDate = typeof args.toDate === "string" && args.toDate.trim() ? args.toDate.trim() : isoDateOffset(3);
  const country = typeof args.country === "string" ? args.country.trim().toUpperCase() : "";
  const countriesArg = Array.isArray(args.countries)
    ? (args.countries as unknown[])
        .map((c) => String(c).trim().toUpperCase())
        .filter(Boolean)
    : country
      ? [country]
      : [];
  const importance = typeof args.importance === "string" ? args.importance.trim().toLowerCase() : "";

  try {
    const key = fmpApiKey();
    const params = new URLSearchParams({ from: fromDate, to: toDate, apikey: key });
    const cacheKey = `${fromDate}:${toDate}:${countriesArg.join(",")}:${importance}`;
    const url = `${FMP_BASE}/economic-calendar?${params.toString()}`;
    const { value, cacheHit } = await withToolCache(calendarCache, cacheKey, () => fmpFetchJson(url));
    let events = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
    if (countriesArg.length) {
      const allowed = new Set(countriesArg);
      events = events.filter((e) => allowed.has(String(e.country ?? "").toUpperCase()));
    }
    events = events.filter((e) => isHighImpactEvent(e.impact ?? e.importance));
    events.sort((a, b) => eventDateIso(a.date).localeCompare(eventDateIso(b.date)));
    const refYear = Number(fromDate.slice(0, 4));
    const tableEvents = selectCalendarTableEvents(events, fromDate);
    const nearTermEnd = (() => {
      const d = new Date(`${fromDate}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + CALENDAR_TABLE_LOOKAHEAD_DAYS);
      return d.toISOString().slice(0, 10);
    })();
    const displayEvents = events
      .filter((e) => {
        const d = eventDateIso(e.date);
        return d >= fromDate && d <= nearTermEnd;
      })
      .slice(0, 20);
    const tableRows = tableEvents.map((e) => {
      const iso = eventDateIso(e.date);
      const eventName = formatMaybe(e.event ?? e.name);
      const countryCode = formatMaybe(e.country);
      const impact = formatMaybe(e.impact ?? e.importance);
      return `${iso}|${eventName}|${countryCode}|${impact}`;
    });
    const lines = displayEvents.map((e, i) =>
      [
        `${i + 1}. ${formatCalendarDisplayDate(e.date, refYear)} ${formatMaybe(e.event ?? e.name)} (${formatMaybe(e.country)})`,
        `actual ${formatMaybe(e.actual)} | forecast ${formatMaybe(e.estimate ?? e.forecast)} | previous ${formatMaybe(e.previous)} | impact ${formatMaybe(e.impact ?? e.importance)}`,
      ].join(" — ")
    );
    return [
      `Economic calendar ${fromDate} to ${toDate}${cacheHit ? " (cached)" : ""}:`,
      `CALENDAR_TABLE (use for HTML table — columns: Date | Event | Country | Impact):`,
      `date|event|country|impact`,
      ...tableRows,
      "",
      lines.length ? lines.join("\n") : "No matching calendar events found.",
    ].join("\n");
  } catch (e) {
    return `Economic calendar fetch failed: ${(e as Error).message}`;
  }
}

export async function runGetFmpEconomicIndicator(args: Record<string, unknown>): Promise<string> {
  const indicatorName = normalizeEconomicIndicatorName(args.name ?? args.indicator);
  if (!indicatorName) {
    return "Error: name is required for get_fmp_economic_indicator (e.g. unemploymentRate, CPI, GDP, initialClaims, totalNonfarmPayroll).";
  }

  const { fromDate, toDate } = resolveIndicatorDateRange({
    fromDate: typeof args.fromDate === "string" ? args.fromDate : undefined,
    toDate: typeof args.toDate === "string" ? args.toDate : undefined,
    months: args.months,
  });

  try {
    const cacheKey = `${indicatorName}:${fromDate}:${toDate}`;
    const { value, cacheHit } = await withToolCache(economicIndicatorCache, cacheKey, async () =>
      fetchEconomicIndicatorSeries(indicatorName, fromDate, toDate)
    );
    const points = value as Awaited<ReturnType<typeof fetchEconomicIndicatorSeries>>;
    return formatEconomicIndicatorText(indicatorName, points, fromDate, toDate, cacheHit);
  } catch (e) {
    return `Economic indicator fetch failed: ${(e as Error).message}`;
  }
}

export async function runGetFmpTreasuryRates(args: Record<string, unknown>): Promise<string> {
  const fromDate =
    typeof args.fromDate === "string" && args.fromDate.trim() ? args.fromDate.trim() : isoDateOffset(-7);
  const toDate = typeof args.toDate === "string" && args.toDate.trim() ? args.toDate.trim() : isoDateOffset(0);

  try {
    const key = fmpApiKey();
    const params = new URLSearchParams({ from: fromDate, to: toDate, apikey: key });
    const cacheKey = `${fromDate}:${toDate}`;
    const url = `${FMP_BASE}/treasury-rates?${params.toString()}`;
    const { value, cacheHit } = await withToolCache(ratesCache, cacheKey, () => fmpFetchJson(url));
    const rateRows = rows(value, 10);
    const lines = rateRows.map((r, i) =>
      [
        `${i + 1}. ${formatMaybe(r.date)}`,
        `1M ${formatMaybe(r.month1)} | 3M ${formatMaybe(r.month3)} | 2Y ${formatMaybe(r.year2)} | 10Y ${formatMaybe(r.year10)} | 30Y ${formatMaybe(r.year30)}`,
      ].join(" — ")
    );
    return [
      `US treasury rates ${fromDate} to ${toDate}${cacheHit ? " (cached)" : ""}:`,
      lines.length ? lines.join("\n") : "No treasury-rate rows found.",
    ].join("\n");
  } catch (e) {
    return `Treasury rates fetch failed: ${(e as Error).message}`;
  }
}

export async function runGetFmpCompanyProfile(args: Record<string, unknown>): Promise<string> {
  const symbol = normalizeFmpSymbol(args.symbol);
  if (!symbol) return "Error: symbol is required for get_fmp_company_profile.";

  try {
    const key = fmpApiKey();
    const url = `${FMP_BASE}/profile?symbol=${encodeURIComponent(symbol)}&apikey=${key}`;
    const { value, cacheHit } = await withToolCache(companyProfileCache, symbol, () => fmpFetchJson(url));
    const profile = rows(value, 1)[0];
    if (!profile) return `No company profile found for ${symbol}.`;
    return [
      `Company profile for ${formatMaybe(profile.symbol ?? symbol)}${cacheHit ? " (cached)" : ""}:`,
      `Company: ${formatMaybe(profile.companyName ?? profile.name)}`,
      `Exchange: ${formatMaybe(profile.exchangeShortName ?? profile.exchange)} | Currency: ${formatMaybe(profile.currency)} | Country: ${formatMaybe(profile.country)}`,
      `Sector: ${formatMaybe(profile.sector)} | Industry: ${formatMaybe(profile.industry)}`,
      `Market cap: ${formatMoney(profile.marketCap)} | Beta: ${formatMaybe(profile.beta)} | Price: ${formatMaybe(profile.price)}`,
      `CEO: ${formatMaybe(profile.ceo)} | Website: ${formatMaybe(profile.website)}`,
      profile.description ? `Description: ${String(profile.description).slice(0, 1000)}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  } catch (e) {
    return `Company profile fetch failed: ${(e as Error).message}`;
  }
}

function normalizeStatementType(raw: unknown): "income" | "balance" | "cashflow" {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (["balance", "balance_sheet", "balance-sheet", "balancesheet"].includes(s)) return "balance";
  if (["cash", "cash_flow", "cash-flow", "cashflow"].includes(s)) return "cashflow";
  return "income";
}

function statementEndpoint(type: "income" | "balance" | "cashflow"): string {
  if (type === "balance") return "balance-sheet-statement";
  if (type === "cashflow") return "cash-flow-statement";
  return "income-statement";
}

export async function runGetFmpFinancialStatements(args: Record<string, unknown>): Promise<string> {
  const symbol = normalizeFmpSymbol(args.symbol);
  if (!symbol) return "Error: symbol is required for get_fmp_financial_statements.";
  const statementType = normalizeStatementType(args.statementType);
  const period = typeof args.period === "string" && args.period.trim().toLowerCase() === "quarter" ? "quarter" : "annual";
  const limit = Math.max(1, Math.min(8, Math.floor(Number(args.limit ?? 4))));

  try {
    const key = fmpApiKey();
    const endpoint = statementEndpoint(statementType);
    const params = new URLSearchParams({ symbol, period, limit: String(limit), apikey: key });
    const cacheKey = `${symbol}:${statementType}:${period}:${limit}`;
    const url = `${FMP_BASE}/${endpoint}?${params.toString()}`;
    const { value, cacheHit } = await withToolCache(financialStatementCache, cacheKey, () => fmpFetchJson(url));
    const statements = rows(value, limit);
    if (statements.length === 0) return `No ${statementType} statements found for ${symbol}.`;

    const lines = statements.map((r, i) => {
      if (statementType === "balance") {
        return [
          `${i + 1}. ${formatMaybe(r.date)} (${formatMaybe(r.period)})`,
          `assets ${formatMoney(r.totalAssets)} | liabilities ${formatMoney(r.totalLiabilities)} | equity ${formatMoney(r.totalStockholdersEquity)}`,
          `cash ${formatMoney(r.cashAndCashEquivalents)} | debt ${formatMoney(r.totalDebt)} | shares ${formatMaybe(r.commonStockSharesOutstanding)}`,
        ].join(" — ");
      }
      if (statementType === "cashflow") {
        return [
          `${i + 1}. ${formatMaybe(r.date)} (${formatMaybe(r.period)})`,
          `operating CF ${formatMoney(r.netCashProvidedByOperatingActivities)} | capex ${formatMoney(r.capitalExpenditure)} | free CF ${formatMoney(r.freeCashFlow)}`,
          `dividends ${formatMoney(r.dividendsPaid)} | buybacks ${formatMoney(r.commonStockRepurchased)}`,
        ].join(" — ");
      }
      return [
        `${i + 1}. ${formatMaybe(r.date)} (${formatMaybe(r.period)})`,
        `revenue ${formatMoney(r.revenue)} | gross profit ${formatMoney(r.grossProfit)} | operating income ${formatMoney(r.operatingIncome)}`,
        `net income ${formatMoney(r.netIncome)} | EPS ${formatMaybe(r.eps)} | EBITDA ${formatMoney(r.ebitda)}`,
      ].join(" — ");
    });

    return [
      `${statementType} statements for ${symbol} (${period}, ${statements.length} rows)${cacheHit ? " (cached)" : ""}:`,
      lines.join("\n"),
    ].join("\n");
  } catch (e) {
    return `Financial statements fetch failed: ${(e as Error).message}`;
  }
}

function numField(row: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = row[k];
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function fmtRatio(n: number | null): string {
  if (n == null) return "n/a";
  return n.toFixed(2);
}

function rangeLabel(values: number[]): string {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const median = values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];
  return ` | ${values.length}-period range: ${min.toFixed(2)}–${max.toFixed(2)} (median ${median.toFixed(2)})`;
}

export async function runGetFmpRatios(args: Record<string, unknown>): Promise<string> {
  const symbol = normalizeFmpSymbol(args.symbol);
  if (!symbol) return "Error: symbol is required for get_fmp_ratios.";
  const period = typeof args.period === "string" && args.period.trim().toLowerCase() === "quarter" ? "quarter" : "annual";
  const limit = Math.max(1, Math.min(8, Math.floor(Number(args.limit ?? 5))));

  try {
    const key = fmpApiKey();
    const cacheKey = `${symbol}:${period}:${limit}`;
    const params = new URLSearchParams({ symbol, period, limit: String(limit), apikey: key });
    const url = `${FMP_BASE}/ratios?${params.toString()}`;
    const { value, cacheHit } = await withToolCache(ratiosCache, cacheKey, () => fmpFetchJson(url));
    const ratioRows = rows(value, limit);
    if (ratioRows.length === 0) return `No ratio data found for ${symbol}.`;

    const peVals: number[] = [];
    const pbVals: number[] = [];
    const psVals: number[] = [];
    const yldVals: number[] = [];
    for (const r of ratioRows) {
      const pe = numField(r, "priceToEarningsRatio", "peRatio", "priceEarningsRatio");
      const pb = numField(r, "priceToBookRatio", "pbRatio");
      const ps = numField(r, "priceToSalesRatio", "psRatio");
      const yld = numField(r, "dividendYield", "dividendYielPercentage", "dividendYielPercentageTTM");
      if (pe != null && pe > 0 && pe < 500) peVals.push(pe);
      if (pb != null && pb > 0 && pb < 100) pbVals.push(pb);
      if (ps != null && ps > 0 && ps < 100) psVals.push(ps);
      if (yld != null && yld >= 0 && yld < 1) yldVals.push(yld);
    }

    const latest = ratioRows[0];
    const latestPe = numField(latest, "priceToEarningsRatio", "peRatio", "priceEarningsRatio");
    const latestPb = numField(latest, "priceToBookRatio", "pbRatio");
    const latestPs = numField(latest, "priceToSalesRatio", "psRatio");
    const latestYld = numField(latest, "dividendYield", "dividendYielPercentage");

    const lines = [
      `Valuation ratios for ${symbol} (${period}, ${ratioRows.length} period(s)${cacheHit ? ", cached" : ""}):`,
      `Latest period: ${formatMaybe(latest.date ?? latest.calendarYear)}`,
      `  P/E: ${fmtRatio(latestPe)}${rangeLabel(peVals)}`,
      `  P/B: ${fmtRatio(latestPb)}${rangeLabel(pbVals)}`,
      `  P/S: ${fmtRatio(latestPs)}${rangeLabel(psVals)}`,
      latestYld != null
        ? `  Dividend yield: ${(latestYld * (latestYld <= 1 ? 100 : 1)).toFixed(2)}%${rangeLabel(yldVals.map((v) => v * (v <= 1 ? 100 : 1)))}`
        : "",
      "",
      "Note: historical ranges are computed from multi-year annual ratio history.",
    ].filter(Boolean);

    return lines.join("\n");
  } catch (e) {
    return `Valuation ratios fetch failed: ${(e as Error).message}`;
  }
}

function normalizeIndicator(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "sma";
  const allowed = new Set(["sma", "ema", "wma", "dema", "tema", "williams", "rsi", "adx", "standarddeviation"]);
  return allowed.has(s) ? s : "sma";
}

function normalizeTimeframe(raw: unknown, fallback = "1day"): string {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  const allowed = new Set(["1min", "5min", "15min", "30min", "1hour", "4hour", "1day"]);
  return allowed.has(s) ? s : fallback;
}

function defaultTimeframeForObjective(objective?: string | null): string {
  if (!objective) return "1day";
  const o = objective.toLowerCase();
  if (/scalp|intraday|day.?trad/i.test(o)) return "15min";
  if (/swing/i.test(o)) return "4hour";
  return "1day";
}

const INDICATOR_V3_TYPE: Record<string, string> = {
  sma: "sma",
  ema: "ema",
  wma: "wma",
  dema: "dema",
  tema: "tema",
  williams: "williams",
  rsi: "rsi",
  adx: "adx",
  standarddeviation: "standardDeviation",
};

function buildTechnicalIndicatorLines(
  points: Record<string, unknown>[],
  indicator: string,
  period: number
): string[] {
  return points.map((p, i) => {
    const val =
      p[indicator] ??
      p[INDICATOR_V3_TYPE[indicator] ?? indicator] ??
      p.value ??
      p.indicator ??
      p[`${indicator}${period}`] ??
      p[`${indicator}${String(period)}`];
    return [
      `${i + 1}. ${formatMaybe(p.date)}`,
      `${indicator.toUpperCase()}(${period}) ${formatMaybe(val)}`,
      `close ${formatMaybe(p.close)} | high ${formatMaybe(p.high)} | low ${formatMaybe(p.low)}`,
    ].join(" — ");
  });
}

export async function runGetFmpTechnicalIndicator(args: Record<string, unknown>): Promise<string> {
  const symbol = normalizeFmpSymbol(args.symbol);
  if (!symbol) return "Error: symbol is required for get_fmp_technical_indicator.";
  const indicator = normalizeIndicator(args.indicator);
  const objective =
    typeof args.objective === "string" ? args.objective : typeof args.investmentObjective === "string" ? args.investmentObjective : null;
  const objectiveDefault = defaultTimeframeForObjective(objective);
  const timeframe = normalizeTimeframe(args.timeframe, objectiveDefault);
  const period = Math.max(2, Math.min(200, Math.floor(Number(args.period ?? 14))));
  const limit = Math.max(1, Math.min(20, Math.floor(Number(args.limit ?? 5))));
  const cacheKey = `${symbol}:${indicator}:${timeframe}:${period}:${limit}`;

  try {
    const key = fmpApiKey();
    let value: unknown;
    let cacheHit = false;
    let source = "stable";

    try {
      const stableParams = new URLSearchParams({ symbol, periodLength: String(period), timeframe, apikey: key });
      const stableUrl = `${FMP_BASE}/technical-indicators/${encodeURIComponent(indicator)}?${stableParams.toString()}`;
      ({ value, cacheHit } = await withToolCache(technicalIndicatorCache, cacheKey, () => fmpFetchJson(stableUrl)));
    } catch {
      const v3Type = INDICATOR_V3_TYPE[indicator] ?? indicator;
      const v3Params = new URLSearchParams({ type: v3Type, period: String(period), apikey: key });
      const v3Url = `https://financialmodelingprep.com/api/v3/technical_indicator/${encodeURIComponent(timeframe)}/${encodeURIComponent(symbol)}?${v3Params.toString()}`;
      ({ value, cacheHit } = await withToolCache(technicalIndicatorCache, `v3:${cacheKey}`, () => fmpFetchJson(v3Url)));
      source = "v3";
    }

    const points = rows(value, 200).slice(0, limit);
    if (points.length === 0) {
      return `No ${indicator.toUpperCase()}(${period}) data available for ${symbol} on ${timeframe}.`;
    }

    const lines = buildTechnicalIndicatorLines(points, indicator, period);
    return [
      `Technical indicator for ${symbol}: ${indicator.toUpperCase()}(${period}) on ${timeframe}${cacheHit ? " (cached)" : ""}${source === "v3" ? " [v3]" : ""}:`,
      lines.join("\n"),
    ].join("\n");
  } catch (e) {
    return `${indicator.toUpperCase()}(${period}) data could not be fetched for ${symbol} (${(e as Error).message}).`;
  }
}

export const ATFX_RESEARCH_FMP_TOOL_DEFINITIONS = [
  {
    type: "function" as const,
    function: {
      name: "get_fmp_quote",
      description:
        "Fetch a live price quote — current price, session change, high/low, volume, exchange. " +
        "Covers US equities, HK (.HK), Japan (.T), FX, indices, commodities, and crypto.",
      parameters: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Ticker e.g. AAPL, EURUSD, XAUUSD (spot gold), XAGUSD (spot silver), 0700.HK",
          },
        },
        required: ["symbol"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_fmp_economic_calendar",
      description:
        "Fetch economic calendar events for a date range. For multi-month outlooks pass fromDate=today and toDate=end of horizon.",
      parameters: {
        type: "object",
        properties: {
          fromDate: { type: "string", description: "Start date YYYY-MM-DD. Defaults to yesterday." },
          toDate: { type: "string", description: "End date YYYY-MM-DD. Defaults to three days ahead." },
          country: { type: "string", description: "Optional single country filter e.g. US, EU, JP." },
          countries: {
            type: "array",
            items: { type: "string" },
            description: "Optional multi-country filter e.g. [\"EU\",\"US\"] for EURUSD reports.",
          },
          importance: { type: "string", description: "Optional impact filter if present in feed data." },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_fmp_economic_indicator",
      description:
        "Fetch historical US macroeconomic indicator time series (unemployment, CPI, GDP, jobless claims, payrolls, etc.). " +
        "Returns latest value, trend, and ECON_SERIES_TABLE for report context.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description:
              "Indicator name: unemploymentRate, CPI, inflationRate, GDP, initialClaims, totalNonfarmPayroll, retailSales, consumerSentiment, federalFunds",
          },
          fromDate: { type: "string", description: "Start date YYYY-MM-DD. Defaults to ~24 months ago." },
          toDate: { type: "string", description: "End date YYYY-MM-DD. Defaults to today." },
          months: { type: "integer", description: "Lookback months when fromDate omitted. Default 24." },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_fmp_treasury_rates",
      description: "Fetch recent US Treasury curve data for rates and macro context.",
      parameters: {
        type: "object",
        properties: {
          fromDate: { type: "string", description: "Start date YYYY-MM-DD. Defaults to seven days ago." },
          toDate: { type: "string", description: "End date YYYY-MM-DD. Defaults to today." },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_fmp_company_profile",
      description: "Fetch company profile: sector, industry, market cap, beta, CEO, description.",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Equity ticker e.g. AAPL, MSFT, 0700.HK" },
        },
        required: ["symbol"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_fmp_ratios",
      description: "Fetch valuation ratios (P/E, P/B, P/S, dividend yield) with multi-period history.",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Equity ticker" },
          period: { type: "string", description: "annual (default) or quarter" },
          limit: { type: "integer", description: "Historical periods 1-8. Default 5." },
        },
        required: ["symbol"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_fmp_financial_statements",
      description: "Fetch income, balance sheet, or cash flow statements.",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Equity ticker" },
          statementType: { type: "string", description: "income, balance, or cashflow. Default income." },
          period: { type: "string", description: "annual or quarter. Default annual." },
          limit: { type: "integer", description: "Periods to return 1-8. Default 4." },
        },
        required: ["symbol"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_fmp_technical_indicator",
      description:
        "Fetch technical indicator values (SMA, EMA, RSI, ADX, etc.). Match timeframe to objective: intraday→15min, swing→4hour, position→1day.",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Ticker e.g. AAPL, EURUSD, BTCUSD" },
          indicator: { type: "string", description: "sma, ema, rsi, adx, etc. Default sma." },
          timeframe: { type: "string", description: "1min, 5min, 15min, 30min, 1hour, 4hour, or 1day" },
          objective: { type: "string", description: "intraday, swing, or position — used when timeframe omitted" },
          period: { type: "integer", description: "Indicator period 2-200. Default 14." },
          limit: { type: "integer", description: "Rows to return 1-20. Default 5." },
        },
        required: ["symbol"],
      },
    },
  },
] as const;

const FMP_HANDLERS: Record<string, (args: Record<string, unknown>) => Promise<string>> = {
  get_fmp_quote: runGetFmpQuote,
  get_fmp_economic_calendar: runGetFmpEconomicCalendar,
  get_fmp_economic_indicator: runGetFmpEconomicIndicator,
  get_fmp_treasury_rates: runGetFmpTreasuryRates,
  get_fmp_company_profile: runGetFmpCompanyProfile,
  get_fmp_ratios: runGetFmpRatios,
  get_fmp_financial_statements: runGetFmpFinancialStatements,
  get_fmp_technical_indicator: runGetFmpTechnicalIndicator,
};

export async function executeFmpResearchTool(name: string, args: Record<string, unknown>): Promise<string | null> {
  const handler = FMP_HANDLERS[name];
  if (!handler) return null;
  return handler(args);
}

/**
 * Brokerage-level token billing (ATFX + future CFD brokerages).
 * Formula: billed_tokens = max(1, ceil(cost_usd × 10_000 × feature_multiplier))
 * Mirrors 1uptick unifiedTokenBilling.ts at organization scope.
 */

import crypto from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config.js";
import { calculateTokenCost, type LLMProvider } from "./llmPricing.js";

export const BROKERAGE_ATFX = "atfx";

const GROUP_BROKERAGE_IDS: Record<string, string> = {
  atfx: BROKERAGE_ATFX,
};

export function groupNameToBrokerageId(groupName: string | null | undefined): string | null {
  const key = (groupName ?? "").toLowerCase().trim();
  return GROUP_BROKERAGE_IDS[key] ?? null;
}

export type BrokerageTokenFeature = "quick_analysis" | "research_report" | "translation" | "article_generate";

export type BrokerageTokenSource = BrokerageTokenFeature;

export const DEFAULT_BROKERAGE_MULTIPLIERS: Record<BrokerageTokenFeature, number> = {
  quick_analysis: 1.8,
  research_report: 1.8,
  translation: 1.0,
  article_generate: 1.8,
};

export const BROKERAGE_SOURCE_LABELS: Record<BrokerageTokenSource, string> = {
  quick_analysis: "Quick analysis",
  research_report: "Research report",
  translation: "Translation",
  article_generate: "Article generate",
};

export type BrokerageTokenConfig = {
  brokerage_id: string;
  display_name: string;
  monthly_token_limit: number;
  billing_cycle_start_date: string;
  multipliers: Record<BrokerageTokenFeature, number>;
  updated_at?: string;
};

export type BrokerageTokenBalance = {
  brokerage_id: string;
  display_name: string;
  limit: number;
  used: number;
  remaining: number;
  period_id: string;
  period_start: string;
  period_end: string;
  billing_cycle_start_date: string;
};

export type BrokerageTokenUsageLog = {
  id: string;
  brokerage_id: string;
  charge_id: string;
  firebase_uid: string | null;
  source: string;
  provider: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
  billed_tokens: number;
  symbol: string | null;
  reference_id: string | null;
  created_at: string;
};

export type ParsedLlmUsage = {
  provider: LLMProvider;
  model: string;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens?: number;
  totalTokens: number;
};

export type PendingUsageRecord = ParsedLlmUsage & {
  source: BrokerageTokenSource;
  costUsd: number;
  billedTokens: number;
  chargeId: string;
  firebaseUid?: string;
  symbol?: string;
  referenceId?: string;
};

export class InsufficientBrokerageTokensError extends Error {
  readonly code = "INSUFFICIENT_TOKENS";

  constructor(
    message: string,
    readonly balance: BrokerageTokenBalance
  ) {
    super(message);
    this.name = "InsufficientBrokerageTokensError";
  }
}

export class BrokerageUsageAccumulator {
  private records: PendingUsageRecord[] = [];

  add(record: PendingUsageRecord): void {
    this.records.push(record);
  }

  getRecords(): PendingUsageRecord[] {
    return this.records;
  }

  isEmpty(): boolean {
    return this.records.length === 0;
  }

  estimatedBilledTokens(): number {
    return this.records.reduce((sum, r) => sum + r.billedTokens, 0);
  }
}

export const brokerageUsageStorage = new AsyncLocalStorage<BrokerageUsageAccumulator>();

export type BrokerageUsageContext = {
  source: BrokerageTokenSource;
  firebaseUid?: string;
  referenceId?: string;
  symbol?: string;
};

export const brokerageUsageContextStorage = new AsyncLocalStorage<BrokerageUsageContext>();

export function getBrokerageUsageContext(): BrokerageUsageContext | undefined {
  return brokerageUsageContextStorage.getStore();
}

export async function runWithBrokerageUsageContext<T>(
  ctx: BrokerageUsageContext,
  fn: () => Promise<T>
): Promise<T> {
  return brokerageUsageContextStorage.run(ctx, fn);
}

const supabase: SupabaseClient | null =
  config.supabase.url && config.supabase.serviceRoleKey
    ? createClient(config.supabase.url, config.supabase.serviceRoleKey)
    : null;

function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error("Supabase not configured.");
  return supabase;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function yyyymmdd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addOneMonthAnniversary(from: Date, anchorDay: number): Date {
  const y = from.getUTCFullYear();
  const m = from.getUTCMonth() + 1;
  const d = Math.min(anchorDay, daysInMonth(y, m));
  return new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
}

function subtractOneMonthAnniversary(from: Date, anchorDay: number): Date {
  const y = from.getUTCFullYear();
  const m = from.getUTCMonth() - 1;
  const d = Math.min(anchorDay, daysInMonth(y, m));
  return new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
}

/** Monthly billing window anchored to admin-configured cycle start date. */
export function resolveBrokerageBillingPeriod(
  billingCycleStartDate: string,
  now = new Date()
): { periodId: string; periodStart: Date; periodEnd: Date } {
  const anchor = new Date(`${billingCycleStartDate}T00:00:00.000Z`);
  const anchorDay = anchor.getUTCDate();
  let periodStart = new Date(
    Date.UTC(
      anchor.getUTCFullYear(),
      anchor.getUTCMonth(),
      Math.min(anchorDay, daysInMonth(anchor.getUTCFullYear(), anchor.getUTCMonth())),
      0,
      0,
      0,
      0
    )
  );

  while (true) {
    const nextStart = addOneMonthAnniversary(periodStart, anchorDay);
    if (now.getTime() < nextStart.getTime()) {
      const periodEnd = new Date(nextStart.getTime() - 1);
      return { periodId: yyyymmdd(periodStart), periodStart, periodEnd };
    }
    periodStart = nextStart;
  }
}

function normalizeMultipliers(raw: unknown): Record<BrokerageTokenFeature, number> {
  const out = { ...DEFAULT_BROKERAGE_MULTIPLIERS };
  if (!raw || typeof raw !== "object") return out;
  for (const key of Object.keys(DEFAULT_BROKERAGE_MULTIPLIERS) as BrokerageTokenFeature[]) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[key] = v;
  }
  return out;
}

function rowToConfig(row: Record<string, unknown>): BrokerageTokenConfig {
  return {
    brokerage_id: String(row.brokerage_id),
    display_name: String(row.display_name ?? row.brokerage_id),
    monthly_token_limit: Number(row.monthly_token_limit ?? 0),
    billing_cycle_start_date: String(row.billing_cycle_start_date).slice(0, 10),
    multipliers: normalizeMultipliers(row.multipliers),
    updated_at: typeof row.updated_at === "string" ? row.updated_at : undefined,
  };
}

export function computeBilledTokens(
  costUsd: number,
  feature: BrokerageTokenFeature,
  multipliers: Record<BrokerageTokenFeature, number>
): number {
  if (costUsd <= 0) return 0;
  const multiplier = multipliers[feature] ?? 1;
  return Math.max(1, Math.ceil(costUsd * 10_000 * multiplier));
}

/** Minimum USD cost so billed_tokens >= 1 after multipliers (cache hits / missing usage metadata). */
export const FALLBACK_USAGE_COST_USD = 0.0001;

/** Typical Requesty/Vertex image generation charge when token pricing does not apply. */
export const THUMBNAIL_GENERATION_COST_USD = 0.04;

/** Image / thumbnail models bill per generation, not per token. */
export function isBrokerageImageModel(model: string): boolean {
  const m = model.trim().toLowerCase();
  return m.includes("flash-image") || m.startsWith("thumbnail:");
}

/** Direct Perplexity API calls include a per-request fee; Requesty-routed sonar does not. */
export function inferPerplexityRequestCount(model: string, provider: string): number {
  if (provider !== "perplexity") return 0;
  const m = model.trim().toLowerCase();
  if (m.includes("perplexity/")) return 0;
  if (m.includes("sonar")) return 1;
  return 0;
}

export type BrokerageUsageLogChargeInput = {
  provider: string;
  model: string;
  source: string;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd?: number;
};

export function recalculateBrokerageUsageLogCharges(
  row: BrokerageUsageLogChargeInput,
  multipliers: Record<BrokerageTokenFeature, number>
): { cost_usd: number; billed_tokens: number } {
  const source = row.source as BrokerageTokenFeature;
  const feature = multipliers[source] !== undefined ? source : "research_report";

  if (row.model === "usage-fallback" || row.model.startsWith("usage-fallback")) {
    const costUsd = Number(row.cost_usd ?? FALLBACK_USAGE_COST_USD);
    return { cost_usd: costUsd, billed_tokens: computeBilledTokens(costUsd, feature, multipliers) };
  }

  if (isBrokerageImageModel(row.model)) {
    const costUsd = THUMBNAIL_GENERATION_COST_USD;
    return { cost_usd: costUsd, billed_tokens: computeBilledTokens(costUsd, feature, multipliers) };
  }

  const provider = row.provider as LLMProvider;
  const perplexityRequestCount = inferPerplexityRequestCount(row.model, row.provider);
  let costUsd = calculateTokenCost(
    provider,
    row.model,
    row.prompt_tokens,
    row.completion_tokens,
    undefined,
    provider === "perplexity" ? { model: row.model, requestCount: perplexityRequestCount } : undefined
  );
  if (costUsd <= 0) costUsd = FALLBACK_USAGE_COST_USD;

  return {
    cost_usd: costUsd,
    billed_tokens: computeBilledTokens(costUsd, feature, multipliers),
  };
}

export function resolveUsageProvider(model: string, endpoint: "requesty" | "perplexity"): LLMProvider {
  if (endpoint === "perplexity") return "perplexity";
  const m = model.toLowerCase();
  if (m.includes("perplexity/") || m.includes("sonar")) return "perplexity";
  return "requesty";
}

export function parseOpenAiChatUsage(
  json: unknown,
  endpoint: "requesty" | "perplexity",
  model: string
): ParsedLlmUsage | null {
  const usage = (json as { usage?: Record<string, number> })?.usage;
  if (!usage) return null;
  const promptTokens = Number(usage.prompt_tokens ?? 0);
  const completionTokens = Number(usage.completion_tokens ?? 0);
  const reasoningTokens = Number(usage.reasoning_tokens ?? 0);
  const totalTokens = Number(usage.total_tokens ?? promptTokens + completionTokens + reasoningTokens);
  if (totalTokens <= 0 && promptTokens <= 0 && completionTokens <= 0) return null;
  return {
    provider: resolveUsageProvider(model, endpoint),
    model,
    promptTokens,
    completionTokens,
    reasoningTokens: reasoningTokens > 0 ? reasoningTokens : undefined,
    totalTokens: totalTokens > 0 ? totalTokens : promptTokens + completionTokens + reasoningTokens,
  };
}

export function captureLlmUsage(
  usage: ParsedLlmUsage,
  opts: {
    source: BrokerageTokenSource;
    firebaseUid?: string;
    chargeId?: string;
    symbol?: string;
    referenceId?: string;
    perplexityRequestCount?: number;
  }
): void {
  const acc = brokerageUsageStorage.getStore();
  if (!acc) return;

  const costUsd = calculateTokenCost(
    usage.provider,
    usage.model,
    usage.promptTokens,
    usage.completionTokens,
    usage.reasoningTokens,
    usage.provider === "perplexity"
      ? { model: usage.model, requestCount: opts.perplexityRequestCount ?? 0 }
      : undefined
  );
  const effectiveCost = costUsd > 0 ? costUsd : FALLBACK_USAGE_COST_USD;

  const billedTokens = computeBilledTokens(effectiveCost, opts.source, DEFAULT_BROKERAGE_MULTIPLIERS);

  acc.add({
    ...usage,
    source: opts.source,
    costUsd: effectiveCost,
    billedTokens,
    chargeId: opts.chargeId ?? crypto.randomUUID(),
    firebaseUid: opts.firebaseUid,
    symbol: opts.symbol,
    referenceId: opts.referenceId,
  });
}

export function captureBrokerageImageGenerationUsage(opts: {
  source: BrokerageTokenSource;
  model: string;
  firebaseUid?: string;
  symbol?: string;
  referenceId?: string;
  usage?: ParsedLlmUsage;
}): void {
  const acc = brokerageUsageStorage.getStore();
  if (!acc) return;

  const usage = opts.usage;
  acc.add({
    provider: usage?.provider ?? "requesty",
    model: opts.model,
    promptTokens: usage?.promptTokens ?? 0,
    completionTokens: usage?.completionTokens ?? 0,
    totalTokens: usage?.totalTokens ?? 0,
    source: opts.source,
    costUsd: THUMBNAIL_GENERATION_COST_USD,
    billedTokens: computeBilledTokens(THUMBNAIL_GENERATION_COST_USD, opts.source, DEFAULT_BROKERAGE_MULTIPLIERS),
    chargeId: crypto.randomUUID(),
    firebaseUid: opts.firebaseUid,
    symbol: opts.symbol,
    referenceId: opts.referenceId,
  });
}
/** Record a charge when no LLM usage was captured (e.g. cached quick analysis). */
export function captureBrokerageFallbackUsage(opts: {
  source: BrokerageTokenSource;
  firebaseUid?: string;
  symbol?: string;
  referenceId?: string;
  model?: string;
  /** Defaults to minimum text charge; use higher values for image generation, etc. */
  costUsd?: number;
}): void {
  const acc = brokerageUsageStorage.getStore();
  if (!acc) return;

  const costUsd = opts.costUsd ?? FALLBACK_USAGE_COST_USD;
  acc.add({
    provider: "requesty",
    model: opts.model ?? "usage-fallback",
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    source: opts.source,
    costUsd,
    billedTokens: computeBilledTokens(costUsd, opts.source, DEFAULT_BROKERAGE_MULTIPLIERS),
    chargeId: crypto.randomUUID(),
    firebaseUid: opts.firebaseUid,
    symbol: opts.symbol,
    referenceId: opts.referenceId,
  });
}

export async function runWithBrokerageUsageTracking<T>(
  fn: () => Promise<T>
): Promise<{ result: T; accumulator: BrokerageUsageAccumulator }> {
  const accumulator = new BrokerageUsageAccumulator();
  const result = await brokerageUsageStorage.run(accumulator, fn);
  return { result, accumulator };
}

export async function listBrokerageTokenConfigs(): Promise<BrokerageTokenConfig[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("brokerage_token_config").select("*").order("brokerage_id");
  if (error) throw error;
  return (data ?? []).map((row) => rowToConfig(row as Record<string, unknown>));
}

export async function getBrokerageTokenConfig(brokerageId: string): Promise<BrokerageTokenConfig | null> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("brokerage_token_config").select("*").eq("brokerage_id", brokerageId).maybeSingle();
  if (error) throw error;
  return data ? rowToConfig(data as Record<string, unknown>) : null;
}

export async function upsertBrokerageTokenConfig(
  input: Partial<BrokerageTokenConfig> & { brokerage_id: string }
): Promise<BrokerageTokenConfig> {
  const sb = requireSupabase();
  const existing = await getBrokerageTokenConfig(input.brokerage_id);
  const payload = {
    brokerage_id: input.brokerage_id,
    display_name: input.display_name ?? existing?.display_name ?? input.brokerage_id.toUpperCase(),
    monthly_token_limit: input.monthly_token_limit ?? existing?.monthly_token_limit ?? 500_000,
    billing_cycle_start_date: input.billing_cycle_start_date ?? existing?.billing_cycle_start_date ?? yyyymmdd(new Date()),
    multipliers: input.multipliers ?? existing?.multipliers ?? DEFAULT_BROKERAGE_MULTIPLIERS,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await sb.from("brokerage_token_config").upsert(payload).select("*").single();
  if (error) throw error;
  return rowToConfig(data as Record<string, unknown>);
}

export async function getBrokerageTokenBalance(brokerageId: string): Promise<BrokerageTokenBalance> {
  const tokenConfig = await getBrokerageTokenConfig(brokerageId);
  if (!tokenConfig) {
    throw new Error(`Unknown brokerage: ${brokerageId}`);
  }
  const period = resolveBrokerageBillingPeriod(tokenConfig.billing_cycle_start_date);
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("brokerage_token_usage_periods")
    .select("tokens_used")
    .eq("brokerage_id", brokerageId)
    .eq("period_id", period.periodId)
    .maybeSingle();
  if (error) throw error;
  const used = Number(data?.tokens_used ?? 0);
  const limit = tokenConfig.monthly_token_limit;
  return {
    brokerage_id: brokerageId,
    display_name: tokenConfig.display_name,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    period_id: period.periodId,
    period_start: period.periodStart.toISOString(),
    period_end: period.periodEnd.toISOString(),
    billing_cycle_start_date: tokenConfig.billing_cycle_start_date,
  };
}

export async function assertBrokerageTokensAvailable(brokerageId: string, estimatedTokens = 1): Promise<BrokerageTokenBalance> {
  const balance = await getBrokerageTokenBalance(brokerageId);
  if (balance.remaining < Math.max(1, estimatedTokens)) {
    throw new InsufficientBrokerageTokensError(
      `Insufficient ${balance.display_name} tokens for this billing period.`,
      balance
    );
  }
  return balance;
}

export async function finalizeBrokerageUsage(
  brokerageId: string,
  accumulator: BrokerageUsageAccumulator,
  opts?: { firebaseUid?: string; defaultSource?: BrokerageTokenSource }
): Promise<number> {
  if (accumulator.isEmpty()) return 0;
  const tokenConfig = await getBrokerageTokenConfig(brokerageId);
  if (!tokenConfig) throw new Error(`Unknown brokerage: ${brokerageId}`);

  const period = resolveBrokerageBillingPeriod(tokenConfig.billing_cycle_start_date);
  const sb = requireSupabase();
  let totalCharged = 0;

  for (const record of accumulator.getRecords()) {
    const feature = record.source ?? opts?.defaultSource ?? "research_report";
    const billedTokens = computeBilledTokens(record.costUsd, feature, tokenConfig.multipliers);
    if (billedTokens <= 0) continue;

    const { error: logErr } = await sb.from("brokerage_token_usage_logs").insert({
      brokerage_id: brokerageId,
      charge_id: record.chargeId,
      firebase_uid: record.firebaseUid ?? opts?.firebaseUid ?? null,
      source: feature,
      provider: record.provider,
      model: record.model,
      prompt_tokens: record.promptTokens,
      completion_tokens: record.completionTokens + (record.reasoningTokens ?? 0),
      total_tokens: record.totalTokens,
      cost_usd: record.costUsd,
      billed_tokens: billedTokens,
      symbol: record.symbol ?? null,
      reference_id: record.referenceId ?? null,
    });

    if (logErr) {
      if (logErr.code === "23505") continue;
      throw logErr;
    }

    const { data: periodRow } = await sb
      .from("brokerage_token_usage_periods")
      .select("tokens_used, cost_usd")
      .eq("brokerage_id", brokerageId)
      .eq("period_id", period.periodId)
      .maybeSingle();

    if (periodRow) {
      const { error: updErr } = await sb
        .from("brokerage_token_usage_periods")
        .update({
          tokens_used: Number(periodRow.tokens_used ?? 0) + billedTokens,
          cost_usd: Number(periodRow.cost_usd ?? 0) + record.costUsd,
          updated_at: new Date().toISOString(),
        })
        .eq("brokerage_id", brokerageId)
        .eq("period_id", period.periodId);
      if (updErr) throw updErr;
    } else {
      const { error: insErr } = await sb.from("brokerage_token_usage_periods").insert({
        brokerage_id: brokerageId,
        period_id: period.periodId,
        period_start: period.periodStart.toISOString(),
        period_end: period.periodEnd.toISOString(),
        tokens_used: billedTokens,
        cost_usd: record.costUsd,
      });
      if (insErr) throw insErr;
    }

    totalCharged += billedTokens;
  }

  return totalCharged;
}

export type AtfxDashboardBillingPeriodRow = {
  period_id: string;
  period_label: string;
  period_start: string;
  period_end: string;
  research_count: number;
  quick_analysis_count: number;
};

export type AtfxDashboardBillingStats = {
  current_period: AtfxDashboardBillingPeriodRow;
  monthly_history: AtfxDashboardBillingPeriodRow[];
};

const DASHBOARD_BILLING_HISTORY_MONTHS = 12;

function formatBillingPeriodLabel(periodStart: Date): string {
  return periodStart.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

function listRecentBillingPeriods(
  billingCycleStartDate: string,
  count: number,
  now = new Date()
): Array<{ periodId: string; periodStart: Date; periodEnd: Date }> {
  const anchor = new Date(`${billingCycleStartDate}T00:00:00.000Z`);
  const anchorDay = anchor.getUTCDate();
  const periods: Array<{ periodId: string; periodStart: Date; periodEnd: Date }> = [];
  let current = resolveBrokerageBillingPeriod(billingCycleStartDate, now);

  for (let i = 0; i < count; i++) {
    periods.unshift(current);
    const prevStart = subtractOneMonthAnniversary(current.periodStart, anchorDay);
    current = {
      periodId: yyyymmdd(prevStart),
      periodStart: prevStart,
      periodEnd: new Date(current.periodStart.getTime() - 1),
    };
  }

  return periods;
}

function bucketCountsByPeriod(
  timestamps: string[],
  periods: Array<{ periodId: string; periodStart: Date; periodEnd: Date }>
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const period of periods) counts[period.periodId] = 0;
  for (const ts of timestamps) {
    const t = new Date(ts).getTime();
    for (const period of periods) {
      if (t >= period.periodStart.getTime() && t <= period.periodEnd.getTime()) {
        counts[period.periodId]++;
        break;
      }
    }
  }
  return counts;
}

async function fetchCreatedAtTimestamps(table: "atfx_research_reports" | "atfx_quick_analyses", since: Date): Promise<string[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.from(table).select("created_at").gte("created_at", since.toISOString());
  if (error) throw error;
  return (data ?? [])
    .map((row) => (typeof row.created_at === "string" ? row.created_at : null))
    .filter((ts): ts is string => Boolean(ts));
}

function periodRowFromCounts(
  period: { periodId: string; periodStart: Date; periodEnd: Date },
  researchCounts: Record<string, number>,
  quickAnalysisCounts: Record<string, number>
): AtfxDashboardBillingPeriodRow {
  return {
    period_id: period.periodId,
    period_label: formatBillingPeriodLabel(period.periodStart),
    period_start: period.periodStart.toISOString(),
    period_end: period.periodEnd.toISOString(),
    research_count: researchCounts[period.periodId] ?? 0,
    quick_analysis_count: quickAnalysisCounts[period.periodId] ?? 0,
  };
}

export async function getAtfxDashboardBillingStats(brokerageId: string): Promise<AtfxDashboardBillingStats> {
  const tokenConfig = await getBrokerageTokenConfig(brokerageId);
  if (!tokenConfig) {
    throw new Error(`Unknown brokerage: ${brokerageId}`);
  }

  const periods = listRecentBillingPeriods(
    tokenConfig.billing_cycle_start_date,
    DASHBOARD_BILLING_HISTORY_MONTHS
  );
  const oldestStart = periods[0]?.periodStart ?? resolveBrokerageBillingPeriod(tokenConfig.billing_cycle_start_date).periodStart;

  const [researchTimestamps, quickAnalysisTimestamps] = await Promise.all([
    fetchCreatedAtTimestamps("atfx_research_reports", oldestStart),
    fetchCreatedAtTimestamps("atfx_quick_analyses", oldestStart),
  ]);

  const researchCounts = bucketCountsByPeriod(researchTimestamps, periods);
  const quickAnalysisCounts = bucketCountsByPeriod(quickAnalysisTimestamps, periods);
  const monthlyHistory = periods.map((period) => periodRowFromCounts(period, researchCounts, quickAnalysisCounts));
  const currentPeriod = monthlyHistory[monthlyHistory.length - 1] ?? periodRowFromCounts(
    resolveBrokerageBillingPeriod(tokenConfig.billing_cycle_start_date),
    researchCounts,
    quickAnalysisCounts
  );

  return {
    current_period: currentPeriod,
    monthly_history: monthlyHistory,
  };
}

export async function listBrokerageTokenUsageLogs(
  brokerageId: string,
  opts?: { limit?: number; days?: number; source?: BrokerageTokenSource | "all" }
): Promise<BrokerageTokenUsageLog[]> {
  const page = await listBrokerageTokenUsageLogsPage(brokerageId, {
    days: opts?.days,
    source: opts?.source,
    page: 1,
    pageSize: opts?.limit ?? 200,
  });
  return page.logs;
}

export type BrokerageTokenUsageLogsPage = {
  logs: BrokerageTokenUsageLog[];
  total: number;
  page: number;
  pageSize: number;
  totals: {
    billed_tokens: number;
    cost_usd: number;
    total_tokens: number;
  };
};

function mapUsageLogRow(row: Record<string, unknown>): BrokerageTokenUsageLog {
  return {
    id: String(row.id),
    brokerage_id: String(row.brokerage_id),
    charge_id: String(row.charge_id),
    firebase_uid: typeof row.firebase_uid === "string" ? row.firebase_uid : null,
    source: String(row.source),
    provider: String(row.provider),
    model: String(row.model),
    prompt_tokens: Number(row.prompt_tokens ?? 0),
    completion_tokens: Number(row.completion_tokens ?? 0),
    total_tokens: Number(row.total_tokens ?? 0),
    cost_usd: Number(row.cost_usd ?? 0),
    billed_tokens: Number(row.billed_tokens ?? 0),
    symbol: typeof row.symbol === "string" ? row.symbol : null,
    reference_id: typeof row.reference_id === "string" ? row.reference_id : null,
    created_at: String(row.created_at),
  };
}

function applyUsageLogFilters<T extends { eq: (col: string, val: string) => T; gte: (col: string, val: string) => T }>(
  query: T,
  opts?: { days?: number; source?: BrokerageTokenSource | "all" }
): T {
  if (opts?.source && opts.source !== "all") {
    query = query.eq("source", opts.source);
  }
  if (opts?.days && opts.days > 0) {
    const since = new Date(Date.now() - opts.days * 86_400_000).toISOString();
    query = query.gte("created_at", since);
  }
  return query;
}

export async function listBrokerageTokenUsageLogsPage(
  brokerageId: string,
  opts?: { page?: number; pageSize?: number; days?: number; source?: BrokerageTokenSource | "all" }
): Promise<BrokerageTokenUsageLogsPage> {
  const sb = requireSupabase();
  const page = Math.max(1, opts?.page ?? 1);
  const pageSize = Math.min(Math.max(opts?.pageSize ?? 25, 1), 100);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let pageQuery = sb
    .from("brokerage_token_usage_logs")
    .select("*", { count: "exact" })
    .eq("brokerage_id", brokerageId);
  pageQuery = applyUsageLogFilters(pageQuery, opts);
  pageQuery = pageQuery.order("created_at", { ascending: false }).range(from, to);

  const { data, error, count } = await pageQuery;
  if (error) throw error;

  let totalsQuery = sb
    .from("brokerage_token_usage_logs")
    .select("billed_tokens, cost_usd, total_tokens")
    .eq("brokerage_id", brokerageId);
  totalsQuery = applyUsageLogFilters(totalsQuery, opts);
  const { data: totalsRows, error: totalsErr } = await totalsQuery;
  if (totalsErr) throw totalsErr;

  const totals = (totalsRows ?? []).reduce(
    (acc, row) => {
      acc.billed_tokens += Number(row.billed_tokens ?? 0);
      acc.cost_usd += Number(row.cost_usd ?? 0);
      acc.total_tokens += Number(row.total_tokens ?? 0);
      return acc;
    },
    { billed_tokens: 0, cost_usd: 0, total_tokens: 0 }
  );

  return {
    logs: (data ?? []).map((row) => mapUsageLogRow(row as Record<string, unknown>)),
    total: count ?? 0,
    page,
    pageSize,
    totals,
  };
}

export function isBrokerageTokenError(err: unknown): err is InsufficientBrokerageTokensError {
  return err instanceof InsufficientBrokerageTokensError;
}

export function brokerageTokenErrorResponse(err: InsufficientBrokerageTokensError) {
  return {
    error: err.message,
    code: err.code,
    balance: err.balance,
  };
}

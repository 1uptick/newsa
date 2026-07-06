/**
 * One-time backfill for brokerage_token_usage_logs after billing fixes:
 * - Perplexity via Requesty no longer adds the direct-API $6/1K request fee
 * - Vertex/Gemini image models use the flat $0.04 thumbnail rate
 *
 * Dry run (default):
 *   npx tsx scripts/backfill-brokerage-token-usage.ts
 *
 * Apply changes:
 *   npx tsx scripts/backfill-brokerage-token-usage.ts --apply
 *
 * Optional filter:
 *   npx tsx scripts/backfill-brokerage-token-usage.ts --brokerage=atfx --apply
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "../server/config.js";
import {
  getBrokerageTokenConfig,
  listBrokerageTokenConfigs,
  recalculateBrokerageUsageLogCharges,
  resolveBrokerageBillingPeriod,
} from "../server/brokerageTokenBilling.js";

type UsageLogRow = {
  id: string;
  brokerage_id: string;
  provider: string;
  model: string;
  source: string;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
  billed_tokens: number;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

type PendingUpdate = {
  id: string;
  brokerage_id: string;
  oldCost: number;
  oldBilled: number;
  newCost: number;
  newBilled: number;
  model: string;
  created_at: string;
};

const APPLY = process.argv.includes("--apply");
const brokerageArg = process.argv.find((arg) => arg.startsWith("--brokerage="));
const brokerageFilter = brokerageArg?.split("=")[1]?.trim() || null;

function roundCost(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

function costsDiffer(a: number, b: number): boolean {
  return Math.abs(a - b) >= 0.0000005;
}

function tokensDiffer(a: number, b: number): boolean {
  return a !== b;
}

async function loadUsageLogs(brokerageId: string): Promise<UsageLogRow[]> {
  const sb = createClient(config.supabase.url, config.supabase.serviceRoleKey);
  const pageSize = 1000;
  const rows: UsageLogRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await sb
      .from("brokerage_token_usage_logs")
      .select("id,brokerage_id,provider,model,source,prompt_tokens,completion_tokens,cost_usd,billed_tokens,created_at,metadata")
      .eq("brokerage_id", brokerageId)
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    const batch = (data ?? []) as UsageLogRow[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function rebuildPeriodTotals(brokerageId: string, billingCycleStartDate: string): Promise<void> {
  const sb = createClient(config.supabase.url, config.supabase.serviceRoleKey);
  const logs = await loadUsageLogs(brokerageId);

  const buckets = new Map<
    string,
    { tokens_used: number; cost_usd: number; period_start: string; period_end: string }
  >();

  for (const log of logs) {
    const period = resolveBrokerageBillingPeriod(billingCycleStartDate, new Date(log.created_at));
    const existing = buckets.get(period.periodId) ?? {
      tokens_used: 0,
      cost_usd: 0,
      period_start: period.periodStart.toISOString(),
      period_end: period.periodEnd.toISOString(),
    };
    existing.tokens_used += Number(log.billed_tokens ?? 0);
    existing.cost_usd += Number(log.cost_usd ?? 0);
    buckets.set(period.periodId, existing);
  }

  const { error: clearErr } = await sb.from("brokerage_token_usage_periods").delete().eq("brokerage_id", brokerageId);
  if (clearErr) throw clearErr;

  if (buckets.size === 0) return;

  const payload = [...buckets.entries()].map(([periodId, totals]) => ({
    brokerage_id: brokerageId,
    period_id: periodId,
    period_start: totals.period_start,
    period_end: totals.period_end,
    tokens_used: totals.tokens_used,
    cost_usd: roundCost(totals.cost_usd),
    updated_at: new Date().toISOString(),
  }));

  const { error: insertErr } = await sb.from("brokerage_token_usage_periods").insert(payload);
  if (insertErr) throw insertErr;
}

async function backfillBrokerage(brokerageId: string): Promise<{ scanned: number; updated: number }> {
  const tokenConfig = await getBrokerageTokenConfig(brokerageId);
  if (!tokenConfig) {
    console.warn(`Skipping unknown brokerage: ${brokerageId}`);
    return { scanned: 0, updated: 0 };
  }

  const logs = await loadUsageLogs(brokerageId);
  const pending: PendingUpdate[] = [];

  for (const row of logs) {
    const next = recalculateBrokerageUsageLogCharges(
      {
        provider: row.provider,
        model: row.model,
        source: row.source,
        prompt_tokens: Number(row.prompt_tokens ?? 0),
        completion_tokens: Number(row.completion_tokens ?? 0),
        cost_usd: Number(row.cost_usd ?? 0),
      },
      tokenConfig.multipliers
    );

    const newCost = roundCost(next.cost_usd);
    const newBilled = next.billed_tokens;
    const oldCost = roundCost(Number(row.cost_usd ?? 0));
    const oldBilled = Number(row.billed_tokens ?? 0);

    if (!costsDiffer(oldCost, newCost) && !tokensDiffer(oldBilled, newBilled)) continue;

    pending.push({
      id: row.id,
      brokerage_id: row.brokerage_id,
      oldCost,
      oldBilled,
      newCost,
      newBilled,
      model: row.model,
      created_at: row.created_at,
    });
  }

  console.log(`\n[${brokerageId}] scanned ${logs.length} logs, ${pending.length} need updates`);
  for (const item of pending.slice(0, 25)) {
    console.log(
      `  ${item.created_at} ${item.model}: cost ${item.oldCost} -> ${item.newCost}, billed ${item.oldBilled} -> ${item.newBilled}`
    );
  }
  if (pending.length > 25) {
    console.log(`  … and ${pending.length - 25} more`);
  }

  if (!APPLY || pending.length === 0) {
    return { scanned: logs.length, updated: pending.length };
  }

  const sb = createClient(config.supabase.url, config.supabase.serviceRoleKey);
  const backfilledAt = new Date().toISOString();

  for (const item of pending) {
    const sourceRow = logs.find((row) => row.id === item.id);
    const metadata = {
      ...(sourceRow?.metadata ?? {}),
      backfill_v1: {
        at: backfilledAt,
        prev_cost_usd: item.oldCost,
        prev_billed_tokens: item.oldBilled,
      },
    };

    const { error } = await sb
      .from("brokerage_token_usage_logs")
      .update({
        cost_usd: item.newCost,
        billed_tokens: item.newBilled,
        metadata,
      })
      .eq("id", item.id);

    if (error) throw error;
  }

  await rebuildPeriodTotals(brokerageId, tokenConfig.billing_cycle_start_date);
  console.log(`[${brokerageId}] updated ${pending.length} logs and rebuilt period totals`);

  return { scanned: logs.length, updated: pending.length };
}

async function main(): Promise<void> {
  if (!config.supabase.url || !config.supabase.serviceRoleKey) {
    throw new Error("Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  }

  console.log(APPLY ? "APPLY mode — writing to Supabase" : "DRY RUN — pass --apply to write changes");

  const configs = await listBrokerageTokenConfigs();
  const brokerageIds = brokerageFilter
    ? configs.filter((c) => c.brokerage_id === brokerageFilter).map((c) => c.brokerage_id)
    : configs.map((c) => c.brokerage_id);

  if (brokerageFilter && brokerageIds.length === 0) {
    throw new Error(`No brokerage_token_config row found for brokerage=${brokerageFilter}`);
  }

  let totalScanned = 0;
  let totalUpdated = 0;

  for (const brokerageId of brokerageIds) {
    const result = await backfillBrokerage(brokerageId);
    totalScanned += result.scanned;
    totalUpdated += result.updated;
  }

  console.log(`\nDone. Scanned ${totalScanned} logs; ${APPLY ? `updated ${totalUpdated}` : `${totalUpdated} would be updated`}.`);
  if (!APPLY) {
    console.log("Re-run with --apply to persist fixes.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

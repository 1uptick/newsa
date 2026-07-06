import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { config } from "../server/config.js";

async function main() {
  const url = config.supabase.url;
  const key = config.supabase.serviceRoleKey;
  if (!url || !key) {
    console.log("Supabase not configured");
    return;
  }

  const sb = createClient(url, key);
  const sources = ["quick_analysis", "research_report", "translation"] as const;

  for (const source of sources) {
    const { data, error } = await sb
      .from("brokerage_token_usage_logs")
      .select(
        "source, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, billed_tokens, reference_id, created_at"
      )
      .eq("brokerage_id", "atfx")
      .eq("source", source)
      .order("created_at", { ascending: false })
      .limit(800);

    if (error) {
      console.log(`\n=== ${source} ERROR:`, error.message);
      continue;
    }

    const rows = data ?? [];
    console.log(`\n=== ${source} (${rows.length} log rows) ===`);
    if (!rows.length) continue;

    const byRef = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = r.reference_id || `row-${r.created_at}`;
      const group = byRef.get(key) ?? [];
      group.push(r);
      byRef.set(key, group);
    }

    type Session = {
      cost: number;
      billed: number;
      tokens: number;
      calls: number;
      models: string[];
    };

    const sessions: Session[] = [...byRef.values()].map((group) => ({
      cost: group.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0),
      billed: group.reduce((s, r) => s + Number(r.billed_tokens ?? 0), 0),
      tokens: group.reduce((s, r) => s + Number(r.total_tokens ?? 0), 0),
      calls: group.length,
      models: [...new Set(group.map((g) => g.model))],
    }));

    const stats = (vals: number[]) => {
      const filtered = vals.filter((v) => v > 0).sort((a, b) => a - b);
      if (!filtered.length) return { n: 0, avg: 0, med: 0, p90: 0, min: 0, max: 0 };
      const sum = filtered.reduce((a, b) => a + b, 0);
      const med = filtered[Math.floor(filtered.length / 2)];
      const p90 = filtered[Math.floor(filtered.length * 0.9)];
      return {
        n: filtered.length,
        avg: sum / filtered.length,
        med,
        p90,
        min: filtered[0],
        max: filtered[filtered.length - 1],
      };
    };

    const costStats = stats(sessions.map((s) => s.cost));
    const billedStats = stats(sessions.map((s) => s.billed));

    console.log("sessions:", sessions.length);
    console.log(
      "Requesty cost USD — avg:",
      costStats.avg.toFixed(4),
      "median:",
      costStats.med.toFixed(4),
      "p90:",
      costStats.p90.toFixed(4),
      "range:",
      `${costStats.min.toFixed(4)}–${costStats.max.toFixed(4)}`
    );
    console.log(
      "Billed brokerage tokens — avg:",
      Math.round(billedStats.avg),
      "median:",
      Math.round(billedStats.med),
      "p90:",
      Math.round(billedStats.p90)
    );
    console.log("Typical models:", [...new Set(rows.map((r) => r.model))].slice(0, 6).join(", "));
    console.log(
      "Top 2 sessions:",
      sessions
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 2)
        .map((s) => ({
          cost_usd: s.cost.toFixed(4),
          billed_tokens: s.billed,
          llm_calls: s.calls,
          models: s.models,
        }))
    );
  }

  const { data: qaIds } = await sb.from("atfx_quick_analysis").select("id").limit(2000);
  const { data: reportIds } = await sb.from("atfx_research_reports").select("id").limit(2000);
  const qaSet = new Set((qaIds ?? []).map((r) => r.id));
  const reportSet = new Set((reportIds ?? []).map((r) => r.id));

  const { data: translationRows } = await sb
    .from("brokerage_token_usage_logs")
    .select("reference_id, cost_usd, billed_tokens, model, created_at")
    .eq("brokerage_id", "atfx")
    .eq("source", "translation")
    .order("created_at", { ascending: false })
    .limit(800);

  const qaTrans: typeof translationRows = [];
  const researchTrans: typeof translationRows = [];
  const otherTrans: typeof translationRows = [];

  for (const row of translationRows ?? []) {
    const ref = row.reference_id ?? "";
    if (qaSet.has(ref)) qaTrans.push(row);
    else if (reportSet.has(ref)) researchTrans.push(row);
    else otherTrans.push(row);
  }

  function summarizeTranslation(label: string, rows: NonNullable<typeof translationRows>) {
    if (!rows.length) {
      console.log(`\n=== ${label}: no rows ===`);
      return;
    }
    const byRef = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = r.reference_id || `row-${r.created_at}`;
      const group = byRef.get(key) ?? [];
      group.push(r);
      byRef.set(key, group);
    }
    const sessions = [...byRef.values()].map((group) => ({
      cost: group.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0),
      billed: group.reduce((s, r) => s + Number(r.billed_tokens ?? 0), 0),
      calls: group.length,
    }));
    const costs = sessions.map((s) => s.cost).filter((c) => c > 0).sort((a, b) => a - b);
    const billed = sessions.map((s) => s.billed).filter((c) => c > 0).sort((a, b) => a - b);
    const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
    const med = (arr: number[]) => (arr.length ? arr[Math.floor(arr.length / 2)] : 0);
    console.log(`\n=== ${label} (${rows.length} log rows, ${sessions.length} sessions) ===`);
    console.log(
      "Requesty cost USD — avg:",
      avg(costs).toFixed(4),
      "median:",
      med(costs).toFixed(4)
    );
    console.log(
      "Billed tokens per session — avg:",
      Math.round(avg(billed)),
      "median:",
      Math.round(med(billed)),
      "calls/session avg:",
      (rows.length / sessions.length).toFixed(1)
    );
  }

  summarizeTranslation("Quick Analysis translation (per locale run)", qaTrans);
  summarizeTranslation("Research report translation (per locale run)", researchTrans);
  if (otherTrans.length) {
    summarizeTranslation("Translation (unlinked reference)", otherTrans);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

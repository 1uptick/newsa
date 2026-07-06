import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { config } from "../server/config.js";

type EntryType = "quick_analysis" | "trending_news" | "fresh_topic" | "manual" | "unknown";

function classifyFirstUserMessage(content: string): EntryType {
  const c = content.trim();
  if (c.includes("[QUICK_ANALYSIS_RESEARCH]")) return "quick_analysis";
  if (/^Research article from Quick Analysis/i.test(c)) return "quick_analysis";
  if (/Write an article based on this news story/i.test(c)) return "trending_news";
  if (/Write a research article using this approved ATFX topic brief/i.test(c)) return "fresh_topic";
  if (/^Start article\b/i.test(c)) return "fresh_topic";
  if (/approved ATFX topic brief/i.test(c)) return "fresh_topic";
  if (/Generate fresh topics/i.test(c)) return "unknown";
  if (c.length > 0) return "manual";
  return "unknown";
}

function stats(vals: number[]) {
  const a = vals.filter((v) => v > 0).sort((x, y) => x - y);
  if (!a.length) return { n: 0, avg: 0, med: 0, p90: 0, min: 0, max: 0 };
  const sum = a.reduce((s, v) => s + v, 0);
  return {
    n: a.length,
    avg: sum / a.length,
    med: a[Math.floor(a.length / 2)],
    p90: a[Math.floor(a.length * 0.9)],
    min: a[0],
    max: a[a.length - 1],
  };
}

async function main() {
  const sb = createClient(config.supabase.url!, config.supabase.serviceRoleKey!);

  const { data: reports, error: repErr } = await sb
    .from("atfx_research_reports")
    .select("id, title, created_at")
    .order("created_at", { ascending: false })
    .limit(80);

  if (repErr) throw repErr;

  const { data: usageRows, error: useErr } = await sb
    .from("brokerage_token_usage_logs")
    .select("reference_id, source, cost_usd, billed_tokens")
    .eq("brokerage_id", "atfx")
    .in("source", ["research_report", "translation"]);

  if (useErr) throw useErr;

  const usageByReport = new Map<string, { researchUsd: number; researchTokens: number; transUsd: number; transTokens: number }>();
  for (const row of usageRows ?? []) {
    const id = row.reference_id;
    if (!id) continue;
    const cur = usageByReport.get(id) ?? { researchUsd: 0, researchTokens: 0, transUsd: 0, transTokens: 0 };
    if (row.source === "research_report") {
      cur.researchUsd += Number(row.cost_usd ?? 0);
      cur.researchTokens += Number(row.billed_tokens ?? 0);
    } else if (row.source === "translation") {
      cur.transUsd += Number(row.cost_usd ?? 0);
      cur.transTokens += Number(row.billed_tokens ?? 0);
    }
    usageByReport.set(id, cur);
  }

  const buckets = new Map<
    EntryType,
    Array<{ id: string; title: string; researchUsd: number; totalUsd: number; researchTokens: number; totalTokens: number }>
  >();

  const reportIds = (reports ?? []).map((r) => r.id);
  const { data: allUserMsgs } = await sb
    .from("atfx_research_report_messages")
    .select("report_id, content, created_at")
    .eq("role", "user")
    .in("report_id", reportIds)
    .order("created_at", { ascending: true });

  const firstMsgByReport = new Map<string, string>();
  for (const m of allUserMsgs ?? []) {
    if (!firstMsgByReport.has(m.report_id)) {
      firstMsgByReport.set(m.report_id, String(m.content ?? ""));
    }
  }

  for (const report of reports ?? []) {
    const first = firstMsgByReport.get(report.id) ?? "";
    const entry = classifyFirstUserMessage(String(first));
    const usage = usageByReport.get(report.id) ?? { researchUsd: 0, researchTokens: 0, transUsd: 0, transTokens: 0 };
    const researchUsd = usage.researchUsd;
    const totalUsd = usage.researchUsd + usage.transUsd;
    const researchTokens = usage.researchTokens;
    const totalTokens = usage.researchTokens + usage.transTokens;

    const list = buckets.get(entry) ?? [];
    list.push({ id: report.id, title: report.title, researchUsd, totalUsd, researchTokens, totalTokens });
    buckets.set(entry, list);
  }

  const order: EntryType[] = ["fresh_topic", "trending_news", "quick_analysis", "manual", "unknown"];
  const labels: Record<EntryType, string> = {
    fresh_topic: "Fresh topic → Start Article",
    trending_news: "Trending news",
    quick_analysis: "Quick Analysis → research article",
    manual: "Manual input",
    unknown: "Unknown / other",
  };

  console.log("Research article cost by entry type (recent reports with usage logs)\n");

  const summary: Array<{ type: EntryType; medResearch: number; medTotal: number; n: number }> = [];

  for (const type of order) {
    const rows = buckets.get(type) ?? [];
    const withUsage = rows.filter((r) => r.researchUsd > 0 || r.totalUsd > 0);
    const researchCosts = withUsage.map((r) => r.researchUsd);
    const totalCosts = withUsage.map((r) => r.totalUsd);
    const researchTokens = withUsage.map((r) => r.researchTokens);
    const rc = stats(researchCosts);
    const tc = stats(totalCosts);
    const rt = stats(researchTokens);

    summary.push({ type, medResearch: rc.med, medTotal: tc.med, n: withUsage.length });

    console.log(`## ${labels[type]}`);
    console.log(`Reports classified: ${rows.length} | With billing data: ${withUsage.length}`);
    if (!withUsage.length) {
      console.log("(no usage yet)\n");
      continue;
    }
    console.log(
      `Research pipeline only — median $${rc.med.toFixed(4)} (avg $${rc.avg.toFixed(4)}, p90 $${rc.p90.toFixed(4)}), median ${Math.round(rt.med)} billed tokens`
    );
    console.log(
      `Incl. translation — median $${tc.med.toFixed(4)} (avg $${tc.avg.toFixed(4)}, p90 $${tc.p90.toFixed(4)})`
    );
    const sample = [...withUsage].sort((a, b) => b.researchUsd - a.researchUsd)[0];
    if (sample) console.log(`Highest: $${sample.researchUsd.toFixed(4)} — ${sample.title?.slice(0, 70)}`);
    console.log("");
  }

  summary.sort((a, b) => b.medResearch - a.medResearch);
  console.log("Ranking by median research pipeline cost (highest first):");
  for (const s of summary.filter((x) => x.n > 0)) {
    console.log(`  ${labels[s.type]}: $${s.medResearch.toFixed(4)} median (${s.n} reports)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

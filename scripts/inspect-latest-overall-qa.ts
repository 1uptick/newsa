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
  const { data, error } = await sb
    .from("atfx_quick_analyses")
    .select("id,symbol,display_name,created_at,chart_image_url,report")
    .ilike("symbol", "OVERALL:%")
    .order("created_at", { ascending: false })
    .limit(3);

  if (error) {
    console.error("DB error:", error.message);
    process.exit(1);
  }

  if (!data?.length) {
    console.log("No overall reports found");
    return;
  }

  for (const row of data) {
    const report = String(row.report || "");
    const imgs = [...report.matchAll(/<img\b[^>]*>/gi)];
    const dataUrlCount = imgs.filter((m) => /src=["']data:image/i.test(m[0])).length;
    console.log("\n---");
    console.log("id:", row.id);
    console.log("symbol:", row.symbol);
    console.log("display:", row.display_name);
    console.log("created:", row.created_at);
    console.log("report chars:", report.length);
    console.log("img tags:", imgs.length, "| data-url:", dataUrlCount);
    console.log("has Hourly charts section:", /hourly charts/i.test(report));
    console.log("has chart grid:", /atfx-econ-charts-grid/i.test(report));
    console.log(
      "chart_image_url:",
      row.chart_image_url ? `${String(row.chart_image_url).slice(0, 72)}...` : "(none)"
    );
    const srcMatch = imgs[0]?.[0].match(/src=["']([^"']+)/i);
    if (srcMatch) console.log("first img src prefix:", srcMatch[1].slice(0, 72));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

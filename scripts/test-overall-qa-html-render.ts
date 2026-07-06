import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { config } from "../server/config.js";
import { getResearchReportCanvasHtml } from "../src/lib/html.ts";

async function main() {
  const sb = createClient(config.supabase.url, config.supabase.serviceRoleKey);
  const { data } = await sb
    .from("atfx_quick_analyses")
    .select("report")
    .eq("id", "3b41ea21-356d-4600-b268-48a48a276f05")
    .single();

  const html = getResearchReportCanvasHtml(data!.report);
  console.log("imgs out:", (html.match(/<img\b/gi) || []).length);
  console.log("len:", html.length);
  console.log("grid:", /atfx-econ-charts-grid/.test(html));
}

main();

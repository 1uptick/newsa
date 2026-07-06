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

  const title =
    process.argv.slice(2).join(" ").trim() ||
    "AUD/USD Reaction to Hawkish Fed Hold and Australian Economic Hesitation: Near-Term Outlook";

  const sb = createClient(url, key);
  const { data, error } = await sb
    .from("atfx_research_reports")
    .select("id,title,updated_at,report_html,report_html_i18n")
    .eq("title", title)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("Report query error:", error.message);
    process.exit(1);
  }
  if (!data?.length) {
    console.log("NOT_FOUND");
    return;
  }

  const row = data[0] as {
    id: string;
    title: string;
    updated_at: string;
    report_html?: string | null;
    report_html_i18n?: unknown;
  };

  const i18n =
    row.report_html_i18n && typeof row.report_html_i18n === "object"
      ? (row.report_html_i18n as Record<string, unknown>)
      : {};
  const en = (i18n.en && typeof i18n.en === "object" ? i18n.en : {}) as Record<string, unknown>;
  const htmlRaw = typeof row.report_html === "string" ? row.report_html : "";
  const enHtml = typeof en.report_html === "string" ? en.report_html : "";
  const picked = enHtml.trim() ? enHtml : htmlRaw;

  console.log("id:", row.id);
  console.log("title:", row.title);
  console.log("updated_at:", row.updated_at);
  console.log("report_html_len:", htmlRaw.length);
  console.log("en_report_html_len:", enHtml.length);
  console.log("picked_len:", picked.length);
  console.log("picked starts with JSON { :", /^\s*\{/.test(picked));
  console.log("has <article>:", /<article\b/i.test(picked));
  console.log("has <h1>:", /<h1\b/i.test(picked));
  console.log("has <h2>:", /<h2\b/i.test(picked));
  console.log("has <h4>:", /<h4\b/i.test(picked));
  console.log("first_500:", picked.slice(0, 500).replace(/\n/g, "\\n"));

  const msg = await sb
    .from("atfx_research_report_messages")
    .select("id,role,content,created_at")
    .eq("report_id", row.id)
    .order("created_at", { ascending: false })
    .limit(8);

  if (msg.error) {
    console.error("Messages query error:", msg.error.message);
    process.exit(1);
  }
  console.log("\nRecent messages:");
  for (const m of msg.data ?? []) {
    const content = String(m.content ?? "");
    console.log(`- ${m.created_at} ${m.role} len=${content.length}`);
    console.log(`  ${content.slice(0, 240).replace(/\n/g, "\\n")}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


import "dotenv/config";
import Airtable from "airtable";
import { config } from "../server/config.ts";

async function main() {
  const key = config.airtable.apiKey;
  const baseId = config.airtable.baseId;
  const tableId = config.airtable.atfxGeneratedArticleTableId || "tblL840we8dgnW9vZ";
  if (!key || !baseId) {
    console.log("Airtable not configured");
    return;
  }
  const base = new Airtable({ apiKey: key }).base(baseId);
  const records = await base(tableId)
    .select({ maxRecords: 50 })
    .all();

  const sorted = [...records].sort((a, b) => {
    const ta = String((a as { _rawJson?: { createdTime?: string } })._rawJson?.createdTime ?? "");
    const tb = String((b as { _rawJson?: { createdTime?: string } })._rawJson?.createdTime ?? "");
    return tb.localeCompare(ta);
  });

  for (const r of sorted) {
    const title = String(r.get("Title_EN") ?? r.get("Title EN") ?? "");
    const content = String(r.get("Content_EN") ?? r.get("Content EN") ?? "");
    const imgs = [...content.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]);
    if (!/eur|inflation|cpi/i.test(title) && imgs.length === 0) continue;
    const dataUrls = imgs.filter((u) => u.startsWith("data:image"));
    const httpUrls = imgs.filter((u) => u.startsWith("http"));
    console.log("\n---", title.slice(0, 80), "---");
    console.log("id:", r.id, "created:", (r as { _rawJson?: { createdTime?: string } })._rawJson?.createdTime);
    console.log("content chars:", content.length);
    console.log("img tags:", imgs.length, "data-url:", dataUrls.length, "http:", httpUrls.length);
    for (const u of imgs) {
      const kind = u.startsWith("data:image") ? "inline" : "url";
      console.log(`  [${kind}] ${u.slice(0, 80)}... (${u.length} chars)`);
    }
    const figcaps = [...content.matchAll(/<figcaption[^>]*>([^<]+)/gi)].map((m) => m[1]);
    if (figcaps.length) console.log("captions:", figcaps);
  }
}

main().catch(console.error);

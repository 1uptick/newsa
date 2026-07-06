import "dotenv/config";
import { config } from "../server/config.ts";

async function main() {
  const key = config.fmp.apiKey;
  const from = "2024-01-01";
  const to = "2026-06-01";
  const url = `https://financialmodelingprep.com/stable/economic-calendar?from=${from}&to=${to}&apikey=${key}`;
  const d = await fetch(url).then((r) => r.json());
  const arr = Array.isArray(d) ? d : [];
  const names = new Set<string>();
  for (const e of arr) {
    if (String(e.country || "").toUpperCase() !== "AU") continue;
    if (!/cpi|inflation/i.test(String(e.event ?? ""))) continue;
    names.add(String(e.event));
  }
  console.log([...names].sort().join("\n"));
}

main().catch(console.error);

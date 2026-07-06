import "dotenv/config";
import { config } from "../server/config.ts";

async function main() {
  const key = config.fmp.apiKey;
  const from = "2023-01-01";
  const to = "2026-06-01";
  const url = `https://financialmodelingprep.com/stable/economic-calendar?from=${from}&to=${to}&apikey=${key}`;
  const r = await fetch(url);
  const d = await r.json();
  const arr = Array.isArray(d) ? d : [];
  const au = arr.filter(
    (e: Record<string, unknown>) =>
      String(e.country || "").toUpperCase() === "AU" &&
      /cpi|inflation/i.test(String(e.event ?? e.name ?? ""))
  );
  console.log("AU CPI events:", au.length);
  console.log(
    au.slice(-8).map((e: Record<string, unknown>) => ({
      date: e.date,
      event: e.event,
      actual: e.actual,
      previous: e.previous,
    }))
  );
}

main().catch(console.error);

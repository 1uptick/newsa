import "dotenv/config";
import { planContentCharts, formatContentChartBrief } from "../server/contentChartPlanner.ts";
import { executeContentChartPlan } from "../server/atfxMarketData.ts";

const topics = [
  "EURUSD outlook",
  "EURUSD and US inflation",
  "EUR/USD ECB rate decision and eurozone inflation",
  "EURUSD technical analysis",
];

for (const t of topics) {
  const plan = planContentCharts(t);
  console.log(t, "=>", formatContentChartBrief(plan));
}

console.log("\n--- Generate EURUSD + US inflation ---");
const plan = planContentCharts("EURUSD and US inflation outlook");
const charts = await executeContentChartPlan(plan);
console.log(charts.map((c) => ({ kind: c.kind, caption: c.caption, len: c.src.length })));

import "dotenv/config";
import { planContentCharts, formatContentChartBrief } from "../server/contentChartPlanner.ts";
import { executeContentChartPlan } from "../server/atfxMarketData.ts";

const topics = [
  "AUD outlook and RBA policy",
  "Australia inflation trends and RBA response",
  "US unemployment and labor market",
];

for (const t of topics) {
  const plan = planContentCharts(t);
  console.log("\n===", t, "===");
  console.log(formatContentChartBrief(plan));
  console.log(JSON.stringify(plan, null, 2));
}

console.log("\n--- Generating charts for Australia inflation ---");
const auPlan = planContentCharts("Australia inflation trends and RBA response");
const charts = await executeContentChartPlan(auPlan);
console.log(
  charts.map((c) => ({ kind: c.kind, caption: c.caption, bytes: c.src.length }))
);

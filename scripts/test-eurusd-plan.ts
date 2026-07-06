import "dotenv/config";
import { planContentCharts, formatContentChartBrief } from "../server/contentChartPlanner.ts";

const titles = [
  "Fed-ECB Rate Divergence Reshapes EUR Valuation as Real Yields Signal Extended Dollar Strength",
  "EURUSD outlook",
  "EURUSD inflation CPI eurozone",
  "EUR/USD and US inflation data",
];

for (const t of titles) {
  console.log(t.slice(0, 70));
  console.log("  =>", formatContentChartBrief(planContentCharts(t)));
}

// Simulate Airtable embed limit
const AIRTABLE_LIMIT = 95_000;
const sampleContent = "x".repeat(12_000); // ~institutional article HTML
const ohlcLen = 63_566;
const econLen = 83_070;
const withBoth = sampleContent.length + ohlcLen + econLen + 500;
console.log("\nSimulated embed size with 12k article + 2 charts:", withBoth, "limit", AIRTABLE_LIMIT);
console.log("Would omit ALL charts:", withBoth > AIRTABLE_LIMIT);

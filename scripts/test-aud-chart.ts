import "dotenv/config";
import { detectFinancialSymbols, generateChartImage } from "../server/atfxMarketData.ts";

const titles = [
  "AUD outlook and RBA policy",
  "AUD/USD weakness after RBA",
  "Australian dollar AUDUSD trading",
];

for (const t of titles) {
  console.log(t, "=>", detectFinancialSymbols(t));
}

console.log("\nGenerating AUDUSD chart...");
const chart = await generateChartImage("AUDUSD");
console.log(chart ? `OK length=${chart.length}` : "FAILED null");

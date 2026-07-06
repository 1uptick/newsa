/**
 * Quick test: US unemployment trend chart → test-unemployment-chart.png
 * Usage: npx tsx scripts/test-unemployment-chart.ts
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { fetchEconomicChartText } from "../server/economicChart.js";

const t0 = Date.now();
const result = await fetchEconomicChartText({
  indicator: "unemploymentRate",
  chartType: "bar",
  months: 12,
});

const match = result.match(/src="(data:image[^"]+)"/);
if (!match) {
  console.error("Chart generation failed:\n", result.slice(0, 500));
  process.exit(1);
}

const dataUrl = match[1];
const [, meta, b64] = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/) ?? [];
if (!b64) {
  console.error("Could not parse data URL");
  process.exit(1);
}

const ext = meta?.includes("png") ? "png" : "svg";
const outPath = `test-unemployment-chart.${ext}`;
writeFileSync(outPath, Buffer.from(b64, "base64"));

console.log(`Saved ${outPath} (${Math.round((Date.now() - t0) / 1000)}s)`);
console.log(result.split("\n")[0]);

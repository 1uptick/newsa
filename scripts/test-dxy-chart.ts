/**
 * Test DXY OHLC chart via Chart-IMG (same path as get_chart_image tool).
 * Usage: npx tsx scripts/test-dxy-chart.ts
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { fetchChartImageText } from "../server/atfxMarketData.js";
import { getChartImgSymbolCandidates } from "../server/chartSymbolHelpers.js";

const inputs = ["DXY", "TVC:DXY", "DX-Y.NYB"];

for (const symbol of inputs) {
  const candidates = getChartImgSymbolCandidates(symbol);
  console.log(`\n--- ${symbol} ---`);
  console.log("Candidates:", candidates.join(" → ") || "(none)");
}

const t0 = Date.now();
const result = await fetchChartImageText("DXY", undefined, "daily");

if (result.startsWith("Chart image unavailable") || result.startsWith("Error")) {
  console.error("\nFAILED:", result.slice(0, 500));
  process.exit(1);
}

const match = result.match(/src="(data:image[^"]+)"/);
if (!match) {
  console.error("\nNo data URL in response:", result.slice(0, 300));
  process.exit(1);
}

const dataUrl = match[1];
const [, meta, b64] = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/) ?? [];
if (!b64) {
  console.error("Could not parse data URL");
  process.exit(1);
}

const outPath = "test-dxy-chart.png";
writeFileSync(outPath, Buffer.from(b64, "base64"));

console.log(`\nOK: Saved ${outPath} (${Math.round((Date.now() - t0) / 1000)}s)`);
console.log(result.split("\n")[0].slice(0, 120) + "...");

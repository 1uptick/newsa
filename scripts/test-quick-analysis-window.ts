/**
 * Sanity check trading-aware quick analysis windows.
 * Run: npx tsx scripts/test-quick-analysis-window.ts
 */
import { resolveQuickAnalysisTradingWindow } from "../server/atfxQuickAnalysisTradingWindow.js";

function eodBar(date: string, close: number) {
  const ms = Date.parse(`${date}T21:00:00.000Z`);
  return { time: Math.floor(ms / 1000), close };
}

const fri = eodBar("2026-06-12", 5430);
const thu = eodBar("2026-06-11", 5410);
const wed = eodBar("2026-06-10", 5390);
const daily = [wed, thu, fri];

const saturday = Date.parse("2026-06-13T15:00:00.000Z");

console.log("=== S&P weekend 24h ===");
console.log(
  resolveQuickAnalysisTradingWindow("^GSPC", "24h", [], daily, saturday).resolvedWindowLabel
);

console.log("=== S&P Monday 48h ===");
console.log(
  resolveQuickAnalysisTradingWindow("^GSPC", "48h", [], daily, Date.parse("2026-06-15T12:00:00.000Z"))
    .resolvedWindowLabel
);

console.log("=== BTC 24h ===");
console.log(
  resolveQuickAnalysisTradingWindow("BTCUSD", "24h", [], daily, saturday).resolvedWindowLabel
);

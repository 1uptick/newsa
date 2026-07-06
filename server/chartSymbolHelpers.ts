/**
 * TradingView / Chart-IMG symbol candidates with ordered fallbacks.
 * Wraps the 1uptick chartImg stack (coachSymbolResolver + chartImgSymbolFallback).
 */

import { resolveCoachSymbol, type AssetTerminal } from "./coachSymbolResolver.js";
import { getTradingViewSymbolCandidates } from "./chartImg/chartImgSymbolFallback.js";
import { terminalToChartImgAssetCategory } from "./chartImg/timeframe.js";
import type { ChartImgAssetCategory } from "./chartImg/types.js";

function terminalToChartCategory(terminal: AssetTerminal): ChartImgAssetCategory {
  return terminalToChartImgAssetCategory(terminal);
}

/** Hardcoded TradingView symbol for chart-img gold snapshots (spot, not COMEX futures). */
export const CHART_IMG_GOLD_API_SYMBOL = "OANDA:XAUUSD";

const GOLD_CHART_FMP_SYMBOLS = new Set(["XAUUSD", "GCUSD", "XAU", "GOLD", "GC"]);

/** True when the input should chart as spot gold on chart-img. */
export function isGoldChartInput(rawSymbol: string): boolean {
  const raw = String(rawSymbol || "").trim();
  if (!raw) return false;
  const fmp = resolveFmpSymbol(raw).toUpperCase();
  if (GOLD_CHART_FMP_SYMBOLS.has(fmp)) return true;
  const upper = raw.toUpperCase().replace(/\s+/g, "");
  return (
    upper.includes("XAUUSD") ||
    upper.includes("OANDA:XAU") ||
    upper === "COMEX:GC1!" ||
    /^(GOLD|XAU|黃金|黄金)$/.test(raw.trim())
  );
}

/**
 * Ordered TradingView symbols to try for Chart-IMG (primary first).
 * Resolves NL phrases / aliases via coachSymbolResolver, then applies 1uptick fallbacks.
 */
export function getChartImgSymbolCandidates(rawSymbol: string): string[] {
  const raw = String(rawSymbol || "").trim();
  if (!raw) return [];

  if (isGoldChartInput(raw)) {
    return [CHART_IMG_GOLD_API_SYMBOL];
  }

  const resolved = resolveCoachSymbol(raw);
  const fmpSymbol = resolved.fmpSymbol || raw.replace(/[/\s]/g, "").toUpperCase();
  const category = terminalToChartCategory(resolved.terminal);

  const out: string[] = [];
  if (raw.includes(":")) {
    const tv = raw.toUpperCase();
    if (!out.includes(tv)) out.push(tv);
  }

  for (const candidate of getTradingViewSymbolCandidates(fmpSymbol, category)) {
    if (!out.includes(candidate)) out.push(candidate);
  }

  return out;
}

/** Resolve any user/LLM symbol to FMP-canonical ticker for quote/API calls. */
export function resolveFmpSymbol(raw: unknown): string {
  const rawStr = typeof raw === "string" ? raw.trim() : "";
  if (!rawStr) return "";
  const { fmpSymbol } = resolveCoachSymbol(rawStr);
  return fmpSymbol || rawStr.replace(/[/\s]/g, "").toUpperCase();
}

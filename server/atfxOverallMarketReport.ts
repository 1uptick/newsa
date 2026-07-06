/**
 * ATFX Markets — multi-segment overall market report (Bloomberg-style overview).
 * Persists into atfx_quick_analyses with OVERALL: symbol prefix.
 * Output: HTML (<h2>, <h4>, <table>, <ul>) + hourly ATFX-branded chart-img grids (2 per row).
 */

import { fetchBatchQuotesForSymbols, quoteToMoverEntry } from "./atfxGainersLosersProcessor.js";
import type { GainerLoserEntry } from "./atfxGainersLosersProcessor.js";
import { generateChartImage } from "./atfxMarketData.js";
import { atfxChartImgAttrs, escapeHtmlAttr, formatAtfxPriceChartFileName } from "./atfxChartNaming.js";
import { pairDisplaySymbol } from "./atfxMarketMoversShared.js";
import type { AtfxQuickAnalysisResult } from "./atfxQuickAnalysis.js";
import type { QuickAnalysisProgressSink, QuickAnalysisProgressStep } from "./atfxQuickAnalysis.js";
import { resolveQuickAnalysisTradingWindow } from "./atfxQuickAnalysisTradingWindow.js";
import { wrapEconomicChartGrid } from "./atfxReportChartLayout.js";
import { ATFX_REPORT_TABLE_CLASS } from "./atfxReportTableHtml.js";
import {
  callRequestyChatWithModelChain,
  extractFirstJsonObject,
  researchModelChain,
  writerModelChain,
} from "./atfxResearchRequesty.js";
import { config } from "./config.js";
import { stripCitationMarkers } from "./stripLlmCitations.js";

export const OVERALL_MARKET_SYMBOL_PREFIX = "OVERALL:";
export const OVERALL_MARKET_HTML_MARKER = "<!--ATFX_OVERALL_HTML-->";

export type OverallMarketSegment = "us_stocks" | "forex" | "commodities";

export const OVERALL_MARKET_SEGMENT_OPTIONS: ReadonlyArray<{
  id: OverallMarketSegment;
  label: string;
  description: string;
}> = [
  {
    id: "us_stocks",
    label: "Stocks market",
    description: "US equities — S&P 500, Nasdaq 100, Dow 30",
  },
  {
    id: "forex",
    label: "Forex",
    description: "Major G10 currency pairs vs USD",
  },
  {
    id: "commodities",
    label: "Commodity",
    description: "Gold, oil, silver, natural gas, copper",
  },
];

const US_STOCK_INDEXES: Array<{ symbol: string; name: string }> = [
  { symbol: "^GSPC", name: "S&P 500" },
  { symbol: "^NDX", name: "Nasdaq 100" },
  { symbol: "^DJI", name: "Dow 30" },
];

const FOREX_MAJORS: Array<{ symbol: string; name: string }> = [
  { symbol: "EURUSD", name: pairDisplaySymbol("EUR", "USD") },
  { symbol: "GBPUSD", name: pairDisplaySymbol("GBP", "USD") },
  { symbol: "USDJPY", name: pairDisplaySymbol("USD", "JPY") },
  { symbol: "USDCHF", name: pairDisplaySymbol("USD", "CHF") },
  { symbol: "AUDUSD", name: pairDisplaySymbol("AUD", "USD") },
  { symbol: "USDCAD", name: pairDisplaySymbol("USD", "CAD") },
  { symbol: "USDCNH", name: pairDisplaySymbol("USD", "CNH") },
];

const MAJOR_COMMODITIES: Array<{ symbol: string; name: string }> = [
  { symbol: "GCUSD", name: "Gold" },
  { symbol: "CLUSD", name: "WTI Crude Oil" },
  { symbol: "BZUSD", name: "Brent Crude Oil" },
  { symbol: "SIUSD", name: "Silver" },
  { symbol: "NGUSD", name: "Natural Gas" },
  { symbol: "HGUSD", name: "Copper" },
];

const SEGMENT_ORDER: OverallMarketSegment[] = ["us_stocks", "forex", "commodities"];

const SEGMENT_H2: Record<OverallMarketSegment, string> = {
  us_stocks: "US Stocks",
  forex: "Forex",
  commodities: "Commodities",
};

const CHART_INTERVAL = "1h";
const CHART_FETCH_CONCURRENCY = 3;

type ChartAsset = { symbol: string; name: string; url: string };

type LlmSubsection = { title: string; body_html: string };
type LlmSection = {
  segment: OverallMarketSegment;
  intro_html: string;
  subsections: LlmSubsection[];
};
type LlmOverallPayload = {
  executive_summary_html: string;
  sections: LlmSection[];
};

function getFmpKey(): string | null {
  return config.fmp.apiKey?.trim() || null;
}

function instrumentsForSegment(segment: OverallMarketSegment): Array<{ symbol: string; name: string }> {
  if (segment === "us_stocks") return US_STOCK_INDEXES;
  if (segment === "forex") return FOREX_MAJORS;
  return MAJOR_COMMODITIES;
}

export function parseOverallMarketSegments(raw: unknown): OverallMarketSegment[] {
  const list = Array.isArray(raw) ? raw : [];
  const picked = new Set<OverallMarketSegment>();
  for (const item of list) {
    const v = String(item ?? "")
      .trim()
      .toLowerCase();
    if (v === "us_stocks" || v === "forex" || v === "commodities") {
      picked.add(v);
    }
  }
  return SEGMENT_ORDER.filter((s) => picked.has(s)).slice(0, 1);
}

export function isOverallMarketReportSymbol(symbol: string): boolean {
  return String(symbol ?? "")
    .trim()
    .toUpperCase()
    .startsWith(OVERALL_MARKET_SYMBOL_PREFIX);
}

export function isOverallMarketHtmlReport(report: string): boolean {
  const t = report.trim();
  return t.startsWith(OVERALL_MARKET_HTML_MARKER) || (t.startsWith("<") && /<h2\b/i.test(t));
}

export function overallMarketSymbolForSegments(segments: OverallMarketSegment[]): string {
  const ordered = SEGMENT_ORDER.filter((s) => segments.includes(s));
  return `${OVERALL_MARKET_SYMBOL_PREFIX}${ordered.map((s) => s.toUpperCase()).join("+")}`;
}

export function overallMarketDisplayName(segments: OverallMarketSegment[]): string {
  const ordered = SEGMENT_ORDER.filter((s) => segments.includes(s));
  if (!ordered.length) return "Overall Market Report";
  return `Overall Market — ${ordered.map((s) => SEGMENT_H2[s]).join(", ")}`;
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  const abs = Math.abs(value);
  const decimals = abs >= 100 ? 2 : abs >= 1 ? 4 : 4;
  return value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatPct(pct: number): string {
  if (!Number.isFinite(pct)) return "n/a";
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
}

function quoteDataBlock(entries: GainerLoserEntry[]): string {
  return entries
    .map((entry) => {
      const label = entry.name?.trim() || entry.symbol;
      return `${label} (${entry.symbol}): ${formatPrice(entry.price)} (${formatPct(entry.changesPercentage)})`;
    })
    .join("\n");
}

async function fetchSegmentQuotes(
  key: string,
  instruments: Array<{ symbol: string; name: string }>
): Promise<GainerLoserEntry[]> {
  const symbols = instruments.map((i) => i.symbol);
  const quotes = await fetchBatchQuotesForSymbols(key, symbols);
  const bySymbol = new Map<string, GainerLoserEntry>();
  for (const q of quotes) {
    const entry = quoteToMoverEntry(q, true);
    if (entry) bySymbol.set(entry.symbol.toUpperCase(), entry);
  }
  return instruments
    .map((i) => {
      const hit =
        bySymbol.get(i.symbol.toUpperCase()) ??
        bySymbol.get(i.symbol.replace(/^\^/, "").toUpperCase());
      if (hit) {
        return { ...hit, name: i.name || hit.name };
      }
      return null;
    })
    .filter(Boolean) as GainerLoserEntry[];
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

function buildPriceSnapshotTable(entries: GainerLoserEntry[]): string {
  if (!entries.length) return "";
  const rows = entries
    .map((entry) => {
      const label = escapeHtmlAttr(entry.name?.trim() || entry.symbol);
      const pct = entry.changesPercentage;
      const pctStyle =
        pct >= 0
          ? ' style="text-align:center;color:#059669;font-weight:600"'
          : ' style="text-align:center;color:#e11d48;font-weight:600"';
      return `<tr><td style="text-align:center">${label}</td><td style="text-align:center">${formatPrice(entry.price)}</td><td${pctStyle}>${formatPct(pct)}</td></tr>`;
    })
    .join("\n");
  return `<table class="${ATFX_REPORT_TABLE_CLASS} atfx-report-table--performance" style="text-align:center"><thead><tr><th style="text-align:center">Instrument</th><th style="text-align:center">Last</th><th style="text-align:center">Session change</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function buildHourlyChartGrid(charts: ChartAsset[]): string {
  if (!charts.length) return "";
  const tags = charts.map((chart) => {
    const fileName = formatAtfxPriceChartFileName(chart.symbol, CHART_INTERVAL);
    const attrs = atfxChartImgAttrs(fileName);
    return `<p><img src="${chart.url}" ${attrs} /></p>`;
  });
  return wrapEconomicChartGrid(tags);
}

function buildMarketDataBlock(
  segments: OverallMarketSegment[],
  quotesBySegment: Partial<Record<OverallMarketSegment, GainerLoserEntry[]>>,
  sessionLabel: string
): string {
  const lines: string[] = [`Data as of: ${sessionLabel}`, ""];
  for (const segment of segments) {
    lines.push(`${SEGMENT_H2[segment]} (last session):`, quoteDataBlock(quotesBySegment[segment] ?? []), "");
  }
  return lines.join("\n").trim();
}

async function fetchSegmentNewsContext(
  segments: OverallMarketSegment[],
  sessionLabel: string,
  newsWindow: string
): Promise<string> {
  const segmentLabels: Record<OverallMarketSegment, string> = {
    us_stocks: "US equities (S&P 500, Nasdaq, Dow)",
    forex: "major G10 FX pairs",
    commodities: "gold, crude oil, silver, natural gas, copper",
  };
  const focus = segments.map((s) => segmentLabels[s]).join("; ");
  const userPrompt = `Summarize the most important market developments for the LAST COMPLETED TRADING SESSION covering: ${focus}.

Session reference: ${sessionLabel}
News window: ${newsWindow}

Return concise bullet points grouped by asset class (US stocks, FX, commodities as applicable). Focus on price action drivers, macro catalysts, and cross-asset themes. No fabricated price levels.`;

  const models = researchModelChain(config.requesty.atfxResearchResearchModel);
  try {
    const raw = await callRequestyChatWithModelChain(
      models,
      [
        {
          role: "system",
          content:
            "You are a Bloomberg-style markets desk analyst. Return markdown bullet points only — no JSON, no preamble.",
        },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.2, max_tokens: 1800 }
    );
    return stripCitationMarkers(raw.trim());
  } catch (e) {
    console.warn("[atfx/overall-market] research context failed:", e);
    return "";
  }
}

function convertNarrativeTablesToBulletList(html: string): string {
  if (!/<table\b/i.test(html)) return html;
  return html.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, (tableHtml) => {
    const items: string[] = [];
    for (const row of tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const rowHtml = row[1];
      if (/<th\b/i.test(rowHtml) && !/<td\b/i.test(rowHtml)) continue;
      const cells = [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
        .map((c) => c[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
        .filter(Boolean);
      if (!cells.length) continue;
      const text = cells.length === 1 ? cells[0] : cells.join(" — ");
      if (text) items.push(text);
    }
    if (!items.length) return "";
    return `<ul>${items.map((t) => `<li>${escapeHtmlAttr(t)}</li>`).join("")}</ul>`;
  });
}

function normalizeSubsectionBodyHtml(html: string): string {
  const trimmed = stripCitationMarkers(html?.trim() || "");
  if (!trimmed) return "<ul><li>Monitor next-session catalysts.</li></ul>";
  const withoutTables = convertNarrativeTablesToBulletList(trimmed);
  if (/<ul\b/i.test(withoutTables)) return withoutTables;
  if (/<li\b/i.test(withoutTables)) return `<ul>${withoutTables}</ul>`;
  const plain = withoutTables.replace(/<\/?p\b[^>]*>/gi, "\n").replace(/<br\s*\/?>/gi, "\n");
  const lines = plain
    .replace(/<[^>]+>/g, "")
    .split(/\n+/)
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
  if (lines.length) {
    return `<ul>${lines.map((l) => `<li>${escapeHtmlAttr(l)}</li>`).join("")}</ul>`;
  }
  return withoutTables;
}

async function writeOverallMarketNarrative(
  segments: OverallMarketSegment[],
  displayName: string,
  sessionLabel: string,
  marketDataBlock: string,
  newsContext: string
): Promise<LlmOverallPayload> {
  const segmentList = segments.map((s) => SEGMENT_H2[s]).join(", ");

  const userPrompt = `Write narrative content for a Bloomberg-style overall market HTML report (LAST COMPLETED TRADING SESSION).

Report: ${displayName}
Session: ${sessionLabel}
Sections required (one JSON section per): ${segmentList}

Verified prices (do not invent levels):
${marketDataBlock}

${newsContext ? `Research context:\n${newsContext}` : ""}

Return ONLY valid JSON:
{
  "executive_summary_html": "<p>...</p> (3-5 sentences, cross-asset)",
  "sections": [
    {
      "segment": "us_stocks" | "forex" | "commodities",
      "intro_html": "<p>opening paragraph for this market</p>",
      "subsections": [
        {
          "title": "Key drivers",
          "body_html": "<ul><li>...</li><li>...</li></ul>"
        },
        {
          "title": "What to watch next",
          "body_html": "<ul><li>...</li></ul>"
        }
      ]
    }
  ]
}

Rules:
- body_html may use ONLY: <p>, <ul>, <li> — no tables
- Market drivers, catalysts, positioning, and watch-list items MUST be bullet points (<ul><li>) — never tables or grids
- Do NOT include <h1>, <h2>, <h4>, or <img> — those are added by the server
- Each section needs 2-4 subsections with clear titles (Key drivers, Cross-asset read-through, Positioning, What to watch next, etc.)
- Institutional market-desk tone; no markdown`;

  const models = writerModelChain(config.requesty.atfxResearchWriterModel);
  const raw = await callRequestyChatWithModelChain(
    models,
    [
      {
        role: "system",
        content:
          "You write institutional market wrap content. Return ONLY valid JSON matching the schema. HTML fragments inside JSON strings only. Market drivers and catalysts must always be <ul><li> bullet lists — never HTML tables.",
      },
      { role: "user", content: userPrompt },
    ],
    { temperature: 0.35, max_tokens: 5000 }
  );

  const jsonStr = extractFirstJsonObject(raw);
  if (!jsonStr) {
    return fallbackNarrative(segments, sessionLabel, newsContext);
  }

  try {
    const parsed = JSON.parse(jsonStr) as LlmOverallPayload;
    if (!parsed.executive_summary_html?.trim()) {
      return fallbackNarrative(segments, sessionLabel, newsContext);
    }
    const sectionBySegment = new Map(
      (Array.isArray(parsed.sections) ? parsed.sections : []).map((s) => [s.segment, s])
    );
    return {
      executive_summary_html: stripCitationMarkers(parsed.executive_summary_html.trim()),
      sections: segments.map((segment) => {
        const hit = sectionBySegment.get(segment);
        return {
          segment,
          intro_html: stripCitationMarkers(hit?.intro_html?.trim() || `<p>${SEGMENT_H2[segment]} session wrap.</p>`),
          subsections: (hit?.subsections ?? []).map((sub) => ({
            title: sub.title?.trim() || "Overview",
            body_html: normalizeSubsectionBodyHtml(sub.body_html || ""),
          })),
        };
      }),
    };
  } catch {
    return fallbackNarrative(segments, sessionLabel, newsContext);
  }
}

function fallbackNarrative(
  segments: OverallMarketSegment[],
  sessionLabel: string,
  newsContext: string
): LlmOverallPayload {
  const bullets = newsContext
    .split("\n")
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 6);
  const list =
    bullets.length > 0
      ? `<ul>${bullets.map((b) => `<li>${escapeHtmlAttr(b)}</li>`).join("")}</ul>`
      : "<ul><li>Session drivers are being monitored into the next open.</li></ul>";
  return {
    executive_summary_html: `<p>Overall market wrap for ${escapeHtmlAttr(sessionLabel)}.</p>`,
    sections: segments.map((segment) => ({
      segment,
      intro_html: `<p>${SEGMENT_H2[segment]} price action reflected the latest session close.</p>`,
      subsections: [
        { title: "Key drivers", body_html: list },
        { title: "What to watch next", body_html: "<ul><li>Watch whether moves extend in the next session.</li></ul>" },
      ],
    })),
  };
}

function assembleOverallMarketHtml(
  displayName: string,
  sessionLabel: string,
  segments: OverallMarketSegment[],
  narrative: LlmOverallPayload,
  quotesBySegment: Partial<Record<OverallMarketSegment, GainerLoserEntry[]>>,
  chartsBySegment: Partial<Record<OverallMarketSegment, ChartAsset[]>>
): string {
  const parts: string[] = [
    OVERALL_MARKET_HTML_MARKER,
    "<article>",
    `<h1>${escapeHtmlAttr(displayName)}</h1>`,
    `<p><em>${escapeHtmlAttr(sessionLabel)}</em></p>`,
    "<h2>Executive summary</h2>",
    narrative.executive_summary_html,
  ];

  for (const segment of segments) {
    const section = narrative.sections.find((s) => s.segment === segment);
    parts.push(`<h2>${SEGMENT_H2[segment]}</h2>`);
    if (section?.intro_html) parts.push(section.intro_html);

    parts.push("<h4>Session snapshot</h4>");
    parts.push(buildPriceSnapshotTable(quotesBySegment[segment] ?? []));

    const charts = chartsBySegment[segment] ?? [];
    if (charts.length) {
      parts.push("<h4>Hourly charts</h4>");
      parts.push(buildHourlyChartGrid(charts));
    }

    for (const sub of section?.subsections ?? []) {
      parts.push(`<h4>${escapeHtmlAttr(sub.title)}</h4>`);
      parts.push(sub.body_html);
    }
  }

  parts.push("</article>");
  return parts.join("\n");
}

function avgChangePct(entries: GainerLoserEntry[]): number | undefined {
  const vals = entries.map((e) => e.changesPercentage).filter((n) => Number.isFinite(n));
  if (!vals.length) return undefined;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export async function runAtfxOverallMarketReport(
  segmentsInput: unknown,
  onProgress?: QuickAnalysisProgressSink
): Promise<AtfxQuickAnalysisResult> {
  const sink = onProgress;
  const segments = parseOverallMarketSegments(segmentsInput);
  if (!segments.length) {
    return {
      success: false,
      symbol: OVERALL_MARKET_SYMBOL_PREFIX,
      displayName: "Overall Market Report",
      report: "",
      timestamp: Date.now(),
      error: "Select at least one market (US Stocks, Forex, or Commodities).",
    };
  }

  const fmpKey = getFmpKey();
  if (!fmpKey) {
    return {
      success: false,
      symbol: overallMarketSymbolForSegments(segments),
      displayName: overallMarketDisplayName(segments),
      report: "",
      timestamp: Date.now(),
      error: "FMP API key not configured",
    };
  }

  const sessionWindow = resolveQuickAnalysisTradingWindow("^GSPC", "24h", [], [], Date.now());
  const sessionLabel = sessionWindow.resolvedWindowLabel || sessionWindow.dataAsOfLabel;
  const newsWindow = sessionWindow.newsWindowLabel;
  const displayName = overallMarketDisplayName(segments);

  sink?.phase?.("Loading market quotes…", "quotes" as QuickAnalysisProgressStep);
  const quotesBySegment: Partial<Record<OverallMarketSegment, GainerLoserEntry[]>> = {};
  const chartsBySegment: Partial<Record<OverallMarketSegment, ChartAsset[]>> = {};

  await Promise.all(
    segments.map(async (segment) => {
      const instruments = instrumentsForSegment(segment);
      quotesBySegment[segment] = await fetchSegmentQuotes(fmpKey, instruments);
    })
  );
  sink?.stepComplete?.("quotes" as QuickAnalysisProgressStep);

  sink?.phase?.("Rendering hourly charts…", "charts" as QuickAnalysisProgressStep);
  let chartIndex = 0;
  const totalCharts = segments.reduce((n, s) => n + instrumentsForSegment(s).length, 0);
  for (const segment of segments) {
    const instruments = instrumentsForSegment(segment);
    const charts = await mapWithConcurrency(instruments, CHART_FETCH_CONCURRENCY, async (inst) => {
      const url = await generateChartImage(inst.symbol, CHART_INTERVAL);
      chartIndex += 1;
      sink?.phase?.(`Rendering charts (${chartIndex}/${totalCharts})…`, "charts" as QuickAnalysisProgressStep);
      return url ? ({ symbol: inst.symbol, name: inst.name, url } satisfies ChartAsset) : null;
    });
    chartsBySegment[segment] = charts.filter((r): r is ChartAsset => r != null);
  }
  sink?.stepComplete?.("charts" as QuickAnalysisProgressStep);

  const allQuotes = segments.flatMap((s) => quotesBySegment[s] ?? []);
  sink?.meta?.({
    changePct: avgChangePct(allQuotes),
    resolvedWindowLabel: sessionLabel,
    dataAsOfLabel: sessionWindow.dataAsOfLabel,
  });

  const hasAnyQuote = segments.some((s) => (quotesBySegment[s] ?? []).length > 0);
  if (!hasAnyQuote) {
    return {
      success: false,
      symbol: overallMarketSymbolForSegments(segments),
      displayName,
      report: "",
      timestamp: Date.now(),
      error: "Could not load market data for the selected segments.",
    };
  }

  const marketDataBlock = buildMarketDataBlock(segments, quotesBySegment, sessionLabel);
  sink?.phase?.("Researching session drivers…", "research" as QuickAnalysisProgressStep);
  const newsContext = await fetchSegmentNewsContext(segments, sessionLabel, newsWindow);
  sink?.stepComplete?.("research" as QuickAnalysisProgressStep);

  sink?.phase?.("Writing market overview…", "narrative" as QuickAnalysisProgressStep);
  const narrative = await writeOverallMarketNarrative(
    segments,
    displayName,
    sessionLabel,
    marketDataBlock,
    newsContext
  );
  sink?.stepComplete?.("narrative" as QuickAnalysisProgressStep);

  sink?.phase?.("Assembling report…", "report");
  const report = assembleOverallMarketHtml(
    displayName,
    sessionLabel,
    segments,
    narrative,
    quotesBySegment,
    chartsBySegment
  );
  sink?.partialReport?.(report);
  sink?.stepComplete?.("report");

  const allQuotesFinal = segments.flatMap((s) => quotesBySegment[s] ?? []);
  const changePct = avgChangePct(allQuotesFinal);
  const firstChart = segments.flatMap((s) => chartsBySegment[s] ?? [])[0];

  return {
    success: true,
    symbol: overallMarketSymbolForSegments(segments),
    displayName,
    report,
    timestamp: Date.now(),
    lookback: "24h",
    changePct,
    resolvedWindowLabel: sessionLabel,
    dataAsOfLabel: sessionWindow.dataAsOfLabel,
    chartImageUrl: firstChart?.url,
    chartCaption: firstChart
      ? formatAtfxPriceChartFileName(firstChart.symbol, CHART_INTERVAL)
      : undefined,
    chartInterval: CHART_INTERVAL,
  };
}

/**
 * Economic bar/line charts for research reports (QuickChart + SVG fallback).
 * Separate from Chart-IMG price OHLC charts.
 */

import {
  ECONOMIC_INDICATOR_LABELS,
  fetchMacroSeries,
  isTreasuryIndicator,
  normalizeEconomicIndicatorName,
  resolveIndicatorDateRange,
  type EconomicDataPoint,
} from "./fmpEconomicIndicators.js";
import { fetchCalendarReleaseSeries } from "./fmpEconomicCalendarSeries.js";
import type { EconomicChartPlan } from "./contentChartPlanner.js";
import { renderQuickChartPng } from "./quickChartRender.js";
import { atfxEconomicChartImgAttrs, formatAtfxEconomicChartFileName, formatEconomicChartDisplayTitle } from "./atfxChartNaming.js";

const CHART_WIDTH = 800;
const CHART_HEIGHT = 400;
const MARGIN = { top: 48, right: 24, bottom: 56, left: 64 };

const COLOR_BAR = "#f2682a";
const COLOR_LINE = "#172b4c";
const COLOR_GRID = "#e5e7eb";
const COLOR_TEXT = "#374151";

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function chartTitle(indicatorName: string): string {
  if (indicatorName === "treasury10Y") return "US 10-Year Treasury Yield";
  if (indicatorName === "treasury2Y") return "US 2-Year Treasury Yield";
  return ECONOMIC_INDICATOR_LABELS[indicatorName] ?? indicatorName;
}

function datasetLabel(indicatorName: string): string {
  if (indicatorName === "unemploymentRate") return "Unemployment (%)";
  if (indicatorName === "inflationRate") return "Inflation (%)";
  if (isTreasuryIndicator(indicatorName)) return "Yield (%)";
  if (indicatorName === "CPI") return "CPI Index";
  return chartTitle(indicatorName);
}

function defaultChartType(indicatorName: string): "bar" | "line" {
  if (isTreasuryIndicator(indicatorName)) return "line";
  if (indicatorName === "GDP" || indicatorName === "totalNonfarmPayroll") return "bar";
  return "bar";
}

function downsample(points: EconomicDataPoint[], maxPoints: number): EconomicDataPoint[] {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const out: EconomicDataPoint[] = [];
  for (let i = 0; i < points.length; i += step) out.push(points[i]);
  if (out[out.length - 1]?.date !== points[points.length - 1].date) {
    out.push(points[points.length - 1]);
  }
  return out;
}

function formatAxisDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
}

function formatValue(v: number): string {
  if (Math.abs(v) >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return v.toFixed(2);
}

/** SVG fallback when QuickChart is unavailable. */
export function renderEconomicChartSvg(
  points: EconomicDataPoint[],
  title: string,
  chartType: "bar" | "line"
): string {
  const plotW = CHART_WIDTH - MARGIN.left - MARGIN.right;
  const plotH = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;

  if (!points.length) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${CHART_WIDTH}" height="${CHART_HEIGHT}" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}">
      <rect width="100%" height="100%" fill="#ffffff"/>
      <text x="${CHART_WIDTH / 2}" y="${CHART_HEIGHT / 2}" text-anchor="middle" fill="${COLOR_TEXT}" font-family="system-ui,sans-serif" font-size="14">No data available</text>
    </svg>`;
  }

  const values = points.map((p) => p.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const pad = (maxVal - minVal) * 0.08 || Math.abs(maxVal) * 0.05 || 1;
  const yMin = minVal - pad;
  const yMax = maxVal + pad;

  const xScale = (i: number) => MARGIN.left + (i / Math.max(1, points.length - 1)) * plotW;
  const yScale = (v: number) => MARGIN.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  const gridLines: string[] = [];
  for (let i = 0; i <= 4; i++) {
    const y = MARGIN.top + (plotH * i) / 4;
    const val = yMax - ((yMax - yMin) * i) / 4;
    gridLines.push(`<line x1="${MARGIN.left}" y1="${y}" x2="${CHART_WIDTH - MARGIN.right}" y2="${y}" stroke="${COLOR_GRID}" stroke-width="1"/>`);
    gridLines.push(
      `<text x="${MARGIN.left - 8}" y="${y + 4}" text-anchor="end" fill="${COLOR_TEXT}" font-family="system-ui,sans-serif" font-size="11">${formatValue(val)}</text>`
    );
  }

  const xLabels: string[] = [];
  const labelStep = Math.max(1, Math.floor(points.length / 6));
  for (let i = 0; i < points.length; i += labelStep) {
    const x = xScale(i);
    xLabels.push(
      `<text x="${x}" y="${CHART_HEIGHT - 16}" text-anchor="middle" fill="${COLOR_TEXT}" font-family="system-ui,sans-serif" font-size="10">${formatAxisDate(points[i].date)}</text>`
    );
  }

  let series = "";
  if (chartType === "bar") {
    const barW = Math.max(2, (plotW / points.length) * 0.65);
    series = points
      .map((p, i) => {
        const x = xScale(i) - barW / 2;
        const y = yScale(p.value);
        const h = MARGIN.top + plotH - y;
        return `<rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${COLOR_BAR}" rx="1"/>`;
      })
      .join("");
  } else {
    const pathD = points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(i)} ${yScale(p.value)}`)
      .join(" ");
    series = `<path d="${pathD}" fill="none" stroke="${COLOR_LINE}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    series += points
      .map((p, i) => `<circle cx="${xScale(i)}" cy="${yScale(p.value)}" r="3" fill="${COLOR_LINE}"/>`)
      .join("");
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CHART_WIDTH}" height="${CHART_HEIGHT}" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}">
    <rect width="100%" height="100%" fill="#ffffff"/>
    <text x="${CHART_WIDTH / 2}" y="28" text-anchor="middle" fill="${COLOR_TEXT}" font-family="system-ui,sans-serif" font-size="16" font-weight="600">${escapeXml(title)}</text>
    ${gridLines.join("")}
    ${series}
    ${xLabels.join("")}
  </svg>`;
}

function svgToDataUrl(svg: string): string {
  const b64 = Buffer.from(svg, "utf8").toString("base64");
  return `data:image/svg+xml;base64,${b64}`;
}

async function renderEconomicChartDataUrl(
  points: EconomicDataPoint[],
  title: string,
  chartType: "bar" | "line",
  datasetLabelText: string
): Promise<{ dataUrl: string; renderer: "quickchart" | "svg" }> {
  const labels = points.map((p) => formatAxisDate(p.date));
  const values = points.map((p) => p.value);

  try {
    const dataUrl = await renderQuickChartPng({
      title,
      datasetLabel: datasetLabelText,
      labels,
      values,
      chartType,
      width: CHART_WIDTH,
      height: CHART_HEIGHT,
    });
    return { dataUrl, renderer: "quickchart" };
  } catch (err) {
    console.warn("QuickChart render failed, using SVG fallback:", (err as Error).message);
    const svg = renderEconomicChartSvg(points, title, chartType);
    return { dataUrl: svgToDataUrl(svg), renderer: "svg" };
  }
}

async function fetchPointsForPlan(
  plan: EconomicChartPlan,
  fromDate: string,
  toDate: string
): Promise<EconomicDataPoint[]> {
  if (plan.source === "calendar" && plan.country && plan.eventPattern) {
    return fetchCalendarReleaseSeries({
      country: plan.country,
      eventPattern: new RegExp(plan.eventPattern, "i"),
      preferEventPrefix: plan.preferEventPrefix,
      fromDate,
      toDate,
    });
  }
  const indicator = plan.indicator ?? "";
  if (!indicator) return [];
  return fetchMacroSeries(indicator, fromDate, toDate);
}

/** Generate embeddable economic chart data URL from a content chart plan item. */
export async function generateEconomicChartDataUrl(plan: EconomicChartPlan): Promise<string | null> {
  const chartType = plan.chartType;
  const { fromDate, toDate } = resolveIndicatorDateRange({ months: plan.months });

  try {
    let points = await fetchPointsForPlan(plan, fromDate, toDate);
    if (!points.length) {
      console.warn("Economic chart: no data points", plan.title);
      return null;
    }
    points = downsample(points, chartType === "bar" ? 24 : 36);

    const label =
      plan.source === "calendar"
        ? plan.title
        : datasetLabel(plan.indicator ?? plan.title);

    const displayTitle = formatEconomicChartDisplayTitle(plan.indicator ?? plan.title);
    const { dataUrl } = await renderEconomicChartDataUrl(points, displayTitle, chartType, label);
    return dataUrl;
  } catch (e) {
    console.error("Economic chart generation failed:", plan.title, (e as Error).message);
    return null;
  }
}

export async function fetchEconomicChartText(args: Record<string, unknown>): Promise<string> {
  const country = typeof args.country === "string" ? args.country.trim().toUpperCase() : "";
  const eventPattern = typeof args.eventPattern === "string" ? args.eventPattern.trim() : "";
  const customTitle = typeof args.title === "string" ? args.title.trim() : "";

  if (country && eventPattern) {
    const chartTypeRaw = typeof args.chartType === "string" ? args.chartType.trim().toLowerCase() : "";
    const chartType: "bar" | "line" = chartTypeRaw === "line" ? "line" : "bar";
    const plan: EconomicChartPlan = {
      source: "calendar",
      country,
      eventPattern,
      preferEventPrefix:
        typeof args.preferEventPrefix === "string" ? args.preferEventPrefix.trim() : undefined,
      title: customTitle || `${country} economic release`,
      chartType,
      months: typeof args.months === "number" ? args.months : Number(args.months) || 24,
    };
    const dataUrl = await generateEconomicChartDataUrl(plan);
    if (!dataUrl) {
      return `Economic chart unavailable for ${plan.title} (no calendar data).`;
    }
    const fileName = formatAtfxEconomicChartFileName(plan.title);
    const displayTitle = formatEconomicChartDisplayTitle(plan.title);
    const imgAttrs = atfxEconomicChartImgAttrs(plan.title);
    return (
      `Economic chart: ${displayTitle} (file: ${fileName}, ${chartType}, calendar ${country}). ` +
      `Embed in report HTML as <img src="${dataUrl}" ${imgAttrs} />. ` +
      `Use <img src="__ECON_CHART_REF_0__" ${imgAttrs} /> in report_html.`
    );
  }

  const rawName = typeof args.indicator === "string" ? args.indicator.trim() : "";
  const indicatorName =
    rawName === "treasury10Y" || rawName === "treasury2Y"
      ? rawName
      : normalizeEconomicIndicatorName(args.indicator ?? args.name);

  if (!indicatorName) {
    return "Error: indicator is required for get_economic_chart (e.g. unemploymentRate, CPI, treasury10Y).";
  }

  const chartTypeRaw = typeof args.chartType === "string" ? args.chartType.trim().toLowerCase() : "";
  const chartType: "bar" | "line" =
    chartTypeRaw === "line" || chartTypeRaw === "bar" ? chartTypeRaw : defaultChartType(indicatorName);

  const { fromDate, toDate } = resolveIndicatorDateRange({
    fromDate: typeof args.fromDate === "string" ? args.fromDate : undefined,
    toDate: typeof args.toDate === "string" ? args.toDate : undefined,
    months: args.months,
  });

  try {
    let points = await fetchMacroSeries(indicatorName, fromDate, toDate);
    points = downsample(points, chartType === "bar" ? 24 : 36);

    const fileName = formatAtfxEconomicChartFileName(indicatorName);
    const displayTitle = formatEconomicChartDisplayTitle(indicatorName);
    const { dataUrl, renderer } = await renderEconomicChartDataUrl(
      points,
      displayTitle,
      chartType,
      datasetLabel(indicatorName)
    );

    const imgAttrs = atfxEconomicChartImgAttrs(indicatorName);
    return (
      `Economic chart: ${displayTitle} (file: ${fileName}, ${chartType}, ${fromDate} to ${toDate}, ${points.length} points, ${renderer}). ` +
      `Embed in report HTML as <img src="${dataUrl}" ${imgAttrs} />. ` +
      `Use <img src="__ECON_CHART_REF_0__" ${imgAttrs} /> in report_html (adjust index if multiple).`
    );
  } catch (e) {
    return `Economic chart unavailable for ${indicatorName} (${(e as Error).message}).`;
  }
}

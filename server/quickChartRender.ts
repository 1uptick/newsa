/**
 * QuickChart.io — Chart.js image rendering for macro bar/line charts.
 * @see https://quickchart.io/documentation/usage/post-endpoint/
 */

import { config } from "./config.js";

const QUICKCHART_URL = "https://quickchart.io/chart";
const REQUEST_TIMEOUT_MS = 20_000;

/** ATFX brand palette (matches price chart accents). */
export const ATFX_CHART_ORANGE = "#f2682a";
export const ATFX_CHART_NAVY = "#172b4c";

export type QuickChartSeriesOptions = {
  title: string;
  datasetLabel: string;
  labels: string[];
  values: number[];
  chartType: "bar" | "line";
  width?: number;
  height?: number;
};

function buildChartJsConfig(opts: QuickChartSeriesOptions): Record<string, unknown> {
  const isLine = opts.chartType === "line";
  const color = isLine ? ATFX_CHART_NAVY : ATFX_CHART_ORANGE;

  return {
    type: opts.chartType,
    data: {
      labels: opts.labels,
      datasets: [
        {
          label: opts.datasetLabel,
          data: opts.values,
          backgroundColor: isLine ? `${color}22` : color,
          borderColor: color,
          borderWidth: isLine ? 2.5 : 1,
          fill: isLine,
          tension: isLine ? 0.25 : 0,
          pointRadius: isLine ? 3 : 0,
          pointBackgroundColor: color,
          borderRadius: isLine ? 0 : 3,
        },
      ],
    },
    options: {
      layout: { padding: { top: 8, right: 12, bottom: 4, left: 4 } },
      plugins: {
        title: {
          display: true,
          text: opts.title,
          font: { size: 16, weight: "600" },
          color: "#172b4c",
          padding: { bottom: 12 },
        },
        legend: {
          display: true,
          position: "bottom",
          labels: { color: "#374151", boxWidth: 12, padding: 16 },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: "#6b7280", maxRotation: 45, minRotation: 0, autoSkip: true, maxTicksLimit: 8 },
        },
        y: {
          beginAtZero: false,
          grid: { color: "#e5e7eb" },
          ticks: { color: "#6b7280" },
        },
      },
    },
  };
}

/** Render PNG via QuickChart POST. Returns base64 data URL. */
export async function renderQuickChartPng(opts: QuickChartSeriesOptions): Promise<string> {
  const width = opts.width ?? 800;
  const height = opts.height ?? 400;
  const chartConfig = buildChartJsConfig(opts);

  const body: Record<string, unknown> = {
    width,
    height,
    format: "png",
    backgroundColor: "#ffffff",
    devicePixelRatio: 2,
    version: "4",
    chart: chartConfig,
  };

  const apiKey = config.quickChart.apiKey?.trim();
  if (apiKey) body.key = apiKey;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(QUICKCHART_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`QuickChart HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100) throw new Error("QuickChart returned empty image");
    return `data:image/png;base64,${buf.toString("base64")}`;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Build chart-img.com v2 Advanced Chart JSON bodies (studies + drawings).
 */

import type {
  BuildChartImgRequestOptions,
  ChartImgAdvancedChartBody,
  ChartImgBias,
  ChartImgDrawing,
  ChartImgPriceLevels,
} from './types.js';

/** 4:3 export size (matches legacy analysis chart cards). */
export const CHART_IMG_EXPORT_WIDTH = 1280;
export const CHART_IMG_EXPORT_HEIGHT = 960;

/** Fewer visible bars — scroll chart left (chart-img shiftLeft, max 1000). */
export const CHART_IMG_DEFAULT_SHIFT_LEFT = 90;

/**
 * chart-img PRO: max studies[] + drawings[] per request (see chart-img Parameter Limit).
 * BASIC=3, PRO=5, MEGA=10, …
 */
export const CHART_IMG_MAX_STUDIES_PLUS_DRAWINGS = 5;

// Match TradingView-ish level colors used in the terminal UI.
// Green: TV "green" (approx #26a69a), Red: TV "red" (approx #ef5350)
const COLOR_SUPPORT = 'rgb(38,166,154)';
const COLOR_RESISTANCE = 'rgb(239,83,80)';
const COLOR_ENTRY = 'rgb(66,165,245)'; // blue
const COLOR_STOP = 'rgb(239,83,80)';
const COLOR_TARGET = 'rgb(38,166,154)';

function parseLevel(v: number | string | undefined): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.-]/g, ''));
  if (!isFinite(n) || n <= 0) return undefined;
  return n;
}

function horizontalLine(
  price: number,
  color: string,
  label: string | undefined,
  lineWidth = 2
): ChartImgDrawing {
  return {
    name: 'Horizontal Line',
    input: {price},
    override: {
      lineWidth,
      lineColor: color,
      ...(label
        ? {
            // TradingView horizontal line supports a text label; chart-img passes overrides through.
            text: label,
            showLabel: true,
            showPrice: true,
            textColor: color,
          }
        : {}),
    },
    zOrder: 'top',
  };
}

function buildLevelDrawings(
  levels: ChartImgPriceLevels | undefined,
  bias: ChartImgBias
): ChartImgDrawing[] {
  const drawings: ChartImgDrawing[] = [];
  if (!levels) return drawings;

  const support = parseLevel(levels.support);
  const resistance = parseLevel(levels.resistance);
  const entry = parseLevel(levels.entry);
  const stop = parseLevel(levels.stopLoss);
  const target = parseLevel(levels.takeProfit);

  if (bias === 'neutral') {
    if (support != null) drawings.push(horizontalLine(support, COLOR_SUPPORT, 'Support'));
    if (resistance != null) drawings.push(horizontalLine(resistance, COLOR_RESISTANCE, 'Resistance'));
    return drawings;
  }

  if (entry != null) drawings.push(horizontalLine(entry, COLOR_ENTRY, 'Entry'));
  if (stop != null) drawings.push(horizontalLine(stop, COLOR_STOP, 'Stop loss'));
  if (target != null) drawings.push(horizontalLine(target, COLOR_TARGET, 'Target'));

  if (support != null && !drawings.some((d) => d.input.price === support)) {
    drawings.push(horizontalLine(support, COLOR_SUPPORT, 'Support', 1));
  }
  if (resistance != null && !drawings.some((d) => d.input.price === resistance)) {
    drawings.push(horizontalLine(resistance, COLOR_RESISTANCE, 'Resistance', 1));
  }

  return drawings;
}

/** Studies in priority order (caller slices to fit plan limit). */
function allStudiesCandidates(): NonNullable<ChartImgAdvancedChartBody['studies']> {
  return [
    {name: 'Volume', forceOverlay: true},
    {
      name: 'MACD',
      override: {
        'Signal.linewidth': 2,
        'Signal.color': 'rgb(255,65,129)',
      },
    },
    {name: 'Relative Strength Index'},
    {
      name: 'Moving Average Exponential',
      forceOverlay: true,
      input: {length: 21},
      override: {'Plot.linewidth': 2, 'Plot.color': 'rgb(120,123,134)'},
    },
  ];
}

/**
 * Fit studies + drawings within chart-img plan cap (trade levels prioritized).
 */
export function allocateStudiesAndDrawings(
  levels: ChartImgPriceLevels | undefined,
  bias: ChartImgBias,
  maxTotal: number = CHART_IMG_MAX_STUDIES_PLUS_DRAWINGS
): {studies: ChartImgAdvancedChartBody['studies']; drawings: ChartImgDrawing[]} {
  const allDrawings = buildLevelDrawings(levels, bias);
  const maxDrawings = Math.min(allDrawings.length, Math.max(0, maxTotal - 1));
  const drawings = allDrawings.slice(0, maxDrawings);

  let slots = maxTotal - drawings.length;
  const studies: NonNullable<ChartImgAdvancedChartBody['studies']> = [];
  for (const study of allStudiesCandidates()) {
    if (slots <= 0) break;
    studies.push(study);
    slots -= 1;
  }

  return {studies, drawings};
}

export function normalizeChartBias(bias: string | undefined): ChartImgBias {
  const b = String(bias || '').toLowerCase();
  if (b === 'bullish' || b === 'long') return 'long';
  if (b === 'bearish' || b === 'short') return 'short';
  if (b === 'neutral' || b === 'wait') return 'neutral';
  return 'unknown';
}

/** Normalize hex or rgb strings to chart-img `rgb(r,g,b)` Color format. */
export function toChartImgRgbColor(color: string): string {
  const s = color.trim();
  if (/^rgb\(/i.test(s)) return s;
  const hex = s.replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgb(${r},${g},${b})`;
  }
  return s;
}

/** Chart-IMG v2 candleStyle overrides when branded up/down colors are supplied. */
export function buildCandleStyleOverrides(upColor: string, downColor: string): Record<string, unknown> {
  const up = toChartImgRgbColor(upColor);
  const down = toChartImgRgbColor(downColor);
  return {
    "candleStyle.upColor": up,
    "candleStyle.downColor": down,
    "candleStyle.borderUpColor": up,
    "candleStyle.borderDownColor": down,
    "candleStyle.wickUpColor": up,
    "candleStyle.wickDownColor": down,
    "candleStyle.drawWick": true,
    "candleStyle.drawBody": true,
    "candleStyle.drawBorder": true,
  };
}

/**
 * Assemble the POST body for chart-img v2 `/tradingview/advanced-chart`.
 */
export function buildChartImgAdvancedChartBody(
  options: BuildChartImgRequestOptions
): ChartImgAdvancedChartBody {
  const width = options.width ?? CHART_IMG_EXPORT_WIDTH;
  const height = options.height ?? CHART_IMG_EXPORT_HEIGHT;
  const bias = options.bias ?? 'unknown';
  const theme = options.theme ?? 'dark';
  const candleStyleOverrides =
    options.candleUpColor && options.candleDownColor
      ? buildCandleStyleOverrides(options.candleUpColor, options.candleDownColor)
      : null;

  return {
    symbol: options.tradingViewSymbol,
    interval: options.interval,
    width,
    height,
    theme,
    style: 'candle',
    scale: options.scale ?? 'regular',
    shiftLeft: options.shiftLeft ?? CHART_IMG_DEFAULT_SHIFT_LEFT,
    format: 'png',
    override: {
      showStudyLastValue: false,
      showLegendValues: true,
      showSymbolWatermark: false,
      showVertGrid: true,
      showHorzGrid: true,
      mainPaneHeight: Math.round(height * 0.58),
      ...(candleStyleOverrides ? { style: candleStyleOverrides } : {}),
    },
    ...allocateStudiesAndDrawings(options.levels, bias),
  };
}

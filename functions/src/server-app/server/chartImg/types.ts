/**
 * chart-img.com v2 Advanced Chart — shared request types for client + Cloud Functions.
 */

export type ChartImgAssetCategory =
  | 'forex'
  | 'crypto'
  | 'commodities'
  | 'indices'
  | 'equity'
  | 'etf'
  | 'hkstocks';

export type ChartImgBias = 'long' | 'short' | 'neutral' | 'unknown';

/** Price levels drawn on the snapshot (S/R or trade plan). */
export interface ChartImgPriceLevels {
  entry?: number;
  stopLoss?: number;
  takeProfit?: number;
  support?: number;
  resistance?: number;
}

export interface ChartImgStudy {
  name: string;
  forceOverlay?: boolean;
  input?: Record<string, unknown>;
  override?: Record<string, unknown>;
}

export interface ChartImgDrawing {
  name: string;
  input: Record<string, unknown>;
  override?: Record<string, unknown>;
  zOrder?: 'top' | 'bottom';
}

export interface ChartImgAdvancedChartBody {
  symbol: string;
  interval: string;
  width: number;
  height: number;
  theme: 'dark' | 'light';
  style: string;
  scale?: 'regular' | 'percent' | 'indexedTo100' | 'logarithmic';
  shiftLeft?: number;
  shiftRight?: number;
  timezone?: string;
  format?: 'png' | 'jpeg';
  override?: Record<string, unknown>;
  studies?: ChartImgStudy[];
  drawings?: ChartImgDrawing[];
}

export type ChartImgTheme = 'dark' | 'light';

export interface BuildChartImgRequestOptions {
  tradingViewSymbol: string;
  /** chart-img interval, e.g. 1h, 4h, 1D */
  interval: string;
  levels?: ChartImgPriceLevels;
  bias?: ChartImgBias;
  width?: number;
  height?: number;
  scale?: ChartImgAdvancedChartBody['scale'];
  shiftLeft?: number;
  shiftRight?: number;
  /** TradingView chart theme (dark = black background, light = white). */
  theme?: ChartImgTheme;
  /** Optional branded candle up/down colors (ATFX research + articles only). */
  candleUpColor?: string;
  candleDownColor?: string;
}

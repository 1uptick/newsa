/**
 * Map app chart timeframes to chart-img / TradingView interval strings.
 */

import type { ChartImgAssetCategory } from './types.js';
import { isB3UiSymbol } from './tradingViewSymbol.js';

const UI_TO_CHART_IMG: Record<string, string> = {
  '5min': '5m',
  '15min': '15m',
  '30min': '30m',
  '1hour': '1h',
  '4hour': '4h',
  '1day': '1D',
  '1week': '1W',
};

/** Quick-analysis modal uses shorthand `1h` / `1d`. */
const QA_TO_CHART_IMG: Record<string, string> = {
  '1h': '1h',
  '1d': '1D',
};

export function uiTimeframeToChartImgInterval(tf: string | undefined): string {
  const key = String(tf || '').trim().toLowerCase();
  if (QA_TO_CHART_IMG[key]) return QA_TO_CHART_IMG[key];
  return UI_TO_CHART_IMG[key] || '1h';
}

/** Prefer symbol suffix over terminal label (HK names often use terminal `usstocks`). */
export function chartImgAssetCategoryForSymbol(
  symbol: string,
  terminal?: string,
): ChartImgAssetCategory {
  const s = String(symbol || '').trim().toUpperCase();
  if (/\.HK$/i.test(s) || /^\d{1,5}\.HK$/i.test(s)) return 'hkstocks';
  if (isB3UiSymbol(s)) return 'equity';
  return terminalToChartImgAssetCategory(terminal);
}

export function terminalToChartImgAssetCategory(terminal: string | undefined): ChartImgAssetCategory {
  const t = String(terminal || '').trim().toLowerCase();
  switch (t) {
  case 'forex':
    return 'forex';
  case 'crypto':
    return 'crypto';
  case 'commodities':
    return 'commodities';
  case 'indices':
    return 'indices';
  case 'hkstocks':
    return 'hkstocks';
  case 'etf':
    return 'etf';
  case 'equity':
  case 'usstocks':
  case 'stocks':
  case 'stock':
    return 'equity';
  default:
    return 'equity';
  }
}

export function quickAnalysisAssetTypeToCategory(
  assetType: string | undefined
): ChartImgAssetCategory {
  switch (String(assetType || '').trim().toLowerCase()) {
  case 'indices':
  case 'index':
    return 'indices';
  case 'forex':
    return 'forex';
  case 'crypto':
    return 'crypto';
  case 'commodities':
  case 'commodity':
    return 'commodities';
  default:
    return 'equity';
  }
}

/** Sensible default timezone for chart-img snapshots. */
export function timezoneForAssetCategory(category: ChartImgAssetCategory): string {
  switch (category) {
  case 'forex':
  case 'crypto':
  case 'commodities':
    return 'Etc/UTC';
  case 'hkstocks':
    return 'Asia/Hong_Kong';
  case 'equity':
  case 'etf':
    return 'America/New_York';
  case 'indices':
    return 'America/New_York';
  default:
    return 'Etc/UTC';
  }
}

/** Timezone for chart-img; uses symbol when venue overrides category (e.g. B3 under equity). */
export function timezoneForChartSymbol(
  category: ChartImgAssetCategory,
  symbol?: string
): string {
  if (symbol && isB3UiSymbol(symbol)) return 'America/Sao_Paulo';
  return timezoneForAssetCategory(category);
}

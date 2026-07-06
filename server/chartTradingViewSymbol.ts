/**
 * Re-exports TradingView / chart-img symbol resolution from the 1uptick chartImg module.
 * @deprecated Import from `./chartImg/tradingViewSymbol.js` directly.
 */
export {
  COMMODITY_TV_FALLBACK_CANDIDATES,
  INDEX_TV_FALLBACK_CANDIDATES,
  isB3UiSymbol,
  parseB3Ticker,
  uiSymbolToTradingViewSymbol,
} from "./chartImg/tradingViewSymbol.js";

export type { ChartImgAssetCategory } from "./chartImg/types.js";

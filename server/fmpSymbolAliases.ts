/**
 * Single source of truth for UI-symbol → FMP-symbol resolution.
 *
 * Used by:
 *   - server: `functions/src/fmpProxyCallable.ts` (dashboard quotes, watchlist quotes)
 *   - server: `functions/src/shared/fmpQuickAnalysisChartSymbol.ts` (chart OHLC fallbacks)
 *   - client: `services/financialModelingPrepService.ts` (direct-mode chart/quote)
 *
 * Why this exists:
 *   The app exposes a small set of friendly tickers in presets / hero quick-links / hardcoded
 *   defaults (e.g. `WHEAT`, `WTIOILUSD`, `CRUDE`, `USDT`, `BNB`, `SPX`) that DO NOT exist as
 *   rows in the Supabase symbols table — Supabase only carries FMP-canonical tickers
 *   (`KEUSX`, `CLUSD`, `BZUSD`, `USDTUSD`, `BNBUSD`, `^GSPC`). When those friendly tickers
 *   are sent unchanged to FMP they either return nothing (USDT, BNB, WHEAT) or — worse —
 *   return an unrelated US equity/ETF (XRP → Bitwise XRP ETF, SOL → Emeren Group, BTC →
 *   Grayscale Bitcoin Trust). This module bridges that gap with a deterministic, ordered
 *   list of variant symbols to try against FMP.
 *
 * Rule of thumb when adding entries:
 *   - Put the FMP-canonical symbol(s) FIRST. They must be lookup-equivalents that FMP's
 *     batch endpoints (`batch-commodity-quotes`, `batch-crypto-quotes`, `batch-index-quotes`)
 *     return as `symbol`.
 *   - The bare/raw user-side symbol is included as the last fallback only when it cannot
 *     collide with an unrelated US ticker (e.g. crypto bare tickers MUST NOT be tried).
 */

function uniqPushTo(arr: string[], ...vals: string[]): void {
  for (const v of vals) {
    const s = String(v || '').trim().toUpperCase();
    if (!s) continue;
    if (!arr.includes(s)) arr.push(s);
  }
}

/**
 * UI/display commodity tickers → FMP commodity symbols (per Supabase `symbols` table).
 * Verified against the production Supabase commodity rows (CLUSD, BZUSD, NGUSD, HOUSD,
 * RBUSD, GCUSD, SIUSD, HGUSD, PLUSD, PAUSD, KEUSX, ZCUSX, KCUSX, CTUSX, SBUSX, ZSUSX,
 * LEUSX, HEUSX, CCUSD, ALIUSD, …).
 */
const COMMODITY_DISPLAY_TO_FMP: Record<string, string[]> = {
  // Energy
  WTIOILUSD: ['CLUSD', 'WTIUSD', 'OILUSD'],
  BRENTOILUSD: ['BZUSD', 'BRENTUSD'],
  CRUDE: ['CLUSD', 'WTIUSD'],
  WTI: ['CLUSD', 'WTIUSD'],
  BRENT: ['BZUSD', 'BRENTUSD'],
  // Some flows use the explicit USD suffix already (e.g. "BRENTUSD"); ensure it still maps to FMP canonical.
  BRENTUSD: ['BZUSD', 'BRENTUSD'],
  NATGAS: ['NGUSD', 'NATGASUSD'],
  NATURALGAS: ['NGUSD', 'NATGASUSD'],
  HEATINGOIL: ['HOUSD'],
  HEATINGOILFUTURES: ['HOUSD'],
  GASOLINE: ['RBUSD'],
  /** COT / terminal root — bare `HO` is not a valid FMP quote ticker. */
  HO: ['HOUSD'],
  // Metals
  COPPER: ['HGUSD'],
  /** COT root for copper — bare `HG` is a US equity on FMP; never quote as HG. */
  HG: ['HGUSD'],
  /** COT root for gold futures — bare `GC` collides with unrelated FMP tickers. */
  GC: ['GCUSD'],
  /** Spot gold/silver (default when user says "gold" / "silver"). */
  GOLD: ['XAUUSD', 'GCUSD'],
  GOLDFUTURES: ['GCUSD'],
  GCUSD: ['GCUSD'],
  XAU: ['XAUUSD'],
  XAUUSD: ['XAUUSD'],
  SILVER: ['XAGUSD', 'SIUSD'],
  SILVERFUTURES: ['SIUSD'],
  SIUSD: ['SIUSD'],
  XAG: ['XAGUSD'],
  XAGUSD: ['XAGUSD'],
  PLATINUM: ['PLUSD', 'XPTUSD'],
  PALLADIUM: ['PAUSD', 'XPDUSD'],
  ALUMINUM: ['ALIUSD'],
  ALUMINIUM: ['ALIUSD'],
  // Grains
  WHEAT: ['KEUSX', 'ZWUSD', 'WHEATUSD'],
  CORN: ['ZCUSX', 'ZCUSD', 'CORNUSD'],
  SOY: ['ZSUSX', 'ZSUSD', 'SOYUSD', 'SOYBEANUSD'],
  SOYBEAN: ['ZSUSX', 'ZSUSD', 'SOYUSD', 'SOYBEANUSD'],
  SOYBEANS: ['ZSUSX', 'ZSUSD', 'SOYUSD', 'SOYBEANUSD'],
  OAT: ['ZOUSX'],
  OATS: ['ZOUSX'],
  RICE: ['ZRUSD'],
  // Softs
  SUGAR: ['SBUSX', 'SBUSD', 'SUGARUSD'],
  COTTON: ['CTUSX', 'CTUSD', 'COTTONUSD'],
  COCOA: ['CCUSD', 'COCOAUSD'],
  COFFEE: ['KCUSX', 'KCUSD', 'COFFEEUSD'],
  ARABICACOFFEE: ['KCUSX', 'KCUSD', 'COFFEEUSD'],
  ARABICA: ['KCUSX', 'KCUSD', 'COFFEEUSD'],
  ORANGEJUICE: ['OJUSX'],
  // Livestock
  LIVECATTLE: ['LEUSX', 'LEUSD'],
  CATTLE: ['LEUSX', 'LEUSD'],
  FEEDERCATTLE: ['GFUSX'],
  LEANHOGS: ['HEUSX', 'HEUSD'],
  HOGS: ['HEUSX', 'HEUSD'],
  LUMBER: ['LBUSD'],
  MILK: ['DCUSD'],
};

/**
 * Ordered candidate FMP symbols for a UI commodity ticker.
 * The original normalized input is included so already-canonical entries (CLUSD, KEUSX, …) keep working.
 */
/**
 * Bare commodity COT roots that collide with US equities on FMP `/quote` (e.g. HG = Hamilton Insurance).
 * Never use these as direct FMP quote symbols — always map via {@link COMMODITY_DISPLAY_TO_FMP} first.
 */
const COMMODITY_BARE_QUOTE_COLLISIONS = new Set([
  'HG', 'CL', 'NG', 'GC', 'SI', 'PL', 'PA', 'RB', 'HO', 'BZ', 'KC', 'ZC', 'ZS', 'CT', 'SB', 'CC',
  'LE', 'HE', 'GF', 'OJ', 'LB', 'DC', 'ALI',
]);

export function commodityAliasCandidates(norm: string): string[] {
  const n = String(norm || '').trim().toUpperCase();
  const out: string[] = [];
  // Display-name aliases first so user-side symbols (WHEAT, WTIOILUSD, …) hit FMP-canonical symbols
  // before we waste a /quote on the literal user string (which FMP often misroutes).
  if (COMMODITY_DISPLAY_TO_FMP[n]) uniqPushTo(out, ...COMMODITY_DISPLAY_TO_FMP[n]);
  if (!COMMODITY_BARE_QUOTE_COLLISIONS.has(n)) {
    uniqPushTo(out, n);
  }

  // ...USD with a long base — also try the bare base (e.g. BRENTUSD → BRENT).
  if (n.endsWith('USD') && n.length > 6) {
    const base = n.slice(0, -3);
    if (!COMMODITY_BARE_QUOTE_COLLISIONS.has(base)) uniqPushTo(out, base);
  }
  return out;
}

/** FMP-canonical commodity ticker for terminal/chart/quote (e.g. HG → HGUSD, COPPER → HGUSD). */
export function canonicalCommoditySymbol(symbol: string): string {
  const n = String(symbol || '')
    .trim()
    .toUpperCase()
    .replace(/[/\s]/g, '')
    .replace(/FUTURES?$/i, '');
  if (!n) return '';
  const candidates = commodityAliasCandidates(n);
  const preferred = candidates.find((c) => c.endsWith('USD') || c.endsWith('USX'));
  return preferred || candidates[0] || n;
}

const FMP_COMMODITY_CANONICAL = new Set<string>(
  Object.values(COMMODITY_DISPLAY_TO_FMP).flat()
);

/** True when the UI ticker should use commodity chart / FMP resolution (not equity forex, etc.). */
export function isCommodityUiSymbol(symbol: string): boolean {
  const n = String(symbol || '')
    .trim()
    .toUpperCase()
    .replace(/[/\s]/g, '')
    .replace(/FUTURES?$/i, '');
  if (!n) return false;
  if (COMMODITY_DISPLAY_TO_FMP[n]) return true;
  const fmp = canonicalCommoditySymbol(n);
  return FMP_COMMODITY_CANONICAL.has(fmp) || fmp.endsWith('USX');
}

/**
 * Crypto MUST use USD-suffixed variants. Bare tickers (`XRP`, `SOL`, `BTC`, `ETH`) are
 * NYSE/ETF tickers in FMP's universe (Bitwise XRP ETF, Emeren Group, Grayscale trusts) and
 * silently return wrong-asset prices when used with `/quote`.
 */
export function cryptoAliasCandidates(norm: string): string[] {
  const n = String(norm || '').trim().toUpperCase();
  if (!n) return [];
  const out: string[] = [];
  if (n.endsWith('USD')) {
    uniqPushTo(out, n);
    return out;
  }
  uniqPushTo(out, `${n}USD`);
  // Stablecoin-tail pairs (BTCUSDT/ETHUSDC) keep their raw form — they're already canonical.
  if (n.endsWith('USDT') || n.endsWith('USDC')) uniqPushTo(out, n);
  return out;
}

/**
 * Index display tickers → FMP `^`-prefixed symbols (and reverse) for both quote and
 * historical-chart endpoints.
 */
const INDEX_DISPLAY_TO_FMP: Record<string, string[]> = {
  SPX: ['^GSPC'],
  SP500: ['^GSPC'],
  SNP500: ['^GSPC'],
  GSPC: ['^GSPC'],
  NDX: ['^IXIC', '^NDX'],
  NASDAQ: ['^IXIC', '^NDX'],
  IXIC: ['^IXIC'],
  DJIA: ['^DJI'],
  DJI: ['^DJI'],
  DOW: ['^DJI'],
  RUT: ['^RUT'],
  RUSSELL: ['^RUT'],
  VIX: ['^VIX'],
  DXY: ['^DXY', 'DX-Y.NYB'],
  DAX: ['^GDAXI'],
  FTSE: ['^FTSE'],
  CAC: ['^FCHI'],
  NIKKEI: ['^N225'],
  N225: ['^N225'],
  HSI: ['^HSI'],
  HANGSENG: ['^HSI'],
  ASX: ['^AXJO'],
  ASX200: ['^AXJO'],
  TSX: ['^GSPTSE'],
  GSPTSE: ['^GSPTSE'],
  KOSPI: ['^KS11'],
  KS11: ['^KS11'],
  SENSEX: ['^BSESN'],
  BSESN: ['^BSESN'],
  TAIEX: ['^TWII'],
  TWII: ['^TWII'],
  STI: ['^STI'],
  IBOVESPA: ['^BVSP'],
  IBOV: ['^BVSP'],
  BVSP: ['^BVSP'],
};

/**
 * Ordered candidate FMP symbols for an index ticker.
 * Mirrors prior behavior in `fmpQuickAnalysisChartSymbol.ts` and the client service.
 */
export function indexAliasCandidates(norm: string): string[] {
  const n = String(norm || '').trim().toUpperCase();
  const out: string[] = [];
  if (INDEX_DISPLAY_TO_FMP[n]) uniqPushTo(out, ...INDEX_DISPLAY_TO_FMP[n]);
  uniqPushTo(out, n);
  if (!n.startsWith('^')) uniqPushTo(out, `^${n}`);
  else if (n.length > 1) uniqPushTo(out, n.slice(1));
  return out;
}

/**
 * UI / fat-finger tickers → FMP-listed symbol (high-confidence only).
 * Keep in sync with `utils/symbol.ts` US_EQUITY_TICKER_TYPOS for client/direct-FMP mode.
 */
const EQUITY_UI_TO_FMP: Record<string, string[]> = {
  MFST: ['MSFT'],
};

/** Ordered FMP candidates for equities, ETFs, HK listings, and generic stocks bucket. */
export function equityAliasCandidates(norm: string): string[] {
  const n = String(norm || '').trim().toUpperCase();
  const out: string[] = [];
  if (EQUITY_UI_TO_FMP[n]) uniqPushTo(out, ...EQUITY_UI_TO_FMP[n]);
  uniqPushTo(out, n);
  return out;
}

/**
 * Convenience wrapper: pick the right alias generator from a watchlist/asset category.
 * Returns the original normalized symbol if no specialized aliasing applies.
 */
export function aliasCandidatesForCategory(norm: string, category: string | undefined | null): string[] {
  const n = String(norm || '').trim().toUpperCase();
  if (!n) return [];
  const cat = String(category || '').trim().toLowerCase();
  if (cat === 'crypto') {
    const c = cryptoAliasCandidates(n);
    return c.length ? c : [n];
  }
  if (cat === 'commodities' || cat === 'commodity') return commodityAliasCandidates(n);
  if (cat === 'indices' || cat === 'index') return indexAliasCandidates(n);
  if (
    cat === 'equity' ||
    cat === 'usstocks' ||
    cat === 'stocks' ||
    cat === 'stock' ||
    cat === 'etf' ||
    cat === 'hkstocks' ||
    cat === 'hkstock' ||
    cat === 'others'
  ) {
    return equityAliasCandidates(n);
  }
  return [n];
}

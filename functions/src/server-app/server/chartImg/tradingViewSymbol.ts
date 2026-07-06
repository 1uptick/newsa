/**
 * Convert UI / FMP symbols to TradingView EXCHANGE:SYMBOL for chart-img.com.
 *
 * FMP and TradingView use different identifiers; this layer is best-effort and
 * may need extension as new asset classes are added.
 */

import { canonicalCommoditySymbol, isCommodityUiSymbol } from "../fmpSymbolAliases.js";
import type { ChartImgAssetCategory } from "./types.js";

/** FMP commodity tickers → TradingView for chart-img. Spot metals use FX spot, not futures. */
const COMMODITY_FMP_TO_TV: Record<string, string> = {
  XAUUSD: 'OANDA:XAUUSD',
  XAGUSD: 'OANDA:XAGUSD',
  GCUSD: 'COMEX:GC1!',
  SIUSD: 'COMEX:SI1!',
  CLUSD: 'NYMEX:CL1!',
  WTIUSD: 'NYMEX:CL1!',
  BZUSD: 'NYMEX:BZ1!',
  NGUSD: 'NYMEX:NG1!',
  HOUSD: 'NYMEX:HO1!',
  RBUSD: 'NYMEX:RB1!',
  HGUSD: 'COMEX:HG1!',
  PLUSD: 'NYMEX:PL1!',
  PAUSD: 'NYMEX:PA1!',
  NIUSD: 'COMEX:NI1!',
};

/** Fallback when FMP ticker is *USD but not listed above (root → continuous future). */
const COMMODITY_USD_ROOT_TO_TV: Record<string, string> = {
  XAU: 'OANDA:XAUUSD',
  XAG: 'OANDA:XAGUSD',
  GC: 'COMEX:GC1!',
  SI: 'COMEX:SI1!',
  CL: 'NYMEX:CL1!',
  WTI: 'NYMEX:CL1!',
  BZ: 'NYMEX:BZ1!',
  NG: 'NYMEX:NG1!',
  HO: 'NYMEX:HO1!',
  RB: 'NYMEX:RB1!',
  HG: 'COMEX:HG1!',
  PL: 'NYMEX:PL1!',
  PA: 'NYMEX:PA1!',
  NI: 'COMEX:NI1!',
};

/**
 * Forex pairs where OANDA:PAIR is wrong or unavailable on TradingView / chart-img.
 * FMP may use USDCNH while UI shows USDCNY — both chart as OANDA:USDCNH.
 */
const FOREX_UI_TO_TV: Record<string, string> = {
  USDKRW: 'FX:USDKRW',
  USDCNY: 'OANDA:USDCNH',
  USDCNH: 'OANDA:USDCNH',
  USDTHB: 'FX:USDTHB',
  USDINR: 'FX:USDINR',
  USDIDR: 'FX:USDIDR',
  USDTWD: 'FX:USDTWD',
};

/** US Dollar Index — stored as forex in DB but charts on TVC:DXY, not OANDA. */
const DXY_UI_TO_TV = 'TVC:DXY';

const DXY_UI_ALIASES = new Set([
  'DXY',
  'DX',
  '^DXY',
  'DX=F',
  'DXF',
  'DXY.NYB',
  'DX-Y.NYB',
  'DXYNYB',
]);

/**
 * FMP / UI index tickers → TradingView EXCHANGE:SYMBOL for chart-img.
 * Global majors from market map + user-verified chart-img symbols.
 */
const INDEX_UI_TO_TV: Record<string, string> = {
  // US
  '^GSPC': 'SP:SPX',
  GSPC: 'SP:SPX',
  SPX: 'SP:SPX',
  SP500: 'SP:SPX',
  '^IXIC': 'NASDAQ:IXIC',
  IXIC: 'NASDAQ:IXIC',
  '^NDX': 'IG:NASDAQ',
  NDX: 'IG:NASDAQ',
  '^DJI': 'DJ:DJI',
  DJI: 'DJ:DJI',
  DOW: 'DJ:DJI',
  '^RUT': 'RUSSELL:RUT',
  RUT: 'RUSSELL:RUT',
  '^VIX': 'CBOE:VIX',
  VIX: 'CBOE:VIX',
  '^DXY': 'TVC:DXY',
  DXY: 'TVC:DXY',
  'DX-Y.NYB': 'TVC:DXY',   // FMP's canonical DXY ticker
  // Canada
  '^GSPTSE': 'TSX:TSX',
  GSPTSE: 'TSX:TSX',
  TSX: 'TSX:TSX',
  // UK
  '^FTSE': 'TVC:UKX',
  FTSE: 'TVC:UKX',
  // France
  '^FCHI': 'TVC:CAC40',
  FCHI: 'TVC:CAC40',
  CAC: 'TVC:CAC40',
  CAC40: 'TVC:CAC40',
  // Germany
  '^GDAXI': 'XETR:DAX',
  GDAXI: 'XETR:DAX',
  DAX: 'XETR:DAX',
  // Japan
  '^N225': 'IG:NIKKEI',
  N225: 'IG:NIKKEI',
  NIKKEI: 'IG:NIKKEI',
  // Hong Kong
  '^HSI': 'HSI:HSI',
  HSI: 'HSI:HSI',
  HANGSENG: 'HSI:HSI',
  // Korea
  '^KS11': 'KRX:KOSPI',
  KS11: 'KRX:KOSPI',
  KOSPI: 'KRX:KOSPI',
  // Taiwan
  '^TWII': 'FTSE:TW50',
  TWII: 'FTSE:TW50',
  TAIEX: 'FTSE:TW50',
  // Singapore
  '^STI': 'CITYINDEX:SINGAPOREINDEXCFD',
  STI: 'CITYINDEX:SINGAPOREINDEXCFD',
  // India
  '^BSESN': 'BSE:SENSEX',
  BSESN: 'BSE:SENSEX',
  SENSEX: 'BSE:SENSEX',
  // Australia
  '^AXJO': 'FXPRO:ASX200',
  AXJO: 'FXPRO:ASX200',
  ASX: 'FXPRO:ASX200',
  ASX200: 'FXPRO:ASX200',
  // Brazil
  '^BVSP': 'INDEX:IBOV',
  BVSP: 'INDEX:IBOV',
  IBOVESPA: 'INDEX:IBOV',
  IBOV: 'INDEX:IBOV',
};

/** Extra chart-img candidates when the primary commodity mapping fails (e.g. NYMEX:CL1!). */
export const COMMODITY_TV_FALLBACK_CANDIDATES: Record<string, string[]> = {
  CLUSD: ['TVC:USOIL', 'CAPITALCOM:OIL', 'ICE:CL1!'],
  WTIUSD: ['TVC:USOIL', 'CAPITALCOM:OIL', 'ICE:CL1!'],
  WTI: ['TVC:USOIL', 'CAPITALCOM:OIL', 'ICE:CL1!'],
  CRUDE: ['TVC:USOIL', 'CAPITALCOM:OIL'],
  WTIOILUSD: ['TVC:USOIL', 'CAPITALCOM:OIL'],
  BZUSD: ['TVC:UKOIL', 'ICE:B1!'],
  BRENT: ['TVC:UKOIL'],
  BRENTUSD: ['TVC:UKOIL'],
  NGUSD: ['TVC:NATURALGAS', 'NYMEX:NG1!'],
  NATGAS: ['TVC:NATURALGAS'],
  XAUUSD: ['FX:XAUUSD', 'FOREXCOM:XAUUSD', 'CAPITALCOM:GOLD', 'COMEX:GC1!'],
  XAGUSD: ['FX:XAGUSD', 'FOREXCOM:XAGUSD', 'CAPITALCOM:SILVER', 'COMEX:SI1!'],
};

/** Extra chart-img candidates when the primary index mapping fails. */
export const INDEX_TV_FALLBACK_CANDIDATES: Record<string, string[]> = {
  BSESN: ['TVC:BSESN', 'NSE:BSEINDEX'],
  SENSEX: ['TVC:SENSEX'],
  KS11: ['TVC:KS11'],
  KOSPI: ['TVC:KOSPI'],
  GSPTSE: ['TVC:TSX'],
  TSX: ['TVC:TSX'],
  TWII: ['TVC:TWII', 'TVC:TWSE'],
  TAIEX: ['TVC:TWII'],
  AXJO: ['ASX:ASX', 'TVC:AXJO'],
  ASX: ['ASX:ASX', 'TVC:AXJO'],
  N225: ['TVC:NI225'],
  NIKKEI: ['TVC:NI225'],
  HSI: ['TVC:HSI'],
  STI: ['TVC:STI'],
  FCHI: ['EURONEXT:PX1', 'TVC:CAC40'],
  CAC: ['EURONEXT:PX1'],
  BVSP: ['TVC:IBOV', 'BMFBOVESPA:IBOV'],
  IBOV: ['TVC:IBOV'],
  NDX: ['NASDAQ:NDX', 'TVC:NDX'],
};

const B3_TV_EXCHANGE = 'BMFBOVESPA';

/**
 * FMP exchange suffix → TradingView exchange prefix for chart-img.
 *
 * Covers all major markets worldwide.  Built from live verification against
 * FMP /stable/quote + TradingView symbol reference, May 2026.
 *
 * Suffixes that require special handling (.HK, .T, .SA, .SS, .SZ, .KS, .KQ,
 * .TW, .TWO) have entries here so the general routing path catches them;
 * any suffix not in this map falls through to usEquityToTradingView.
 */
const FMP_SUFFIX_TO_TV: Record<string, { exchange: string; stripSuffix: boolean }> = {
  // ── Asia-Pacific ──────────────────────────────────────────────────────────
  T:   { exchange: 'TSE',      stripSuffix: true  }, // Tokyo
  KS:  { exchange: 'KRX',      stripSuffix: true  }, // Korea Stock Exchange
  KQ:  { exchange: 'KOSDAQ',   stripSuffix: true  }, // KOSDAQ
  TW:  { exchange: 'TWSE',     stripSuffix: true  }, // Taiwan
  TWO: { exchange: 'TPEX',     stripSuffix: true  }, // Taipei OTC
  AX:  { exchange: 'ASX',      stripSuffix: true  }, // Australia
  NZ:  { exchange: 'NZX',      stripSuffix: true  }, // New Zealand
  SI:  { exchange: 'SGX',      stripSuffix: true  }, // Singapore
  BK:  { exchange: 'SET',      stripSuffix: true  }, // Thailand
  JK:  { exchange: 'IDX',      stripSuffix: true  }, // Indonesia
  KL:  { exchange: 'MYX',      stripSuffix: true  }, // Malaysia (Bursa)
  SS:  { exchange: 'SSE',      stripSuffix: true  }, // Shanghai A-shares
  SZ:  { exchange: 'SZSE',     stripSuffix: true  }, // Shenzhen A-shares
  HK:  { exchange: 'HKEX',     stripSuffix: true  }, // Hong Kong (padded in fmpSuffixToTradingView)
  // ── South Asia ────────────────────────────────────────────────────────────
  NS:  { exchange: 'NSE',      stripSuffix: true  }, // India NSE
  BO:  { exchange: 'BSE',      stripSuffix: true  }, // India BSE
  // ── Middle East ───────────────────────────────────────────────────────────
  SR:  { exchange: 'TADAWUL',  stripSuffix: true  }, // Saudi Arabia
  AH:  { exchange: 'ADX',      stripSuffix: true  }, // Abu Dhabi
  DU:  { exchange: 'DFM',      stripSuffix: true  }, // Dubai
  QA:  { exchange: 'QSE',      stripSuffix: true  }, // Qatar
  // ── Europe — Western ─────────────────────────────────────────────────────
  L:   { exchange: 'LSE',      stripSuffix: true  }, // London
  PA:  { exchange: 'EURONEXT', stripSuffix: true  }, // Paris / Euronext
  DE:  { exchange: 'XETR',     stripSuffix: true  }, // Germany XETRA
  MI:  { exchange: 'MIL',      stripSuffix: true  }, // Milan
  AS:  { exchange: 'EURONEXT', stripSuffix: true  }, // Amsterdam
  MC:  { exchange: 'BME',      stripSuffix: true  }, // Madrid
  SW:  { exchange: 'SIX',      stripSuffix: true  }, // Switzerland
  LS:  { exchange: 'EURONEXT', stripSuffix: true  }, // Lisbon
  BR:  { exchange: 'EURONEXT', stripSuffix: true  }, // Brussels
  // ── Europe — Nordic ───────────────────────────────────────────────────────
  OL:  { exchange: 'OSL',      stripSuffix: true  }, // Oslo
  ST:  { exchange: 'STO',      stripSuffix: true  }, // Stockholm
  CO:  { exchange: 'OMXCOP',   stripSuffix: true  }, // Copenhagen
  HE:  { exchange: 'OMXHEX',   stripSuffix: true  }, // Helsinki
  // ── Europe — Eastern ─────────────────────────────────────────────────────
  VI:  { exchange: 'WBAG',     stripSuffix: true  }, // Vienna
  WA:  { exchange: 'GPW',      stripSuffix: true  }, // Warsaw
  AT:  { exchange: 'ATHEX',    stripSuffix: true  }, // Athens
  IS:  { exchange: 'BIST',     stripSuffix: true  }, // Istanbul
  BD:  { exchange: 'BET',      stripSuffix: true  }, // Budapest
  PR:  { exchange: 'PSE',      stripSuffix: true  }, // Prague
  // ── Africa ────────────────────────────────────────────────────────────────
  JO:  { exchange: 'JSE',      stripSuffix: true  }, // Johannesburg
  CA:  { exchange: 'EGX',      stripSuffix: true  }, // Cairo
  // ── Americas ──────────────────────────────────────────────────────────────
  TO:  { exchange: 'TSX',      stripSuffix: true  }, // Toronto
  V:   { exchange: 'TSXV',     stripSuffix: true  }, // TSX Venture
  CN:  { exchange: 'NEO',      stripSuffix: true  }, // Canadian NEO
  SA:  { exchange: 'BMFBOVESPA', stripSuffix: true }, // Brazil B3 (handled by B3 branch but kept for safety)
  BA:  { exchange: 'BCBA',     stripSuffix: true  }, // Buenos Aires
  SN:  { exchange: 'BCS',      stripSuffix: true  }, // Santiago
  MX:  { exchange: 'BMV',      stripSuffix: true  }, // Mexico
  // ── Israel ────────────────────────────────────────────────────────────────
  TA:  { exchange: 'TASE',     stripSuffix: true  }, // Tel Aviv
};

/**
 * Resolve a FMP ticker that includes an exchange suffix (e.g. "BMW.DE", "2330.TW")
 * to its TradingView EXCHANGE:TICKER form.
 * Returns null if the suffix is not in the map (caller should fall through).
 */
function fmpSuffixToTradingView(norm: string): string | null {
  const dot = norm.lastIndexOf('.');
  if (dot < 0) return null;
  const suffix = norm.slice(dot + 1);
  const base   = norm.slice(0, dot);
  const entry  = FMP_SUFFIX_TO_TV[suffix];
  if (!entry) return null;

  // .HK: strip leading zeros except keep minimum 4-digit HK convention
  if (suffix === 'HK') {
    const num = parseInt(base, 10);
    const padded = isNaN(num) || num <= 0 ? base : String(num).padStart(4, '0');
    return `HKEX:${padded}`;
  }

  const ticker = entry.stripSuffix ? base : norm;
  return `${entry.exchange}:${ticker}`;
}

function normalizeUiSymbol(symbol: string): string {
  return String(symbol || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/FUTURES?$/i, '');
}

/**
 * FMP B3 listings use a `.SA` suffix; TradingView uses BMFBOVESPA:PETR4 (no suffix).
 * Bare tickers like B3SA3 / PETR4 (share class digit at end) are also treated as B3.
 */
export function parseB3Ticker(symbol: string): string | null {
  const raw = String(symbol || '').trim().toUpperCase();
  if (!raw) return null;

  if (raw.endsWith('.SA')) {
    const ticker = raw.slice(0, -3);
    return ticker.length >= 4 ? ticker : null;
  }

  // B3 share classes: PETR4, VALE3, ITUB4 (4 letters + digit) …
  if (/^[A-Z]{4}\d{1,2}$/.test(raw)) return raw;
  // Roots with digits (B3SA3, MGLU3) — share class digit at end (3, 4, 5, …).
  if (/^[A-Z0-9]{4}\d$/.test(raw) && /[3456789]$/.test(raw)) return raw;

  return null;
}

export function isB3UiSymbol(symbol: string): boolean {
  return parseB3Ticker(symbol) != null;
}

function b3StockToTradingView(symbol: string): string {
  const ticker = parseB3Ticker(symbol) || normalizeUiSymbol(symbol).replace(/\.SA$/i, '');
  return `${B3_TV_EXCHANGE}:${ticker}`;
}

function isDxyUiSymbol(norm: string): boolean {
  if (DXY_UI_ALIASES.has(norm)) return true;
  const bare = norm.replace(/[^A-Z]/g, '');
  return bare === 'DXYNYB' || bare === 'DXY';
}

function forexToTradingView(norm: string): string {
  if (isDxyUiSymbol(norm)) return DXY_UI_TO_TV;
  const pair = norm.replace(/[^A-Z]/g, '');
  if (FOREX_UI_TO_TV[pair]) return FOREX_UI_TO_TV[pair];
  if (FOREX_UI_TO_TV[norm]) return FOREX_UI_TO_TV[norm];
  if (pair.length === 6) return `OANDA:${pair}`;
  return `OANDA:${norm}`;
}

function cryptoToTradingView(norm: string): string {
  const bare = norm.replace(/[^A-Z0-9]/g, '');
  if (bare.endsWith('USDT')) return `BINANCE:${bare}`;
  if (bare.endsWith('USDC')) return `BINANCE:${bare}`;
  if (bare.endsWith('USD')) {
    const base = bare.slice(0, -3);
    return `BINANCE:${base}USDT`;
  }
  return `BINANCE:${bare}USDT`;
}

function commodityToTradingView(norm: string): string {
  const fmp = canonicalCommoditySymbol(norm) || norm;
  if (COMMODITY_FMP_TO_TV[fmp]) return COMMODITY_FMP_TO_TV[fmp];
  if (fmp.endsWith('USD') && fmp.length > 3) {
    const root = fmp.slice(0, -3);
    if (COMMODITY_USD_ROOT_TO_TV[root]) return COMMODITY_USD_ROOT_TO_TV[root];
  }
  return `TVC:${fmp}`;
}

function isLikelyFmpIndexSymbol(norm: string): boolean {
  if (!norm) return false;
  if (norm.startsWith('^')) return true;
  if (INDEX_UI_TO_TV[norm] || INDEX_UI_TO_TV[`^${norm}`]) return true;
  return false;
}

function indexToTradingView(norm: string): string {
  if (INDEX_UI_TO_TV[norm]) return INDEX_UI_TO_TV[norm];
  const bare = norm.startsWith('^') ? norm.slice(1) : norm;
  if (INDEX_UI_TO_TV[bare]) return INDEX_UI_TO_TV[bare];
  if (INDEX_UI_TO_TV[`^${bare}`]) return INDEX_UI_TO_TV[`^${bare}`];
  return `TVC:${bare}`;
}

function hkStockToTradingView(norm: string): string {
  let s = norm.replace(/\.HK$/i, '');
  s = s.replace(/^0+/, '') || s;
  if (/^\d+$/.test(s)) return `HKEX:${s}`;
  if (s.endsWith('.HK')) return hkStockToTradingView(s);
  return `HKEX:${s}`;
}


/** US-listed tickers without exchange suffix → NASDAQ (v2); ETFs often on AMEX. */
function usEquityToTradingView(norm: string): string {
  const etfTickers = new Set([
    'SPY', 'QQQ', 'IWM', 'DIA', 'VOO', 'VTI', 'GLD', 'SLV', 'TLT', 'HYG', 'XLF', 'XLE', 'XLK',
  ]);
  const nysePreferred = new Set(['NET', 'BRK', 'BRKB']);
  if (etfTickers.has(norm)) return `AMEX:${norm}`;
  if (nysePreferred.has(norm)) return `NYSE:${norm}`;
  if (/^[A-Z]{1,5}$/.test(norm)) return `NASDAQ:${norm}`;
  return `NASDAQ:${norm}`;
}

/**
 * Resolve a UI symbol + asset category to a TradingView symbol for chart-img.
 */
export function uiSymbolToTradingViewSymbol(
  symbol: string,
  assetCategory: ChartImgAssetCategory
): string {
  const norm = normalizeUiSymbol(symbol);
  if (!norm) return 'BINANCE:BTCUSDT';

  // Commodity tickers must chart as futures even when category/terminal is wrong (e.g. GOLD → equity).
  if (isCommodityUiSymbol(symbol)) {
    return commodityToTradingView(norm);
  }

  // B3 / Bovespa (FMP `.SA`) must not route to NASDAQ — chart as BMFBOVESPA:PETR4.
  if (isB3UiSymbol(symbol)) {
    return b3StockToTradingView(symbol);
  }

  // FMP indices are often stored as ^GSPC / ^BSESN regardless of category label.
  if (isLikelyFmpIndexSymbol(norm)) {
    return indexToTradingView(norm);
  }

  // ── Global exchange-suffix routing ────────────────────────────────────────
  // Any FMP ticker with a recognised exchange suffix (e.g. BMW.DE, 2330.TW,
  // RELIANCE.NS) is mapped to the correct TradingView EXCHANGE:TICKER form.
  // This runs before the asset-category switch so it takes priority.
  const suffixTv = fmpSuffixToTradingView(norm);
  if (suffixTv) return suffixTv;

  switch (assetCategory) {
  case 'forex':
    return forexToTradingView(norm);
  case 'crypto':
    return cryptoToTradingView(norm);
  case 'commodities':
    return commodityToTradingView(norm);
  case 'indices':
    return indexToTradingView(norm);
  case 'hkstocks':
    return hkStockToTradingView(norm);
  case 'etf':
    return usEquityToTradingView(norm);
  case 'equity':
    if (/^\d{1,5}$/.test(norm)) {
      // Bare numeric without suffix — default to HK
      return hkStockToTradingView(`${norm}.HK`);
    }
    return usEquityToTradingView(norm);
  default:
    return usEquityToTradingView(norm);
  }
}

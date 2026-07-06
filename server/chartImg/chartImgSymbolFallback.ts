/**
 * TradingView symbol resolution with ordered fallbacks when chart-img rejects a symbol.
 */

import { buildChartImgAdvancedChartBody } from "./chartImgRequest.js";
import type { ChartImgAssetCategory, ChartImgPriceLevels } from "./types.js";
import {
  COMMODITY_TV_FALLBACK_CANDIDATES,
  INDEX_TV_FALLBACK_CANDIDATES,
  isB3UiSymbol,
  parseB3Ticker,
  uiSymbolToTradingViewSymbol,
} from "./tradingViewSymbol.js";

const CHART_IMG_V2_URL = 'https://api.chart-img.com/v2/tradingview/advanced-chart';

export type ChartImgFetchBody = ReturnType<typeof buildChartImgAdvancedChartBody>;

function uniqPush(out: string[], ...vals: string[]): void {
  for (const v of vals) {
    const s = String(v || '').trim();
    if (!s || out.includes(s)) continue;
    out.push(s);
  }
}

/** chart-img HTTP 429 / plan quota errors — retry after a delay, do not try symbol fallbacks. */
export function isChartImgRateLimitError(message: string): boolean {
  const m = String(message || '').toLowerCase();
  if (!m) return false;
  return (
    m.includes('limit exceeded') ||
    m.includes('rate limit') ||
    m.includes('too many requests') ||
    m.includes('http 429') ||
    m.includes('429')
  );
}

/** chart-img / TradingView errors that may succeed with a different EXCHANGE:SYMBOL prefix. */
export function isChartImgSymbolMismatchError(message: string): boolean {
  const m = String(message || '').toLowerCase();
  if (!m) return false;
  return (
    m.includes('invalid symbol') ||
    m === 'invalid symbol' ||
    m.includes('symbol is invalid') ||
    m.includes('unknown symbol') ||
    m.includes('symbol not found') ||
    m.includes('no such symbol') ||
    (m.includes('symbol') && m.includes('not found')) ||
    (m.includes('symbol') && m.includes('does not exist'))
  );
}

/**
 * Ordered TradingView symbols to try for chart-img (primary first).
 */
export function getTradingViewSymbolCandidates(
  symbol: string,
  assetCategory: ChartImgAssetCategory
): string[] {
  const primary = uiSymbolToTradingViewSymbol(symbol, assetCategory);
  const out: string[] = [primary];

  if (isB3UiSymbol(symbol)) {
    appendB3SymbolCandidates(out, symbol);
  } else if (assetCategory === 'forex') {
    appendForexSymbolCandidates(out, symbol, primary);
  } else if (assetCategory === 'commodities') {
    appendCommoditySymbolCandidates(out, symbol, primary);
  } else if (assetCategory === 'indices') {
    appendIndexSymbolCandidates(out, symbol, primary);
  } else if (assetCategory === 'crypto') {
    appendCryptoSymbolCandidates(out, symbol, primary);
  } else if (assetCategory === 'equity' || assetCategory === 'etf') {
    appendUsEquitySymbolCandidates(out, symbol, primary);
    if (/\.HK$/i.test(String(symbol || '').trim())) {
      appendHkSymbolCandidates(out, symbol);
    }
  } else if (assetCategory === 'hkstocks') {
    appendHkSymbolCandidates(out, symbol);
  }

  return out;
}

function appendHkSymbolCandidates(out: string[], symbol: string): void {
  const norm = String(symbol || '').trim().toUpperCase().replace(/\s+/g, '');
  const bare = norm.replace(/\.HK$/i, '');
  const num = parseInt(bare, 10);
  if (!Number.isFinite(num) || num <= 0) return;
  const padded = String(num).padStart(4, '0');
  const unpadded = String(num);
  uniqPush(
    out,
    `HKEX:${padded}`,
    `HKEX:${unpadded}`,
    `SEHK:${padded}`,
    `HKG:${padded}`,
  );
}

function appendB3SymbolCandidates(out: string[], symbol: string): void {
  const ticker = parseB3Ticker(symbol);
  if (!ticker) return;
  uniqPush(
    out,
    `BMFBOVESPA:${ticker}`,
    `BOVESPA:${ticker}`,
    `BMFBOVESPA:${ticker}.SA`
  );
}

function normalizePair(symbol: string): string {
  return String(symbol || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
}

function appendForexSymbolCandidates(
  out: string[],
  symbol: string,
  primary: string
): void {
  const pair = normalizePair(symbol);
  if (pair.length !== 6) return;

  const base = pair.slice(0, 3);
  const quote = pair.slice(3, 6);

  uniqPush(out, `FX:${pair}`, `OANDA:${pair}`);

  if (quote === 'CNY') {
    uniqPush(out, `OANDA:${base}CNH`, `FX:${base}CNH`);
  }
  if (quote === 'CNH') {
    uniqPush(out, `OANDA:${base}CNY`, `FX:${base}CNY`);
  }

  // Some EM / cross pairs chart on FX: but not OANDA: (e.g. USDKRW).
  if (quote === 'KRW' || quote === 'TWD' || quote === 'INR' || quote === 'IDR') {
    uniqPush(out, `FX:${pair}`);
  }

  // Generic last-resort (occasionally works for macro indices masquerading as FX).
  if (!primary.startsWith('TVC:')) {
    uniqPush(out, `TVC:${pair}`);
  }
}

function appendCommoditySymbolCandidates(out: string[], symbol: string, primary: string): void {
  const raw = String(symbol || '').trim().toUpperCase().replace(/\s+/g, '');
  const bare = raw.replace(/^\^/, '');
  const extras =
    COMMODITY_TV_FALLBACK_CANDIDATES[bare] ||
    COMMODITY_TV_FALLBACK_CANDIDATES[raw];
  if (extras?.length) uniqPush(out, ...extras);

  const colon = primary.indexOf(':');
  if (colon < 0) return;
  const exchange = primary.slice(0, colon);
  const ticker = primary.slice(colon + 1);
  if (exchange === 'TVC' && ticker.endsWith('USD')) {
    const root = ticker.slice(0, -3);
    uniqPush(
      out,
      `NYMEX:${root}1!`,
      `COMEX:${root}1!`,
      `ICE:${root}1!`
    );
  }
}

function appendIndexSymbolCandidates(
  out: string[],
  symbol: string,
  _primary: string
): void {
  const raw = String(symbol || '').trim().toUpperCase().replace(/\s+/g, '');
  const bare = raw.replace(/^\^/, '');
  const extras = INDEX_TV_FALLBACK_CANDIDATES[bare] || INDEX_TV_FALLBACK_CANDIDATES[raw];
  if (extras?.length) uniqPush(out, ...extras);
  if (!bare.startsWith('TVC')) {
    uniqPush(out, `TVC:${bare}`);
  }
}

function appendCryptoSymbolCandidates(
  out: string[],
  symbol: string,
  primary: string
): void {
  const bare = normalizePair(symbol);
  if (primary.startsWith('BINANCE:')) {
    uniqPush(out, `COINBASE:${bare}`, `BITSTAMP:${bare}`);
  }
}

function appendUsEquitySymbolCandidates(
  out: string[],
  symbol: string,
  primary: string
): void {
  const bare = normalizePair(symbol);
  if (!bare || bare.length > 5) return;
  if (primary.startsWith('NASDAQ:')) {
    uniqPush(out, `NYSE:${bare}`, `AMEX:${bare}`);
  } else if (primary.startsWith('NYSE:')) {
    uniqPush(out, `NASDAQ:${bare}`, `AMEX:${bare}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchChartImgPngOnce(
  body: ChartImgFetchBody,
  apiKey: string
): Promise<Buffer> {
  const res = await fetch(CHART_IMG_V2_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'content-type': 'application/json',
      accept: 'image/png,application/json',
    },
    body: JSON.stringify(body),
  });

  const contentType = res.headers.get('content-type') || '';
  if (!res.ok || contentType.includes('application/json')) {
    let detail = `HTTP ${res.status}`;
    try {
      const errJson = (await res.json()) as {message?: string; error?: string};
      detail = errJson.message || errJson.error || detail;
    } catch {
      try {
        detail = await res.text();
      } catch {
        /* ignore */
      }
    }
    if (res.status === 429) {
      detail = detail.includes('429') ? detail : `Limit Exceeded (HTTP 429)`;
    }
    throw new Error(`chart-img request failed: ${detail}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 256) {
    throw new Error('chart-img returned an empty or invalid image');
  }
  return buf;
}

export interface FetchChartImgPngOptions {
  /** Retries on 429 / "Limit Exceeded" (default 6). */
  maxRateLimitRetries?: number;
  /** First backoff wait in ms (default 10s, doubles each retry, cap 2 min). */
  rateLimitBaseMs?: number;
  /** Optional log hook (backfill script). */
  onRateLimitRetry?: (info: { attempt: number; maxAttempts: number; waitMs: number }) => void;
}

export async function fetchChartImgPng(
  body: ChartImgFetchBody,
  apiKey: string,
  options?: FetchChartImgPngOptions
): Promise<Buffer> {
  const maxRetries = options?.maxRateLimitRetries ?? 6;
  const baseMs = options?.rateLimitBaseMs ?? 10_000;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await fetchChartImgPngOnce(body, apiKey);
    } catch (err) {
      const message = (err as Error)?.message ?? String(err);
      if (!isChartImgRateLimitError(message) || attempt >= maxRetries) {
        throw err;
      }
      const waitMs = Math.min(baseMs * 2 ** attempt, 120_000);
      options?.onRateLimitRetry?.({
        attempt: attempt + 1,
        maxAttempts: maxRetries,
        waitMs,
      });
      await sleep(waitMs);
    }
  }

  throw new Error('chart-img rate limit retries exhausted');
}

export interface FetchThemeChartsParams {
  tradingViewSymbol: string;
  interval: string;
  levels?: ChartImgPriceLevels;
  bias?: string;
  timezone?: string;
}

/** Fetch dark + light PNGs for one resolved TradingView symbol. */
export async function fetchChartImgThemePair(
  params: FetchThemeChartsParams,
  apiKey: string,
  fetchPngOptions?: FetchChartImgPngOptions
): Promise<{dark: Buffer; light: Buffer; tradingViewSymbol: string}> {
  const {tradingViewSymbol, interval, levels, bias, timezone} = params;
  const base = buildChartImgAdvancedChartBody({
    tradingViewSymbol,
    interval,
    levels,
    bias: bias as 'long' | 'short' | 'neutral' | 'unknown' | undefined,
    theme: 'dark',
  });
  if (timezone) base.timezone = timezone;

  const dark = await fetchChartImgPng({...base, theme: 'dark'}, apiKey, fetchPngOptions);
  const light = await fetchChartImgPng({...base, theme: 'light'}, apiKey, fetchPngOptions);

  return {dark, light, tradingViewSymbol};
}

/**
 * Resolve a working TradingView symbol (with prefix fallbacks), then fetch dark + light charts.
 */
export async function fetchChartImgThemePairWithFallback(
  symbol: string,
  assetCategory: ChartImgAssetCategory,
  chartParams: Omit<FetchThemeChartsParams, 'tradingViewSymbol'>,
  apiKey: string,
  fetchPngOptions?: FetchChartImgPngOptions
): Promise<{dark: Buffer; light: Buffer; tradingViewSymbol: string; candidatesTried: string[]}> {
  const candidates = getTradingViewSymbolCandidates(symbol, assetCategory);
  if (!candidates.length) {
    throw new Error('No TradingView symbol candidates');
  }

  let lastError: Error | null = null;

  for (const tradingViewSymbol of candidates) {
    try {
      const pair = await fetchChartImgThemePair(
        {...chartParams, tradingViewSymbol},
        apiKey,
        fetchPngOptions
      );
      return {...pair, candidatesTried: candidates};
    } catch (err) {
      const message = (err as Error)?.message ?? String(err);
      lastError = err instanceof Error ? err : new Error(message);
      if (isChartImgRateLimitError(message) || !isChartImgSymbolMismatchError(message)) {
        throw lastError;
      }
    }
  }

  throw lastError ?? new Error('chart-img: all TradingView symbol candidates failed');
}

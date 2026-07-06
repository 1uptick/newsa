/**
 * coachSymbolResolver.ts
 *
 * Single-entry-point symbol normalizer for every AI-coach tool.
 *
 * Problem it solves
 * -----------------
 * The LLM (or user input) can pass many different strings for the same asset:
 *   "WTI", "wti crude", "WTI crude oil", "WTIOILUSD"     → FMP: CLUSD
 *   "brent oil", "Brent crude", "BRENTUSD"               → FMP: BZUSD
 *   "natural gas", "Nat Gas", "NATGAS"                   → FMP: NGUSD
 *   "gold", "Gold Futures", "GOLD", "XAUUSD"             → FMP: XAUUSD (spot); GCUSD only for futures
 *   "bitcoin", "Bitcoin", "BTC", "BTCUSD"                → FMP: BTCUSD
 *   "S&P 500", "SP500", "s&p", "SPX"                     → FMP: ^GSPC
 *
 * None of those raw strings work reliably with FMP's `/quote` or
 * `/technical-indicators` endpoints.  This module resolves ALL of them
 * to the correct FMP-canonical ticker before any API call is made.
 *
 * Usage
 * -----
 *   import { resolveCoachSymbol } from "../../shared/coachSymbolResolver";
 *
 *   const { fmpSymbol, terminal } = resolveCoachSymbol(rawSymbolFromLlm);
 */

import {
  canonicalCommoditySymbol,
  isCommodityUiSymbol,
  cryptoAliasCandidates,
  indexAliasCandidates,
} from "./fmpSymbolAliases.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type AssetTerminal =
  | "commodities"
  | "crypto"
  | "indices"
  | "forex"
  | "equity"
  | "hkstocks";

export interface ResolvedSymbol {
  /** Symbol to pass directly to FMP APIs (quote, technical-indicator, …). */
  fmpSymbol: string;
  /** Asset category for downstream chart/tool routing. */
  terminal: AssetTerminal;
  /** Human-readable name when known (e.g. "Brent Crude Oil"). */
  displayName?: string;
  /** True if the input was a natural-language phrase rather than a raw ticker. */
  wasNaturalLanguage: boolean;
}

// ─── Natural-language phrase → canonical mapping ─────────────────────────────
//
// Keys are lowercase, trimmed, normalised (spaces collapsed).  Values use the
// FMP-canonical symbol so they flow straight into every FMP endpoint.
//
const NL_TO_SYMBOL: Record<string, { fmpSymbol: string; terminal: AssetTerminal; displayName: string }> = {
  // ── Energy ──────────────────────────────────────────────────────────────────
  "wti":                       { fmpSymbol: "CLUSD",  terminal: "commodities", displayName: "WTI Crude Oil" },
  "wti crude":                 { fmpSymbol: "CLUSD",  terminal: "commodities", displayName: "WTI Crude Oil" },
  "wti crude oil":             { fmpSymbol: "CLUSD",  terminal: "commodities", displayName: "WTI Crude Oil" },
  "wti oil":                   { fmpSymbol: "CLUSD",  terminal: "commodities", displayName: "WTI Crude Oil" },
  "crude oil":                 { fmpSymbol: "CLUSD",  terminal: "commodities", displayName: "WTI Crude Oil" },
  "crude":                     { fmpSymbol: "CLUSD",  terminal: "commodities", displayName: "WTI Crude Oil" },
  "light crude":               { fmpSymbol: "CLUSD",  terminal: "commodities", displayName: "WTI Crude Oil" },
  "light sweet crude":         { fmpSymbol: "CLUSD",  terminal: "commodities", displayName: "WTI Crude Oil" },
  "oil":                       { fmpSymbol: "CLUSD",  terminal: "commodities", displayName: "WTI Crude Oil" },
  "nymex crude":               { fmpSymbol: "CLUSD",  terminal: "commodities", displayName: "WTI Crude Oil" },

  "brent":                     { fmpSymbol: "BZUSD",  terminal: "commodities", displayName: "Brent Crude Oil" },
  "brent oil":                 { fmpSymbol: "BZUSD",  terminal: "commodities", displayName: "Brent Crude Oil" },
  "brent crude":               { fmpSymbol: "BZUSD",  terminal: "commodities", displayName: "Brent Crude Oil" },
  "brent crude oil":           { fmpSymbol: "BZUSD",  terminal: "commodities", displayName: "Brent Crude Oil" },
  "ice brent":                 { fmpSymbol: "BZUSD",  terminal: "commodities", displayName: "Brent Crude Oil" },

  "natural gas":               { fmpSymbol: "NGUSD",  terminal: "commodities", displayName: "Natural Gas" },
  "nat gas":                   { fmpSymbol: "NGUSD",  terminal: "commodities", displayName: "Natural Gas" },
  "natgas":                    { fmpSymbol: "NGUSD",  terminal: "commodities", displayName: "Natural Gas" },
  "gas":                       { fmpSymbol: "NGUSD",  terminal: "commodities", displayName: "Natural Gas" },
  "henry hub":                 { fmpSymbol: "NGUSD",  terminal: "commodities", displayName: "Natural Gas" },

  "heating oil":               { fmpSymbol: "HOUSD",  terminal: "commodities", displayName: "Heating Oil" },
  "gasoline":                  { fmpSymbol: "RBUSD",  terminal: "commodities", displayName: "RBOB Gasoline" },
  "rbob":                      { fmpSymbol: "RBUSD",  terminal: "commodities", displayName: "RBOB Gasoline" },

  // ── Metals ───────────────────────────────────────────────────────────────────
  "gold":                      { fmpSymbol: "XAUUSD", terminal: "commodities", displayName: "Gold (Spot)" },
  "spot gold":                 { fmpSymbol: "XAUUSD", terminal: "commodities", displayName: "Gold (Spot)" },
  "gold spot":                 { fmpSymbol: "XAUUSD", terminal: "commodities", displayName: "Gold (Spot)" },
  "黃金":                      { fmpSymbol: "XAUUSD", terminal: "commodities", displayName: "Gold (Spot)" },
  "黄金":                      { fmpSymbol: "XAUUSD", terminal: "commodities", displayName: "Gold (Spot)" },
  "xau":                       { fmpSymbol: "XAUUSD", terminal: "commodities", displayName: "Gold (Spot)" },
  "xauusd":                    { fmpSymbol: "XAUUSD", terminal: "commodities", displayName: "Gold (Spot)" },
  "gold futures":              { fmpSymbol: "GCUSD",  terminal: "commodities", displayName: "Gold Futures" },
  "comex gold":                { fmpSymbol: "GCUSD",  terminal: "commodities", displayName: "Gold Futures" },

  "silver":                    { fmpSymbol: "XAGUSD", terminal: "commodities", displayName: "Silver (Spot)" },
  "spot silver":               { fmpSymbol: "XAGUSD", terminal: "commodities", displayName: "Silver (Spot)" },
  "silver spot":               { fmpSymbol: "XAGUSD", terminal: "commodities", displayName: "Silver (Spot)" },
  "白銀":                      { fmpSymbol: "XAGUSD", terminal: "commodities", displayName: "Silver (Spot)" },
  "白银":                      { fmpSymbol: "XAGUSD", terminal: "commodities", displayName: "Silver (Spot)" },
  "xag":                       { fmpSymbol: "XAGUSD", terminal: "commodities", displayName: "Silver (Spot)" },
  "xagusd":                    { fmpSymbol: "XAGUSD", terminal: "commodities", displayName: "Silver (Spot)" },
  "silver futures":            { fmpSymbol: "SIUSD",  terminal: "commodities", displayName: "Silver Futures" },

  "copper":                    { fmpSymbol: "HGUSD",  terminal: "commodities", displayName: "Copper" },
  "copper futures":            { fmpSymbol: "HGUSD",  terminal: "commodities", displayName: "Copper Futures" },

  "platinum":                  { fmpSymbol: "PLUSD",  terminal: "commodities", displayName: "Platinum" },
  "palladium":                 { fmpSymbol: "PAUSD",  terminal: "commodities", displayName: "Palladium" },
  "aluminum":                  { fmpSymbol: "ALIUSD", terminal: "commodities", displayName: "Aluminum" },
  "aluminium":                 { fmpSymbol: "ALIUSD", terminal: "commodities", displayName: "Aluminium" },

  // ── Grains / Softs ───────────────────────────────────────────────────────────
  "wheat":                     { fmpSymbol: "KEUSX",  terminal: "commodities", displayName: "Wheat" },
  "wheat futures":             { fmpSymbol: "KEUSX",  terminal: "commodities", displayName: "Wheat Futures" },
  "corn":                      { fmpSymbol: "ZCUSX",  terminal: "commodities", displayName: "Corn" },
  "corn futures":              { fmpSymbol: "ZCUSX",  terminal: "commodities", displayName: "Corn Futures" },
  "soybeans":                  { fmpSymbol: "ZSUSX",  terminal: "commodities", displayName: "Soybeans" },
  "soybean":                   { fmpSymbol: "ZSUSX",  terminal: "commodities", displayName: "Soybeans" },
  "soy":                       { fmpSymbol: "ZSUSX",  terminal: "commodities", displayName: "Soybeans" },
  "coffee":                    { fmpSymbol: "KCUSX",  terminal: "commodities", displayName: "Coffee" },
  "arabica coffee":            { fmpSymbol: "KCUSX",  terminal: "commodities", displayName: "Arabica Coffee" },
  "sugar":                     { fmpSymbol: "SBUSX",  terminal: "commodities", displayName: "Sugar" },
  "cotton":                    { fmpSymbol: "CTUSX",  terminal: "commodities", displayName: "Cotton" },
  "cocoa":                     { fmpSymbol: "CCUSD",  terminal: "commodities", displayName: "Cocoa" },
  "orange juice":              { fmpSymbol: "OJUSX",  terminal: "commodities", displayName: "Orange Juice" },
  "live cattle":               { fmpSymbol: "LEUSX",  terminal: "commodities", displayName: "Live Cattle" },
  "cattle":                    { fmpSymbol: "LEUSX",  terminal: "commodities", displayName: "Live Cattle" },
  "lean hogs":                 { fmpSymbol: "HEUSX",  terminal: "commodities", displayName: "Lean Hogs" },
  "hogs":                      { fmpSymbol: "HEUSX",  terminal: "commodities", displayName: "Lean Hogs" },
  "lumber":                    { fmpSymbol: "LBUSD",  terminal: "commodities", displayName: "Lumber" },

  // ── Crypto ───────────────────────────────────────────────────────────────────
  "bitcoin":                   { fmpSymbol: "BTCUSD", terminal: "crypto",      displayName: "Bitcoin" },
  "btc":                       { fmpSymbol: "BTCUSD", terminal: "crypto",      displayName: "Bitcoin" },
  "ethereum":                  { fmpSymbol: "ETHUSD", terminal: "crypto",      displayName: "Ethereum" },
  "ether":                     { fmpSymbol: "ETHUSD", terminal: "crypto",      displayName: "Ethereum" },
  "eth":                       { fmpSymbol: "ETHUSD", terminal: "crypto",      displayName: "Ethereum" },
  "solana":                    { fmpSymbol: "SOLUSD", terminal: "crypto",      displayName: "Solana" },
  "sol":                       { fmpSymbol: "SOLUSD", terminal: "crypto",      displayName: "Solana" },
  "xrp":                       { fmpSymbol: "XRPUSD", terminal: "crypto",      displayName: "XRP" },
  "ripple":                    { fmpSymbol: "XRPUSD", terminal: "crypto",      displayName: "XRP" },
  "bnb":                       { fmpSymbol: "BNBUSD", terminal: "crypto",      displayName: "BNB" },
  "dogecoin":                  { fmpSymbol: "DOGEUSD",terminal: "crypto",      displayName: "Dogecoin" },
  "doge":                      { fmpSymbol: "DOGEUSD",terminal: "crypto",      displayName: "Dogecoin" },
  "cardano":                   { fmpSymbol: "ADAUSD", terminal: "crypto",      displayName: "Cardano" },
  "ada":                       { fmpSymbol: "ADAUSD", terminal: "crypto",      displayName: "Cardano" },
  "polkadot":                  { fmpSymbol: "DOTUSD", terminal: "crypto",      displayName: "Polkadot" },
  "avalanche":                 { fmpSymbol: "AVAXUSD",terminal: "crypto",      displayName: "Avalanche" },
  "avax":                      { fmpSymbol: "AVAXUSD",terminal: "crypto",      displayName: "Avalanche" },
  "chainlink":                 { fmpSymbol: "LINKUSD",terminal: "crypto",      displayName: "Chainlink" },
  "link":                      { fmpSymbol: "LINKUSD",terminal: "crypto",      displayName: "Chainlink" },
  "litecoin":                  { fmpSymbol: "LTCUSD", terminal: "crypto",      displayName: "Litecoin" },
  "ltc":                       { fmpSymbol: "LTCUSD", terminal: "crypto",      displayName: "Litecoin" },
  "usdt":                      { fmpSymbol: "USDTUSD",terminal: "crypto",      displayName: "Tether" },
  "tether":                    { fmpSymbol: "USDTUSD",terminal: "crypto",      displayName: "Tether" },

  // ── Forex (major pairs + common NL) ───────────────────────────────────────────
  "eur usd":                   { fmpSymbol: "EURUSD", terminal: "forex",       displayName: "EUR/USD" },
  "eurusd":                    { fmpSymbol: "EURUSD", terminal: "forex",       displayName: "EUR/USD" },
  "euro":                      { fmpSymbol: "EURUSD", terminal: "forex",       displayName: "EUR/USD" },
  "gbp usd":                   { fmpSymbol: "GBPUSD", terminal: "forex",       displayName: "GBP/USD" },
  "gbpusd":                    { fmpSymbol: "GBPUSD", terminal: "forex",       displayName: "GBP/USD" },
  "cable":                     { fmpSymbol: "GBPUSD", terminal: "forex",       displayName: "GBP/USD" },
  "pound":                     { fmpSymbol: "GBPUSD", terminal: "forex",       displayName: "GBP/USD" },
  "usd jpy":                   { fmpSymbol: "USDJPY", terminal: "forex",       displayName: "USD/JPY" },
  "usdjpy":                    { fmpSymbol: "USDJPY", terminal: "forex",       displayName: "USD/JPY" },
  "yen":                       { fmpSymbol: "USDJPY", terminal: "forex",       displayName: "USD/JPY" },
  "aud usd":                   { fmpSymbol: "AUDUSD", terminal: "forex",       displayName: "AUD/USD" },
  "audusd":                    { fmpSymbol: "AUDUSD", terminal: "forex",       displayName: "AUD/USD" },
  "aud":                       { fmpSymbol: "AUDUSD", terminal: "forex",       displayName: "AUD/USD" },
  "australian dollar":         { fmpSymbol: "AUDUSD", terminal: "forex",       displayName: "AUD/USD" },
  "aussie":                    { fmpSymbol: "AUDUSD", terminal: "forex",       displayName: "AUD/USD" },
  "aussie dollar":             { fmpSymbol: "AUDUSD", terminal: "forex",       displayName: "AUD/USD" },
  "nz dollar":                 { fmpSymbol: "NZDUSD", terminal: "forex",       displayName: "NZD/USD" },
  "nzd usd":                   { fmpSymbol: "NZDUSD", terminal: "forex",       displayName: "NZD/USD" },
  "nzdusd":                    { fmpSymbol: "NZDUSD", terminal: "forex",       displayName: "NZD/USD" },
  "kiwi":                      { fmpSymbol: "NZDUSD", terminal: "forex",       displayName: "NZD/USD" },
  "usd cad":                   { fmpSymbol: "USDCAD", terminal: "forex",       displayName: "USD/CAD" },
  "usdcad":                    { fmpSymbol: "USDCAD", terminal: "forex",       displayName: "USD/CAD" },
  "loonie":                    { fmpSymbol: "USDCAD", terminal: "forex",       displayName: "USD/CAD" },
  "usd chf":                   { fmpSymbol: "USDCHF", terminal: "forex",       displayName: "USD/CHF" },
  "usdchf":                    { fmpSymbol: "USDCHF", terminal: "forex",       displayName: "USD/CHF" },
  "usd cnh":                   { fmpSymbol: "USDCNH", terminal: "forex",       displayName: "USD/CNH" },
  "usdcnh":                    { fmpSymbol: "USDCNH", terminal: "forex",       displayName: "USD/CNH" },
  "usdcny":                    { fmpSymbol: "USDCNH", terminal: "forex",       displayName: "USD/CNH" },

  // ── Dollar Index (FMP: DX-Y.NYB, not ^DXY or DXY) ────────────────────────────
  "dollar index":              { fmpSymbol: "DX-Y.NYB", terminal: "indices",   displayName: "US Dollar Index" },
  "usd index":                 { fmpSymbol: "DX-Y.NYB", terminal: "indices",   displayName: "US Dollar Index" },
  "dxy":                       { fmpSymbol: "DX-Y.NYB", terminal: "indices",   displayName: "US Dollar Index" },
  "dollar":                    { fmpSymbol: "DX-Y.NYB", terminal: "indices",   displayName: "US Dollar Index" },
  "usd":                       { fmpSymbol: "DX-Y.NYB", terminal: "indices",   displayName: "US Dollar Index" },

  // ── Indices ───────────────────────────────────────────────────────────────────
  "s&p 500":                   { fmpSymbol: "^GSPC",  terminal: "indices",     displayName: "S&P 500" },
  "s&p500":                    { fmpSymbol: "^GSPC",  terminal: "indices",     displayName: "S&P 500" },
  "s&p":                       { fmpSymbol: "^GSPC",  terminal: "indices",     displayName: "S&P 500" },
  "sp500":                     { fmpSymbol: "^GSPC",  terminal: "indices",     displayName: "S&P 500" },
  "snp500":                    { fmpSymbol: "^GSPC",  terminal: "indices",     displayName: "S&P 500" },
  "dow jones":                 { fmpSymbol: "^DJI",   terminal: "indices",     displayName: "Dow Jones" },
  "dow":                       { fmpSymbol: "^DJI",   terminal: "indices",     displayName: "Dow Jones" },
  "nasdaq":                    { fmpSymbol: "^IXIC",  terminal: "indices",     displayName: "NASDAQ Composite" },
  "nasdaq composite":          { fmpSymbol: "^IXIC",  terminal: "indices",     displayName: "NASDAQ Composite" },
  "ixic":                      { fmpSymbol: "^IXIC",  terminal: "indices",     displayName: "NASDAQ Composite" },
  "nasdaq 100":                { fmpSymbol: "^NDX",   terminal: "indices",     displayName: "NASDAQ 100" },
  "ndx":                       { fmpSymbol: "^NDX",   terminal: "indices",     displayName: "NASDAQ 100" },
  "nikkei":                    { fmpSymbol: "^N225",  terminal: "indices",     displayName: "Nikkei 225" },
  "nikkei 225":                { fmpSymbol: "^N225",  terminal: "indices",     displayName: "Nikkei 225" },
  "hang seng":                 { fmpSymbol: "^HSI",   terminal: "indices",     displayName: "Hang Seng" },
  "hang seng index":           { fmpSymbol: "^HSI",   terminal: "indices",     displayName: "Hang Seng" },
  "hsi":                       { fmpSymbol: "^HSI",   terminal: "indices",     displayName: "Hang Seng" },
  "dax":                       { fmpSymbol: "^GDAXI", terminal: "indices",     displayName: "DAX" },
  "ftse":                      { fmpSymbol: "^FTSE",  terminal: "indices",     displayName: "FTSE 100" },
  "ftse 100":                  { fmpSymbol: "^FTSE",  terminal: "indices",     displayName: "FTSE 100" },
  "cac":                       { fmpSymbol: "^FCHI",  terminal: "indices",     displayName: "CAC 40" },
  "cac 40":                    { fmpSymbol: "^FCHI",  terminal: "indices",     displayName: "CAC 40" },
  "vix":                       { fmpSymbol: "^VIX",   terminal: "indices",     displayName: "VIX" },
  "volatility index":          { fmpSymbol: "^VIX",   terminal: "indices",     displayName: "VIX" },
  "fear index":                { fmpSymbol: "^VIX",   terminal: "indices",     displayName: "VIX" },
  "kospi":                     { fmpSymbol: "^KS11",  terminal: "indices",     displayName: "KOSPI" },
  "sensex":                    { fmpSymbol: "^BSESN", terminal: "indices",     displayName: "Sensex" },
  "asx 200":                   { fmpSymbol: "^AXJO",  terminal: "indices",     displayName: "ASX 200" },
  "asx200":                    { fmpSymbol: "^AXJO",  terminal: "indices",     displayName: "ASX 200" },
  "taiex":                     { fmpSymbol: "^TWII",  terminal: "indices",     displayName: "TAIEX" },
  "taiwan index":              { fmpSymbol: "^TWII",  terminal: "indices",     displayName: "TAIEX" },
  "russell 2000":              { fmpSymbol: "^RUT",   terminal: "indices",     displayName: "Russell 2000" },
  "russell":                   { fmpSymbol: "^RUT",   terminal: "indices",     displayName: "Russell 2000" },
  "ibovespa":                  { fmpSymbol: "^BVSP",  terminal: "indices",     displayName: "Ibovespa" },
  "bovespa":                   { fmpSymbol: "^BVSP",  terminal: "indices",     displayName: "Ibovespa" },
  "ibov":                      { fmpSymbol: "^BVSP",  terminal: "indices",     displayName: "Ibovespa" },
  "tsx":                       { fmpSymbol: "^GSPTSE",terminal: "indices",     displayName: "TSX Composite" },
  "straits times":             { fmpSymbol: "^STI",   terminal: "indices",     displayName: "Straits Times Index" },
  "sti":                       { fmpSymbol: "^STI",   terminal: "indices",     displayName: "Straits Times Index" },

  // ── Thematic ETFs (full product names + common aliases) ─────────────────────
  "global x data center digital infrastructure etf": { fmpSymbol: "DTCR",   terminal: "equity", displayName: "Global X Data Center & Digital Infrastructure ETF" },
  "global x data center digital infrastructure":     { fmpSymbol: "DTCR",   terminal: "equity", displayName: "Global X Data Center & Digital Infrastructure ETF" },
  "data center digital infrastructure etf":        { fmpSymbol: "DTCR",   terminal: "equity", displayName: "Global X Data Center & Digital Infrastructure ETF" },
  "dtcr":                                            { fmpSymbol: "DTCR",   terminal: "equity", displayName: "Global X Data Center & Digital Infrastructure ETF" },

  "vaneck rare earth and strategic metals etf":      { fmpSymbol: "REMX",   terminal: "equity", displayName: "VanEck Rare Earth and Strategic Metals ETF" },
  "vaneck rare earth strategic metals etf":          { fmpSymbol: "REMX",   terminal: "equity", displayName: "VanEck Rare Earth and Strategic Metals ETF" },
  "vaneck rare earth":                               { fmpSymbol: "REMX",   terminal: "equity", displayName: "VanEck Rare Earth and Strategic Metals ETF" },
  "remx":                                            { fmpSymbol: "REMX",   terminal: "equity", displayName: "VanEck Rare Earth and Strategic Metals ETF" },

  "vaneck semiconductor etf":                        { fmpSymbol: "SMH",    terminal: "equity", displayName: "VanEck Semiconductor ETF" },
  "vaneck semiconductors etf":                       { fmpSymbol: "SMH",    terminal: "equity", displayName: "VanEck Semiconductor ETF" },
  "smh":                                             { fmpSymbol: "SMH",    terminal: "equity", displayName: "VanEck Semiconductor ETF" },

  "han etf future of defense":                       { fmpSymbol: "NATO.L", terminal: "equity", displayName: "HANetf Future of Defence UCITS ETF" },
  "han etf future of defence":                       { fmpSymbol: "NATO.L", terminal: "equity", displayName: "HANetf Future of Defence UCITS ETF" },
  "hanetf future of defense":                        { fmpSymbol: "NATO.L", terminal: "equity", displayName: "HANetf Future of Defence UCITS ETF" },
  "hanetf future of defence":                        { fmpSymbol: "NATO.L", terminal: "equity", displayName: "HANetf Future of Defence UCITS ETF" },
  "future of defense etf":                           { fmpSymbol: "NATO.L", terminal: "equity", displayName: "HANetf Future of Defence UCITS ETF" },
  "future of defence etf":                           { fmpSymbol: "NATO.L", terminal: "equity", displayName: "HANetf Future of Defence UCITS ETF" },
  "han future of defense":                           { fmpSymbol: "NATO.L", terminal: "equity", displayName: "HANetf Future of Defence UCITS ETF" },
  "han future of defence":                           { fmpSymbol: "NATO.L", terminal: "equity", displayName: "HANetf Future of Defence UCITS ETF" },
  "nato etf":                                        { fmpSymbol: "NATO.L", terminal: "equity", displayName: "HANetf Future of Defence UCITS ETF" },
  "natp":                                            { fmpSymbol: "NATP.L", terminal: "equity", displayName: "HANetf Future of Defence UCITS ETF (GBP line)" },
};

// ─── Global exchange-suffix registry ─────────────────────────────────────────
//
// FMP uses Yahoo Finance-compatible suffixes.  Any symbol matching TICKER.SUFFIX
// where SUFFIX is in this map is a listed equity — pass the symbol through as-is.
// Only .HK receives extra normalisation (zero-pad numeric codes to 4 digits).
//
// Suffixes verified against FMP /stable/quote, May 2026.
//
const EXCHANGE_SUFFIX_TERMINAL: Record<string, AssetTerminal> = {
  // ── Asia-Pacific ──────────────────────────────────────────────────────────
  HK: "hkstocks",  // Hong Kong (HKSE)
  T:  "equity",    // Tokyo (JPX)
  KS: "equity",    // Korea Stock Exchange
  KQ: "equity",    // KOSDAQ
  TW: "equity",    // Taiwan (TWSE)
  TWO:"equity",    // Taipei OTC Board
  AX: "equity",    // Australia (ASX)
  NZ: "equity",    // New Zealand (NZE)
  SI: "equity",    // Singapore (SES)
  BK: "equity",    // Thailand (SET)
  JK: "equity",    // Indonesia (JKT)
  KL: "equity",    // Malaysia (KLS)
  SS: "equity",    // Shanghai A-shares (SHH)
  SZ: "equity",    // Shenzhen A-shares (SHZ)
  // ── South Asia ────────────────────────────────────────────────────────────
  NS: "equity",    // India NSE
  BO: "equity",    // India BSE
  // ── Middle East ───────────────────────────────────────────────────────────
  SR: "equity",    // Saudi Arabia (Tadawul)
  AH: "equity",    // Abu Dhabi (ADX)
  DU: "equity",    // Dubai (DFM)
  QA: "equity",    // Qatar (QSE)
  // ── Europe — Western ─────────────────────────────────────────────────────
  L:  "equity",    // London (LSE)
  PA: "equity",    // Paris / Euronext
  DE: "equity",    // Germany XETRA
  MI: "equity",    // Milan (MIL)
  AS: "equity",    // Amsterdam (AMS)
  MC: "equity",    // Madrid (BME)
  SW: "equity",    // Switzerland (SIX)
  LS: "equity",    // Lisbon (LIS)
  BR: "equity",    // Brussels (BRU)
  // ── Europe — Nordic ───────────────────────────────────────────────────────
  OL: "equity",    // Oslo (OSL)
  ST: "equity",    // Stockholm (STO)
  CO: "equity",    // Copenhagen (CPH)
  HE: "equity",    // Helsinki (HEL)
  // ── Europe — Eastern ─────────────────────────────────────────────────────
  VI: "equity",    // Vienna (VIE)
  WA: "equity",    // Warsaw (WSE)
  AT: "equity",    // Athens (ATH)
  IS: "equity",    // Istanbul (IST)
  BD: "equity",    // Budapest (BUD)
  PR: "equity",    // Prague
  // ── Africa ────────────────────────────────────────────────────────────────
  JO: "equity",    // Johannesburg (JNB)
  CA: "equity",    // Cairo (EGX)
  // ── Americas ──────────────────────────────────────────────────────────────
  TO: "equity",    // Toronto (TSX)
  V:  "equity",    // TSX Venture
  CN: "equity",    // Canadian NEO Exchange
  SA: "equity",    // Brazil B3 (SAO)
  BA: "equity",    // Buenos Aires (BUE)
  SN: "equity",    // Santiago (SGO)
  MX: "equity",    // Mexico (MEX)
  // ── Israel ────────────────────────────────────────────────────────────────
  TA: "equity",    // Tel Aviv (TLV)
};

const KNOWN_EXCHANGE_SUFFIXES = new Set(Object.keys(EXCHANGE_SUFFIX_TERMINAL));

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Normalise a raw string to a collapsed, trimmed uppercase key for map lookups. */
function collapseKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[\u4e00-\u9fff\u3040-\u30ff\u1100-\u11ff\uac00-\ud7af]+/g, " ") // strip CJK
    .replace(/\s+&\s+/g, " ")   // "data center & digital" → "data center digital"
    .replace(/[^a-z0-9&']+/g, " ")   // collapse non-alphanumeric
    .replace(/'/g, "")
    .trim();
}

/** Detect whether a ticker looks like a forex pair (6-char alphabetic). */
function looksLikeForex(n: string): boolean {
  return /^[A-Z]{6}$/.test(n);
}

/** Normalise a HK numeric code to FMP's 4-digit zero-padded format. */
function normaliseHkCode(numStr: string): string {
  const num = parseInt(numStr.replace(/\D/g, ""), 10);
  return isNaN(num) || num <= 0 ? numStr : String(num).padStart(4, "0");
}

/**
 * If `norm` has a dot suffix and that suffix is NOT in KNOWN_EXCHANGE_SUFFIXES,
 * AND the ticker part is purely numeric → treat as a HK code with wrong suffix.
 * Returns the corrected symbol (e.g. "0941.GK" → "0941.HK"), or null if not applicable.
 */
function tryRepairWrongHkSuffix(norm: string): string | null {
  const dot = norm.lastIndexOf(".");
  if (dot < 0) return null;
  const suffix = norm.slice(dot + 1);
  if (KNOWN_EXCHANGE_SUFFIXES.has(suffix)) return null; // suffix already known
  const base = norm.slice(0, dot);
  if (!/^\d{1,5}$/.test(base)) return null;
  return `${normaliseHkCode(base)}.HK`;
}

/** Well-known crypto base tickers for bare-ticker detection and USD-pair mapping. */
const CRYPTO_BASE_TICKERS = new Set([
  "BTC","ETH","SOL","XRP","BNB","DOGE","ADA","DOT","AVAX","LINK","LTC",
  "USDT","USDC","UNI","SHIB","MATIC","ATOM","FIL","ALGO","VET","TRX",
  "TON","SUI","APT","ARB","OP","INJ","SEI","WIF","PEPE","BONK",
  "FET","NEAR","HBAR","ICP","AAVE","MKR","CRV","SNX","COMP","YFI",
  "SUSHI","ENJ","CHZ","SAND","MANA","AXS","GALA","IMX","FTM","ONE",
  "EGLD","FLOW","THETA","GRT","LRC","CELO","ZEC","XMR","DASH","BCH",
  "ETC","XLM","EOS","NEO","IOTA","STX","TAO","JUP","PYTH","W",
]);

function looksLikeCrypto(n: string): boolean {
  if (n.endsWith("USDT") || n.endsWith("USDC")) return true;
  if (n.endsWith("USD") && n.length > 3) return CRYPTO_BASE_TICKERS.has(n.slice(0, -3));
  // Bare base tickers: BTC, ETH, DOT, SOL …
  return CRYPTO_BASE_TICKERS.has(n);
}

/**
 * Normalise a user-facing crypto ticker to FMP's canonical USD-pair format.
 *   BTCUSDT → BTCUSD   (FMP uses *USD pairs, not USDT)
 *   ETHUSDC → ETHUSD
 *   BTC     → BTCUSD   (via cryptoAliasCandidates fallback)
 */
function normaliseCryptoForFmp(n: string): string {
  if (n.endsWith("USDT")) return `${n.slice(0, -4)}USD`;  // BTCUSDT → BTCUSD
  if (n.endsWith("USDC")) return `${n.slice(0, -4)}USD`;  // BTCUSDC → BTCUSD
  return n;
}

/**
 * Detect B3 (Brazilian) stock tickers and return the bare ticker (no .SA suffix).
 * Patterns: PETR4, VALE3, ITUB4, B3SA3, MGLU3, BOVA11, SMAL11 …
 * Returns null when not a B3 ticker.
 */
function parseB3Ticker(n: string): string | null {
  // Strip .SA suffix if already present
  const bare = n.endsWith(".SA") ? n.slice(0, -3) : n;
  if (bare.length < 5 || bare.length > 8) return null;
  // Standard share class: 4 letters + 1–2 digits (PETR4, VALE3, ITUB4)
  if (/^[A-Z]{4}\d{1,2}$/.test(bare)) return bare;
  // Mixed alphanumeric root + share class digit (B3SA3, MGLU3)
  if (/^[A-Z0-9]{4}\d$/.test(bare) && /[3456789]$/.test(bare)) return bare;
  // FII / ETF: 4 letters + 2 digits (BOVA11, SMAL11, KNRI11)
  if (/^[A-Z]{4}11$/.test(bare)) return bare;
  return null;
}

/**
 * Explicit set of known index FMP symbols so we don't accidentally classify
 * random tickers as indices. Only symbols in this set (or starting with ^) are
 * treated as indices by the resolver.
 */
const KNOWN_INDEX_TICKERS = new Set([
  "GSPC","^GSPC","SPX","SP500",
  "IXIC","^IXIC","NDX","^NDX",
  "DJI","^DJI","DOW",
  "RUT","^RUT",
  "VIX","^VIX",
  "DXY","^DXY","DX",
  "N225","^N225","NIKKEI",
  "HSI","^HSI","HANGSENG",
  "GDAXI","^GDAXI","DAX",
  "FTSE","^FTSE",
  "FCHI","^FCHI","CAC","CAC40",
  "KS11","^KS11","KOSPI",
  "BSESN","^BSESN","SENSEX",
  "AXJO","^AXJO","ASX200",
  "TWII","^TWII","TAIEX",
  "STI","^STI",
  "GSPTSE","^GSPTSE","TSX",
  "BVSP","^BVSP","IBOV","IBOVESPA",
]);

/**
 * Explicit FMP symbol overrides for cases where `indexAliasCandidates[0]`
 * returns the wrong symbol.
 *
 * DXY  → FMP uses "DX-Y.NYB" (not "^DXY") — confirmed May 2026.
 * NDX  → bare "NDX" maps to NASDAQ Composite via aliases; must be "^NDX".
 */
const INDEX_FMP_OVERRIDES: Record<string, string> = {
  "DXY":      "DX-Y.NYB",
  "^DXY":     "DX-Y.NYB",
  "DX-Y":     "DX-Y.NYB",
  "NDX":      "^NDX",
};

// ─── Main resolver ────────────────────────────────────────────────────────────

/**
 * Resolve any raw symbol / natural-language phrase to a FMP-canonical symbol.
 *
 * Safe to call on every tool invocation — falls back to the raw input when
 * the symbol is already canonical (e.g. AAPL, MSFT, EURUSD).
 */
export function resolveCoachSymbol(
  raw: unknown,
  terminalHint?: string | null
): ResolvedSymbol {
  const rawStr = typeof raw === "string" ? raw.trim() : "";
  if (!rawStr) return { fmpSymbol: "", terminal: "equity", wasNaturalLanguage: false };

  // ── 1. Try natural-language phrase lookup first ───────────────────────────────
  const key = collapseKey(rawStr);
  const nlMatch = NL_TO_SYMBOL[key];
  if (nlMatch) {
    return {
      fmpSymbol: nlMatch.fmpSymbol,
      terminal: nlMatch.terminal,
      displayName: nlMatch.displayName,
      wasNaturalLanguage: key.includes(" "),
    };
  }

  // ── 2. Normalise to uppercase ticker (strip slashes/spaces, keep dots) ────────
  const norm = rawStr.replace(/[/\s]/g, "").toUpperCase();

  // ── 3. Commodity UI symbol → FMP canonical ───────────────────────────────────
  if (isCommodityUiSymbol(norm)) {
    return {
      fmpSymbol: canonicalCommoditySymbol(norm),
      terminal: "commodities",
      wasNaturalLanguage: false,
    };
  }

  // ── 4. Exchange-suffix routing ────────────────────────────────────────────────
  //   Any symbol with a known exchange suffix passes through as-is to FMP.
  //   Only .HK requires numeric code normalisation (zero-pad to 4 digits).
  const dotIdx = norm.lastIndexOf(".");
  if (dotIdx > 0) {
    const suffix = norm.slice(dotIdx + 1);
    const base   = norm.slice(0, dotIdx);

    if (KNOWN_EXCHANGE_SUFFIXES.has(suffix)) {
      const terminal = EXCHANGE_SUFFIX_TERMINAL[suffix];
      if (suffix === "HK") {
        // Normalise: "941.HK" → "0941.HK", "00941.HK" → "0941.HK"
        const paddedBase = /^\d+$/.test(base) ? normaliseHkCode(base) : base;
        return { fmpSymbol: `${paddedBase}.HK`, terminal: "hkstocks", wasNaturalLanguage: false };
      }
      // All other exchanges: pass through unchanged, correct terminal assigned.
      return { fmpSymbol: norm, terminal, wasNaturalLanguage: false };
    }

    // Unknown suffix on a numeric base → assume HK with wrong suffix (e.g. 0941.GK)
    const repaired = tryRepairWrongHkSuffix(norm);
    if (repaired) {
      return { fmpSymbol: repaired, terminal: "hkstocks", wasNaturalLanguage: false };
    }

    // Unknown suffix on an alpha base → pass through as equity (FMP might know it)
    return { fmpSymbol: norm, terminal: "equity", wasNaturalLanguage: false };
  }

  // ── 5. B3 / Brazilian equities without .SA suffix (PETR4, VALE3, B3SA3, …) ──
  const b3Ticker = parseB3Ticker(norm);
  if (b3Ticker) {
    return { fmpSymbol: `${b3Ticker}.SA`, terminal: "equity", wasNaturalLanguage: false };
  }

  // ── 6. Bare HK numeric codes (no suffix, terminal hint = hkstocks) ───────────
  if (/^\d{1,5}$/.test(norm)) {
    const termLower = String(terminalHint || "").toLowerCase();
    if (termLower === "hkstocks" || termLower === "hk") {
      return { fmpSymbol: `${normaliseHkCode(norm)}.HK`, terminal: "hkstocks", wasNaturalLanguage: false };
    }
    // Ambiguous numeric without hint — default to HK (most common use-case)
    return { fmpSymbol: `${normaliseHkCode(norm)}.HK`, terminal: "hkstocks", wasNaturalLanguage: false };
  }

  // ── 7. Crypto (bare tickers + USD/USDT/USDC pairs) ───────────────────────────
  if (looksLikeCrypto(norm)) {
    // FMP uses *USD pairs (BTCUSD), not USDT/USDC pairs — normalise first.
    const fmpNorm = normaliseCryptoForFmp(norm);
    const cryptoCandidates = cryptoAliasCandidates(fmpNorm);
    return { fmpSymbol: cryptoCandidates[0] || fmpNorm, terminal: "crypto", wasNaturalLanguage: false };
  }

  // ── 8. Index tickers — only explicitly known symbols or ^ prefix ──────────────
  if (norm.startsWith("^") || KNOWN_INDEX_TICKERS.has(norm)) {
    // indexAliasCandidates[0] is sometimes wrong; explicit overrides take priority.
    const override = INDEX_FMP_OVERRIDES[norm];
    if (override) return { fmpSymbol: override, terminal: "indices", wasNaturalLanguage: false };
    const indexCandidates = indexAliasCandidates(norm);
    return { fmpSymbol: indexCandidates[0] || norm, terminal: "indices", wasNaturalLanguage: false };
  }

  // ── 9. Forex (6-char pairs ending in a known quote currency) ─────────────────
  if (looksLikeForex(norm)) {
    const termLower = String(terminalHint || "").toLowerCase();
    if (termLower === "forex" || termLower === "fx") {
      return { fmpSymbol: norm, terminal: "forex", wasNaturalLanguage: false };
    }
    if (/^[A-Z]{3}(USD|EUR|GBP|JPY|CHF|CAD|AUD|NZD|HKD|SGD|CNH|CNY)$/.test(norm)) {
      return { fmpSymbol: norm, terminal: "forex", wasNaturalLanguage: false };
    }
  }

  // ── 10. Passthrough — canonical equity ticker (AAPL, MSFT, TSMC, etc.) ───────
  const terminalFromHint: AssetTerminal =
    (terminalHint && (["commodities","crypto","indices","forex","equity","hkstocks"].includes(
      String(terminalHint).toLowerCase()
    ) ? String(terminalHint).toLowerCase() as AssetTerminal : "equity")) ||
    "equity";

  return { fmpSymbol: norm, terminal: terminalFromHint, wasNaturalLanguage: false };
}

const FX_BASE_TO_PAIR: Record<string, string> = {
  AUD: "AUDUSD",
  EUR: "EURUSD",
  GBP: "GBPUSD",
  NZD: "NZDUSD",
  CAD: "USDCAD",
  CHF: "USDCHF",
  JPY: "USDJPY",
  CNH: "USDCNH",
  CNY: "USDCNH",
};

const NL_PHRASES_BY_LENGTH = Object.keys(NL_TO_SYMBOL).sort((a, b) => b.length - a.length);

/**
 * Scan free text for chartable/quotable symbols using NL phrases, FX pairs, and resolver fallbacks.
 */
export function scanCoachSymbolsInText(text: string): string[] {
  const haystack = collapseKey(text);
  const found: string[] = [];
  const seen = new Set<string>();

  const push = (sym: string) => {
    const s = sym.trim();
    if (!s) return;
    const key = s.replace(/[/\s]/g, "").toUpperCase();
    if (seen.has(key)) return;
    seen.add(key);
    found.push(s);
  };

  for (const phrase of NL_PHRASES_BY_LENGTH) {
    if (phrase.length < 2) continue;
    const re = new RegExp(`(?:^|\\s)${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$|[,.])`);
    if (re.test(haystack)) push(NL_TO_SYMBOL[phrase].fmpSymbol);
  }

  const pairRe =
    /\b(EUR\/USD|GBP\/USD|USD\/JPY|USD\/CNH|AUD\/USD|NZD\/USD|USD\/CAD|USD\/CHF|EURUSD|GBPUSD|USDJPY|USDCNH|AUDUSD|NZDUSD|USDCAD|USDCHF)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = pairRe.exec(text)) !== null) {
    push(m[1].replace("/", "").toUpperCase());
  }

  const commodityPairRe = /\b(XAUUSD|XAGUSD|XAU\/USD|XAG\/USD|BTCUSD|ETHUSD)\b/gi;
  while ((m = commodityPairRe.exec(text)) !== null) {
    push(m[1].replace("/", "").toUpperCase());
  }

  const fxBaseRe = /\b(AUD|EUR|GBP|NZD|CAD|CHF|JPY|CNH|CNY)\b/gi;
  while ((m = fxBaseRe.exec(text)) !== null) {
    const base = m[1].toUpperCase();
    const pair = FX_BASE_TO_PAIR[base];
    if (pair) push(pair);
  }

  return found;
}

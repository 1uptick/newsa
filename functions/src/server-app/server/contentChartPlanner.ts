/**
 * Unified chart planning for ATFX articles and research reports.
 * Combines coachSymbolResolver + chart candidates + macro topic detection
 * so regex-only gaps (e.g. bare "AUD") cannot skip charts again.
 */

import { getChartImgSymbolCandidates } from "./chartSymbolHelpers.js";
import { scanCoachSymbolsInText } from "./coachSymbolResolver.js";

export type EconomicChartPlan = {
  source: "us_series" | "calendar";
  /** FMP US indicator id (us_series) */
  indicator?: string;
  /** ISO country code for calendar releases (AU, GB, …) */
  country?: string;
  /** Match calendar event names */
  eventPattern?: string;
  /** Prefer one headline release family when multiple match */
  preferEventPrefix?: string;
  title: string;
  chartType: "bar" | "line";
  months: number;
};

export type ContentChartPlan = {
  priceSymbols: string[];
  /** Symbols explicitly named in the topic (not country-inferred). */
  explicitPriceSymbols: string[];
  economicCharts: EconomicChartPlan[];
};

export type ArticleChartEmbed = {
  src: string;
  /** Visible title e.g. US CPI */
  caption: string;
  /** SEO filename stem e.g. ATFX - US CPI 2026-6-13 */
  fileName?: string;
  kind: "price" | "economic";
};

/** Default max macro charts when the user did not explicitly ask for economic figures. */
export const MAX_ECONOMIC_CHARTS_DEFAULT = 2;
/** Max macro charts when the user explicitly asks for economic / macro figures. */
export const MAX_ECONOMIC_CHARTS_EXPLICIT = 4;
/** Absolute ceiling for embed buffers and hard limits (excludes OHLC price charts). */
export const MAX_ECONOMIC_CHARTS = MAX_ECONOMIC_CHARTS_EXPLICIT;

/** Max OHLC price charts per article/report. */
export const MAX_PRICE_CHARTS = 3;

const TV_SYMBOL_RE =
  /\b(?:TVC|NASDAQ|NYSE|AMEX|OANDA|FOREX|COMEX|BINANCE|SP|DJ|FX|CME):[A-Z0-9!._-]+\b/gi;

const FX_PAIR_RE =
  /\b(EUR\/USD|GBP\/USD|USD\/JPY|USD\/CNH|EURUSD|GBPUSD|USDJPY|USDCNH|AUD\/USD|NZD\/USD|USD\/CAD|USD\/CHF|AUDUSD|NZDUSD|USDCAD|USDCHF|EURGBP|EURJPY|GBPJPY|XAUUSD|XAGUSD|XAU\/USD|XAG\/USD|BTCUSD|ETHUSD)\b/gi;

const COUNTRY_PATTERNS: Array<{ code: string; re: RegExp }> = [
  { code: "AU", re: /\b(australia|australian|aussie|australia's|\brba\b)\b/i },
  { code: "US", re: /\b(united states|u\.s\.a?|america|american|\bfed\b|\bfomc\b|\bus\b)\b/i },
  { code: "GB", re: /\b(united kingdom|\buk\b|britain|british|\bboe\b)\b/i },
  { code: "EU", re: /\b(eurozone|euro area|european union|\becb\b)\b/i },
  { code: "JP", re: /\b(japan|japanese|\bboj\b)\b/i },
  { code: "CN", re: /\b(china|chinese|\bpboc\b)\b/i },
  { code: "CA", re: /\b(canada|canadian|\bboc\b)\b/i },
  { code: "NZ", re: /\b(new zealand|\bnz\b|\brbnz\b)\b/i },
];

type MacroRule = {
  topicRe: RegExp;
  usIndicator?: string;
  calendar?: {
    country: string | "infer";
    eventPattern: RegExp;
    preferEventPrefix?: string;
    title: (countryLabel: string) => string;
  };
  chartType: "bar" | "line";
  months: number;
};

const COUNTRY_LABELS: Record<string, string> = {
  AU: "Australia",
  US: "United States",
  GB: "United Kingdom",
  EU: "Eurozone",
  JP: "Japan",
  CN: "China",
  CA: "Canada",
  NZ: "New Zealand",
};

const MACRO_RULES: MacroRule[] = [
  {
    topicRe: /\b(inflation|cpi|consumer price|物價|通胀|通脹|deflat)\b/i,
    usIndicator: "inflationRate",
    calendar: {
      country: "infer",
      eventPattern: /inflation|cpi/i,
      preferEventPrefix: "Inflation Rate YoY",
      title: (c) => `${c} Inflation Rate (YoY)`,
    },
    chartType: "bar",
    months: 24,
  },
  {
    topicRe: /\b(ecb|eurozone|euro area)\b/i,
    calendar: {
      country: "EU",
      eventPattern: /inflation|cpi/i,
      preferEventPrefix: "Inflation Rate YoY",
      title: (c) => `${c} Inflation Rate (YoY)`,
    },
    chartType: "bar",
    months: 24,
  },
  {
    topicRe: /\b(\bfed\b|fomc|federal reserve)\b/i,
    usIndicator: "federalFunds",
    chartType: "line",
    months: 36,
  },
  {
    topicRe: /\b(real yields?|bond yields?|10-?year yield|yield curve)\b/i,
    usIndicator: "treasury10Y",
    chartType: "line",
    months: 12,
  },
  {
    topicRe: /\b(unemployment|jobless|labour market|labor market|失業)\b/i,
    usIndicator: "unemploymentRate",
    calendar: {
      country: "infer",
      eventPattern: /unemployment/i,
      preferEventPrefix: "Unemployment Rate",
      title: (c) => `${c} Unemployment Rate`,
    },
    chartType: "bar",
    months: 24,
  },
  {
    topicRe: /\b(gdp|gross domestic|經濟增長|经济增长)\b/i,
    usIndicator: "GDP",
    calendar: {
      country: "infer",
      eventPattern: /\bgdp\b/i,
      preferEventPrefix: "GDP",
      title: (c) => `${c} GDP`,
    },
    chartType: "bar",
    months: 36,
  },
  {
    topicRe: /\b(nonfarm|non-farm|payroll|nfp|就業)\b/i,
    usIndicator: "totalNonfarmPayroll",
    chartType: "bar",
    months: 24,
  },
  {
    topicRe: /\b(initial claims|jobless claims|申請失業)\b/i,
    usIndicator: "initialClaims",
    chartType: "bar",
    months: 12,
  },
  {
    topicRe: /\b(retail sales|零售)\b/i,
    usIndicator: "retailSales",
    chartType: "bar",
    months: 24,
  },
  {
    topicRe: /\b(treasury|國債|国债)\b/i,
    usIndicator: "treasury10Y",
    chartType: "line",
    months: 12,
  },
  {
    topicRe: /\b(dxy|dollar index|us dollar index|usd index|trade-weighted dollar|dollar outlook|美(?:元|圓)指數|美元指数)\b/i,
    usIndicator: "treasury10Y",
    chartType: "line",
    months: 12,
  },
  {
    topicRe:
      /\b(pmi|purchasing managers?|manufacturing(?:\s+(?:pmi|index|activity|slowdown|contraction|expansion|sector))?|ism(?:\s+manufacturing)?|industrial production|factory activity|製造業|制造业)\b/i,
    calendar: {
      country: "infer",
      eventPattern: /manufacturing pmi|ism manufacturing|pmi/i,
      preferEventPrefix: "ISM Manufacturing PMI",
      title: (c) => `${c} Manufacturing PMI`,
    },
    chartType: "bar",
    months: 24,
  },
];

const DOLLAR_INDEX_TOPIC_RE =
  /\b(dxy|dollar index|us dollar index|usd index|trade-weighted dollar|dollar outlook|美(?:元|圓)指數|美元指数)\b/i;

/** True when the user explicitly asks for macro / economic figure context. */
export function userRequestedMacroFigures(text: string): boolean {
  return /\b(cpi|consumer price|inflation|unemployment|jobless|payroll|nonfarm|non-farm|nfp|gdp|gross domestic|macro figure|economic figure|economic data|treasury yield|yield curve|fed funds|fomc|interest rate|monetary policy|labor market|labour market|economic indicator|phillips|pmi|purchasing managers?|manufacturing(?:\s+(?:pmi|index|activity|slowdown|contraction|expansion))?|ism(?:\s+manufacturing)?|industrial production|factory activity)\b/i.test(
    text
  );
}

/** Max macro economic figure charts allowed for this user message. */
export function maxEconomicChartsAllowed(text: string): number {
  return userRequestedMacroFigures(text)
    ? MAX_ECONOMIC_CHARTS_EXPLICIT
    : MAX_ECONOMIC_CHARTS_DEFAULT;
}

const GLOBAL_MANUFACTURING_PMI_PLANS: EconomicChartPlan[] = [
  {
    source: "calendar",
    country: "US",
    eventPattern: "manufacturing pmi|ism manufacturing",
    preferEventPrefix: "ISM Manufacturing PMI",
    title: "US ISM Manufacturing PMI",
    chartType: "bar",
    months: 24,
  },
  {
    source: "calendar",
    country: "CN",
    eventPattern: "manufacturing pmi|official manufacturing",
    preferEventPrefix: "Manufacturing PMI",
    title: "China Manufacturing PMI",
    chartType: "bar",
    months: 24,
  },
  {
    source: "calendar",
    country: "EU",
    eventPattern: "manufacturing pmi|hcoB manufacturing",
    preferEventPrefix: "Manufacturing PMI",
    title: "Eurozone Manufacturing PMI",
    chartType: "bar",
    months: 24,
  },
];

function dollarIndexMacroChartPlans(): EconomicChartPlan[] {
  return [
    {
      source: "us_series",
      indicator: "treasury10Y",
      title: "US 10-Year Treasury Yield",
      chartType: "line",
      months: 12,
    },
    {
      source: "us_series",
      indicator: "inflationRate",
      title: "US Inflation Rate",
      chartType: "bar",
      months: 24,
    },
  ];
}

function detectCountry(text: string): string | null {
  for (const { code, re } of COUNTRY_PATTERNS) {
    if (re.test(text)) return code;
  }
  return null;
}

function countryLabel(code: string): string {
  return COUNTRY_LABELS[code] ?? code;
}

/** Map ISO currency codes to FMP economic-calendar country codes. */
const CURRENCY_TO_CALENDAR_COUNTRY: Record<string, string> = {
  EUR: "EU",
  USD: "US",
  GBP: "GB",
  JPY: "JP",
  CHF: "CH",
  CAD: "CA",
  AUD: "AU",
  NZD: "NZ",
  CNH: "CN",
  CNY: "CN",
};

const FX_CURRENCY_CODES = "EUR|GBP|AUD|NZD|USD|JPY|CHF|CAD|CNH|CNY";

function addCalendarCountryFromCurrency(codes: Set<string>, currency: string): void {
  const mapped = CURRENCY_TO_CALENDAR_COUNTRY[currency.toUpperCase()];
  if (mapped) codes.add(mapped);
}

function addCalendarCountriesFromSymbol(codes: Set<string>, symbol: string): void {
  const norm = symbol.replace(/[/\s:.-]/g, "").toUpperCase();
  if (!norm) return;
  if (norm.includes("DXY")) {
    codes.add("US");
    return;
  }
  if (norm.length === 6 && /^[A-Z]+$/.test(norm)) {
    addCalendarCountryFromCurrency(codes, norm.slice(0, 3));
    addCalendarCountryFromCurrency(codes, norm.slice(3, 6));
  }
}

/**
 * Countries whose calendar releases are relevant to the report subject.
 * e.g. EURUSD → EU + US; DXY → US; Australia CPI → AU.
 */
export function detectCalendarCountries(text: string, instruments: string[] = []): string[] {
  const combined = `${text}\n${instruments.join("\n")}`.trim();
  if (!combined) return [];

  const codes = new Set<string>();

  const slashPairRe = new RegExp(
    `\\b(${FX_CURRENCY_CODES})\\s*[/\\-]\\s*(${FX_CURRENCY_CODES})\\b`,
    "gi"
  );
  let m: RegExpExecArray | null;
  while ((m = slashPairRe.exec(combined)) !== null) {
    addCalendarCountryFromCurrency(codes, m[1]);
    addCalendarCountryFromCurrency(codes, m[2]);
  }

  const concatPairRe = new RegExp(`\\b(${FX_CURRENCY_CODES})(${FX_CURRENCY_CODES})\\b`, "gi");
  while ((m = concatPairRe.exec(combined)) !== null) {
    addCalendarCountryFromCurrency(codes, m[1]);
    addCalendarCountryFromCurrency(codes, m[2]);
  }

  if (DOLLAR_INDEX_TOPIC_RE.test(combined)) codes.add("US");

  for (const { code, re } of COUNTRY_PATTERNS) {
    if (re.test(combined)) codes.add(code);
  }

  for (const inst of instruments) addCalendarCountriesFromSymbol(codes, inst);

  if (isGoldSilverArticle(combined, instruments)) codes.add("US");

  return [...codes];
}

/** Normalize calendar row country labels for filtering (US, EU, …). */
export function normalizeCalendarCountryCode(raw: string): string {
  const s = raw.trim().toUpperCase();
  if (s === "EUR" || s === "EUROZONE" || s === "EURO AREA" || s === "EURO") return "EU";
  if (s === "UK" || s === "UNITED KINGDOM" || s === "GREAT BRITAIN") return "GB";
  if (s === "UNITED STATES" || s === "U.S." || s === "USA") return "US";
  if (s.length === 2) return s;
  return s.slice(0, 2);
}

function isChartableSymbol(symbol: string): boolean {
  if (!symbol.trim()) return false;
  return getChartImgSymbolCandidates(symbol).length > 0;
}

function dedupeSymbols(symbols: string[]): string[] {
  const out: string[] = [];
  for (const sym of symbols) {
    const s = sym.trim();
    if (!s) continue;
    const norm = s.replace(/[/\s]/g, "").toUpperCase();
    if (out.some((x) => x.replace(/[/\s]/g, "").toUpperCase() === norm)) continue;
    out.push(s);
  }
  return out;
}

function extractExplicitPriceSymbols(text: string): string[] {
  const symbols: string[] = [];

  const fxPairs = text.match(FX_PAIR_RE);
  if (fxPairs) {
    for (const p of fxPairs) {
      const normalized = p.replace("/", "").toUpperCase();
      if (!symbols.includes(normalized)) symbols.push(normalized);
    }
  }

  const tvSymbols = text.match(TV_SYMBOL_RE);
  if (tvSymbols) {
    for (const tv of tvSymbols) {
      const s = tv.toUpperCase();
      if (!symbols.includes(s)) symbols.push(s);
    }
  }

  if (/(?:黃金|黄金|XAU|GOLD|gold|金價|金价)/i.test(text)) symbols.push("XAUUSD");
  if (/(?:白銀|白银|XAG|SILVER|silver|銀價|银价)/i.test(text)) symbols.push("XAGUSD");
  if (/(?:原油|WTI|oil|crude)/i.test(text)) symbols.push("CLUSD");
  if (/(?:標普|S&P|SPX|SP500)/i.test(text)) symbols.push("SP:SPX");
  if (/(?:DXY|美(?:元|圓)指數|Dollar Index)/i.test(text)) symbols.push("TVC:DXY");
  if (/(?:\bUSD strength\b|\bdollar strength\b|\bstronger dollar\b|\bweaker dollar\b|\bUS dollar\b)/i.test(text)) {
    if (!symbols.includes("TVC:DXY")) symbols.push("TVC:DXY");
  }

  const reverseUsdPairRe = /\b(JPY|CAD|CHF)(USD)\b/gi;
  let rm: RegExpExecArray | null;
  while ((rm = reverseUsdPairRe.exec(text)) !== null) {
    const normalized = `USD${rm[1].toUpperCase()}`;
    if (!symbols.includes(normalized)) symbols.push(normalized);
  }
  if (/(?:納指|Nasdaq|NASDAQ|QQQ)/i.test(text)) symbols.push("NASDAQ:NDX");
  if (/(?:道指|Dow Jones|DJIA)/i.test(text)) symbols.push("DJ:DJI");

  return symbols;
}

function inferCountryLinkedFx(text: string, country: string | null): string[] {
  if (!country) return [];
  const map: Record<string, string> = {
    AU: "AUDUSD",
    NZ: "NZDUSD",
    GB: "GBPUSD",
    JP: "USDJPY",
    CA: "USDCAD",
    EU: "EURUSD",
    CN: "USDCNH",
  };
  const sym = map[country];
  return sym ? [sym] : [];
}

function detectEconomicCharts(text: string): EconomicChartPlan[] {
  const maxEcon = maxEconomicChartsAllowed(text);
  const country = detectCountry(text);
  const plans: EconomicChartPlan[] = [];
  const seen = new Set<string>();

  if (DOLLAR_INDEX_TOPIC_RE.test(text)) {
    for (const plan of dollarIndexMacroChartPlans()) {
      const key = `us:${plan.indicator}`;
      if (seen.has(key)) continue;
      seen.add(key);
      plans.push(plan);
    }
  }

  if (/\bglobal\b/i.test(text) && /\b(pmi|manufacturing|factory)\b/i.test(text)) {
    for (const plan of GLOBAL_MANUFACTURING_PMI_PLANS) {
      const key = `cal:${plan.country}:${plan.preferEventPrefix ?? plan.eventPattern}`;
      if (seen.has(key)) continue;
      seen.add(key);
      plans.push(plan);
    }
  }

  for (const rule of MACRO_RULES) {
    if (!rule.topicRe.test(text)) continue;

    const targetCountry = country ?? "US";

    if (targetCountry === "US" && rule.usIndicator) {
      const key = `us:${rule.usIndicator}`;
      if (!seen.has(key)) {
        seen.add(key);
        plans.push({
          source: "us_series",
          indicator: rule.usIndicator,
          title: rule.calendar?.title("United States") ?? rule.usIndicator,
          chartType: rule.chartType,
          months: rule.months,
        });
      }
      continue;
    }

    if (rule.calendar) {
      const calCountry = rule.calendar.country === "infer" ? targetCountry : rule.calendar.country;
      const key = `cal:${calCountry}:${rule.calendar.preferEventPrefix ?? rule.calendar.eventPattern.source}`;
      if (!seen.has(key)) {
        seen.add(key);
        plans.push({
          source: "calendar",
          country: calCountry,
          eventPattern: rule.calendar.eventPattern.source,
          preferEventPrefix: rule.calendar.preferEventPrefix,
          title: rule.calendar.title(countryLabel(calCountry)),
          chartType: rule.chartType,
          months: rule.months,
        });
      }
    }
  }

  return plans.slice(0, maxEcon);
}

/** Plan price OHLC + economic charts from topic title/summary. */
export function planContentCharts(text: string): ContentChartPlan {
  const combined = text.trim();
  const country = detectCountry(combined);
  const maxEcon = maxEconomicChartsAllowed(combined);

  const fromCoach = scanCoachSymbolsInText(combined);
  const explicit = extractExplicitPriceSymbols(combined);
  const countryFx = inferCountryLinkedFx(combined, country);

  const explicitPriceSymbols = dedupeSymbols([...explicit, ...fromCoach])
    .filter(isChartableSymbol)
    .slice(0, MAX_PRICE_CHARTS);

  const priceSymbols = dedupeSymbols([...explicitPriceSymbols, ...countryFx])
    .filter(isChartableSymbol)
    .slice(0, MAX_PRICE_CHARTS);

  const economicCharts = detectEconomicCharts(combined).slice(0, maxEcon);

  return { priceSymbols, explicitPriceSymbols, economicCharts };
}

/** Backward-compatible symbol list for quotes and legacy callers. */
export function detectFinancialSymbols(text: string): string[] {
  return planContentCharts(text).priceSymbols;
}

/** One-line brief for logs and LLM context. */
export function formatContentChartBrief(plan: ContentChartPlan): string {
  const parts: string[] = [];
  for (const sym of plan.priceSymbols.slice(0, MAX_PRICE_CHARTS)) {
    parts.push(`OHLC ${sym}`);
  }
  for (const ec of plan.economicCharts) {
    parts.push(`macro ${ec.title}`);
  }
  return parts.length ? parts.join(" | ") : "no charts planned";
}

/** Serialize economic plans for research planner hints. */
export function formatEconomicChartHints(plans: EconomicChartPlan[]): string {
  if (!plans.length) return "";
  return plans
    .map((p) => {
      if (p.source === "us_series") return `${p.indicator} (${p.chartType}, ${p.months}mo)`;
      return `${p.title} [${p.country} calendar, ${p.chartType}]`;
    })
    .join("; ");
}

export function formatArticleChartsWriterBlock(charts: ArticleChartEmbed[]): string {
  if (!charts.length) return "";
  const lines = charts.map((c) => {
    if (c.kind === "economic") {
      return `- Macro figure chart "${c.caption}": In a macro/fundamentals section, write 1–2 paragraphs citing the latest reading, recent trend (rising/falling/stable), and why it supports or challenges the thesis. Do not leave the chart undiscussed.`;
    }
    return `- Price chart "${c.caption}": In a market/technical section, reference the visible trend, recent swing highs/lows, or range — tie levels to your narrative (support/resistance, breakout, consolidation).`;
  });
  return `\nCHARTS (appended to published HTML — discuss each in the body prose):\n${lines.join("\n")}\n`;
}

export function normalizeArticleCharts(
  charts: Array<string | ArticleChartEmbed>
): ArticleChartEmbed[] {
  return charts.map((c, i) =>
    typeof c === "string"
      ? { src: c, caption: `Chart ${i + 1}`, kind: "price" as const }
      : c
  );
}

/** Which macro/calendar research tools fit this article subject. */
export type ResearchToolHints = {
  includeCalendar: boolean;
  includeMacroCharts: boolean;
  includeTreasury: boolean;
};

const FX_CURRENCY_SET = new Set([
  "EUR",
  "GBP",
  "USD",
  "JPY",
  "CHF",
  "CAD",
  "AUD",
  "NZD",
  "CNH",
  "CNY",
]);

const CRYPTO_TOPIC_RE =
  /\b(crypto|cryptocurrency|bitcoin|btc\b|ethereum|eth\b|altcoin|blockchain|defi|web3|solana|xrp|binance|meme coin|token(?:s)?)\b/i;

const STOCK_TOPIC_RE =
  /\b(stock|equity|equities|share(?:s)?|earnings|eps\b|revenue|guidance|ipo|buyback|dividend|valuations?|p\/e\b|market cap|magnificent seven|faang|semiconductor(?:s)?|chip maker|nvidia|apple|microsoft|amazon|google|meta|tesla)\b/i;

const COMMODITY_TOPIC_RE =
  /\b(gold|silver|xau|xag|oil|wti|brent|crude|copper|natural gas|commodity|commodities|precious metal|金價|金价|原油|白銀|白银)\b/i;

const GOLD_SILVER_TOPIC_RE =
  /\b(gold|silver|xau|xag|precious metal|金價|金价|白銀|白银)\b/i;

const EXPLICIT_CALENDAR_RE =
  /\b(economic calendar|calendar table|calendar events?|upcoming releases?|data releases?|week ahead|catalysts? this week|high-?impact events?)\b/i;

const MACRO_DATA_TOPIC_RE =
  /\b(central bank|monetary policy|rate decision|policy meeting|interest rate outlook|fx outlook|forex outlook|currency outlook|macro outlook|inflation report|employment report|jobs data|gdp (?:data|release|report)|economic data|labour market data|labor market data|manufacturing(?:\s+(?:pmi|slowdown|activity|index))?|pmi|purchasing managers?|industrial production|factory activity|global growth|economic slowdown|rba\b|ecb\b|boe\b|pboc\b|fomc\b|\bfed\b)\b/i;

const COMMODITY_SYMBOL_RE = /^(XAU|XAG|CL|NG|GC|SI|HG|USOIL|UKOIL|COPPER|WTI|BRENT)/;
const GOLD_SILVER_SYMBOL_RE = /^(XAU|XAG|GC|SI)/;
const CRYPTO_SYMBOL_RE = /^(BTC|ETH|XRP|SOL|DOGE|ADA|BNB|LTC|DOT|AVAX)/;

export function isGoldSilverSymbol(symbol: string): boolean {
  const n = symbol.replace(/[/\s:.-]/g, "").toUpperCase();
  if (GOLD_SILVER_SYMBOL_RE.test(n)) return true;
  return n === "XAUUSD" || n === "XAGUSD";
}

/** Gold / silver articles — include US economic calendar (Fed, NFP, CPI drive USD pricing). */
export function isGoldSilverArticle(text: string, instruments: string[] = []): boolean {
  const inst = instruments.map((s) => s.trim()).filter(Boolean);
  if (inst.some(isGoldSilverSymbol)) return true;
  return GOLD_SILVER_TOPIC_RE.test(text);
}

export function isForexPairSymbol(symbol: string): boolean {
  const n = symbol.replace(/[/\s:.-]/g, "").toUpperCase();
  if (n.includes("DXY")) return true;
  if (n.length === 6 && /^[A-Z]+$/.test(n)) {
    const base = n.slice(0, 3);
    const quote = n.slice(3, 6);
    return FX_CURRENCY_SET.has(base) && FX_CURRENCY_SET.has(quote);
  }
  return false;
}

export function isCommoditySymbol(symbol: string): boolean {
  const n = symbol.replace(/[/\s:.-]/g, "").toUpperCase();
  if (COMMODITY_SYMBOL_RE.test(n)) return true;
  return ["XAUUSD", "XAGUSD", "CLUSD", "NGUSD", "USOIL", "UKOIL"].includes(n);
}

export function isCryptoSymbol(symbol: string): boolean {
  const n = symbol.replace(/[/\s:.-]/g, "").toUpperCase();
  if (CRYPTO_SYMBOL_RE.test(n)) return true;
  return n.includes("BINANCE") || n.includes("CRYPTO");
}

export function isEquityTicker(symbol: string): boolean {
  const bare = symbol.replace(/^[^:]+:/, "").toUpperCase();
  if (!/^[A-Z]{1,5}$/.test(bare)) return false;
  if (isForexPairSymbol(bare) || isCommoditySymbol(bare) || isCryptoSymbol(bare)) return false;
  return true;
}

/** Macro + commodity education (e.g. global PMI slowdown + WTI) needs both econ and price charts. */
export function isMacroCommodityHybridTopic(text: string): boolean {
  const macro =
    userRequestedMacroFigures(text) ||
    MACRO_DATA_TOPIC_RE.test(text) ||
    /\b(pmi|manufacturing|industrial production|economic slowdown|global growth)\b/i.test(text);
  const commodity = COMMODITY_TOPIC_RE.test(text);
  return macro && commodity;
}

/** Stocks, crypto, and commodity price articles — skip macro calendar by default. */
export function isAssetFocusedArticle(text: string, instruments: string[] = []): boolean {
  if (userRequestedMacroFigures(text) || EXPLICIT_CALENDAR_RE.test(text)) return false;
  if (MACRO_DATA_TOPIC_RE.test(text)) return false;
  if (isMacroCommodityHybridTopic(text)) return false;

  const inst = instruments.map((s) => s.trim()).filter(Boolean);

  if (inst.some(isCryptoSymbol) || CRYPTO_TOPIC_RE.test(text)) return true;
  if (inst.some(isCommoditySymbol) || COMMODITY_TOPIC_RE.test(text)) return true;
  if (inst.some(isEquityTicker) || STOCK_TOPIC_RE.test(text)) return true;

  return false;
}

function isMacroDataTopic(text: string): boolean {
  return userRequestedMacroFigures(text) || MACRO_DATA_TOPIC_RE.test(text);
}

/** Decide whether calendar / macro-chart / treasury tools belong in the research plan. */
export function resolveResearchToolHints(
  userMessage: string,
  instruments: string[] = []
): ResearchToolHints {
  const text = userMessage.trim();
  const inst = instruments;
  const assetFocused = isAssetFocusedArticle(text, inst);
  const goldSilver = isGoldSilverArticle(text, inst);

  const explicitCalendar = EXPLICIT_CALENDAR_RE.test(text);
  const macroTopic = isMacroDataTopic(text);
  const forexFundamental =
    inst.some(isForexPairSymbol) &&
    /\b(outlook|fundamental|drivers?|macro|policy|analysis)\b/i.test(text);

  const includeCalendar =
    goldSilver || (!assetFocused && (explicitCalendar || macroTopic || forexFundamental));
  const combined = `${text}\n${inst.join(" ")}`;
  const includeTreasury =
    includeCalendar &&
    /\b(treasury|yield|yields|rates?|fed|fomc|bond|real yield|dxy|dollar index)\b/i.test(combined);
  const includeMacroCharts =
    !assetFocused &&
    (userRequestedMacroFigures(text) ||
      (macroTopic && detectEconomicCharts(text).length > 0));

  return { includeCalendar, includeMacroCharts, includeTreasury };
}

export function articleChartSrcs(charts: Array<string | ArticleChartEmbed>): string[] {
  return normalizeArticleCharts(charts).map((c) => c.src);
}

/**
 * Regenerate / inject macro economic charts into stored research reports on load.
 */

import type { EconomicChartPlan } from "./contentChartPlanner.js";
import {
  MAX_ECONOMIC_CHARTS,
  maxEconomicChartsAllowed,
  planContentCharts,
  userRequestedMacroFigures,
} from "./contentChartPlanner.js";
import { generateEconomicChartDataUrl } from "./economicChart.js";
import { atfxEconomicChartImgAttrs } from "./atfxChartNaming.js";
import {
  countEconomicChartsInHtml,
  ECON_CHART_IMG_IN_HTML_RE,
  groupConsecutiveEconomicChartBlocks,
  tagSoloEconomicChartBlock,
  wrapEconomicChartGrid,
} from "./atfxReportChartLayout.js";

export { groupConsecutiveEconomicChartBlocks, wrapEconomicChartGrid };

function chartPlanPresentInHtml(html: string, plan: EconomicChartPlan): boolean {
  const indicator = (plan.indicator ?? "").toLowerCase();
  const title = (plan.title ?? "").toLowerCase();
  const hay = `${indicator} ${title}`;

  if (/treasury|yield/.test(hay)) {
    return /<img\b[^>]*\bsrc="data:image\/[^"]+"[^>]*\balt="[^"]*treasury/i.test(html);
  }
  if (/inflation|cpi/.test(hay)) {
    return /<img\b[^>]*\bsrc="data:image\/[^"]+"[^>]*\balt="[^"]*(?:CPI|inflation)/i.test(html);
  }
  if (/unemployment|jobless/.test(hay)) {
    return /<img\b[^>]*\bsrc="data:image\/[^"]+"[^>]*\balt="[^"]*unemployment/i.test(html);
  }
  if (/gdp/.test(hay)) {
    return /<img\b[^>]*\bsrc="data:image\/[^"]+"[^>]*\balt="[^"]*\bgdp/i.test(html);
  }
  if (/nonfarm|payroll/.test(hay)) {
    return /<img\b[^>]*\bsrc="data:image\/[^"]+"[^>]*\balt="[^"]*(nonfarm|payroll)/i.test(html);
  }
  if (/manufacturing|pmi|ism/.test(hay)) {
    return /<img\b[^>]*\bsrc="data:image\/[^"]+"[^>]*\balt="[^"]*(manufacturing|pmi|ism)/i.test(html);
  }
  return ECON_CHART_IMG_IN_HTML_RE.test(html);
}

export function reportHtmlHasEconomicCharts(html: string, plans?: EconomicChartPlan[]): boolean {
  if (!html?.trim()) return false;
  if (plans?.length) return plans.every((plan) => chartPlanPresentInHtml(html, plan));
  return ECON_CHART_IMG_IN_HTML_RE.test(html);
}

const MACRO_SECTION_RE =
  /<h2[^>]*>[^<]*(?:macro|inflation|labor|labour|employment|unemployment|cpi|economic|fundamental|payroll|jobless|treasury|yield|dollar|dxy|\busd\b|monetary|rates?|driver|outlook|figure|pmi|manufacturing|ism|factory|industrial)[^<]*<\/h2>/i;

const DOLLAR_INDEX_RE =
  /\b(dxy|dollar index|us dollar index|usd index|trade-weighted dollar|dollar outlook|美(?:元|圓)指數|美元指数)\b/i;

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dollarIndexChartPlans(): EconomicChartPlan[] {
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

function resolveEconomicChartPlans(
  title: string,
  html: string,
  researchPlan?: unknown
): EconomicChartPlan[] {
  const text = `${title}\n${stripHtmlToText(html)}`.slice(0, 6000);
  const maxEcon = maxEconomicChartsAllowed(text);

  if (researchPlan && typeof researchPlan === "object") {
    const planned = (researchPlan as { planned_economic_charts?: EconomicChartPlan[] })
      .planned_economic_charts;
    if (Array.isArray(planned) && planned.length) return planned.slice(0, maxEcon);
  }

  if (userRequestedMacroFigures(text)) {
    const fromContent = planContentCharts(text).economicCharts;
    if (fromContent.length) return fromContent.slice(0, maxEcon);
  }

  return [];
}

function buildEconImgTag(src: string, plan: EconomicChartPlan): string {
  const attrs = atfxEconomicChartImgAttrs(plan.indicator ?? plan.title);
  return tagSoloEconomicChartBlock(`<p><img src="${src}" ${attrs} /></p>`);
}

/** Insert macro chart imgs after the best matching section (or after first section). */
export function injectEconomicChartBlock(html: string, imgTags: string[]): string {
  if (!imgTags.length || !html?.trim()) return html;
  const block = wrapEconomicChartGrid(imgTags);

  if (MACRO_SECTION_RE.test(html)) {
    return html.replace(MACRO_SECTION_RE, (heading) => `${heading}\n${block}`);
  }

  const firstSection = /(<h2[^>]*>[\s\S]*?<\/h2>\s*<p>[\s\S]*?<\/p>)/i;
  if (firstSection.test(html)) {
    return html.replace(firstSection, `$1\n${block}`);
  }

  return `${block}\n${html}`;
}

export async function refreshMissingEconomicCharts(
  html: string,
  title: string,
  brief: unknown,
  researchPlan?: unknown
): Promise<{ html: string; econEmbeds: string[]; changed: boolean }> {
  if (!html?.trim()) return { html, econEmbeds: [], changed: false };

  const text = `${title}\n${stripHtmlToText(html)}`.slice(0, 6000);
  const maxEcon = maxEconomicChartsAllowed(text);

  const briefEmbeds =
    brief && typeof brief === "object" && Array.isArray((brief as { econ_chart_embeds?: unknown }).econ_chart_embeds)
      ? (brief as { econ_chart_embeds: unknown[] }).econ_chart_embeds
          .filter((s): s is string => typeof s === "string" && s.startsWith("data:image"))
          .slice(0, MAX_ECONOMIC_CHARTS)
      : [];

  if (countEconomicChartsInHtml(html) >= maxEcon) {
    return { html, econEmbeds: briefEmbeds, changed: false };
  }

  if (reportHtmlHasEconomicCharts(html)) {
    return { html, econEmbeds: briefEmbeds, changed: false };
  }

  const plans = resolveEconomicChartPlans(title, html, researchPlan);
  if (!plans.length) return { html, econEmbeds: briefEmbeds, changed: false };
  if (reportHtmlHasEconomicCharts(html, plans)) {
    return { html, econEmbeds: briefEmbeds, changed: false };
  }

  const embeds: string[] = [];
  const imgTags: string[] = [];
  const room = Math.max(0, maxEcon - countEconomicChartsInHtml(html));
  for (const plan of plans.slice(0, room)) {
    const src = await generateEconomicChartDataUrl(plan);
    if (!src) continue;
    embeds.push(src);
    imgTags.push(buildEconImgTag(src, plan));
  }

  if (!imgTags.length) return { html, econEmbeds: briefEmbeds, changed: false };

  const nextHtml = injectEconomicChartBlock(html, imgTags);
  return { html: groupConsecutiveEconomicChartBlocks(nextHtml), econEmbeds: embeds, changed: nextHtml !== html };
}

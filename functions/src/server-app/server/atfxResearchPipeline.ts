import {
  detectCalendarCountries,
  formatEconomicChartHints,
  MAX_ECONOMIC_CHARTS,
  maxEconomicChartsAllowed,
  planContentCharts,
  resolveResearchToolHints,
  isGoldSilverArticle,
  isGoldSilverSymbol,
} from "./contentChartPlanner.js";
import type { ContentChartPlan, EconomicChartPlan } from "./contentChartPlanner.js";
import {
  buildPlanUserPrompt,
  buildPlannerSystemPrompt,
  buildResearchQueryFromPlan,
  formatContentPlanForResearch,
  buildSectionRevisionPlanPrompt,
  buildSectionInsertWriterSystemPrompt,
  buildSectionInsertWriterUserPrompt,
  buildSectionMergeWriterSystemPrompt,
  buildSectionMergeWriterUserPrompt,
  buildSectionSplitWriterSystemPrompt,
  buildSectionSplitWriterUserPrompt,
  buildSectionRevisionWriterSystemPrompt,
  buildSectionRevisionWriterUserPrompt,
  buildWriterSystemPrompt,
  buildWriterUserPrompt,
  buildArticleRevisionWriterSystemPrompt,
  buildArticleRevisionWriterUserPrompt,
  todayContextBlock,
  defaultSectionOutline,
  expandUserMessageForPlanning,
  isQuickAnalysisResearchRequest,
  parseQuickAnalysisDataAsOf,
  parseQuickAnalysisPrimarySymbol,
  quickAnalysisExpansionSectionOutline,
  normalizeSectionTitle,
  type SectionContentBrief,
  type WriterContentPlan,
} from "./atfxResearchPrompts.js";
import { executeResearchTool, toolDisplayLabel, toolEventDetail } from "./atfxResearchToolRegistry.js";
import {
  effectiveStyle,
  horizonDays,
  isoDateOffset,
  normalizeReportOutputOptions,
  optionsSummaryLine,
  parseResolvedStyle,
  translationTargets,
  type ReportLanguage,
  type ReportOutputOptions,
  type ResolvedReportStyle,
} from "./atfxResearchReportOptions.js";
import {
  languageTabLabel,
  translateResearchReport,
  type ReportI18nContent,
} from "./atfxResearchTranslate.js";
import { callRequestyChat, extractFirstJsonObject, streamRequestyChatWithModelChain, planModelChain, writerModelChain } from "./atfxResearchRequesty.js";
import { normalizeWriterReportHtml, repairEconomicChartImgTags, refreshReportChartEmbeds } from "./atfxReportHtmlNormalize.js";
import { describeEditIntent, resolveEditIntent, looksLikeExplicitNewReport } from "./atfxEditIntentPlanner.js";
import {
  appendContentToSectionEnd,
  describeSectionPlacement,
  findTargetSection,
  insertReportSection,
  isChartOnlySectionEditRequest,
  isReplaceChartSectionEditRequest,
  listReportSections,
  listReportSectionTitles,
  mergeReportSections,
  moveReportSection,
  parseAppendChartIntent,
  removeMacroChartsFromSectionHtml,
  removeReportSection,
  renameReportSection,
  replaceReportSection,
  splitReportSection,
  type SectionEditIntent,
} from "./atfxReportHtmlSections.js";
import { atfxEconomicChartImgAttrs } from "./atfxChartNaming.js";
import { tagSoloEconomicChartBlock } from "./atfxReportChartLayout.js";
import { stripCitationMarkers } from "./stripLlmCitations.js";
import { config } from "./config.js";

export type EconomicIndicatorPlan = {
  name: string;
  chartType: "bar" | "line";
  months?: number;
};

export type ResearchPlan = {
  resolved_style: ResolvedReportStyle;
  instruments: string[];
  research_query: string;
  section_outline: string[];
  tools_needed: string[];
  chart_objective: string;
  recency: string;
  economic_indicators: EconomicIndicatorPlan[];
  /** Suggested H1 headline angle from planner. */
  title_angle?: string;
  /** Central narrative thesis the article must deliver. */
  content_thesis?: string;
  /** Primary SEO keywords for headings and copy. */
  seo_keywords?: string[];
  /** Long-tail / secondary SEO phrases. */
  seo_secondary_keywords?: string[];
  /** Meta description angle for SEO excerpt generation. */
  meta_description_hint?: string;
  /** Per-section content plan (purpose + key points). */
  section_briefs?: SectionContentBrief[];
  /** Deterministic macro chart targets from contentChartPlanner (incl. non-US calendar). */
  planned_economic_charts?: EconomicChartPlan[];
  /** Max macro charts for this request (2 default, 4 when user asks for macro figures). */
  max_economic_charts?: number;
};

function parseStringList(value: unknown, max = 12): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((x) => String(x).trim())
    .filter(Boolean)
    .slice(0, max);
}

function parseSectionBriefs(
  parsed: Record<string, unknown>,
  section_outline: string[]
): SectionContentBrief[] | undefined {
  if (!Array.isArray(parsed.section_briefs)) return undefined;
  const briefs: SectionContentBrief[] = [];
  for (const item of parsed.section_briefs) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const title = normalizeSectionTitle(typeof o.title === "string" ? o.title : "");
    const purpose = typeof o.purpose === "string" ? o.purpose.trim() : "";
    const key_points = parseStringList(o.key_points, 8);
    if (!title) continue;
    briefs.push({
      title,
      purpose: purpose || `Cover ${title} for the reader.`,
      key_points,
    });
  }
  if (!briefs.length) return undefined;
  if (section_outline.length) {
    const byTitle = new Map(briefs.map((b) => [b.title.toLowerCase(), b]));
    return section_outline.map((title) => {
      const hit = byTitle.get(title.toLowerCase());
      return hit ?? { title, purpose: `Develop ${title} using research brief facts.`, key_points: [] };
    });
  }
  return briefs;
}

export function researchPlanToWriterContentPlan(plan: ResearchPlan): WriterContentPlan {
  return {
    section_outline: plan.section_outline,
    section_briefs: plan.section_briefs,
    title_angle: plan.title_angle,
    content_thesis: plan.content_thesis,
    seo_keywords: plan.seo_keywords,
    seo_secondary_keywords: plan.seo_secondary_keywords,
    meta_description_hint: plan.meta_description_hint,
  };
}

export type ResearchBrief = {
  as_of: string;
  instruments: string[];
  resolved_style: ResolvedReportStyle;
  news_text: string;
  quotes_text: string;
  calendar_text: string;
  extras_text: string;
  chart_embeds: string[];
  econ_chart_embeds: string[];
  /** Snapshot of planner content targets the research phase gathered against. */
  content_plan_text?: string;
};

export type PipelineStage = "planning" | "research" | "writing" | "translating";

export type ResearchToolEvent = {
  name: string;
  summary: string;
  detail?: string;
};

export type PipelineSink = {
  stageStart?: (stage: PipelineStage, message: string) => void;
  stageComplete?: (stage: PipelineStage, displayText: string) => void;
  stageDelta?: (stage: PipelineStage, delta: string) => void;
  toolStart?: (name: string, detail?: string) => void;
  toolResult?: (name: string, summary: string, detail?: string) => void;
  delta?: (text: string) => void;
  reportPreview?: (language: ReportLanguage, html: string) => void;
};

export type PipelineDisplayLog = {
  planning: string;
  research: string;
  writing: string;
};

export type PipelineResult = {
  reply: string;
  title?: string;
  report_html?: string;
  report_i18n?: ReportI18nContent;
  tool_events: ResearchToolEvent[];
  research_plan: ResearchPlan;
  research_brief: ResearchBrief;
  output_options: ReportOutputOptions;
  pipeline_display: PipelineDisplayLog;
  rawText: string;
};

function parsePlanJson(raw: string, options: ReportOutputOptions): ResearchPlan {
  const jsonStr = extractFirstJsonObject(raw);
  const parsed = jsonStr ? (JSON.parse(jsonStr) as Record<string, unknown>) : {};
  const resolved_style = effectiveStyle(options, parseResolvedStyle(parsed.resolved_style));
  const instruments = Array.isArray(parsed.instruments)
    ? (parsed.instruments as unknown[]).map((x) => String(x).trim()).filter(Boolean).slice(0, 5)
    : [];
  const section_outline = Array.isArray(parsed.section_outline)
    ? (parsed.section_outline as unknown[])
        .map((x) => normalizeSectionTitle(String(x)))
        .filter(Boolean)
    : defaultSectionOutline(resolved_style);
  const tools_needed = Array.isArray(parsed.tools_needed)
    ? (parsed.tools_needed as unknown[]).map((x) => String(x).trim())
    : ["news"];
  const economic_indicators: EconomicIndicatorPlan[] = Array.isArray(parsed.economic_indicators)
    ? (parsed.economic_indicators as unknown[])
        .flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const o = item as Record<string, unknown>;
          const name = typeof o.name === "string" ? o.name.trim() : "";
          if (!name) return [];
          const ct = typeof o.chartType === "string" ? o.chartType.trim().toLowerCase() : "bar";
          const chartType: "bar" | "line" = ct === "line" ? "line" : "bar";
          const rawMonths = typeof o.months === "number" ? o.months : Number(o.months);
          const plan: EconomicIndicatorPlan = { name, chartType };
          if (Number.isFinite(rawMonths)) plan.months = Math.floor(rawMonths);
          return [plan];
        })
        .slice(0, MAX_ECONOMIC_CHARTS)
    : [];
  const outline =
    section_outline.length ? section_outline : defaultSectionOutline(resolved_style);
  return {
    resolved_style,
    instruments,
    research_query:
      typeof parsed.research_query === "string" && parsed.research_query.trim()
        ? parsed.research_query.trim()
        : "Latest market drivers and catalysts",
    section_outline: outline,
    tools_needed,
    chart_objective: typeof parsed.chart_objective === "string" ? parsed.chart_objective : "daily",
    recency:
      typeof parsed.recency === "string"
        ? parsed.recency
        : options.horizon === "12m" || options.horizon === "6m"
          ? "month"
          : options.horizon === "1m"
            ? "day"
            : "week",
    economic_indicators,
    title_angle:
      typeof parsed.title_angle === "string" && parsed.title_angle.trim()
        ? parsed.title_angle.trim()
        : undefined,
    content_thesis:
      typeof parsed.content_thesis === "string" && parsed.content_thesis.trim()
        ? parsed.content_thesis.trim()
        : undefined,
    seo_keywords: (() => {
      const v = parseStringList(parsed.seo_keywords, 10);
      return v.length ? v : undefined;
    })(),
    seo_secondary_keywords: (() => {
      const v = parseStringList(parsed.seo_secondary_keywords, 10);
      return v.length ? v : undefined;
    })(),
    meta_description_hint:
      typeof parsed.meta_description_hint === "string" && parsed.meta_description_hint.trim()
        ? parsed.meta_description_hint.trim()
        : undefined,
    section_briefs: parseSectionBriefs(parsed, outline),
  };
}

function mergeInstrumentSymbols(base: string[], additions: string[]): string[] {
  const instruments = [...base];
  for (const sym of additions) {
    const norm = sym.replace(/[/\s]/g, "").toUpperCase();
    if (!norm) continue;
    if (!instruments.some((x) => x.replace(/[/\s]/g, "").toUpperCase() === norm)) {
      instruments.push(sym);
    }
  }
  return instruments;
}

function applyStylePlanOverrides(
  plan: ResearchPlan,
  options: ReportOutputOptions,
  contentPlan: ContentChartPlan,
  userMessage: string,
  inPlaceEdit = false
): ResearchPlan {
  if (options.style !== "technical_analysis" || inPlaceEdit) return plan;

  let instruments = mergeInstrumentSymbols(plan.instruments, contentPlan.explicitPriceSymbols);
  if (!instruments.length) {
    instruments = mergeInstrumentSymbols([], contentPlan.priceSymbols);
  }
  instruments = instruments.slice(0, 5);

  const tools = new Set(plan.tools_needed);
  if (instruments.length > 0) {
    for (const tool of ["news", "quote", "chart", "technical_analysis"]) tools.add(tool);
    if (isGoldSilverArticle(userMessage, instruments) || instruments.some(isGoldSilverSymbol)) {
      tools.add("calendar");
    }
  }

  let research_query = plan.research_query;
  if (instruments.length > 0) {
    const symLabel = instruments.join(", ");
    const needsTaQuery =
      userMessage.trim().length < 60 ||
      !/(technical|support|resistance|chart|level|trend|rsi|macd|trade|setup|price action)/i.test(
        userMessage
      ) ||
      /refers to the trading pair|commonly used in forex|measure the value/i.test(plan.research_query);
    if (needsTaQuery) {
      research_query = `Latest ${symLabel} price action, trend context, key support and resistance levels, RSI/MACD/moving-average readings, and catalysts affecting ${symLabel}`;
    }
  }

  return {
    ...plan,
    resolved_style: "technical_analysis",
    instruments,
    tools_needed: [...tools],
    section_outline: defaultSectionOutline("technical_analysis"),
    research_query,
  };
}

function applyQuickAnalysisPlanOverrides(
  plan: ResearchPlan,
  options: ReportOutputOptions,
  contentPlan: ContentChartPlan,
  userMessage: string,
  inPlaceEdit = false
): ResearchPlan {
  if (inPlaceEdit || !isQuickAnalysisResearchRequest(userMessage)) return plan;

  const primary = parseQuickAnalysisPrimarySymbol(userMessage);
  let instruments = mergeInstrumentSymbols(plan.instruments, contentPlan.explicitPriceSymbols);
  if (!instruments.length) {
    instruments = mergeInstrumentSymbols([], contentPlan.priceSymbols);
  }
  if (primary) {
    instruments = mergeInstrumentSymbols(instruments, [primary]);
  }
  instruments = instruments.slice(0, 5);

  const tools = new Set(plan.tools_needed);
  tools.add("news");
  if (instruments.length > 0) {
    for (const tool of ["quote", "chart"]) tools.add(tool);
    if (isGoldSilverArticle(userMessage, instruments) || instruments.some(isGoldSilverSymbol)) {
      tools.add("calendar");
    }
  }

  const symLabel = instruments.join(", ") || primary || "the primary instrument";
  const dataAsOf = parseQuickAnalysisDataAsOf(userMessage);
  let research_query = plan.research_query.trim();
  const weakQuery =
    !research_query ||
    /^(what is|define|explain|overview of|introduction to)\b/i.test(research_query) ||
    /refers to the trading pair|commonly used in forex|measure the value/i.test(research_query);
  if (weakQuery) {
    research_query = dataAsOf
      ? `Latest news, catalysts, and price action for ${symLabel} since ${dataAsOf} — expanding a quick market snapshot into a full research article`
      : `Latest news, catalysts, and price action for ${symLabel} to expand a quick market snapshot into a full research article`;
  }

  let resolved_style = plan.resolved_style;
  if (options.style === "auto" && resolved_style === "qa") {
    resolved_style = "bloomberg";
  }

  let section_outline = plan.section_outline.map(normalizeSectionTitle).filter(Boolean);
  if (section_outline.length < 4) {
    section_outline = quickAnalysisExpansionSectionOutline();
  }

  return {
    ...plan,
    resolved_style,
    instruments,
    tools_needed: [...tools],
    section_outline,
    research_query,
  };
}

function mergeContentChartPlan(
  base: ResearchPlan,
  contentPlan: ContentChartPlan,
  userMessage: string,
  options: ReportOutputOptions,
  mergeOpts?: { inPlaceEdit?: boolean }
): ResearchPlan {
  const inPlaceEdit = mergeOpts?.inPlaceEdit ?? false;
  const maxEcon = maxEconomicChartsAllowed(userMessage);
  let economic_indicators = base.economic_indicators.slice(0, maxEcon);

  let instruments = inPlaceEdit
    ? mergeInstrumentSymbols([], contentPlan.explicitPriceSymbols)
    : mergeInstrumentSymbols(base.instruments, contentPlan.explicitPriceSymbols);
  if (!instruments.length && !inPlaceEdit && options.style === "technical_analysis") {
    instruments = mergeInstrumentSymbols([], contentPlan.priceSymbols);
  }
  if (!instruments.length && !inPlaceEdit && isQuickAnalysisResearchRequest(userMessage)) {
    instruments = mergeInstrumentSymbols([], contentPlan.priceSymbols);
    const primary = parseQuickAnalysisPrimarySymbol(userMessage);
    if (primary) instruments = mergeInstrumentSymbols(instruments, [primary]);
  }

  const trimmedInstruments = instruments.slice(0, 5);
  const toolHints = resolveResearchToolHints(userMessage, trimmedInstruments);

  const plannerWantsEcon =
    toolHints.includeMacroCharts &&
    (base.tools_needed.includes("econ_chart") ||
      economic_indicators.length > 0 ||
      contentPlan.economicCharts.length > 0);

  let tools_needed = [...base.tools_needed];

  if (trimmedInstruments.length === 0) {
    tools_needed = tools_needed.filter(
      (t) => !["quote", "chart", "technical_analysis", "profile", "ratios"].includes(t)
    );
  }

  if (!toolHints.includeCalendar) {
    tools_needed = tools_needed.filter((t) => t !== "calendar");
  }
  if (!toolHints.includeTreasury) {
    tools_needed = tools_needed.filter((t) => t !== "treasury");
  }

  if (!plannerWantsEcon) {
    tools_needed = tools_needed.filter((t) => t !== "econ_chart");
    economic_indicators = [];
  } else if (!tools_needed.includes("econ_chart")) {
    tools_needed.push("econ_chart");
  }

  if (
    !inPlaceEdit &&
    contentPlan.explicitPriceSymbols.length > 0 &&
    trimmedInstruments.length > 0
  ) {
    const tools = new Set(tools_needed);
    tools.add("news");
    tools.add("quote");
    tools.add("chart");
    tools_needed = [...tools];
  }

  if (
    !inPlaceEdit &&
    trimmedInstruments.length > 0 &&
    tools_needed.includes("chart") &&
    !tools_needed.includes("technical_analysis")
  ) {
    tools_needed.push("technical_analysis");
  }

  const planned_economic_charts = plannerWantsEcon
    ? contentPlan.economicCharts.slice(0, maxEcon)
    : [];

  return applyQuickAnalysisPlanOverrides(
    applyStylePlanOverrides(
      {
        ...base,
        instruments: trimmedInstruments,
        tools_needed,
        economic_indicators,
        planned_economic_charts,
        max_economic_charts: maxEcon,
      },
      options,
      contentPlan,
      userMessage,
      inPlaceEdit
    ),
    options,
    contentPlan,
    userMessage,
    inPlaceEdit
  );
}

/** When a canvas article exists, only run research tools the user explicitly asked for. */
function constrainPlanForInPlaceEdit(
  plan: ResearchPlan,
  userMessage: string,
  contentPlan: ContentChartPlan
): ResearchPlan {
  const maxEcon = maxEconomicChartsAllowed(userMessage);

  if (isChartOnlySectionEditRequest(userMessage)) {
    const economicCharts = contentPlan.economicCharts.slice(0, 1);
    const wantsPrice =
      /\b(price chart|chart for|quote for|ohlc|tradingview)\b/i.test(userMessage) ||
      (contentPlan.explicitPriceSymbols.length > 0 &&
        /\b(chart|graph|figure|image|picture|embed|broken|fix|replace|not\s+show|missing|refresh)\b/i.test(
          userMessage
        ));
    const instruments = wantsPrice ? contentPlan.explicitPriceSymbols.slice(0, 1) : [];
    const tools: string[] = [];
    if (economicCharts.length) tools.push("econ_chart");
    if (instruments.length) {
      tools.push("quote", "chart");
    }
    return {
      ...plan,
      instruments,
      tools_needed: tools,
      planned_economic_charts: economicCharts,
      economic_indicators: [],
      max_economic_charts: 1,
      research_query:
        economicCharts[0]?.title ?? (instruments[0] ? `${instruments[0]} price chart` : "chart data"),
    };
  }

  const wantsNews = /\b(news|headline|catalyst|backup|evidence|source)\b/i.test(userMessage);
  const wantsQuote = /\b(quote|live price|current price|price level)\b/i.test(userMessage);
  const wantsPriceChart =
    /\b(price chart|chart for|ohlc|tradingview)\b/i.test(userMessage) ||
    (contentPlan.explicitPriceSymbols.length > 0 && /\b(chart|graph|figure|image)\b/i.test(userMessage));
  const wantsTa = /\b(technical analysis|rsi|macd|support|resistance|moving average|fibonacci)\b/i.test(
    userMessage
  );
  const wantsEconMacro =
    contentPlan.economicCharts.length > 0 &&
    /\b(chart|graph|figure|image|embed|cpi|inflation|gdp|unemployment|macro|economic|fix|replace|broken|missing|fetch|refresh)\b/i.test(
      userMessage
    );
  const wantsCalendar = /\b(calendar|economic event|data release|schedule|upcoming)\b/i.test(userMessage);

  const allowed = new Set<string>();
  if (wantsNews) allowed.add("news");
  if (wantsQuote) allowed.add("quote");
  if (wantsPriceChart) {
    allowed.add("quote");
    allowed.add("chart");
  }
  if (wantsTa) allowed.add("technical_analysis");
  if (wantsEconMacro) allowed.add("econ_chart");
  if (wantsCalendar) allowed.add("calendar");

  const tools_needed = plan.tools_needed.filter((t) => allowed.has(t));
  const needsInstruments = wantsQuote || wantsPriceChart || wantsTa;
  const instruments =
    needsInstruments && tools_needed.length
      ? mergeInstrumentSymbols([], contentPlan.explicitPriceSymbols).slice(0, 5)
      : [];

  return {
    ...plan,
    instruments,
    tools_needed,
    planned_economic_charts: wantsEconMacro ? contentPlan.economicCharts.slice(0, maxEcon) : [],
    economic_indicators: wantsEconMacro ? plan.economic_indicators.slice(0, maxEcon) : [],
    max_economic_charts: maxEcon,
  };
}

function emptyResearchBrief(plan: ResearchPlan): ResearchBrief {
  return {
    as_of: isoDateOffset(0),
    instruments: [],
    resolved_style: plan.resolved_style,
    news_text: "",
    quotes_text: "",
    calendar_text: "",
    extras_text: "",
    chart_embeds: [],
    econ_chart_embeds: [],
  };
}

async function runResearchPhaseIfNeeded(
  plan: ResearchPlan,
  options: ReportOutputOptions,
  sink?: PipelineSink
): Promise<{ brief: ResearchBrief; tool_events: ResearchToolEvent[] }> {
  if (!plan.tools_needed.length) {
    sink?.stageStart?.("research", "Using existing article content…");
    sink?.stageComplete?.("research", "No new market data needed — editing from existing article.");
    return { brief: emptyResearchBrief(plan), tool_events: [] };
  }
  return runResearchPhase(plan, options, sink);
}

function inPlaceEditPlanFooter(userMessage: string, plan: ResearchPlan): string {
  if (isChartOnlySectionEditRequest(userMessage)) {
    return isReplaceChartSectionEditRequest(userMessage)
      ? "• Edit: replace chart only — preserve existing prose"
      : "• Edit: append chart only — preserve existing prose";
  }
  if (!plan.tools_needed.length) {
    return "• Edit: in-place only — no new market research";
  }
  return `• Research focus: ${plan.research_query}`;
}

export function formatPlanDisplay(plan: ResearchPlan, options: ReportOutputOptions): string {
  const lines = [
    "Planning complete",
    `• ${optionsSummaryLine(options, plan.resolved_style)}`,
    plan.title_angle ? `• Title angle: ${plan.title_angle}` : "",
    plan.content_thesis ? `• Thesis: ${plan.content_thesis}` : "",
    plan.seo_keywords?.length ? `• SEO keywords: ${plan.seo_keywords.join(", ")}` : "",
    plan.seo_secondary_keywords?.length
      ? `• Secondary SEO: ${plan.seo_secondary_keywords.join(", ")}`
      : "",
    `• Instruments: ${plan.instruments.length ? plan.instruments.join(", ") : "none"}`,
    `• Data tools: ${plan.tools_needed.join(", ") || "none"}`,
    `• Sections: ${plan.section_outline.join(" → ")}`,
    `• Research focus: ${plan.research_query}`,
  ].filter(Boolean);
  if (plan.section_briefs?.length) {
    lines.push(
      "• Content plan:",
      ...plan.section_briefs.map((b) => {
        const points = b.key_points.length ? ` — ${b.key_points.slice(0, 3).join("; ")}` : "";
        return `  - ${b.title}: ${b.purpose}${points}`;
      })
    );
  }
  return lines.join("\n\n");
}

function extractChartEmbed(raw: string, chartEmbeds: string[]): string {
  const match = raw.match(/src="(data:image[^"]+)"/);
  if (!match) return raw.slice(0, 2000);
  const idx = chartEmbeds.length;
  chartEmbeds.push(match[1]);
  const nameMatch =
    raw.match(/Chart image:\s*(.+?)\s*\(embed/i) ?? raw.match(/alt="([^"]+)"/);
  const fileName = nameMatch?.[1]?.trim() ?? "ATFX - chart";
  const safe = fileName.replace(/"/g, "&quot;");
  return `Chart captured (${fileName}). Use <img src="__CHART_REF_${idx}__" alt="${safe}" data-filename="${safe}.png" /> in report_html.`;
}

function extractEconChartEmbed(raw: string, econChartEmbeds: string[]): string {
  if (econChartEmbeds.length >= MAX_ECONOMIC_CHARTS) return raw.slice(0, 2000);
  const match = raw.match(/src="(data:image[^"]+)"/);
  if (!match) return raw.slice(0, 2000);
  const idx = econChartEmbeds.length;
  econChartEmbeds.push(match[1]);
  const nameMatch =
    raw.match(/Economic chart:\s*(.+?)\s*\(/i) ?? raw.match(/alt="([^"]+)"/);
  const fileName = nameMatch?.[1]?.trim() ?? "ATFX - economic chart";
  const safe = fileName.replace(/"/g, "&quot;");
  return `Economic chart captured (${fileName}). Use <img src="__ECON_CHART_REF_${idx}__" alt="${safe}" data-filename="${safe}.png" /> in report_html macro section.`;
}

export function formatBriefDisplay(brief: ResearchBrief): string {
  return formatHeadlinesMarkdown(brief);
}

function formatHeadlinesMarkdown(brief: ResearchBrief): string {
  if (!brief.news_text.trim()) return "";
  const newsLines = brief.news_text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 4);
  if (!newsLines.length) return "";
  const body = newsLines.map((l) => `- ${l.replace(/^[-*•]\s*/, "")}`).join("\n");
  return stripCitationMarkers(`### Headlines\n\n${body}`);
}

/** Bubble-visible research content (market news + headline summary). */
export function formatResearchBubbleContent(brief: ResearchBrief): string {
  const parts: string[] = [];
  if (brief.news_text.trim()) {
    parts.push(`### Market research\n\n${brief.news_text.trim().slice(0, 4000)}`);
  }
  const headlines = formatHeadlinesMarkdown(brief);
  if (headlines) parts.push(headlines);
  return stripCitationMarkers(parts.join("\n\n"));
}

/** Full research log for chat display (tool output + brief summary). */
export function formatBriefDisplayVerbose(brief: ResearchBrief): string {
  const sections: string[] = ["Research complete", `Instruments: ${brief.instruments.join(", ")}`];
  if (brief.quotes_text.trim()) {
    sections.push("", "=== Quotes ===", brief.quotes_text.trim());
  }
  if (brief.news_text.trim()) {
    sections.push("", "=== News / catalysts ===", brief.news_text.trim().slice(0, 6000));
  }
  if (brief.calendar_text.trim()) {
    sections.push("", "=== Calendar / rates ===", brief.calendar_text.trim().slice(0, 3000));
  }
  if (brief.extras_text.trim()) {
    sections.push("", "=== Charts & extras ===", brief.extras_text.trim().slice(0, 3000));
  }
  if (brief.chart_embeds.length) {
    sections.push("", `Price charts captured: ${brief.chart_embeds.length}`);
  }
  if (brief.econ_chart_embeds.length) {
    sections.push("", `Economic charts captured: ${brief.econ_chart_embeds.length}`);
  }
  return sections.join("\n");
}

function briefToWriterText(brief: ResearchBrief): string {
  return [
    `As of: ${brief.as_of}`,
    `Instruments: ${brief.instruments.join(", ")}`,
    brief.content_plan_text
      ? `\n=== EDITORIAL BLUEPRINT (stage 1 — research targeted these sections) ===\n${brief.content_plan_text}`
      : "",
    "",
    "=== NEWS / CATALYSTS ===",
    brief.news_text,
    "",
    "=== QUOTES ===",
    brief.quotes_text,
    brief.calendar_text ? `\n=== CALENDAR ===\n${brief.calendar_text}` : "",
    brief.extras_text ? `\n=== ADDITIONAL ===\n${brief.extras_text}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function substituteChartRefs(html: string, chartEmbeds: string[], econChartEmbeds: string[] = []): string {
  let out = html.replace(/__CHART_REF_(\d+)__/g, (_m, idx) => chartEmbeds[Number(idx)] ?? "");
  out = out.replace(/__ECON_CHART_REF_(\d+)__/g, (_m, idx) => econChartEmbeds[Number(idx)] ?? "");
  return out;
}

function parseWriterPayload(
  text: string,
  chartEmbeds: string[],
  econChartEmbeds: string[] = [],
  calendarText?: string,
  extrasText?: string
): { reply: string; title?: string; report_html?: string } {
  const readString = (v: unknown): string | undefined => {
    if (typeof v !== "string") return undefined;
    const t = v.trim();
    return t || undefined;
  };
  const pickReportHtml = (parsed: Record<string, unknown>): string | undefined => {
    const direct =
      readString(parsed.report_html) ??
      readString(parsed.reportHtml) ??
      readString(parsed.html) ??
      readString(parsed.article_html) ??
      readString(parsed.content);
    if (direct) return direct;

    const nestedReport = parsed.report;
    if (nestedReport && typeof nestedReport === "object") {
      const reportObj = nestedReport as Record<string, unknown>;
      const nested =
        readString(reportObj.report_html) ??
        readString(reportObj.reportHtml) ??
        readString(reportObj.html) ??
        readString(reportObj.content);
      if (nested) return nested;
    }

    const i18n = parsed.report_i18n;
    if (i18n && typeof i18n === "object") {
      const en = (i18n as Record<string, unknown>).en;
      if (en && typeof en === "object") {
        const enHtml = readString((en as Record<string, unknown>).report_html);
        if (enHtml) return enHtml;
      }
    }
    return undefined;
  };
  const decodeJsonLikeString = (s: string): string =>
    s
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  const readMalformedJsonField = (raw: string, field: string): string | undefined => {
    const re = new RegExp(`"${field}"\\s*:\\s*"([\\s\\S]*?)"(?=\\s*,\\s*"|\\s*}\\s*$)`, "i");
    const m = raw.match(re);
    if (!m?.[1]) return undefined;
    const v = decodeJsonLikeString(m[1]).trim();
    return v || undefined;
  };

  const jsonStr = extractFirstJsonObject(text);
  if (jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
      const reply =
        readString(parsed.reply) ??
        readString(parsed.message) ??
        readString(parsed.summary) ??
        "";
      const rawHtml = pickReportHtml(parsed);
      const report_html = rawHtml
        ? normalizeWriterReportHtml(rawHtml, chartEmbeds, econChartEmbeds, calendarText, extrasText)
        : undefined;
      if (reply || report_html) {
        return {
          reply: reply || (report_html ? "Report generated." : "Done."),
          title: readString(parsed.title) ?? readString(parsed.headline),
          report_html,
        };
      }
    } catch {
      const reply =
        readMalformedJsonField(jsonStr, "reply") ??
        readMalformedJsonField(jsonStr, "message") ??
        readMalformedJsonField(jsonStr, "summary") ??
        "";
      const title =
        readMalformedJsonField(jsonStr, "title") ??
        readMalformedJsonField(jsonStr, "headline");
      const rawHtml =
        readMalformedJsonField(jsonStr, "report_html") ??
        readMalformedJsonField(jsonStr, "reportHtml") ??
        readMalformedJsonField(jsonStr, "html") ??
        readMalformedJsonField(jsonStr, "article_html") ??
        readMalformedJsonField(jsonStr, "content");
      const report_html = rawHtml
        ? normalizeWriterReportHtml(rawHtml, chartEmbeds, econChartEmbeds, calendarText, extrasText)
        : undefined;
      if (reply || report_html) {
        return {
          reply: reply || (report_html ? "Report generated." : "Done."),
          title,
          report_html,
        };
      }
    }
  }
  return { reply: text.trim() || "Done." };
}

function parseSectionWriterPayload(
  text: string,
  chartEmbeds: string[],
  econChartEmbeds: string[] = [],
  calendarText?: string,
  extrasText?: string
): { reply: string; section_html?: string; sections_html?: string[] } {
  const readString = (v: unknown): string | undefined => {
    if (typeof v !== "string") return undefined;
    const t = v.trim();
    return t || undefined;
  };
  const pickSectionHtml = (parsed: Record<string, unknown>): string | undefined => {
    const direct =
      readString(parsed.section_html) ??
      readString(parsed.sectionHtml) ??
      readString(parsed.report_html) ??
      readString(parsed.reportHtml) ??
      readString(parsed.html) ??
      readString(parsed.content);
    if (direct) return direct;

    const section = parsed.section;
    if (section && typeof section === "object") {
      const sectionObj = section as Record<string, unknown>;
      return (
        readString(sectionObj.section_html) ??
        readString(sectionObj.sectionHtml) ??
        readString(sectionObj.html) ??
        readString(sectionObj.content)
      );
    }
    return undefined;
  };
  const decodeJsonLikeString = (s: string): string =>
    s
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  const readMalformedJsonField = (raw: string, field: string): string | undefined => {
    const re = new RegExp(`"${field}"\\s*:\\s*"([\\s\\S]*?)"(?=\\s*,\\s*"|\\s*}\\s*$)`, "i");
    const m = raw.match(re);
    if (!m?.[1]) return undefined;
    const v = decodeJsonLikeString(m[1]).trim();
    return v || undefined;
  };

  const jsonStr = extractFirstJsonObject(text);
  if (jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
      const reply =
        readString(parsed.reply) ??
        readString(parsed.message) ??
        readString(parsed.summary) ??
        "";
      const rawSection = pickSectionHtml(parsed) ?? "";
      const section_html = rawSection
        ? normalizeWriterReportHtml(rawSection, chartEmbeds, econChartEmbeds, calendarText, extrasText)
        : undefined;
      const rawSections = (parsed.sections_html ?? parsed.sectionsHtml) as unknown;
      const sections_html = Array.isArray(rawSections)
        ? rawSections
            .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
            .map((s) => normalizeWriterReportHtml(s, chartEmbeds, econChartEmbeds, calendarText, extrasText))
        : undefined;
      if (reply || section_html || sections_html?.length) {
        return {
          reply: reply || "Section updated.",
          section_html,
          sections_html,
        };
      }
    } catch {
      const reply =
        readMalformedJsonField(jsonStr, "reply") ??
        readMalformedJsonField(jsonStr, "message") ??
        readMalformedJsonField(jsonStr, "summary") ??
        "";
      const rawSection =
        readMalformedJsonField(jsonStr, "section_html") ??
        readMalformedJsonField(jsonStr, "sectionHtml") ??
        readMalformedJsonField(jsonStr, "report_html") ??
        readMalformedJsonField(jsonStr, "reportHtml") ??
        readMalformedJsonField(jsonStr, "html") ??
        readMalformedJsonField(jsonStr, "content");
      const section_html = rawSection
        ? normalizeWriterReportHtml(rawSection, chartEmbeds, econChartEmbeds, calendarText, extrasText)
        : undefined;
      if (reply || section_html) {
        return {
          reply: reply || "Section updated.",
          section_html,
        };
      }
    }
  }
  return { reply: text.trim() || "Done." };
}

function formatSectionEditPlanDisplay(
  intent: SectionEditIntent,
  sections: ReturnType<typeof listReportSections>,
  plan?: ResearchPlan,
  userMessage?: string
): string {
  const lines = ["Planning complete", `• ${describeEditIntent(intent, sections, userMessage)}`];
  if (plan) {
    lines.push(`• Instruments: ${plan.instruments.join(", ") || "from report context"}`);
    lines.push(`• Research focus: ${plan.research_query}`);
    lines.push(`• Tools: ${plan.tools_needed.join(", ") || "none"}`);
  }
  return lines.join("\n\n");
}

function isContentEditIntent(intent: SectionEditIntent): intent is
  | Extract<SectionEditIntent, { mode: "revise" }>
  | Extract<SectionEditIntent, { mode: "insert" }>
  | Extract<SectionEditIntent, { mode: "merge" }>
  | Extract<SectionEditIntent, { mode: "split" }> {
  return intent.mode === "revise" || intent.mode === "insert" || intent.mode === "merge" || intent.mode === "split";
}

async function runSectionStructuralEdit(
  intent: SectionEditIntent,
  currentReportHtml: string,
  sink?: PipelineSink
): Promise<{ reply: string; report_html: string; rawText: string }> {
  const sections = listReportSections(currentReportHtml);
  sink?.stageStart?.("planning", "Planning section edit…");
  sink?.stageComplete?.("planning", formatSectionEditPlanDisplay(intent, sections));

  if (intent.mode === "remove") {
    sink?.stageStart?.("writing", `Removing "${intent.section.title}"…`);
    const report_html = removeReportSection(currentReportHtml, intent.section.title);
    sink?.stageComplete?.("writing", `Section removed\n• "${intent.section.title}" deleted`);
    sink?.reportPreview?.("en", report_html);
    return {
      reply: `Removed the "${intent.section.title}" section.`,
      report_html,
      rawText: "",
    };
  }

  if (intent.mode === "rename") {
    sink?.stageStart?.("writing", `Renaming "${intent.section.title}"…`);
    const report_html = renameReportSection(currentReportHtml, intent.section.title, intent.newTitle);
    sink?.stageComplete?.(
      "writing",
      `Section renamed\n• "${intent.section.title}" → "${intent.newTitle}"`
    );
    sink?.reportPreview?.("en", report_html);
    return {
      reply: `Renamed "${intent.section.title}" to "${intent.newTitle}".`,
      report_html,
      rawText: "",
    };
  }

  if (intent.mode === "move") {
    const placementDescription = describeSectionPlacement(intent.placement, sections);
    sink?.stageStart?.("writing", `Moving "${intent.section.title}"…`);
    const report_html = moveReportSection(currentReportHtml, intent.section.title, intent.placement);
    sink?.stageComplete?.(
      "writing",
      `Section moved\n• "${intent.section.title}" ${placementDescription}`
    );
    sink?.reportPreview?.("en", report_html);
    return {
      reply: `Moved "${intent.section.title}" ${placementDescription}.`,
      report_html,
      rawText: "",
    };
  }

  throw new Error(`Unsupported structural edit mode: ${(intent as SectionEditIntent).mode}`);
}

function buildChartBlockFromBrief(brief: ResearchBrief, plan: ResearchPlan): string {
  const parts: string[] = [];
  const econPlans = plan.planned_economic_charts ?? [];
  for (let i = 0; i < brief.econ_chart_embeds.length; i++) {
    const src = brief.econ_chart_embeds[i];
    const planItem = econPlans[i];
    const attrs = atfxEconomicChartImgAttrs(planItem?.indicator ?? planItem?.title ?? "economic chart");
    parts.push(tagSoloEconomicChartBlock(`<p><img src="${src}" ${attrs} /></p>`));
  }
  for (let i = 0; i < brief.chart_embeds.length; i++) {
    const src = brief.chart_embeds[i];
    const sym = plan.instruments[i] ?? plan.instruments[0] ?? "Chart";
    const safe = sym.replace(/"/g, "&quot;");
    parts.push(`<p><img src="${src}" alt="${safe}" data-filename="ATFX - ${safe}.png" /></p>`);
  }
  return parts.join("\n");
}

function buildAppendChartPlan(
  userMessage: string,
  sectionTitle: string,
  options: ReportOutputOptions
): ResearchPlan {
  const contentPlan = planContentCharts(userMessage);
  const instruments = contentPlan.explicitPriceSymbols.length
    ? contentPlan.explicitPriceSymbols
    : contentPlan.priceSymbols;
  const trimmedInstruments = instruments.slice(0, 1);
  const economicCharts = contentPlan.economicCharts.slice(0, 1);
  const tools: string[] = [];
  if (economicCharts.length) tools.push("econ_chart");
  if (trimmedInstruments.length) {
    tools.push("quote", "chart");
  }
  const chartLabel =
    economicCharts[0]?.title ?? (trimmedInstruments[0] ? `${trimmedInstruments[0]} price chart` : "chart data");
  return {
    resolved_style: effectiveStyle(options, "bloomberg"),
    instruments: trimmedInstruments,
    research_query: chartLabel,
    section_outline: [sectionTitle],
    tools_needed: tools,
    chart_objective: "daily",
    recency: "week",
    economic_indicators: [],
    planned_economic_charts: economicCharts,
    max_economic_charts: 1,
  };
}

async function runAppendChartSectionEdit(
  userMessage: string,
  intent: Extract<SectionEditIntent, { mode: "append_chart" }>,
  currentReportHtml: string,
  options: ReportOutputOptions,
  sink?: PipelineSink
): Promise<PipelineResult> {
  const sections = listReportSections(currentReportHtml);
  const plan = buildAppendChartPlan(userMessage, intent.section.title, options);
  const isReplace = isReplaceChartSectionEditRequest(userMessage);

  sink?.stageStart?.("planning", "Planning chart placement…");
  sink?.stageComplete?.(
    "planning",
    [
      "Planning complete",
      `• ${describeEditIntent(intent, sections, userMessage)}`,
      `• Chart: ${plan.research_query}`,
      `• Tools: ${plan.tools_needed.join(", ") || "none"}`,
      "• Edit: chart embed only — preserve existing prose",
    ].join("\n\n")
  );

  if (!plan.tools_needed.length) {
    throw new Error("Could not determine which chart to add from your request.");
  }

  const { brief, tool_events } = await runResearchPhase(plan, options, sink);

  const chartBlock = buildChartBlockFromBrief(brief, plan);
  if (!chartBlock.trim()) {
    throw new Error("Chart data could not be fetched — try again or name the indicator (e.g. US inflation, CPI).");
  }

  sink?.stageStart?.(
    "writing",
    isReplace ? `Replacing chart in "${intent.section.title}"…` : `Adding chart to "${intent.section.title}"…`
  );
  let sectionHtml = intent.section.html;
  if (isReplace) {
    sectionHtml = removeMacroChartsFromSectionHtml(sectionHtml, userMessage);
  }
  const newSectionHtml = appendContentToSectionEnd(sectionHtml, chartBlock);
  let report_html = replaceReportSection(currentReportHtml, intent.section.title, newSectionHtml);
  report_html = refreshReportChartEmbeds(report_html, brief);
  const reply = isReplace
    ? `Replaced ${plan.research_query} in "${intent.section.title}".`
    : `Added ${plan.research_query} at the end of "${intent.section.title}".`;
  sink?.stageComplete?.(
    "writing",
    isReplace ? `Chart replaced\n• ${plan.research_query}` : `Chart added\n• ${plan.research_query}`
  );
  if (report_html?.trim()) sink?.reportPreview?.("en", report_html);

  const titleMatch = currentReportHtml.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const written = {
    reply,
    title: titleMatch ? stripHtmlFromTitle(titleMatch[1]) : undefined,
    report_html,
  };
  const report_i18n = await runTranslatePhase(written, options, sink);
  const extraLangs = translationTargets(options.languages);
  const replySuffix =
    extraLangs.length > 0
      ? `\n\nTranslated versions: ${extraLangs.map((l) => languageTabLabel(l)).join(", ")}.`
      : "";

  return {
    reply: `${written.reply}${replySuffix}`,
    title: written.title,
    report_html: written.report_html,
    report_i18n: Object.keys(report_i18n).length ? report_i18n : undefined,
    tool_events,
    research_plan: plan,
    research_brief: brief,
    output_options: options,
    pipeline_display: {
      planning: "",
      research: formatBriefDisplayVerbose(brief),
      writing: reply,
    },
    rawText: "",
  };
}

async function runPlanPhase(
  userMessage: string,
  options: ReportOutputOptions,
  sink?: PipelineSink
): Promise<ResearchPlan> {
  sink?.stageStart?.("planning", "Planning research…");
  const today = new Date().toISOString().slice(0, 10);
  const planningMessage = expandUserMessageForPlanning(userMessage, options);
  const contentPlan = planContentCharts(planningMessage);
  const qaPrimary = parseQuickAnalysisPrimarySymbol(userMessage);
  const chartHints = contentPlan.explicitPriceSymbols.length
    ? contentPlan.explicitPriceSymbols
    : contentPlan.priceSymbols;
  const hints = qaPrimary ? [...new Set([qaPrimary, ...chartHints])] : chartHints;
  const econHints = contentPlan.economicCharts.length
    ? formatEconomicChartHints(contentPlan.economicCharts)
    : undefined;
  const planModels = planModelChain(config.requesty.atfxResearchPlanModel);
  const plannerSystem = buildPlannerSystemPrompt(
    options,
    today,
    options.style === "technical_analysis" ? "technical_analysis" : "new_article"
  );
  const raw = await streamRequestyChatWithModelChain(
    planModels,
    [
      {
        role: "system",
        content: plannerSystem,
      },
      { role: "user", content: buildPlanUserPrompt(planningMessage, options, today, hints, econHints ? [econHints] : undefined) },
    ],
    () => {},
    { temperature: 0.3 }
  );
  const plan = mergeContentChartPlan(parsePlanJson(raw, options), contentPlan, planningMessage, options);
  sink?.stageComplete?.("planning", formatPlanDisplay(plan, options));
  return plan;
}

async function runSectionEditPlanPhase(
  userMessage: string,
  intent: Extract<SectionEditIntent, { mode: "revise" | "insert" | "merge" | "split" }>,
  options: ReportOutputOptions,
  currentReportHtml: string,
  sink?: PipelineSink
): Promise<ResearchPlan> {
  const sectionTitle =
    intent.mode === "insert"
      ? intent.newSectionTitle
      : intent.mode === "merge"
        ? intent.mergedTitle
        : intent.mode === "split"
          ? intent.section.title
          : intent.section.title;
  const planMode = intent.mode === "merge" || intent.mode === "split" ? "revise" : intent.mode;
  const sections = listReportSections(currentReportHtml);
  const placementDescription =
    intent.mode === "insert" ? describeSectionPlacement(intent.placement, sections) : undefined;

  sink?.stageStart?.(
    "planning",
    intent.mode === "insert"
      ? `Planning new section…`
      : intent.mode === "merge"
        ? `Planning section merge…`
        : intent.mode === "split"
          ? `Planning section split…`
          : `Planning section revision…`
  );
  const today = new Date().toISOString().slice(0, 10);
  const contentPlan = planContentCharts(userMessage);
  const hints = contentPlan.explicitPriceSymbols;
  const planModels = planModelChain(config.requesty.atfxResearchPlanModel);
  const raw = await streamRequestyChatWithModelChain(
    planModels,
    [
      {
        role: "system",
        content: buildPlannerSystemPrompt(options, today, "section_edit"),
      },
      {
        role: "user",
        content: buildSectionRevisionPlanPrompt(
          userMessage,
          sectionTitle,
          options,
          today,
          hints,
          planMode,
          placementDescription,
          listReportSectionTitles(currentReportHtml)
        ),
      },
    ],
    () => {},
    { temperature: 0.3 }
  );
  const plan = mergeContentChartPlan(parsePlanJson(raw, options), contentPlan, userMessage, options, {
    inPlaceEdit: true,
  });
  plan.section_outline = [sectionTitle];
  if (!plan.tools_needed.includes("news") && /\b(news|headline|catalyst|backup|evidence|source)\b/i.test(userMessage)) {
    plan.tools_needed = [...new Set([...plan.tools_needed, "news"])];
  }
  if (
    (planMode === "insert" || intent.mode === "merge" || intent.mode === "split") &&
    /\b(faq|f\s*&\s*q|q\s*&\s*a|frequently asked)\b/i.test(sectionTitle) &&
    !/\b(news|quote|chart|market|data|catalyst)\b/i.test(userMessage)
  ) {
    plan.tools_needed = [];
  }
  const constrained = constrainPlanForInPlaceEdit(plan, userMessage, contentPlan);
  sink?.stageComplete?.("planning", formatSectionEditPlanDisplay(intent, sections, constrained, userMessage));
  return constrained;
}

async function runSectionWritePhase(
  userMessage: string,
  intent: Extract<SectionEditIntent, { mode: "revise" | "insert" | "merge" | "split" }>,
  plan: ResearchPlan,
  brief: ResearchBrief,
  options: ReportOutputOptions,
  currentReportHtml: string,
  sink?: PipelineSink
): Promise<{ reply: string; report_html?: string; rawText: string }> {
  const writerModels = writerModelChain(config.requesty.atfxResearchWriterModel);
  const briefText = briefToWriterText(brief);

  if (intent.mode === "merge") {
    sink?.stageStart?.("writing", `Merging sections into "${intent.mergedTitle}"…`);
    const system = buildSectionMergeWriterSystemPrompt(plan.resolved_style, options, brief.as_of);
    const user = buildSectionMergeWriterUserPrompt(
      userMessage,
      intent.mergedTitle,
      intent.sections.map((s) => ({ title: s.title, html: s.html })),
      briefText,
      currentReportHtml,
      brief.as_of
    );
    const rawText = await streamRequestyChatWithModelChain(
      writerModels,
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      (piece) => sink?.delta?.(piece),
      { temperature: 0.4, max_tokens: 5_500 }
    );
    const parsed = parseSectionWriterPayload(rawText, brief.chart_embeds, brief.econ_chart_embeds, brief.calendar_text, brief.extras_text);
    let report_html: string | undefined;
    if (parsed.section_html?.trim()) {
      report_html = mergeReportSections(currentReportHtml, intent.sections, parsed.section_html);
    }
    sink?.stageComplete?.(
      "writing",
      report_html ? `Sections merged\n• "${intent.mergedTitle}"` : `Writing complete\n• Could not merge sections`
    );
    if (report_html?.trim()) sink?.reportPreview?.("en", report_html);
    return { reply: parsed.reply, report_html, rawText };
  }

  if (intent.mode === "split") {
    sink?.stageStart?.("writing", `Splitting "${intent.section.title}"…`);
    const system = buildSectionSplitWriterSystemPrompt(plan.resolved_style, options, brief.as_of);
    const user = buildSectionSplitWriterUserPrompt(
      userMessage,
      intent.section.title,
      intent.section.html,
      intent.splitTitles,
      briefText,
      currentReportHtml,
      brief.as_of
    );
    const rawText = await streamRequestyChatWithModelChain(
      writerModels,
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      (piece) => sink?.delta?.(piece),
      { temperature: 0.4, max_tokens: 5_500 }
    );
    const parsed = parseSectionWriterPayload(rawText, brief.chart_embeds, brief.econ_chart_embeds, brief.calendar_text, brief.extras_text);
    let report_html: string | undefined;
    if (parsed.sections_html?.length) {
      report_html = splitReportSection(currentReportHtml, intent.section.title, parsed.sections_html);
    }
    sink?.stageComplete?.(
      "writing",
      report_html
        ? `Section split\n• "${intent.section.title}" → ${intent.splitTitles.join(", ")}`
        : `Writing complete\n• Could not split section`
    );
    if (report_html?.trim()) sink?.reportPreview?.("en", report_html);
    return { reply: parsed.reply, report_html, rawText };
  }

  if (intent.mode === "revise") {
    const chartOnly = isChartOnlySectionEditRequest(userMessage);
    sink?.stageStart?.("writing", `Revising "${intent.section.title}"…`);
    const system = buildSectionRevisionWriterSystemPrompt(plan.resolved_style, options, brief.as_of, chartOnly);
    const user = buildSectionRevisionWriterUserPrompt(
      userMessage,
      intent.section.title,
      intent.section.html,
      briefText,
      currentReportHtml,
      brief.as_of,
      chartOnly
    );

    const rawText = await streamRequestyChatWithModelChain(
      writerModels,
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      (piece) => sink?.delta?.(piece),
      { temperature: 0.4, max_tokens: 4_500 }
    );

    const parsed = parseSectionWriterPayload(rawText, brief.chart_embeds, brief.econ_chart_embeds, brief.calendar_text, brief.extras_text);
    let report_html: string | undefined;
    if (parsed.section_html?.trim()) {
      let sectionHtml = parsed.section_html;
      if (chartOnly && brief.econ_chart_embeds.length > 0) {
        sectionHtml = repairEconomicChartImgTags(sectionHtml, brief.econ_chart_embeds);
        const hasEconChart = brief.econ_chart_embeds.some((src) => sectionHtml.includes(src));
        if (!hasEconChart) {
          const chartBlock = buildChartBlockFromBrief(brief, plan);
          if (chartBlock.trim()) {
            sectionHtml = appendContentToSectionEnd(sectionHtml, chartBlock);
          }
        }
      }
      report_html = replaceReportSection(currentReportHtml, intent.section.title, sectionHtml);
    }

    sink?.stageComplete?.(
      "writing",
      report_html
        ? chartOnly
          ? `Chart added\n• "${intent.section.title}"`
          : `Section updated\n• "${intent.section.title}" revised`
        : `Writing complete\n• Could not apply section revision`
    );
    if (report_html?.trim()) sink?.reportPreview?.("en", report_html);

    return { reply: parsed.reply, report_html, rawText };
  }

  const sections = listReportSections(currentReportHtml);
  const placementDescription = describeSectionPlacement(intent.placement, sections);
  sink?.stageStart?.("writing", `Adding "${intent.newSectionTitle}"…`);
  const system = buildSectionInsertWriterSystemPrompt(plan.resolved_style, options, brief.as_of);
  const user = buildSectionInsertWriterUserPrompt(
    userMessage,
    intent.newSectionTitle,
    placementDescription,
    sections.map((s) => s.title),
    briefText,
    currentReportHtml,
    brief.as_of
  );

  const rawText = await streamRequestyChatWithModelChain(
    writerModels,
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    (piece) => sink?.delta?.(piece),
    { temperature: 0.4, max_tokens: 4_500 }
  );

  const parsed = parseSectionWriterPayload(rawText, brief.chart_embeds, brief.econ_chart_embeds, brief.calendar_text, brief.extras_text);
  let report_html: string | undefined;
  if (parsed.section_html?.trim()) {
    report_html = insertReportSection(currentReportHtml, parsed.section_html, intent.placement);
  }

  sink?.stageComplete?.(
    "writing",
    report_html
      ? `Section added\n• "${intent.newSectionTitle}" inserted ${placementDescription}`
      : `Writing complete\n• Could not add section`
  );
  if (report_html?.trim()) sink?.reportPreview?.("en", report_html);

  return { reply: parsed.reply, report_html, rawText };
}

async function runSectionEditPipeline(
  userMessage: string,
  currentReportHtml: string,
  intent: SectionEditIntent,
  options: ReportOutputOptions,
  sink?: PipelineSink
): Promise<PipelineResult> {
  const pipeline_display: PipelineDisplayLog = { planning: "", research: "", writing: "" };
  const trackedSink: PipelineSink = {
    ...sink,
    stageDelta: (stage, delta) => {
      if (stage === "research" || stage === "writing") {
        pipeline_display[stage] += delta;
      }
      if (stage !== "planning") {
        sink?.stageDelta?.(stage, delta);
      }
    },
    stageComplete: (stage, displayText) => {
      if (stage === "planning" || stage === "research" || stage === "writing") {
        if (stage === "planning") {
          pipeline_display[stage] = displayText;
        } else {
          const prior = pipeline_display[stage].trim();
          pipeline_display[stage] = prior ? `${prior}\n\n${displayText}` : displayText;
        }
      }
      sink?.stageComplete?.(stage, displayText);
    },
    delta: (text) => {
      pipeline_display.writing += text;
      sink?.delta?.(text);
    },
  };

  if (intent.mode === "append_chart") {
    return runAppendChartSectionEdit(userMessage, intent, currentReportHtml, options, trackedSink);
  }

  if (!isContentEditIntent(intent)) {
    const structural = await runSectionStructuralEdit(intent, currentReportHtml, trackedSink);
    const titleMatch = currentReportHtml.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
    const written = {
      reply: structural.reply,
      title: titleMatch ? stripHtmlFromTitle(titleMatch[1]) : undefined,
      report_html: structural.report_html,
    };
    const report_i18n = await runTranslatePhase(written, options, trackedSink);
    const extraLangs = translationTargets(options.languages);
    const replySuffix =
      extraLangs.length > 0
        ? `\n\nTranslated versions: ${extraLangs.map((l) => languageTabLabel(l)).join(", ")}.`
        : "";
    const emptyPlan: ResearchPlan = {
      resolved_style: effectiveStyle(options, "bloomberg"),
      instruments: [],
      research_query: "",
      section_outline: [],
      tools_needed: [],
      chart_objective: "daily",
      recency: "week",
      economic_indicators: [],
    };
    const emptyBrief: ResearchBrief = {
      as_of: isoDateOffset(0),
      instruments: [],
      resolved_style: emptyPlan.resolved_style,
      news_text: "",
      quotes_text: "",
      calendar_text: "",
      extras_text: "",
      chart_embeds: [],
      econ_chart_embeds: [],
    };
    return {
      reply: `${written.reply}${replySuffix}`,
      title: written.title,
      report_html: written.report_html,
      report_i18n: Object.keys(report_i18n).length ? report_i18n : undefined,
      tool_events: [],
      research_plan: emptyPlan,
      research_brief: emptyBrief,
      output_options: options,
      pipeline_display,
      rawText: structural.rawText,
    };
  }

  const plan = await runSectionEditPlanPhase(userMessage, intent, options, currentReportHtml, trackedSink);
  const { brief, tool_events } = await runResearchPhaseIfNeeded(plan, options, trackedSink);
  const revised = await runSectionWritePhase(
    userMessage,
    intent,
    plan,
    brief,
    options,
    currentReportHtml,
    trackedSink
  );

  const titleMatch = currentReportHtml.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const written = {
    reply: revised.reply,
    title: titleMatch ? stripHtmlFromTitle(titleMatch[1]) : undefined,
    report_html: revised.report_html,
  };
  const report_i18n = await runTranslatePhase(written, options, trackedSink);

  const extraLangs = translationTargets(options.languages);
  const replySuffix =
    extraLangs.length > 0
      ? `\n\nTranslated versions: ${extraLangs.map((l) => languageTabLabel(l)).join(", ")}.`
      : "";

  return {
    reply: `${written.reply}${replySuffix}`,
    title: written.title,
    report_html: written.report_html,
    report_i18n: Object.keys(report_i18n).length ? report_i18n : undefined,
    tool_events,
    research_plan: plan,
    research_brief: brief,
    output_options: { ...options, style: options.style === "auto" ? "auto" : plan.resolved_style },
    pipeline_display,
    rawText: revised.rawText,
  };
}

function stripHtmlFromTitle(raw: string): string {
  return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

async function runResearchPhase(
  plan: ResearchPlan,
  options: ReportOutputOptions,
  sink?: PipelineSink
): Promise<{ brief: ResearchBrief; tool_events: ResearchToolEvent[] }> {
  const contentPlan = formatContentPlanForResearch(researchPlanToWriterContentPlan(plan), options);
  const researchQuery = buildResearchQueryFromPlan(plan);
  const sectionCount = plan.section_outline.length;
  sink?.stageStart?.(
    "research",
    sectionCount
      ? `Gathering data for ${sectionCount} planned sections…`
      : "Gathering market data…"
  );
  const tool_events: ResearchToolEvent[] = [];
  const chart_embeds: string[] = [];
  const econ_chart_embeds: string[] = [];
  const today = isoDateOffset(0);
  const calendarTo = isoDateOffset(horizonDays(options.horizon));

  const tasks: Array<{ name: string; args: Record<string, unknown>; detail?: string }> = [];

  if (plan.tools_needed.includes("news")) {
    tasks.push({
      name: "get_market_news_research",
      args: {
        query: researchQuery,
        content_plan: contentPlan,
        audience: options.audience,
        pace: options.pace,
        length: options.length,
        horizon: options.horizon,
        symbols: plan.instruments.join(", "),
        recency: plan.recency,
        asOfDate: today,
      },
    });
  }

  const maxInstruments = options.pace === "quick" ? 1 : 3;
  for (const sym of plan.instruments.slice(0, maxInstruments)) {
    if (plan.tools_needed.includes("quote")) {
      const args = { symbol: sym };
      tasks.push({ name: "get_fmp_quote", args, detail: toolEventDetail("get_fmp_quote", args) });
    }
    if (plan.tools_needed.includes("chart")) {
      const args = { symbol: sym, objective: plan.chart_objective };
      tasks.push({
        name: "get_chart_image",
        args,
        detail: toolEventDetail("get_chart_image", args),
      });
    }
    if (plan.tools_needed.includes("technical_analysis")) {
      const args = { symbol: sym, objective: plan.chart_objective };
      tasks.push({
        name: "get_technical_analysis",
        args,
        detail: toolEventDetail("get_technical_analysis", args),
      });
    }
  }

  if (options.pace !== "quick") {
    if (plan.tools_needed.includes("calendar")) {
      const calContext = `${researchQuery}\n${contentPlan}\n${plan.instruments.join(" ")}`;
      let calCountries = detectCalendarCountries(calContext, plan.instruments);
      if (isGoldSilverArticle(calContext, plan.instruments)) {
        calCountries = ["US"];
      }
      tasks.push({
        name: "get_fmp_economic_calendar",
        args: {
          fromDate: today,
          toDate: calendarTo,
          importance: "high",
          ...(calCountries.length ? { countries: calCountries } : {}),
        },
      });
    }

    if (plan.tools_needed.includes("treasury")) {
      tasks.push({
        name: "get_fmp_treasury_rates",
        args: { fromDate: isoDateOffset(-14), toDate: today },
      });
    }

    const primaryEquity = plan.instruments.find((s) => /^[A-Z]{1,5}$/.test(s) && !s.endsWith("USD"));
    if (primaryEquity) {
      if (plan.tools_needed.includes("profile")) {
        tasks.push({ name: "get_fmp_company_profile", args: { symbol: primaryEquity } });
      }
      if (plan.tools_needed.includes("ratios")) {
        tasks.push({ name: "get_fmp_ratios", args: { symbol: primaryEquity } });
      }
    }
  }

  const maxEcon = plan.max_economic_charts ?? MAX_ECONOMIC_CHARTS;

  const explicitEconPlan =
    (plan.planned_economic_charts?.length ?? 0) > 0 || plan.economic_indicators.length > 0;
  const runEconCharts =
    plan.tools_needed.includes("econ_chart") && (options.pace !== "quick" || explicitEconPlan);

  if (runEconCharts) {
    let econChartTaskCount = 0;

    for (const ind of plan.economic_indicators) {
      tasks.push({
        name: "get_fmp_economic_indicator",
        args: {
          name: ind.name,
          months: ind.months ?? 12,
        },
      });
      if (econChartTaskCount >= maxEcon) continue;
      econChartTaskCount += 1;
      tasks.push({
        name: "get_economic_chart",
        args: {
          indicator: ind.name,
          chartType: ind.chartType,
          months: ind.months ?? 12,
        },
      });
    }

    for (const ec of plan.planned_economic_charts ?? []) {
      if (econChartTaskCount >= maxEcon) break;
      if (ec.source === "calendar") {
        econChartTaskCount += 1;
        tasks.push({
          name: "get_economic_chart",
          args: {
            country: ec.country,
            eventPattern: ec.eventPattern,
            preferEventPrefix: ec.preferEventPrefix,
            title: ec.title,
            chartType: ec.chartType,
            months: ec.months,
          },
        });
        continue;
      }
      if (ec.indicator) {
        const dup = plan.economic_indicators.some((i) => i.name === ec.indicator);
        if (dup) continue;
        tasks.push({
          name: "get_fmp_economic_indicator",
          args: { name: ec.indicator, months: ec.months },
        });
        econChartTaskCount += 1;
        tasks.push({
          name: "get_economic_chart",
          args: { indicator: ec.indicator, chartType: ec.chartType, months: ec.months },
        });
      }
    }
  }

  const results = await Promise.all(
    tasks.map(async ({ name, args, detail }) => {
      sink?.toolStart?.(name, detail);
      sink?.stageStart?.("research", `Running ${toolDisplayLabel(name)}${detail ? ` (${detail})` : ""}…`);
      const raw = await executeResearchTool(name, args);
      const summary = raw.slice(0, 120);
      tool_events.push({ name, summary, ...(detail ? { detail } : {}) });
      sink?.toolResult?.(name, summary, detail);
      const content =
        name === "get_chart_image"
          ? extractChartEmbed(raw, chart_embeds)
          : name === "get_economic_chart"
            ? extractEconChartEmbed(raw, econ_chart_embeds)
            : raw;
      if (name === "get_market_news_research") {
        sink?.stageDelta?.(
          "research",
          `\n\n### Market research\n\n${stripCitationMarkers(content.slice(0, 4000))}\n`
        );
      }
      return { name, content };
    })
  );

  let news_text = "";
  let quotes_text = "";
  let calendar_text = "";
  let extras_text = "";

  for (const r of results) {
    if (r.name === "get_market_news_research") news_text = r.content;
    else if (r.name === "get_fmp_quote") quotes_text += (quotes_text ? "\n" : "") + r.content;
    else if (r.name === "get_fmp_economic_calendar" || r.name === "get_fmp_treasury_rates") {
      calendar_text += (calendar_text ? "\n" : "") + r.content;
    } else if (r.name === "get_fmp_economic_indicator") {
      calendar_text += (calendar_text ? "\n\n" : "") + r.content;
    } else if (r.name === "get_chart_image" || r.name === "get_economic_chart") {
      extras_text += (extras_text ? "\n" : "") + r.content;
    } else {
      extras_text += (extras_text ? "\n\n" : "") + r.content;
    }
  }

  const brief: ResearchBrief = {
    as_of: today,
    instruments: plan.instruments,
    resolved_style: plan.resolved_style,
    news_text: news_text.slice(0, 8000),
    quotes_text: quotes_text.slice(0, 4000),
    calendar_text: calendar_text.slice(0, 4000),
    extras_text: extras_text.slice(0, 12_000),
    chart_embeds,
    econ_chart_embeds,
    ...(contentPlan ? { content_plan_text: contentPlan } : {}),
  };

  sink?.stageComplete?.("research", formatBriefDisplay(brief));
  return { brief, tool_events };
}

async function runWritePhase(
  userMessage: string,
  plan: ResearchPlan,
  brief: ResearchBrief,
  options: ReportOutputOptions,
  currentReportHtml: string,
  sink?: PipelineSink
): Promise<{ reply: string; title?: string; report_html?: string; rawText: string }> {
  sink?.stageStart?.("writing", "Writing report…");
  const style = plan.resolved_style;
  const writerModels = writerModelChain(config.requesty.atfxResearchWriterModel);
  const system = buildWriterSystemPrompt(style, options, brief.as_of);
  const user = buildWriterUserPrompt(
    userMessage,
    briefToWriterText(brief),
    researchPlanToWriterContentPlan(plan),
    options,
    currentReportHtml,
    brief.as_of
  );

  const rawText = await streamRequestyChatWithModelChain(
    writerModels,
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    (piece) => sink?.delta?.(piece),
    { temperature: 0.45, max_tokens: options.length === "2000" ? 10_000 : 4_500 }
  );

  const parsed = parseWriterPayload(rawText, brief.chart_embeds, brief.econ_chart_embeds, brief.calendar_text, brief.extras_text);
  sink?.stageComplete?.(
    "writing",
    `Writing complete\n• ${parsed.title ?? "Report"} ready in English (~${options.length} words)`
  );
  if (parsed.report_html?.trim()) {
    sink?.reportPreview?.("en", parsed.report_html);
  }
  return { ...parsed, rawText };
}

async function runArticleRevisionPlanPhase(
  userMessage: string,
  currentReportHtml: string,
  options: ReportOutputOptions,
  sink?: PipelineSink
): Promise<ResearchPlan> {
  sink?.stageStart?.("planning", "Planning article updates…");
  const today = new Date().toISOString().slice(0, 10);
  const sectionTitles = listReportSectionTitles(currentReportHtml);
  const prefixedMessage = `[MODIFY EXISTING ARTICLE — keep the same topic; user wants edits only]
Existing sections: ${sectionTitles.join(" → ")}
User change request: ${userMessage}`;
  const contentPlan = planContentCharts(userMessage);
  const hints = contentPlan.explicitPriceSymbols;
  const econHints = contentPlan.economicCharts.length
    ? formatEconomicChartHints(contentPlan.economicCharts)
    : undefined;
  const planModels = planModelChain(config.requesty.atfxResearchPlanModel);
  const raw = await streamRequestyChatWithModelChain(
    planModels,
    [
      {
        role: "system",
        content: buildPlannerSystemPrompt(options, today, "in_place_edit"),
      },
      {
        role: "user",
        content: buildPlanUserPrompt(
          prefixedMessage,
          options,
          today,
          hints,
          econHints ? [econHints] : undefined
        ),
      },
    ],
    () => {},
    { temperature: 0.3 }
  );
  let plan = mergeContentChartPlan(parsePlanJson(raw, options), contentPlan, userMessage, options, {
    inPlaceEdit: true,
  });
  if (sectionTitles.length) plan.section_outline = sectionTitles;
  plan = constrainPlanForInPlaceEdit(plan, userMessage, contentPlan);
  const planLines = [
    "Planning complete",
    "• Modifying existing article (not a new report)",
    sectionTitles.length ? `• Sections: ${sectionTitles.join(" → ")}` : "",
    `• Instruments: ${plan.instruments.join(", ") || "none"}`,
    `• Tools: ${plan.tools_needed.join(", ") || "none"}`,
    inPlaceEditPlanFooter(userMessage, plan),
  ].filter(Boolean);
  sink?.stageComplete?.("planning", planLines.join("\n\n"));
  return plan;
}

async function runArticleRevisionWritePhase(
  userMessage: string,
  plan: ResearchPlan,
  brief: ResearchBrief,
  options: ReportOutputOptions,
  currentReportHtml: string,
  sink?: PipelineSink
): Promise<{ reply: string; title?: string; report_html?: string; rawText: string }> {
  sink?.stageStart?.("writing", "Updating article…");
  const style = plan.resolved_style;
  const writerModels = writerModelChain(config.requesty.atfxResearchWriterModel);
  const system = buildArticleRevisionWriterSystemPrompt(style, options, brief.as_of);
  const user = buildArticleRevisionWriterUserPrompt(
    userMessage,
    briefToWriterText(brief),
    plan.section_outline,
    currentReportHtml,
    brief.as_of
  );

  const rawText = await streamRequestyChatWithModelChain(
    writerModels,
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    (piece) => sink?.delta?.(piece),
    { temperature: 0.4, max_tokens: options.length === "2000" ? 10_000 : 4_500 }
  );

  const parsed = parseWriterPayload(
    rawText,
    brief.chart_embeds,
    brief.econ_chart_embeds,
    brief.calendar_text,
    brief.extras_text
  );
  const titleMatch = currentReportHtml.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const preservedTitle = titleMatch ? stripHtmlFromTitle(titleMatch[1]) : parsed.title;
  sink?.stageComplete?.(
    "writing",
    `Article updated\n• ${preservedTitle ?? parsed.title ?? "Report"} revised per your request`
  );
  if (parsed.report_html?.trim()) {
    sink?.reportPreview?.("en", parsed.report_html);
  }
  return {
    reply: parsed.reply,
    title: parsed.title?.trim() || preservedTitle,
    report_html: parsed.report_html,
    rawText,
  };
}

async function runArticleRevisionPipeline(
  userMessage: string,
  currentReportHtml: string,
  options: ReportOutputOptions,
  sink?: PipelineSink
): Promise<PipelineResult> {
  const appendChart = parseAppendChartIntent(userMessage, currentReportHtml);
  if (appendChart) {
    return runSectionEditPipeline(userMessage, currentReportHtml, appendChart, options, sink);
  }

  const pipeline_display: PipelineDisplayLog = { planning: "", research: "", writing: "" };
  const trackedSink: PipelineSink = {
    ...sink,
    stageDelta: (stage, delta) => {
      if (stage === "research" || stage === "writing") {
        pipeline_display[stage] += delta;
      }
      if (stage !== "planning") {
        sink?.stageDelta?.(stage, delta);
      }
    },
    stageComplete: (stage, displayText) => {
      if (stage === "planning" || stage === "research" || stage === "writing") {
        if (stage === "planning") {
          pipeline_display[stage] = displayText;
        } else {
          const prior = pipeline_display[stage].trim();
          pipeline_display[stage] = prior ? `${prior}\n\n${displayText}` : displayText;
        }
      }
      sink?.stageComplete?.(stage, displayText);
    },
    delta: (text) => {
      pipeline_display.writing += text;
      sink?.delta?.(text);
    },
  };

  const plan = await runArticleRevisionPlanPhase(userMessage, currentReportHtml, options, trackedSink);
  const { brief, tool_events } = await runResearchPhaseIfNeeded(plan, options, trackedSink);
  const written = await runArticleRevisionWritePhase(
    userMessage,
    plan,
    brief,
    options,
    currentReportHtml,
    trackedSink
  );
  const report_i18n = await runTranslatePhase(written, options, trackedSink);

  const extraLangs = translationTargets(options.languages);
  const replySuffix =
    extraLangs.length > 0
      ? `\n\nTranslated versions: ${extraLangs.map((l) => languageTabLabel(l)).join(", ")}.`
      : "";

  return {
    reply: `${written.reply}${replySuffix}`,
    title: written.title,
    report_html: written.report_html,
    report_i18n: Object.keys(report_i18n).length ? report_i18n : undefined,
    tool_events,
    research_plan: plan,
    research_brief: brief,
    output_options: options,
    pipeline_display,
    rawText: written.rawText,
  };
}

async function runTranslatePhase(
  written: { reply: string; title?: string; report_html?: string },
  options: ReportOutputOptions,
  sink?: PipelineSink
): Promise<ReportI18nContent> {
  const i18n: ReportI18nContent = {};
  const html = written.report_html?.trim();
  if (!html) return i18n;

  const title = written.title?.trim() || "Untitled report";
  i18n.en = { title, report_html: html };

  const targets = translationTargets(options.languages);
  if (!targets.length) return i18n;

  sink?.stageStart?.("translating", "Translating report…");

  for (const lang of targets) {
    sink?.stageStart?.("translating", `Translating to ${languageTabLabel(lang)}…`);
    const translated = await translateResearchReport(title, html, lang, {
      onProgress: (message) => sink?.stageStart?.("translating", message),
      onPartialHtml: (partialHtml) => sink?.reportPreview?.(lang, partialHtml),
    });
    i18n[lang] = translated;
    sink?.reportPreview?.(lang, translated.report_html);
    sink?.stageComplete?.(
      "translating",
      `Translation complete (${languageTabLabel(lang)})\n• ${translated.title}`
    );
  }

  return i18n;
}

function isShortChatOnly(message: string, options: ReportOutputOptions): boolean {
  if (options.style !== "auto") return false;
  const m = message.trim().toLowerCase();
  if (m.length < 12) {
    if (planContentCharts(message).priceSymbols.length > 0) return false;
    return true;
  }
  if (/^(thanks|thank you|ok|okay|yes|no|hi|hello)\.?!?$/.test(m)) return true;
  return false;
}

export async function runResearchPipeline(
  userMessage: string,
  currentReportHtml: string,
  optionsInput: unknown,
  sink?: PipelineSink
): Promise<PipelineResult> {
  const options = normalizeReportOutputOptions(optionsInput);

  if (isShortChatOnly(userMessage, options)) {
    const model = config.requesty.atfxResearchChatModel;
    const rawText = await callRequestyChat(
      model,
      [
        {
          role: "system",
          content: "You are a helpful ATFX research assistant. Reply briefly. Return JSON: { \"reply\": \"...\" }",
        },
        { role: "user", content: userMessage },
      ],
      { temperature: 0.3 }
    );
    const parsed = parseWriterPayload(rawText, []);
    const emptyPlan: ResearchPlan = {
      resolved_style: effectiveStyle(options, "bloomberg"),
      instruments: [],
      research_query: "",
      section_outline: [],
      tools_needed: [],
      chart_objective: "daily",
      recency: "week",
      economic_indicators: [],
    };
    const emptyBrief: ResearchBrief = {
      as_of: isoDateOffset(0),
      instruments: [],
      resolved_style: emptyPlan.resolved_style,
      news_text: "",
      quotes_text: "",
      calendar_text: "",
      extras_text: "",
      chart_embeds: [],
      econ_chart_embeds: [],
    };
    return {
      ...parsed,
      tool_events: [],
      research_plan: emptyPlan,
      research_brief: emptyBrief,
      output_options: options,
      pipeline_display: { planning: "", research: "", writing: "" },
      rawText,
    };
  }

  if (currentReportHtml.trim()) {
    const today = new Date().toISOString().slice(0, 10);

    const appendChart = parseAppendChartIntent(userMessage, currentReportHtml);
    if (appendChart) {
      return runSectionEditPipeline(userMessage, currentReportHtml, appendChart, options, sink);
    }

    const classified = await resolveEditIntent(userMessage, currentReportHtml, today);

    if (classified.route === "chat_only") {
      const model = config.requesty.atfxResearchChatModel;
      const rawText = await callRequestyChat(
        model,
        [
          {
            role: "system",
            content:
              "You are a helpful ATFX research assistant. Answer questions about markets or the report briefly. Return JSON: { \"reply\": \"...\" }",
          },
          { role: "user", content: userMessage },
        ],
        { temperature: 0.3 }
      );
      const parsed = parseWriterPayload(rawText, []);
      const emptyPlan: ResearchPlan = {
        resolved_style: effectiveStyle(options, "bloomberg"),
        instruments: [],
        research_query: "",
        section_outline: [],
        tools_needed: [],
        chart_objective: "daily",
        recency: "week",
        economic_indicators: [],
      };
      const emptyBrief: ResearchBrief = {
        as_of: isoDateOffset(0),
        instruments: [],
        resolved_style: emptyPlan.resolved_style,
        news_text: "",
        quotes_text: "",
        calendar_text: "",
        extras_text: "",
        chart_embeds: [],
        econ_chart_embeds: [],
      };
      return {
        ...parsed,
        tool_events: [],
        research_plan: emptyPlan,
        research_brief: emptyBrief,
        output_options: options,
        pipeline_display: { planning: "", research: "", writing: "" },
        rawText,
      };
    }

    if (classified.route === "section_edit" && classified.intent) {
      return runSectionEditPipeline(userMessage, currentReportHtml, classified.intent, options, sink);
    }

    if (classified.route === "article_edit") {
      const sections = listReportSections(currentReportHtml);
      const target = findTargetSection(userMessage, sections);
      if (
        target &&
        !/\b(all sections|entire|whole|full article|every section|across the report)\b/i.test(userMessage)
      ) {
        return runSectionEditPipeline(
          userMessage,
          currentReportHtml,
          { mode: "revise", section: target },
          options,
          sink
        );
      }
      return runArticleRevisionPipeline(userMessage, currentReportHtml, options, sink);
    }

    if (classified.route === "full_report" && !looksLikeExplicitNewReport(userMessage)) {
      return runArticleRevisionPipeline(userMessage, currentReportHtml, options, sink);
    }

    // Existing canvas — always modify in place; never run a fresh full-report pipeline in this session.
    return runArticleRevisionPipeline(userMessage, currentReportHtml, options, sink);
  }

  const pipeline_display: PipelineDisplayLog = { planning: "", research: "", writing: "" };
  const trackedSink: PipelineSink = {
    ...sink,
    stageDelta: (stage, delta) => {
      if (stage === "research" || stage === "writing") {
        pipeline_display[stage] += delta;
      }
      if (stage !== "planning") {
        sink?.stageDelta?.(stage, delta);
      }
    },
    stageComplete: (stage, displayText) => {
      if (stage === "planning" || stage === "research" || stage === "writing") {
        if (stage === "planning") {
          pipeline_display[stage] = displayText;
        } else {
          const prior = pipeline_display[stage].trim();
          pipeline_display[stage] = prior ? `${prior}\n\n${displayText}` : displayText;
        }
      }
      sink?.stageComplete?.(stage, displayText);
    },
    delta: (text) => {
      pipeline_display.writing += text;
      sink?.delta?.(text);
    },
  };

  const plan = await runPlanPhase(userMessage, options, trackedSink);
  const { brief, tool_events } = await runResearchPhase(plan, options, trackedSink);
  const written = await runWritePhase(userMessage, plan, brief, options, currentReportHtml, trackedSink);
  const report_i18n = await runTranslatePhase(written, options, trackedSink);

  const extraLangs = translationTargets(options.languages);
  const replySuffix =
    extraLangs.length > 0
      ? `\n\nTranslated versions: ${extraLangs.map((l) => languageTabLabel(l)).join(", ")}.`
      : "";

  return {
    reply: written.reply + replySuffix,
    title: written.title,
    report_html: written.report_html,
    report_i18n: Object.keys(report_i18n).length ? report_i18n : undefined,
    tool_events,
    research_plan: plan,
    research_brief: brief,
    output_options: { ...options, style: options.style === "auto" ? "auto" : plan.resolved_style },
    pipeline_display,
    rawText: written.rawText,
  };
}

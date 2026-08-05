import {
  horizonLabel,
  languagesSummaryLine,
  normalizeCustomStyleInstructions,
  PACE_PRESETS,
  type ReportOutputOptions,
  type ResolvedReportStyle,
} from "./atfxResearchReportOptions.js";
import { maxEconomicChartsAllowed, userRequestedMacroFigures, isAssetFocusedArticle, isGoldSilverArticle, isMacroCommodityHybridTopic, planContentCharts } from "./contentChartPlanner.js";
import { isChartOnlySectionEditRequest, isReplaceChartSectionEditRequest } from "./atfxReportHtmlSections.js";
import { reportHtmlStructurePromptBlock, reportTableHtmlPromptBlock } from "./atfxReportTableHtml.js";

/**
 * Returns true when the user message is about a specific recently-occurred market event
 * (central bank decision, macro data release, etc.) that has an immediate post-event
 * market reaction which may differ from the prior multi-month trend.
 * Used to force `recency: "day"` and surface past-calendar outcomes.
 */
export function isRecentEventDrivenTopic(userMessage: string): boolean {
  return /\b(fomc|fed\s+meeting|rate\s+decision|central\s+bank|nfp|non.?farm\s+payrolls?|payrolls?\s+report|cpi|inflation\s+print|inflation\s+data|pmi|purchasing\s+managers|ecb|boj|boe|rba|rbnz|pboc|jobs\s+report|employment\s+report|gdp\s+release|gdp\s+report)\b/i.test(userMessage);
}

/** Section-level content plan produced in the planning phase and consumed by the writer. */
export type SectionContentBrief = {
  title: string;
  purpose: string;
  key_points: string[];
};

/** Editorial blueprint passed from planner to writer (structure + SEO + content angles). */
export type WriterContentPlan = {
  section_outline: string[];
  section_briefs?: SectionContentBrief[];
  title_angle?: string;
  content_thesis?: string;
  seo_keywords?: string[];
  seo_secondary_keywords?: string[];
  meta_description_hint?: string;
};

/**
 * Shared 3-phase pipeline — keep terminology identical in plan, research, and write prompts.
 */
export const ARTICLE_PIPELINE_FLOW = `ATFX article pipeline (3 aligned stages):
1. PLAN — outputs EDITORIAL BLUEPRINT JSON: section_outline, section_briefs (purpose + key_points per <h2>), content_thesis, title_angle, seo_keywords, meta_description_hint, research_query, tools_needed.
2. RESEARCH — fetches live facts mapped to section_briefs.key_points (news, quotes, charts, calendar). Does NOT write article prose.
3. WRITE — produces final HTML from EDITORIAL BLUEPRINT + RESEARCH BRIEF. Facts only from the brief; structure, thesis, and SEO from the blueprint.`;

/** One-line article settings block reused in all pipeline stages. */
export function formatArticleSettingsSummary(options: ReportOutputOptions): string {
  const pace = PACE_PRESETS[options.pace];
  return [
    `Style: ${options.style === "auto" ? "Auto" : options.style}`,
    `Audience: ${options.audience === "retail" ? "Retail" : "Institutional"}`,
    `Length: ~${options.length} words (${pace.label})`,
    `Horizon: ${horizonLabel(options.horizon)}`,
    `Languages: ${languagesSummaryLine(options.languages)}`,
  ].join(" | ");
}

export type PlannerSystemMode = "new_article" | "technical_analysis" | "section_edit" | "in_place_edit";

/** System prompt for the planning LLM (stage 1). */
export function buildPlannerSystemPrompt(
  options: ReportOutputOptions,
  today: string,
  mode: PlannerSystemMode = "new_article"
): string {
  const settings = formatArticleSettingsSummary(options);
  const date = todayContextBlock(today);
  const base = `${ARTICLE_PIPELINE_FLOW}\n\nYou are stage 1 (PLAN). Return ONLY valid JSON.\nArticle settings: ${settings}`;

  switch (mode) {
    case "technical_analysis":
      return `${base}
Plan the FULL EDITORIAL BLUEPRINT for a technical analysis article: section_briefs must cover trend, levels, indicators, bull/bear scenarios, and trade plan.
Set resolved_style to "technical_analysis". instruments MUST be non-empty. tools_needed MUST include: news, quote, chart, technical_analysis.

${date}`;
    case "section_edit":
      return `${base}
Plan a minimal blueprint for ONE section edit on an existing article. section_briefs should target only the section being changed.
Default tools_needed to []. Add tools only when the user explicitly needs fresh external data.

${date}`;
    case "in_place_edit":
      return `${base}
Plan IN-PLACE edits only — do NOT replan a brand-new article. Preserve existing section structure unless the user asked to restructure.
Default tools_needed to []. instruments only if the user named symbols in their edit request.

${date}`;
    default:
      return `${base}
Produce the complete EDITORIAL BLUEPRINT (structure, content, SEO, thesis) AND minimal tools_needed. Do NOT output only tools.
When style is auto, pick the best resolved_style. Let section_briefs drive research_query and tools_needed.

${date}`;
  }
}

function formatBlueprintBody(plan: WriterContentPlan, options: ReportOutputOptions): string[] {
  const lines: string[] = [];
  if (plan.title_angle?.trim()) lines.push(`Title angle (H1): ${plan.title_angle.trim()}`);
  if (plan.content_thesis?.trim()) lines.push(`Content thesis: ${plan.content_thesis.trim()}`);
  if (plan.seo_keywords?.length) {
    lines.push(`Primary SEO keywords: ${plan.seo_keywords.join(", ")}`);
  }
  if (plan.seo_secondary_keywords?.length) {
    lines.push(`Secondary SEO keywords: ${plan.seo_secondary_keywords.join(", ")}`);
  }
  if (plan.meta_description_hint?.trim()) {
    lines.push(`Meta description hint: ${plan.meta_description_hint.trim()}`);
  }
  lines.push(`Section outline: ${plan.section_outline.join(" → ")}`);
  if (plan.section_briefs?.length) {
    lines.push("Section briefs:");
    for (const brief of plan.section_briefs) {
      lines.push(`  [${brief.title}]`);
      lines.push(`    Purpose: ${brief.purpose}`);
      if (brief.key_points.length) {
        for (const point of brief.key_points) {
          lines.push(`    • ${point}`);
        }
      }
    }
  }
  lines.push(`Target: ${formatArticleSettingsSummary(options)}`);
  return lines;
}

/** Stage 2 — what research must gather (from planner blueprint). */
export function formatContentPlanForResearch(
  plan: WriterContentPlan,
  options: ReportOutputOptions
): string {
  return [
    "EDITORIAL BLUEPRINT (stage 1 output — research gathers evidence for each key_point; no prose):",
    ...formatBlueprintBody(plan, options),
  ].join("\n");
}

/** Stage 3 — what the writer must implement (from planner blueprint). */
export function formatEditorialBlueprintForWriter(
  plan: WriterContentPlan,
  options: ReportOutputOptions
): string {
  return [
    "EDITORIAL BLUEPRINT (stage 1 output — write implements this using RESEARCH BRIEF facts only):",
    ...formatBlueprintBody(plan, options),
    "- Each section_outline item becomes one <h2>. Fulfill matching section_briefs purpose and key_points.",
    "- Use title_angle for <h1> direction; weave seo_keywords naturally; do not invent facts missing from the brief.",
  ].join("\n");
}

/** Stage 2 user prompt for web-search / news research. */
export function buildResearchUserPrompt(args: {
  query: string;
  contentPlanText: string;
  symbols?: string;
  today: string;
  options: ReportOutputOptions;
}): string {
  const symLine = args.symbols?.trim() ? `\nInstruments: ${args.symbols.trim()}` : "";
  return `${todayContextBlock(args.today)}

${ARTICLE_PIPELINE_FLOW}

You are stage 2 (RESEARCH). ${formatArticleSettingsSummary(args.options)}

Task: gather live, verifiable facts for the EDITORIAL BLUEPRINT below. Do NOT write article paragraphs.
- Map bullets to section_briefs using [Section Title] prefixes when possible.
- Prioritize developments on or after ${args.today}; include dates on headlines.
- Source names only (no URLs). Quotes and chart data come from other tools — focus on news, catalysts, macro context.

Primary search focus:
${args.query.trim()}${symLine}

${args.contentPlanText.trim()}

Return plain-text bullets starting with "- ".`;
}

/** Strip HTML heading hints the plan model sometimes prefixes (e.g. "h2 Overview"). */
export function normalizeSectionTitle(title: string): string {
  return String(title || "")
    .trim()
    .replace(/^<h2>\s*/i, "")
    .replace(/\s*<\/h2>$/i, "")
    .replace(/^h2\s+/i, "")
    .replace(/^#{1,6}\s+/, "")
    .trim();
}

export function defaultSectionOutline(style: ResolvedReportStyle): string[] {
  switch (style) {
    case "qa":
      return [
        "Key Questions",
        "Market Snapshot",
        "Drivers & Catalysts",
        "Outlook & Scenarios",
        "Risk FAQ",
      ];
    case "editorial":
      return ["Thesis", "Context", "The Case", "Counterpoints", "Conclusion"];
    case "casual":
      return ["What's Happening", "Why It Matters", "Levels to Watch", "Bottom Line"];
    case "financial_education":
      return ["Core Concept", "How It Works", "Market Example", "Why Traders Care", "Glossary"];
    case "instructional":
      return ["Objective", "Setup", "Step-by-Step Playbook", "Checklist", "Common Mistakes", "Summary"];
    case "scenario_chain":
      return [
        "Setup & Assumptions",
        "Bullish Path — If Conditions Hold",
        "Bearish Path — If Conditions Reverse",
        "Cross-Asset Ripples",
        "What Would Break the Chain",
        "Scenario Summary",
      ];
    case "technical_analysis":
      return [
        "Chart Setup & Trend",
        "Key Levels",
        "Indicators & Momentum",
        "Pattern Read",
        "Bullish Scenario",
        "Bearish Scenario",
        "Trade Plan & Risk",
      ];
    case "custom":
      return ["Introduction", "Analysis", "Outlook", "Key Takeaways"];
    default:
      return ["Market Snapshot", "Price Action", "Key Levels", "Catalysts", "Outlook", "Risks"];
  }
}

/** Planner hint: section titles and shape must match the resolved style. */
export function stylePlanGuidance(style: ResolvedReportStyle, customInstructions?: string): string {
  switch (style) {
    case "qa":
      return (
        'Plan section_outline for Q&A: theme clusters as h2 titles (e.g. "Key Questions", "Outlook FAQ"). ' +
        "The writer will use h4 interrogative questions under each cluster — not narrative essay sections."
      );
    case "editorial":
      return (
        "Plan section_outline for an opinion-led editorial: thesis → context → argument → counterpoints → conclusion. " +
        'Include an explicit "Counterpoints" (or equivalent) section.'
      );
    case "casual":
      return (
        'Plan conversational section titles (e.g. "What\'s Happening", "Why It Matters") — avoid institutional labels like "Market Snapshot" unless rewritten casually.'
      );
    case "financial_education":
      return (
        'Plan teaching arc: concept → mechanism → real-world example → glossary. ' +
        "Include a dedicated Glossary section title. " +
        "When the topic names a tradable (WTI, gold, FX pair, etc.), list it in instruments and include quote+chart for the Market Example section. " +
        "When the topic covers PMI, manufacturing, or other macro figures, include econ_chart and list matching economic_indicators."
      );
    case "instructional":
      return (
        'Plan action playbook sections: objective, setup, steps, checklist, common mistakes. ' +
        "Use imperative-friendly section titles."
      );
    case "scenario_chain":
      return (
        "Plan if-then scenario sections: starting setup → at least two contrasting causal paths (e.g. prices stay high vs fall) → cross-asset knock-ons → what would invalidate the chain. " +
        'Use section titles that signal conditional logic (e.g. "Bullish Path — If Oil Stays Elevated", "Bearish Path — If Oil Weakens").'
      );
    case "technical_analysis":
      return (
        "Plan chart-driven technical analysis sections: trend/structure → support & resistance levels → indicator read (RSI, MACD, moving averages, etc.) → pattern or price-action interpretation → bull/bear scenarios → trade plan with entry, targets, stop, and invalidation. " +
        'Favor section titles traders expect (e.g. "Key Levels", "Indicators & Momentum", "Trade Plan & Risk").'
      );
    case "custom": {
      const instructions = normalizeCustomStyleInstructions(customInstructions);
      if (instructions) {
        return (
          "Plan section_outline that implements the user's custom style instructions below — match their requested structure, tone, and section naming.\n\n" +
          `Custom instructions:\n"""${instructions}"""`
        );
      }
      return (
        "Plan section_outline for a custom user style with no specific instructions — use a balanced research arc " +
        '(e.g. "Introduction", "Analysis", "Outlook", "Key Takeaways") tailored to the topic.'
      );
    }
    default:
      return (
        "Plan wire-style sections: snapshot, price action, key levels, catalysts, outlook, risks. " +
        "Favor data-dense section titles suitable for a Bloomberg/terminal note."
      );
  }
}

export function stylePromptBlock(style: ResolvedReportStyle, customInstructions?: string): string {
  const distinct =
    "CRITICAL: The draft must be instantly recognizable as this style — if it could pass as another style, rewrite until the voice and structure are unmistakable.";

  if (style === "custom") {
    const instructions = normalizeCustomStyleInstructions(customInstructions);
    if (!instructions) {
      return (
        `WRITING STYLE — Custom (user-defined):\n` +
        `- No specific instructions were provided. Write a clear, professional research report suited to the topic and audience.\n` +
        `- Use a coherent structure with descriptive section titles from the plan outline.\n` +
        `- Follow all HTML, table, and chart rules elsewhere in this prompt.\n` +
        distinct
      );
    }
    return (
      `WRITING STYLE — Custom (user-defined):\n` +
      `- Follow the user's style instructions below EXACTLY. They override default voice/structure hints except safety and HTML rules in this prompt.\n` +
      `- If instructions conflict with other style templates, the custom instructions win.\n\n` +
      `USER CUSTOM STYLE INSTRUCTIONS:\n"""\n${instructions}\n"""\n\n` +
      distinct
    );
  }

  switch (style) {
    case "qa":
      return (
        `WRITING STYLE — Q&A (question-and-answer report):\n` +
        `- The entire report is Q&A — NOT a narrative essay with occasional questions.\n` +
        `- Structure: <h2> theme cluster → multiple <h4>Question here?</h4> → answer in <p> or <ul><li>.\n` +
        `- Minimum 8 distinct questions across the report; each h4 must be a full interrogative sentence ending with ?\n` +
        `- Answers: 2–5 sentences, direct, grounded in the research brief — no fabricated quotes or interviews.\n` +
        `- Openings: start with an h2 + first question — do NOT write a long thesis paragraph before Q&A begins.\n` +
        `- Tables allowed only for compact data snapshots; prose Q&A carries the report.\n` +
        `- AVOID: editorial opinion arcs, imperative how-to steps, textbook definitions without questions, terminal-style wire ledes.\n` +
        distinct
      );
    case "editorial":
      return (
        `WRITING STYLE — Editorial (opinion-led analysis):\n` +
        `- Lead with a clear, debatable THESIS in the opening <p> (what you believe and why it matters now).\n` +
        `- Voice: authoritative magazine/op-ed — may use "we" sparingly; build an argument, not a data dump.\n` +
        `- Structure: thesis → supporting evidence → acknowledge counterpoints → rebuttal or nuance → conclusion with conviction.\n` +
        `- Paragraphs: 3–6 sentences; connect ideas with narrative transitions, not bullet-only sections.\n` +
        `- Include an explicit counterpoints section that steel-mans the opposite view before your conclusion.\n` +
        `- Ground every claim in the research brief; opinion is in framing and emphasis, not invented facts.\n` +
        `- AVOID: terminal-style tick-by-tick recaps, FAQ question headers, step-by-step instructions, textbook teaching tone.\n` +
        distinct
      );
    case "casual":
      return (
        `WRITING STYLE — Casual (accessible newsletter/blog):\n` +
        `- Voice: friendly, direct, conversational — use "you" and contractions (it's, don't, here's).\n` +
        `- Sentences: short (mostly under 22 words); one idea per sentence; plain English over desk jargon.\n` +
        `- Explain any technical term in parentheses the first time (e.g. "DXY (US dollar index)").\n` +
        `- Section titles should sound human ("What's moving prices?" not "Market Overview").\n` +
        `- Use occasional signposts: "Here's the thing:", "Bottom line:", "What to watch:".\n` +
        `- Limit tables to at most 2 simple ones; prefer <p> and <ul><li> over dense grids.\n` +
        `- AVOID: institutional wire density, academic definitions, numbered playbooks, formal Q&A with h4 questions.\n` +
        distinct
      );
    case "financial_education":
      return (
        `WRITING STYLE — Financial education (teach the concept):\n` +
        `- Goal: teach the reader HOW the market concept works — not primarily to call a trade.\n` +
        `- Structure: define term → explain mechanism → real-world example tied to the brief → why it matters for traders.\n` +
        `- Mandatory Glossary section: at least 5 terms as <h4>Term</h4><p>definition</p> or <ul><li>.\n` +
        `- Use analogies ("Think of X like Y") and plain-language cause/effect chains.\n` +
        `- Minimize trade calls; if levels appear, explain what support/resistance MEANS, not only numbers.\n` +
        `- Tone: patient teacher — no hype, no op-ed thesis, no FAQ-only format.\n` +
        `- AVOID: Bloomberg-style wire ledes, opinion-editorial arguing, imperative checklists, casual slang.\n` +
        distinct
      );
    case "instructional":
      return (
        `WRITING STYLE — Instructional (action playbook / how-to):\n` +
        `- Goal: tell the reader exactly WHAT TO DO — setup, steps, checks, and pitfalls.\n` +
        `- Use imperative verbs: "Check…", "Set…", "Monitor…", "Avoid…".\n` +
        `- Include a numbered or bulleted step sequence in <ul><li> or <p> with explicit Step 1, Step 2…\n` +
        `- Mandatory "Common Mistakes" (or equivalent) section listing 3+ pitfalls as <ul><li>.\n` +
        `- Include a checklist section the reader can scan before acting.\n` +
        `- Keep commentary subordinate to actions — every section should advance a practical workflow.\n` +
        `- AVOID: long opinion essays, FAQ-only Q&A, textbook glossary dumps, casual blog chit-chat.\n` +
        distinct
      );
    case "scenario_chain":
      return (
        `WRITING STYLE — Scenario chain (if-then causal simulation):\n` +
        `- Goal: walk the reader through LOGIC STEP BY STEP — like a situational simulation, not a static market recap.\n` +
        `- Structure: state the starting condition → chain consequences link-by-link → end-state for markets/assets.\n` +
        `- Use explicit if-then language: "If oil prices stay elevated → US inflation pressures build → the Fed keeps rates higher for longer → USD finds support and US equities face valuation pressure."\n` +
        `- Present at least TWO contrasting paths (e.g. bullish-chain vs bearish-chain, or high-vs-low scenario) under separate <h2> sections.\n` +
        `- Each path: 4–7 causal steps minimum, as <ul><li> chains or short <p> blocks with arrows (→) between steps.\n` +
        `- Label scenario branches with <h4> (e.g. <h4>Path A — Oil stays high</h4>) before the chain.\n` +
        `- Cross-asset section: show how the same trigger ripples through FX, rates, equities, commodities — still as chains.\n` +
        `- Include a "What Would Break the Chain" section: 2–4 invalidation triggers (data prints, policy shifts) as <ul><li>.\n` +
        `- Ground every link in the research brief — do not invent transmission mechanisms unsupported by evidence.\n` +
        `- Tone: clear, logical, slightly narrative — like stress-testing a story; not opinion-editorial, not FAQ, not a how-to checklist.\n` +
        `- AVOID: Bloomberg wire ledes with no if-then structure, standalone level tables without causal context, rhetorical Q&A headers.\n` +
        distinct
      );
    case "technical_analysis":
      return (
        `WRITING STYLE — Technical analysis article:\n` +
        `- Goal: produce a chart-first market read — trend, structure, levels, indicators, and actionable trade framing.\n` +
        `- Open with the current trend bias (bullish, bearish, or range-bound) and timeframe context (e.g. daily vs 4H).\n` +
        `- Mandatory level work: cite specific support/resistance, prior swing highs/lows, and invalidation levels with prices.\n` +
        `- Include an indicators section covering momentum/structure tools from the brief (e.g. RSI, MACD, moving averages, Fibonacci, volume) — interpret readings, don't just list numbers.\n` +
        `- Use a <table> for Key Levels (level | role | implication) and another for Trade Plan (entry zone | target | stop | R:R) when levels are available.\n` +
        `- Present separate bullish and bearish scenarios tied to level breaks/holds — what confirms each path.\n` +
        `- Trade Plan section: entry trigger, targets, stop-loss, invalidation, and risk notes — conditional language ("if price holds above X…").\n` +
        `- Weave in brief fundamental/macro context only as backdrop — TA structure and price action lead every section.\n` +
        `- Tone: professional desk TA note — precise, level-driven, no hype.\n` +
        `- AVOID: long macro essays without levels, FAQ Q&A format, casual newsletter voice, glossary teaching, imperative how-to checklists without chart context.\n` +
        distinct
      );
    default:
      return (
        `WRITING STYLE — Bloomberg / terminal wire report:\n` +
        `- Voice: institutional, neutral, dense — like a Bloomberg terminal note or Reuters wire.\n` +
        `- Lead each section with the key datapoint or price move, then context (inverted-pyramid).\n` +
        `- Paragraphs: 2–4 tight sentences; numbers, levels, and dates upfront.\n` +
        `- Use <table> for snapshots, key levels, and catalyst calendars; narrative in <p>.\n` +
        `- No first person, no rhetorical questions, no "you", no teaching analogies, no how-to steps.\n` +
        `- AVOID: blog tone, FAQ h4 questions, editorial thesis framing, glossary teaching sections.\n` +
        distinct
      );
  }
}

export function autoStyleSelectionGuide(): string {
  return (
    `When style is "auto", pick resolved_style using these rules:\n` +
    `- bloomberg: default for macro/FX/commodities market updates, price action, catalysts, institutional readers.\n` +
    `- qa: user asks questions, wants FAQ, interview format, or "explain in Q&A". NOT for ATFX "Quick Analysis" product snapshots (use bloomberg/editorial).\n` +
    `- editorial: user wants opinion, thesis, bull/bear debate, "make the case", or magazine-style take.\n` +
    `- casual: user asks for simple, beginner-friendly, newsletter, or "explain like I'm new".\n` +
    `- financial_education: user wants to learn a concept (what is CPI, how rates work, define term).\n` +
    `- instructional: user wants steps, playbook, checklist, how to trade/monitor/setup.\n` +
    `- scenario_chain: user wants if-then logic, causal chains, scenario simulation, knock-on effects, "what happens if", or step-by-step transmission (e.g. oil → inflation → Fed → USD/stocks).\n` +
    `- technical_analysis: user wants chart/TA coverage — support & resistance, trend, indicators (RSI/MACD/MA), patterns, trade setup, entry/stop/target, or "technical analysis" / "chart read".`
  );
}

export function languageInstruction(): string {
  return "Write ALL of title, reply, and report_html in English. Additional languages are translated in a separate step — do not output Chinese here. Keep tickers and symbols in Latin form.";
}

export function audiencePromptBlock(audience: ReportOutputOptions["audience"]): string {
  if (audience === "retail") {
    return (
      "Audience: Retail traders and individual investors. " +
      "Use clear, accessible language; briefly explain technical terms on first use. " +
      "Emphasize practical implications, what to watch, and risk context. Avoid desk slang and assume no sell-side research background."
    );
  }
  return (
    "Audience: Institutional (PMs, macro desks, professional allocators). " +
    "Write with institutional density: precise levels, catalyst timelines, cross-asset context, and concise wire-style prose. " +
    "Assume strong market literacy; prioritize actionable macro and flow-relevant detail."
  );
}

export function writerMaxTokens(length: ReportOutputOptions["length"]): number {
  if (length === "2000") return 10_000;
  if (length === "1200") return 6_000;
  return 4_500;
}

/** Human-readable UTC date for prompts (e.g. "Friday, June 13, 2026"). */
export function formatLongUtcDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Short UTC date for table examples (e.g. "Jun 13"). */
export function formatShortUtcDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Shared as-of / publication date block for all research LLM prompts. */
export function todayContextBlock(today: string): string {
  return (
    `TODAY'S DATE (publication / as-of): ${today} (${formatLongUtcDate(today)}, UTC).\n` +
    `Use this as "today" for outlooks, relative timing, and calendar relevance. ` +
    `Do not invent dates from training data or copy example dates from instructions.`
  );
}

function macroChartPlanningBlock(userMessage: string): string {
  const maxEcon = maxEconomicChartsAllowed(userMessage);
  const explicit = userRequestedMacroFigures(userMessage);
  const hybrid = isMacroCommodityHybridTopic(userMessage);
  return `Macro economic figure charts (CPI, unemployment, GDP, manufacturing PMI, treasury yields, etc.):
- Include when the article is macro/data-release driven (FX policy, inflation, employment, PMI/manufacturing, central banks).
- Include for macro + commodity education topics (e.g. global PMI slowdown with WTI) — both econ charts AND the commodity price chart belong in the plan.
- Do NOT add for pure stock/crypto/commodity price-action articles unless the user explicitly asks for macro figures or PMI/manufacturing data.
- User ${explicit ? "explicitly asked for macro/economic figures" : "did NOT explicitly ask for macro figures"}.
${hybrid ? "- This topic combines macro figures with a named commodity — include econ_chart AND list the commodity in instruments with quote+chart." : ""}
- If you include macro charts: add "econ_chart" to tools_needed and list items in economic_indicators (chartType "bar" for monthly releases, "line" for treasury10Y).
- Maximum: ${maxEcon} charts (you may include anywhere from 0 up to that maximum).
- Do not add macro charts only because the topic mentions USD or FX unless they materially support your narrative.`;
}

function technicalAnalysisInstrumentsBlock(): string {
  return `Instruments (REQUIRED for technical analysis):
- instruments MUST list the primary tradable(s) from the user request (e.g. XAUUSD, EURUSD, AAPL).
- If symbol hints are provided below, copy them into instruments — never leave instruments [] for TA.
- tools_needed MUST include: news, quote, chart, technical_analysis.
- For gold/silver (XAUUSD, XAGUSD), also include calendar.
- research_query must ask for recent price action, catalysts, and drivers for the TA read — NOT a generic definition of what the symbol is.`;
}

function instrumentsPlanningBlock(): string {
  return `Instruments (price symbols / FMP tickers):
- instruments MAY be an empty array [] when no single tradable needs live prices or an OHLC chart.
- Use [] for conceptual, educational, policy/regulation, pure Q&A, scenario-chain, or macro-narrative topics where price action is not the focus.
- Only list instruments when quotes, charts, or technical levels materially strengthen the article.
- Do NOT default to EURUSD or any symbol just because the topic mentions FX, a currency, or a country.
- When instruments is [], omit "quote", "chart", and "technical_analysis" from tools_needed.
- Tailor section_outline to the topic — do not force "Price Action" or "Key Levels" when instruments is [].`;
}

function toolsSelectionBlock(userMessage: string): string {
  const assetFocused = isAssetFocusedArticle(userMessage);
  const goldSilver = isGoldSilverArticle(userMessage);
  const hybrid = isMacroCommodityHybridTopic(userMessage);
  const eventDriven = isRecentEventDrivenTopic(userMessage);
  const eventRecencyNote = eventDriven
    ? `\nEVENT-DRIVEN RECENCY RULE: This topic involves a specific recently-occurred market event (FOMC, NFP, CPI, central bank decision, etc.). Set recency to "day" — do NOT use "week" or "month". A wider window returns pre-event positioning articles that misrepresent the post-event market direction. Also include "calendar" in tools_needed so the actual event outcome (actual vs forecast vs previous) is surfaced from the recent past.`
    : "";
  return `Research tools (pick the MINIMUM set — do not default to everything):
- "news" — recent headlines and catalysts (almost always useful).
- "quote" — live prices for the primary instrument(s). Only when instruments is non-empty.
- "chart" — OHLC price chart for the primary instrument(s). Only when instruments is non-empty.
- "technical_analysis" — FMP OHLC-based support/resistance table plus full indicators (EMA, RSI, MACD, ATR) when history allows. Include only when "chart" is included or the user asks for levels/support/resistance/technical analysis.
- "calendar" — economic calendar table. Use for macro/FX/rates/data-release articles AND for gold/silver articles (US calendar — Fed, CPI, NFP drive USD and precious metals). Omit for stocks, crypto, and other commodities (oil, copper, etc.) unless the user asks for upcoming macro events.
- "econ_chart" — macro figure charts (CPI, unemployment, etc.). See macro chart rules below; usually omit for asset-focused articles.
- "treasury" — US treasury yields. Only when rates/yields/Fed/DXY are central to the story.
- "profile" / "ratios" — single-stock fundamentals when the article focuses on one equity ticker.

${goldSilver ? "This request is gold/silver — include calendar (US high-impact events) plus news, quote, and chart." : hybrid ? "This request combines macro figures (e.g. PMI/manufacturing) with a commodity — include news, quote, chart for the commodity, and econ_chart for macro figure charts." : assetFocused ? 'This request looks asset-focused (stock/crypto/non-precious commodity) — prefer news+quote+chart only and omit calendar unless explicitly requested.' : "Include calendar only if macro catalysts are material to this specific article."}${eventRecencyNote}`;
}

/** Client-sent marker when a research article starts from ATFX Quick Analysis. */
export const QUICK_ANALYSIS_RESEARCH_MARKER = "[QUICK_ANALYSIS_RESEARCH]";

export function isQuickAnalysisResearchRequest(userMessage: string): boolean {
  const trimmed = userMessage.trim();
  if (!trimmed) return false;
  if (trimmed.includes(QUICK_ANALYSIS_RESEARCH_MARKER)) return true;
  return (
    /\bexpanding on this Quick Analysis snapshot\b/i.test(trimmed) &&
    /\bQuick Analysis report:\s*\n/i.test(trimmed)
  );
}

export function parseQuickAnalysisPrimarySymbol(userMessage: string): string | null {
  const match = userMessage.match(/^Primary symbol:\s*(\S+)/im);
  const sym = match?.[1]?.trim();
  return sym || null;
}

export function parseQuickAnalysisDataAsOf(userMessage: string): string | null {
  const match = userMessage.match(/^Data as of:\s*(.+)$/im);
  const label = match?.[1]?.trim();
  return label || null;
}

export function quickAnalysisExpansionSectionOutline(): string[] {
  return ["Market Overview", "Key Drivers", "Market Context", "Outlook & Scenarios", "Risks"];
}

function quickAnalysisResearchPlanningBlock(
  userMessage: string,
  options: ReportOutputOptions,
  symbolHints: string[]
): string {
  const primary = parseQuickAnalysisPrimarySymbol(userMessage);
  const dataAsOf = parseQuickAnalysisDataAsOf(userMessage);
  const symLine =
    primary || symbolHints.length
      ? `Primary instrument(s): ${[primary, ...symbolHints].filter(Boolean).join(", ")} — instruments MUST be non-empty; tools_needed MUST include news, quote, and chart.`
      : "Extract the primary tradable from Instrument / Quick Analysis report — instruments MUST be non-empty; tools_needed MUST include news, quote, and chart.";
  const staleLine = dataAsOf
    ? `Embedded snapshot is as-of ${dataAsOf}. research_query MUST ask for news, catalysts, and price action since that window (not a generic definition of the symbol).`
    : "Embedded snapshot may be up to 72 hours old. research_query MUST ask for the latest catalysts and price action to refresh the story.";
  const styleNote =
    options.style === "auto"
      ? 'Do NOT choose resolved_style "qa" — "Quick Analysis" is an ATFX product name, not a request for FAQ/Q&A format. Prefer bloomberg or editorial unless the user locked another style.'
      : options.style === "qa"
        ? 'User locked Q&A writing style — honor it, but this is still a full research expansion (not a short snapshot).'
        : `Honor locked style "${options.style}"; plan a full multi-section research article, not a snapshot recap.`;

  return `QUICK ANALYSIS RESEARCH EXPANSION (mandatory for this request):
- The user selected a saved ATFX Quick Analysis (snapshot + drivers + context). Expand it into a full research article — do NOT treat the embedded report as sufficient research.
- ${symLine}
- ${staleLine}
- ${styleNote}
- section_outline should expand the snapshot themes (setup → drivers → context → outlook → risks), e.g. ${quickAnalysisExpansionSectionOutline().join(" → ")}.
- Include calendar when macro catalysts in the snapshot or instrument warrant it (FX, rates, gold/silver).`;
}

function quickAnalysisResearchWriterBlock(): string {
  return `QUICK ANALYSIS EXPANSION (mandatory):
- The user request embeds an ATFX Quick Analysis snapshot (Quick Snapshot, Market drivers, Market context, What to watch next). Use it as the editorial anchor — integrate and expand its themes into the full article.
- RESEARCH BRIEF is the source of truth for all prices, levels, percentages, and dated facts (the embedded snapshot may be stale).
- Do NOT paste or lightly paraphrase the embedded Quick Analysis markdown. Write a complete multi-section research article per the outline and target length.
- Carry forward driver narratives from the user request where still supported by the brief; add fresh catalysts and context from the brief.`;
}

export function expandUserMessageForPlanning(userMessage: string, options: ReportOutputOptions): string {
  if (isQuickAnalysisResearchRequest(userMessage) && options.style !== "technical_analysis") {
    const primary = parseQuickAnalysisPrimarySymbol(userMessage);
    const dataAsOf = parseQuickAnalysisDataAsOf(userMessage);
    const prefixParts = [
      "[Expand Quick Analysis into full research article]",
      primary ? `Primary symbol: ${primary}.` : "",
      dataAsOf ? `Refresh data since snapshot as-of ${dataAsOf}.` : "Refresh with latest catalysts and prices.",
    ].filter(Boolean);
    return `${prefixParts.join(" ")}\n\n${userMessage}`;
  }

  if (options.style !== "technical_analysis") return userMessage;
  const trimmed = userMessage.trim();
  if (!trimmed) return userMessage;

  const contentPlan = planContentCharts(trimmed);
  const symbols = contentPlan.explicitPriceSymbols.length
    ? contentPlan.explicitPriceSymbols
    : contentPlan.priceSymbols;
  if (!symbols.length) return userMessage;

  const compact = trimmed.replace(/\s+/g, "").toUpperCase();
  const symbolOnly =
    symbols.length === 1 &&
    (compact === symbols[0].replace(/[/\s:]/g, "").toUpperCase() || trimmed.length <= 32);

  if (
    symbolOnly ||
    !/(technical|analysis|support|resistance|chart|level|trend|rsi|macd|trade|setup)/i.test(trimmed)
  ) {
    const sym = symbols.join(", ");
    return (
      `Technical analysis article for ${sym}. Analyze trend structure, key support and resistance levels, ` +
      `indicator readings (RSI, MACD, moving averages), bullish and bearish scenarios, and a trade plan ` +
      `(entry, targets, stop, invalidation). User input: ${trimmed}`
    );
  }
  return userMessage;
}

function articleSettingsPlanningBlock(options: ReportOutputOptions): string {
  const pace = PACE_PRESETS[options.pace];
  const sectionCount =
    options.length === "2000" || options.pace === "deep"
      ? "6–9 sections"
      : options.pace === "quick"
        ? "4–6 sections"
        : "5–7 sections";
  return `Article settings (align the ENTIRE blueprint to these):
${formatArticleSettingsSummary(options)}
- Section count: ${sectionCount}; deeper pace = richer section_briefs with more key_points per section
- Thesis, outlook sections, and research_query must match the ${horizonLabel(options.horizon)} horizon`;
}

function seoPlanningBlock(options: ReportOutputOptions): string {
  if (options.audience === "institutional") {
    return `SEO & discoverability (institutional):
- seo_keywords: 4–8 professional search terms traders/desks would use (asset, catalyst, policy, data release) — NOT tabloid or curiosity-gap bait
- seo_secondary_keywords: 3–6 long-tail phrases (e.g. "Fed dot plot impact on USD", "gold real yields outlook")
- title_angle: Bloomberg/terminal-style headline angle — factual, dense, market-moving fact first
- meta_description_hint: 120–160 char professional summary angle (wire tone, no emoji)`;
  }
  return `SEO & discoverability (retail):
- seo_keywords: 5–10 high-intent search phrases retail traders would Google (asset + catalyst + timeframe)
- seo_secondary_keywords: 3–6 long-tail variants and question-style phrases
- title_angle: attention-worthy but accurate H1 angle — include primary keyword naturally when possible
- meta_description_hint: 120–160 char meta description angle with a clear hook and primary keyword`;
}

function editorialBlueprintInstructions(options: ReportOutputOptions): string {
  return `EDITORIAL BLUEPRINT (stage 1 output — mandatory; do NOT plan only data tools):
You must produce the complete blueprint the RESEARCH and WRITE stages will follow:
1. STRUCTURE — section_outline (${articleSettingsPlanningBlock(options)})
2. CONTENT — section_briefs: one per section with purpose + 2–5 key_points (research will gather facts for these; writer will expand them)
3. SEO — title_angle, seo_keywords, seo_secondary_keywords, meta_description_hint (${seoPlanningBlock(options)})
4. NARRATIVE — content_thesis: central argument the article must prove
5. DATA — research_query + tools_needed only where live data supports section_briefs.key_points

section_briefs[].title MUST match section_outline exactly (same order, same count).
research_query must ask for evidence that fills section_briefs — not a generic topic definition.`;
}

/** Enrich the planner's research_query with thesis and per-section fact needs. */
export function buildResearchQueryFromPlan(plan: {
  research_query: string;
  content_thesis?: string;
  section_briefs?: SectionContentBrief[];
}): string {
  const base = plan.research_query.trim() || "Latest market drivers and catalysts";
  const parts = [base];
  if (plan.content_thesis?.trim()) {
    parts.push(`Article thesis to support with evidence: ${plan.content_thesis.trim()}`);
  }
  if (plan.section_briefs?.length) {
    const needs = plan.section_briefs
      .flatMap((b) => {
        if (b.key_points.length) {
          return b.key_points.map((p) => `${b.title}: ${p}`);
        }
        return [`${b.title}: ${b.purpose}`];
      })
      .slice(0, 14);
    if (needs.length) {
      parts.push(
        `Prioritize live data and headlines that support these planned sections:\n${needs.map((n) => `- ${n}`).join("\n")}`
      );
    }
  }
  return parts.join("\n\n");
}

export function buildPlanUserPrompt(
  userMessage: string,
  options: ReportOutputOptions,
  today: string,
  symbolHints: string[],
  economicHints?: string[]
): string {
  const maxEcon = maxEconomicChartsAllowed(userMessage);
  const fromQuickAnalysis = isQuickAnalysisResearchRequest(userMessage);
  const eventDriven = isRecentEventDrivenTopic(userMessage);
  const eventDrivenPlanBlock = eventDriven
    ? `\nEVENT-DRIVEN ARTICLE (mandatory overrides):
- This topic covers a specific recently-occurred market event (FOMC, NFP, CPI, central bank rate decision, PMI, GDP release, etc.).
- Set recency to "day" in the JSON output — REQUIRED. A "week" or "month" window returns pre-event articles that misrepresent the post-event direction.
- research_query MUST ask for the IMMEDIATE MARKET REACTION after the event (e.g., "how did DXY and major FX pairs react after the July 2026 FOMC decision?"), NOT the pre-event outlook or multi-month trend narrative.
- Include "calendar" in tools_needed — the calendar now covers the past 14 days and will show the actual event outcome (actual vs forecast vs previous), grounding the article in the real result.
- content_thesis MUST reflect the post-event market state based on what actually happened, not training-data assumptions about what "should" happen.`
    : "";
  const customInstructions = normalizeCustomStyleInstructions(options.customStyleInstructions);
  const styleInstruction =
    options.style === "auto"
      ? `The user selected style "auto" — you MUST choose the best resolved_style from: bloomberg, qa, editorial, casual, financial_education, instructional, scenario_chain, technical_analysis based on the user message. Include resolved_style in JSON.\n\n${autoStyleSelectionGuide()}${
          fromQuickAnalysis
            ? `\n\nIMPORTANT: This request expands an ATFX Quick Analysis snapshot. Do NOT choose resolved_style "qa" unless the user explicitly asks for FAQ/Q&A interview format.`
            : ""
        }`
      : options.style === "custom"
        ? customInstructions
          ? `Use writing style: custom (do not change it). Set resolved_style to "custom".\n\nUser-defined custom style instructions:\n"""${customInstructions}"""\n\n${stylePlanGuidance("custom", customInstructions)}`
          : `Use writing style: custom (do not change it). Set resolved_style to "custom". No custom instructions provided — plan a balanced research structure.\n\n${stylePlanGuidance("custom")}`
        : `Use writing style: ${options.style} (do not change it). Set resolved_style to the same value.\n\n${stylePlanGuidance(options.style as ResolvedReportStyle)}`;

  const instrumentsBlock =
    options.style === "technical_analysis" ? technicalAnalysisInstrumentsBlock() : instrumentsPlanningBlock();
  const qaPrimary = fromQuickAnalysis ? parseQuickAnalysisPrimarySymbol(userMessage) : null;
  const mergedSymbolHints = qaPrimary
    ? [...new Set([qaPrimary, ...symbolHints].filter(Boolean))]
    : symbolHints;

  const symbolHintLine =
    options.style === "technical_analysis"
      ? mergedSymbolHints.length
        ? `Primary symbol(s) — set instruments to: ${mergedSymbolHints.join(", ")}`
        : "Extract the tradable symbol from the user request and set instruments — do not leave instruments empty."
      : fromQuickAnalysis
        ? mergedSymbolHints.length
          ? `Quick Analysis primary symbol(s) — set instruments to: ${mergedSymbolHints.join(", ")} and include news+quote+chart in tools_needed.`
          : "Quick Analysis request — extract the primary tradable from Instrument / report text; instruments MUST be non-empty with news+quote+chart."
        : mergedSymbolHints.length
          ? `Symbol hints from the topic — include in instruments with quote+chart when the brief names a tradable (e.g. WTI, gold): ${mergedSymbolHints.join(", ")}`
          : "No explicit price symbols in the request — instruments may be [] unless a primary tradable is clearly needed.";

  return `${todayContextBlock(today)}

${ARTICLE_PIPELINE_FLOW}

User request: ${userMessage}

Article settings:
- ${formatArticleSettingsSummary(options)}

${symbolHintLine}
${economicHints?.length ? `Optional macro chart ideas (you may use 0–${maxEcon}; not required): ${economicHints.join("; ")}` : ""}

${styleInstruction}

${editorialBlueprintInstructions(options)}

Tailor section_outline, section_briefs, SEO fields, content_thesis, research_query, and tools_needed for the ${options.audience} audience.${
    options.style === "technical_analysis"
      ? " This is a chart-driven technical analysis article — price symbols and TA tools are required."
      : fromQuickAnalysis
        ? " This expands a Quick Analysis snapshot — primary instrument, news, quote, and chart are required."
        : " Let the topic drive structure — do not assume every article needs price symbols or market-data tools."
  }

${eventDrivenPlanBlock}
${fromQuickAnalysis ? `${quickAnalysisResearchPlanningBlock(userMessage, options, mergedSymbolHints)}\n\n` : ""}${instrumentsBlock}

Return ONLY a JSON object:
{
  "resolved_style": "bloomberg|qa|editorial|casual|financial_education|instructional|scenario_chain|technical_analysis|custom",
  "title_angle": "Suggested H1 headline angle aligned to audience and SEO",
  "content_thesis": "1-2 sentence central narrative the article must deliver",
  "seo_keywords": ["primary", "search", "terms"],
  "seo_secondary_keywords": ["long-tail", "phrases"],
  "meta_description_hint": "120-160 char meta description angle for SEO/social",
  "section_outline": ["Context", "Drivers", "Outlook"],
  "section_briefs": [
    {
      "title": "Context",
      "purpose": "What this section must accomplish for the reader",
      "key_points": ["Specific angle or fact to cover", "Another point the writer must address"]
    }
  ],
  "instruments": [],
  "research_query": "perplexity search question supporting the content thesis",
  "tools_needed": ["news"],
  "chart_objective": "intraday|swing|daily|position",
  "recency": "day|week|month",
  "economic_indicators": []
}

section_briefs MUST have exactly one entry per section_outline item (same titles, same order).
section_outline values must be plain English titles only — the writer turns each into an <h2>.
Downstream: RESEARCH (stage 2) gathers facts for key_points; WRITE (stage 3) implements this blueprint using those facts.

${toolsSelectionBlock(userMessage)}

${macroChartPlanningBlock(userMessage)}`;
}

export function buildWriterSystemPrompt(
  style: ResolvedReportStyle,
  options: ReportOutputOptions,
  today: string
): string {
  return `${ARTICLE_PIPELINE_FLOW}

You are stage 3 (WRITE) — senior research analyst for ATFX users.
${formatArticleSettingsSummary(options)}

${todayContextBlock(today)}

${audiencePromptBlock(options.audience)}
${stylePromptBlock(style, options.customStyleInstructions)}
${languageInstruction()}

Target length: approximately ${options.length} words in report_html body.

${reportHtmlStructurePromptBlock()}

${reportTableHtmlPromptBlock(today)}

Additional rules:
- EDITORIAL BLUEPRINT (in user message) defines structure, thesis, SEO, and section_briefs. RESEARCH BRIEF is the only source for facts and numbers.
- Each section_outline item = one <h2>. Fulfill the matching section_briefs purpose and key_points using brief data only.
- Embed price OHLC charts with <img src="__CHART_REF_N__" alt="..." /> inside instrument / price-action <h2> sections.
- Place the support/resistance table from technical analysis directly under each chart — two columns (Resistance | Support) with prices from the brief only.
- Embed macro economic charts (unemployment, CPI, etc.) with <img src="__ECON_CHART_REF_N__" alt="..." /> inside macro / labor / inflation <h2> sections — never mix with price chart placeholders.
- For every macro chart placeholder, write at least one adjacent <p> that discusses the latest reading, recent trend, and market implication using facts from the research brief — charts are not decorative filler.
- Macro chart alt text must be short display titles only (e.g. "US CPI", "US unemployment"); the ATFX prefix belongs in data-filename only, not in alt or visible headings.
- No <script>, no citation markers like [1].
- report_html is REQUIRED for research reports — always include the full <article> body (never reply-only).
- Do NOT wrap HTML in markdown code fences. Output raw HTML inside the JSON string.
- Economic calendar tables: use ONLY High impact rows from CALENDAR_TABLE in the research brief (exact dates/events). Never reuse example dates from instructions.
- Economic calendar placement: ALWAYS near the end of the article (last or second-to-last <h2> section), not in the opening sections.
- For Q&A style: report_html is REQUIRED — format the full article as Q&A inside <article>; never reply-only.
- POST-EVENT RECENCY RULE: When the article is anchored to a specific named market event (FOMC meeting, central bank rate decision, NFP, CPI print, PMI release, GDP report), the immediate post-event market direction from the NEWS section is the current market state. Do NOT let the longer-term TA trend (which reflects multi-month price history) override the post-event narrative. If the CALENDAR section shows an actual outcome (e.g., Fed held rates, NFP missed), that outcome and any corresponding post-event price reaction in NEWS take priority over the TA trend bias. Example: if NEWS reports "DXY fell sharply after the FOMC decision", the article thesis must reflect USD weakness as the immediate market state — do not rephrase it as "USD strength driven by Fed signals". Frame the TA trend as historical context ("prior to the decision, DXY had been supported…") and the post-event reaction as the current narrative lead.

Return ONLY valid JSON: { "reply": "...", "title": "...", "report_html": "..." }
The JSON "title" must match the <h1> text inside report_html.
Do not invent numbers not in the research brief.`;
}

export function buildWriterUserPrompt(
  userMessage: string,
  briefText: string,
  contentPlan: WriterContentPlan,
  options: ReportOutputOptions,
  currentHtml: string,
  today: string
): string {
  const canvas =
    currentHtml.trim().length > 0
      ? `\n\nCurrent canvas HTML (update if user asked to revise):\n${currentHtml.slice(0, 8000)}`
      : "";

  const hasCalendar = /=== CALENDAR ===|CALENDAR_TABLE|Economic calendar/i.test(briefText);
  const tableReminder = hasCalendar
    ? `\n\nIMPORTANT: Today is ${today}. Calendar table rows must match High impact rows from CALENDAR_TABLE in the brief exactly (dates, events, countries) — do not invent or reuse stale dates like Sep 11 unless they appear in the brief. Omit Medium/Low impact events. Place the calendar table near the END of the article (last or second-to-last section). Use <h1>, <h2>, <h4>, <p>, <table>, <ul>.`
    : "\n\nIMPORTANT: Use the strict HTML structure (<h1>, <h2>, <h4>, <p>, <table>, <ul>). Format support/resistance / key levels as <table>, not plain text lists. When multiple price charts exist, put each symbol's levels table directly under its own chart.";

  const qaBlock = isQuickAnalysisResearchRequest(userMessage)
    ? `\n\n${quickAnalysisResearchWriterBlock()}`
    : "";

  const blueprintBlock = formatEditorialBlueprintForWriter(contentPlan, options);

  return `${todayContextBlock(today)}

${ARTICLE_PIPELINE_FLOW}

You are stage 3 (WRITE). ${formatArticleSettingsSummary(options)}

User request: ${userMessage}

${blueprintBlock}

RESEARCH BRIEF (stage 2 output — sole source of truth for facts, quotes, charts, calendar; fulfill section_briefs.key_points from this data only):
${briefText}
${tableReminder}${qaBlock}
${canvas}

Produce the JSON response now.`;
}

export function buildArticleRevisionWriterSystemPrompt(
  style: ResolvedReportStyle,
  options: ReportOutputOptions,
  today: string
): string {
  return `${buildWriterSystemPrompt(style, options, today)}

ARTICLE REVISION MODE (mandatory when editing an existing canvas):
- An article ALREADY exists. The user wants a MINOR in-place modification — NOT fresh full-market research and NOT a brand-new article.
- Keep the same overall topic, title, and primary instruments unless the user explicitly asks to change them.
- Return the COMPLETE updated report_html (<article>…</article>) including ALL sections.
- Preserve sections and content the user did not ask to change; apply only the requested edits.
- Do not discard existing charts, tables, or structure unless the user asked to change them.
- When the research brief is empty, use ONLY the existing article HTML — do not invent new prices, headlines, or data.
- If the user wants a completely new article on a different subject, reply briefly that they should open a new report from History — do not rewrite the topic here.`;
}

export function buildArticleRevisionWriterUserPrompt(
  userMessage: string,
  briefText: string,
  sectionOutline: string[],
  currentHtml: string,
  today: string
): string {
  const tableReminder =
    "\n\nIMPORTANT: This is a revision — start from the existing HTML below. Apply the user's change request. Place economic calendar near the end. Split key technical levels per instrument/chart when multiple __CHART_REF_N__ exist.";

  const briefBlock = briefText.trim()
    ? briefText
    : "(none — no new market data was fetched; use only the existing article HTML below)";

  return `${todayContextBlock(today)}

User revision request: ${userMessage}

Existing section order (preserve unless user asked to restructure): ${sectionOutline.join(" → ")}

RESEARCH BRIEF (source of truth for any new facts):
${briefBlock}
${tableReminder}

EXISTING ARTICLE HTML (modify this — do not replace with an unrelated new article):
${currentHtml.slice(0, 12000)}

Return JSON with the full updated report_html.`;
}

export function buildEditIntentClassifierPrompt(
  userMessage: string,
  reportTitle: string,
  sectionTitles: string[],
  today: string
): string {
  return `${todayContextBlock(today)}

Report title: ${reportTitle}
Existing sections (in order): ${sectionTitles.length ? sectionTitles.join(" → ") : "(none)"}

User message: ${userMessage}

Classify what the user wants. Prefer section_edit when they name or imply one section. Use article_edit only when the change truly spans multiple sections with no single target. Use full_report ONLY when they explicitly want a completely NEW report on a different topic (not a modification). Use chat_only for pure questions with no edit.

When an article already exists, edits are minor in-place changes — never classify as full_report unless the user explicitly asks to start over on a new topic.

Supported section_edit modes:
- append_chart: add or replace a chart/graph/figure in an existing section without rewriting prose (place at end unless user says otherwise; when replacing a broken/missing chart, remove the old embed and insert a fresh one)
- revise: change content/tone/detail in an existing section
- insert: add a new section
- remove: delete a section
- rename: change a section heading only
- move: reorder a section (use placement_after / placement_before)
- merge: combine two or more sections into one (target_sections array + new_section_title)
- split: divide one section into two or more (target_section + split_section_titles array)

Examples:
- "Add a US inflation chart at the end of Context section" → section_edit, append_chart, target Context section
- "Add a US CPI chart in a location that fits" → section_edit, append_chart (pick best inflation/macro section)
- "The US CPI chart is not showing — replace it with a new chart" → section_edit, append_chart (replace broken CPI embed; econ_chart only)
- "Fix the broken inflation chart" → section_edit, append_chart
- "Fix US CPI" / "CPI embed is missing" (no "chart" word) → section_edit, append_chart
- "Gold chart won't load" / "XAUUSD image broken" → section_edit, append_chart (price chart tools only)
- "Fetch a fresh CPI figure" / "pull new inflation data" → section_edit, append_chart
- "Remove the broken CPI image and add a new one" → section_edit, append_chart
- "The chart isn't displaying" (one broken embed in article) → section_edit, append_chart
- "Add more news to Market Sentiment" → section_edit, revise, target Market Sentiment
- "Add a FAQ section before Risks" → section_edit, insert, new_section_title FAQ, placement_before Risks
- "Delete the Risks section" → section_edit, remove
- "Rename Outlook to Forward View" → section_edit, rename
- "Move FAQ after Outlook" → section_edit, move, placement_after Outlook
- "Combine Market Overview and Price Action into Market Summary" → section_edit, merge
- "Split Technical Analysis into Daily View and Weekly View" → section_edit, split, split_section_titles
- "Make the tone more retail-friendly" → section_edit revise (pick the most relevant section) or article_edit with tools_needed []
- "The US CPI chart is not showing — replace it" → section_edit, append_chart
- "Split the key levels table under each chart" → article_edit
- "Add more detail about COP" → article_edit or section_edit if Price Action named
- "Write a new report on Gold" → full_report
- "Start over on Bitcoin" → full_report
- "What does DXY mean?" → chat_only

Return ONLY JSON:
{
  "route": "section_edit|article_edit|full_report|chat_only",
  "edit_mode": "append_chart|revise|insert|remove|rename|move|merge|split|null",
  "target_section": "exact or best-match title from the list, or null",
  "target_sections": ["section A", "section B"],
  "new_section_title": "for insert/rename/merge, or null",
  "split_section_titles": ["Daily View", "Weekly View"],
  "placement_after": "section title or null",
  "placement_before": "section title or null",
  "confidence": 0.0,
  "reason": "short explanation"
}`;
}

export function buildSectionRevisionPlanPrompt(
  userMessage: string,
  sectionTitle: string,
  options: ReportOutputOptions,
  today: string,
  symbolHints: string[],
  mode: "revise" | "insert" = "revise",
  placementDescription?: string,
  existingSectionTitles?: string[]
): string {
  const chartOnly = mode === "revise" && isChartOnlySectionEditRequest(userMessage);
  const actionLine =
    mode === "insert"
      ? `The user wants to ADD a new section to an existing report — do NOT rewrite the full article.

New section title: "${sectionTitle}"
Placement: ${placementDescription ?? "at an appropriate position in the report"}
${existingSectionTitles?.length ? `Existing sections (in order): ${existingSectionTitles.join(" → ")}` : ""}`
      : chartOnly
        ? isReplaceChartSectionEditRequest(userMessage)
          ? `The user wants to REPLACE a broken or missing chart in ONE section only — do NOT plan news research or a prose rewrite.

Target section: "${sectionTitle}"
- tools_needed should be ONLY what is needed for the chart (econ_chart for macro charts; quote+chart for price charts).
- research_query should name the chart data only (e.g. "US CPI chart"), not a broad market story.
- Omit "news" unless the user explicitly asked for headlines.`
          : `The user wants to APPEND a chart to ONE section only — do NOT plan news research or a prose rewrite.

Target section: "${sectionTitle}"
- tools_needed should be ONLY what is needed for the chart (econ_chart for macro charts; quote+chart for price charts).
- research_query should name the chart data only (e.g. "US inflation rate chart"), not a broad market story.
- Omit "news" unless the user explicitly asked for headlines.`
        : `The user wants to revise ONE existing report section only — do NOT plan a full rewrite or broad market research.

Target section: "${sectionTitle}"
- Default tools_needed to []. Only add news/quote/chart/econ_chart if the user explicitly asked for fresh data in their message.
- research_query should describe the section edit only, not a new article topic.`;

  return `${todayContextBlock(today)}

${actionLine}
User request: ${userMessage}

Output settings:
- Audience: ${options.audience === "retail" ? "Retail" : "Institutional"}
- Pace: ${PACE_PRESETS[options.pace].label}

${symbolHints.length ? `Optional symbol hints (include only if price action is central): ${symbolHints.join(", ")}` : "No explicit price symbols — instruments may be []."}

${instrumentsPlanningBlock()}

Return ONLY JSON:
{
  "resolved_style": "bloomberg|qa|editorial|casual|financial_education|instructional|scenario_chain|technical_analysis|custom",
  "instruments": [],
  "research_query": "focused search for the section content",
  "tools_needed": ["news"],
  "chart_objective": "intraday|swing|daily|position",
  "recency": "day|week|month",
  "economic_indicators": []
}

Pick the MINIMUM tools_needed. FAQ/Q&A sections usually need no tools unless the user asks for market data. News sections need "news". Omit chart/quote/technical_analysis when instruments is []. Omit calendar for stock/crypto/oil topics; include US calendar for gold/silver.

${toolsSelectionBlock(userMessage)}

${macroChartPlanningBlock(userMessage)}`;
}

export function buildSectionInsertWriterSystemPrompt(
  style: ResolvedReportStyle,
  options: ReportOutputOptions,
  today: string
): string {
  return `You are a senior research analyst adding ONE new section to an existing ATFX research report.

${todayContextBlock(today)}

${audiencePromptBlock(options.audience)}
${stylePromptBlock(style, options.customStyleInstructions)}
${languageInstruction()}

${reportHtmlStructurePromptBlock()}

${reportTableHtmlPromptBlock(today)}

New section rules:
- Output ONLY the new section in section_html — not the full article.
- section_html MUST begin with <h2> using the EXACT section title provided.
- Match the tone, formatting, and depth of the existing report excerpt.
- FAQ/Q&A sections: use <h4> for each question and <p> or <ul><li> for answers grounded in the report topic.
- News sections: summarize recent catalysts from the research brief; use <p> and <ul><li>.
- No <script>, no citation markers like [1].
- Do NOT wrap HTML in markdown code fences.

Return ONLY valid JSON: { "reply": "...", "section_html": "..." }
The reply should briefly confirm what was added and where.`;
}

export function buildSectionInsertWriterUserPrompt(
  userMessage: string,
  sectionTitle: string,
  placementDescription: string,
  existingSectionTitles: string[],
  briefText: string,
  fullReportHtml: string,
  today: string
): string {
  const styleSample = fullReportHtml.trim().slice(0, 4000);

  return `${todayContextBlock(today)}

User request: ${userMessage}

New section title (exact): "${sectionTitle}"
Placement: ${placementDescription}
Existing section order: ${existingSectionTitles.join(" → ")}

RESEARCH BRIEF (source of truth for facts):
${briefText.slice(0, 8000)}

FULL REPORT EXCERPT (style reference — do NOT rewrite other sections):
${styleSample}

Write ONLY the new "${sectionTitle}" section. Return JSON with section_html (starting with <h2>${sectionTitle}</h2>).`;
}

export function buildSectionRevisionWriterSystemPrompt(
  style: ResolvedReportStyle,
  options: ReportOutputOptions,
  today: string,
  chartOnly = false
): string {
  const chartOnlyRules = chartOnly
    ? `
CHART-ONLY EDIT (critical):
- Keep EVERY existing paragraph in the section unchanged — copy them verbatim unless the user asked to fix a specific sentence.
- Append the new chart at the END of the section (after existing prose).
- You MAY add at most ONE short <p> (1–2 sentences) immediately before the chart citing the latest reading from the research brief — wire-style, no analogies, no "think of X like Y", no teaching tone.
- Do NOT add educational filler, new thesis paragraphs, or rewrite the section opening.
`
    : "";

  return `You are a senior research analyst revising ONE section of an existing ATFX research report.

${todayContextBlock(today)}

${audiencePromptBlock(options.audience)}
${stylePromptBlock(style, options.customStyleInstructions)}
${languageInstruction()}

${reportHtmlStructurePromptBlock()}

${reportTableHtmlPromptBlock(today)}

Section revision rules:
- Output ONLY the revised section in section_html — not the full article.
- section_html MUST begin with <h2> using the EXACT same section title provided.
- Preserve charts/images already in the section unless the user asked to change them; use __CHART_REF_N__ / __ECON_CHART_REF_N__ only for NEW charts from the brief.
- Match the tone and formatting of the existing report.
- No <script>, no citation markers like [1].
- Do NOT wrap HTML in markdown code fences.
${chartOnlyRules}

Return ONLY valid JSON: { "reply": "...", "section_html": "..." }
The reply should briefly confirm what changed in plain English.`;
}

export function buildSectionRevisionWriterUserPrompt(
  userMessage: string,
  sectionTitle: string,
  sectionHtml: string,
  briefText: string,
  fullReportHtml: string,
  today: string,
  chartOnly = false
): string {
  const styleSample = fullReportHtml.trim().slice(0, 4000);
  const chartOnlyNote = chartOnly
    ? `\nCHART-ONLY: Preserve the CURRENT SECTION HTML prose verbatim. Append the new chart placeholder(s) at the end. Do not replace or expand the section narrative.\n`
    : "";

  return `${todayContextBlock(today)}

User revision request: ${userMessage}
${chartOnlyNote}
Section to revise (exact title): "${sectionTitle}"

CURRENT SECTION HTML:
${sectionHtml.slice(0, 6000)}

RESEARCH BRIEF (source of truth for any new facts):
${briefText.slice(0, 8000)}

FULL REPORT EXCERPT (style reference only — do NOT rewrite other sections):
${styleSample}

Revise ONLY the "${sectionTitle}" section. Return JSON with section_html containing just that section (starting with <h2>${sectionTitle}</h2>).`;
}

export function buildSectionMergeWriterSystemPrompt(
  style: ResolvedReportStyle,
  options: ReportOutputOptions,
  today: string
): string {
  return `You are a senior research analyst merging multiple sections of an ATFX research report into one cohesive section.

${todayContextBlock(today)}

${audiencePromptBlock(options.audience)}
${stylePromptBlock(style, options.customStyleInstructions)}
${languageInstruction()}

${reportHtmlStructurePromptBlock()}

Merge rules:
- Output ONE merged section in section_html starting with <h2> using the exact merged title provided.
- Combine facts from all source sections; remove redundancy; preserve charts/tables where still relevant.
- Do NOT output the full article.
- No citation markers like [1].

Return ONLY valid JSON: { "reply": "...", "section_html": "..." }`;
}

export function buildSectionMergeWriterUserPrompt(
  userMessage: string,
  mergedTitle: string,
  sourceSections: Array<{ title: string; html: string }>,
  briefText: string,
  fullReportHtml: string,
  today: string
): string {
  const sources = sourceSections
    .map((s) => `### ${s.title}\n${s.html.slice(0, 3500)}`)
    .join("\n\n");

  return `${todayContextBlock(today)}

User request: ${userMessage}

Merged section title (exact): "${mergedTitle}"

SOURCE SECTIONS TO MERGE:
${sources}

RESEARCH BRIEF (optional new facts):
${briefText.slice(0, 4000)}

FULL REPORT EXCERPT (style reference):
${fullReportHtml.slice(0, 2500)}

Return JSON with section_html — one merged section only (<h2>${mergedTitle}</h2>…).`;
}

export function buildSectionSplitWriterSystemPrompt(
  style: ResolvedReportStyle,
  options: ReportOutputOptions,
  today: string
): string {
  return `You are a senior research analyst splitting one report section into multiple logical sections.

${todayContextBlock(today)}

${audiencePromptBlock(options.audience)}
${stylePromptBlock(style, options.customStyleInstructions)}
${languageInstruction()}

${reportHtmlStructurePromptBlock()}

Split rules:
- Output sections_html: an array of full section HTML strings, each starting with <h2> using the exact titles provided.
- Divide content logically; do not duplicate large blocks across sections.
- Preserve charts/tables in the most appropriate split section.
- Do NOT output the full article.

Return ONLY valid JSON: { "reply": "...", "sections_html": ["<h2>…</h2>…", "<h2>…</h2>…"] }`;
}

export function buildSectionSplitWriterUserPrompt(
  userMessage: string,
  sourceTitle: string,
  sourceHtml: string,
  splitTitles: string[],
  briefText: string,
  fullReportHtml: string,
  today: string
): string {
  return `${todayContextBlock(today)}

User request: ${userMessage}

Section to split: "${sourceTitle}"
New section titles (exact, in order): ${splitTitles.map((t) => `"${t}"`).join(", ")}

CURRENT SECTION HTML:
${sourceHtml.slice(0, 8000)}

RESEARCH BRIEF:
${briefText.slice(0, 4000)}

FULL REPORT EXCERPT (style reference):
${fullReportHtml.slice(0, 2500)}

Return JSON with sections_html containing exactly ${splitTitles.length} sections with the titles above.`;
}

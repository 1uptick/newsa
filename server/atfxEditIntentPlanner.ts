import {
  describeSectionPlacement,
  expandSectionReferences,
  findTargetSection,
  formatNewSectionTitle,
  listReportSectionTitles,
  listReportSections,
  parseMergeSectionsFromMessage,
  parseNewSectionTitle,
  isReplaceChartSectionEditRequest,
  parseAppendChartIntent,
  parseSectionPlacement,
  parseSplitIntentFromMessage,
  sectionExists,
  type ReportSection,
  type SectionEditIntent,
  type SectionInsertPlacement,
} from "./atfxReportHtmlSections.js";
import { buildEditIntentClassifierPrompt } from "./atfxResearchPrompts.js";
import { callRequestyChatWithModelChain, extractFirstJsonObject, planModelChain } from "./atfxResearchRequesty.js";
import { config } from "./config.js";

export type EditPipelineRoute = "section_edit" | "article_edit" | "full_report" | "chat_only";

export type EditIntentClassification = {
  route: EditPipelineRoute;
  intent: SectionEditIntent | null;
  confidence: number;
  source: "heuristic" | "llm";
  reason?: string;
};

type LlmEditIntentPayload = {
  route?: string;
  edit_mode?: string;
  target_section?: string;
  target_sections?: string[];
  new_section_title?: string;
  split_section_titles?: string[];
  placement_after?: string | null;
  placement_before?: string | null;
  confidence?: number;
  reason?: string;
};

const FULL_REWRITE_RE =
  /\b(rewrite|start over|from scratch|entire report|whole report|full report|regenerate|write a new report|create a new report|new report on)\b/i;

const CHAT_ONLY_RE =
  /\b(what does|what is|what are|explain|how does|why is|can you tell me|define)\b/i;

const REMOVE_RE = /\b(remove|delete|drop|cut out|strip|get rid of)\b/i;
const RENAME_RE = /\b(rename|retitle|change the title|call it|retitle it)\b(?:\s+(?:the|this))?\s+/i;
const MOVE_RE = /\b(move|relocate|reorder|put|place)\b/i;

const EDIT_SIGNAL_RE =
  /\b(add|insert|include|append|create|remove|delete|revise|update|modify|change|rewrite|improve|expand|shorten|simplify|move|rename|retitle|merge|combine|join|split|divide|separate|more|less|bullish|bearish|tone|table|chart|paragraph|bullet|section|headline|news|faq|f&q|q&a)\b/i;

function matchSectionByTitle(titleRef: string | undefined, sections: ReportSection[]): ReportSection | null {
  if (!titleRef?.trim()) return null;
  const exact = sections.find((s) => s.title.toLowerCase() === titleRef.trim().toLowerCase());
  if (exact) return exact;
  return findTargetSection(titleRef, sections);
}

function placementFromLlm(
  payload: LlmEditIntentPayload,
  sections: ReportSection[],
  newSectionTitle: string
): SectionInsertPlacement {
  const after = matchSectionByTitle(payload.placement_after ?? undefined, sections);
  const before = matchSectionByTitle(payload.placement_before ?? undefined, sections);
  if (after) return { afterSection: after.title };
  if (before) return { beforeSection: before.title };
  return parseSectionPlacement("", sections, newSectionTitle);
}

function parseRenameTitle(userMessage: string): string | null {
  const patterns = [
    /\b(?:rename|retitle)\s+(?:the\s+)?(?:section\s+)?(?:to|as)\s+["']?([^"'.]+?)["']?(?:\s+section)?(?:[,.]|$)/i,
    /\bcall it\s+["']?([^"'.]+?)["']?(?:[,.]|$)/i,
    /\bchange the title to\s+["']?([^"'.]+?)["']?(?:[,.]|$)/i,
  ];
  for (const pattern of patterns) {
    const m = userMessage.match(pattern);
    if (m?.[1]) return formatNewSectionTitle(m[1].trim());
  }
  return null;
}

function looksLikeFullRewrite(userMessage: string): boolean {
  if (!FULL_REWRITE_RE.test(userMessage)) return false;
  if (/\b(section|paragraph|part|table|chart|sentence)\b/i.test(userMessage)) return false;
  return true;
}

/** True only when the user clearly wants a new report, not an in-place edit. */
export function looksLikeExplicitNewReport(userMessage: string): boolean {
  if (looksLikeFullRewrite(userMessage)) return true;
  return /\b(new article|new report|brand[- ]new report|start over|from scratch|write a new (?:report|article)|generate a new (?:report|article)|report on a different|different topic entirely)\b/i.test(
    userMessage
  );
}

function looksLikeChatOnly(userMessage: string, sections: ReportSection[]): boolean {
  if (!CHAT_ONLY_RE.test(userMessage)) return false;
  if (EDIT_SIGNAL_RE.test(userMessage) && findTargetSection(userMessage, sections)) return false;
  return !/\b(report|article|section|outlook|overview)\b/i.test(userMessage);
}

export function classifyEditIntentHeuristic(
  userMessage: string,
  currentReportHtml: string
): EditIntentClassification {
  const sections = listReportSections(currentReportHtml);
  if (!sections.length) {
    return { route: "full_report", intent: null, confidence: 0.5, source: "heuristic" };
  }

  if (looksLikeExplicitNewReport(userMessage)) {
    return {
      route: "full_report",
      intent: null,
      confidence: 0.92,
      source: "heuristic",
      reason: "Explicit new report requested",
    };
  }

  if (looksLikeFullRewrite(userMessage)) {
    return {
      route: "full_report",
      intent: null,
      confidence: 0.92,
      source: "heuristic",
      reason: "Full report rewrite requested",
    };
  }

  if (looksLikeChatOnly(userMessage, sections)) {
    return {
      route: "chat_only",
      intent: null,
      confidence: 0.85,
      source: "heuristic",
      reason: "Question without edit intent",
    };
  }

  const mergeIntent = parseMergeSectionsFromMessage(userMessage, sections);
  if (mergeIntent && /\b(merge|combine|join|consolidate)\b/i.test(userMessage)) {
    return {
      route: "section_edit",
      intent: {
        mode: "merge",
        sections: mergeIntent.sections,
        mergedTitle: mergeIntent.mergedTitle,
      },
      confidence: 0.9,
      source: "heuristic",
      reason: `Merge sections into "${mergeIntent.mergedTitle}"`,
    };
  }

  const splitIntent = parseSplitIntentFromMessage(userMessage, sections);
  if (splitIntent && /\b(split|divide|break up|separate)\b/i.test(userMessage)) {
    return {
      route: "section_edit",
      intent: {
        mode: "split",
        section: splitIntent.section,
        splitTitles: splitIntent.splitTitles,
      },
      confidence: 0.9,
      source: "heuristic",
      reason: `Split "${splitIntent.section.title}" into ${splitIntent.splitTitles.join(" + ")}`,
    };
  }

  const newTitle = parseNewSectionTitle(userMessage);
  const hasAddSectionPhrase =
    /\b(?:add|insert|include|append|create)\b/i.test(userMessage) &&
    (/\bsection\b/i.test(userMessage) || /\b(faq|f\s*&\s*q|q\s*&\s*a)\b/i.test(userMessage));

  if (newTitle && hasAddSectionPhrase && !sectionExists(newTitle, sections)) {
    return {
      route: "section_edit",
      intent: {
        mode: "insert",
        newSectionTitle: newTitle,
        placement: parseSectionPlacement(userMessage, sections, newTitle),
      },
      confidence: 0.93,
      source: "heuristic",
      reason: `Insert new section "${newTitle}"`,
    };
  }

  const appendChart = parseAppendChartIntent(userMessage, currentReportHtml);
  if (appendChart) {
    return {
      route: "section_edit",
      intent: appendChart,
      confidence: 0.96,
      source: "heuristic",
      reason: isReplaceChartSectionEditRequest(userMessage)
        ? `Replace chart in "${appendChart.section.title}"`
        : `Append chart to end of "${appendChart.section.title}"`,
    };
  }

  const target = findTargetSection(userMessage, sections);

  if (target && REMOVE_RE.test(userMessage) && !hasAddSectionPhrase) {
    return {
      route: "section_edit",
      intent: { mode: "remove", section: target },
      confidence: 0.9,
      source: "heuristic",
      reason: `Remove section "${target.title}"`,
    };
  }

  const renameTitle = parseRenameTitle(userMessage);
  if (target && renameTitle && RENAME_RE.test(userMessage)) {
    return {
      route: "section_edit",
      intent: { mode: "rename", section: target, newTitle: renameTitle },
      confidence: 0.88,
      source: "heuristic",
      reason: `Rename "${target.title}" to "${renameTitle}"`,
    };
  }

  if (target && MOVE_RE.test(userMessage) && /\b(before|after|above|below|between)\b/i.test(userMessage)) {
    return {
      route: "section_edit",
      intent: {
        mode: "move",
        section: target,
        placement: parseSectionPlacement(userMessage, sections, target.title),
      },
      confidence: 0.86,
      source: "heuristic",
      reason: `Move section "${target.title}"`,
    };
  }

  const reviseHint =
    /\b(more|additional|extra|expand|update|revise|modify|change|rewrite|improve|backup|evidence|detail|shorten|simplify|tone|bullish|bearish|table|chart|paragraph|bullet|fix|correct|clarify)\b/i.test(
      userMessage
    );

  if (target && (reviseHint || !hasAddSectionPhrase)) {
    return {
      route: "section_edit",
      intent: { mode: "revise", section: target },
      confidence: reviseHint ? 0.88 : 0.72,
      source: "heuristic",
      reason: `Revise section "${target.title}"`,
    };
  }

  if (EDIT_SIGNAL_RE.test(userMessage)) {
    const target = findTargetSection(userMessage, sections);
    if (target) {
      return {
        route: "section_edit",
        intent: { mode: "revise", section: target },
        confidence: 0.78,
        source: "heuristic",
        reason: `Revise section "${target.title}"`,
      };
    }
    return {
      route: "article_edit",
      intent: null,
      confidence: 0.82,
      source: "heuristic",
      reason: "Modify existing article",
    };
  }

  return {
    route: "article_edit",
    intent: null,
    confidence: 0.8,
    source: "heuristic",
    reason: "Default: modify existing article",
  };
}

function intentFromLlmPayload(
  payload: LlmEditIntentPayload,
  userMessage: string,
  sections: ReportSection[],
  currentReportHtml = ""
): EditIntentClassification {
  const route: EditPipelineRoute =
    payload.route === "section_edit" ||
    payload.route === "article_edit" ||
    payload.route === "chat_only" ||
    payload.route === "full_report"
      ? payload.route
      : "article_edit";

  const confidence = typeof payload.confidence === "number" ? payload.confidence : 0.75;
  const reason = typeof payload.reason === "string" ? payload.reason : undefined;

  if (route === "article_edit" || route === "chat_only" || route === "full_report") {
    return { route, intent: null, confidence, source: "llm", reason };
  }

  const mode = payload.edit_mode;
  const target = matchSectionByTitle(payload.target_section, sections);

  if (mode === "insert") {
    const title =
      (payload.new_section_title?.trim() && formatNewSectionTitle(payload.new_section_title)) ||
      parseNewSectionTitle(userMessage);
    if (!title) return { route: "full_report", intent: null, confidence: 0.4, source: "llm", reason };
    return {
      route: "section_edit",
      intent: {
        mode: "insert",
        newSectionTitle: title,
        placement: placementFromLlm(payload, sections, title),
      },
      confidence,
      source: "llm",
      reason,
    };
  }

  if (!target) {
    return { route: "full_report", intent: null, confidence: 0.4, source: "llm", reason: "Section not found" };
  }

  if (mode === "remove") {
    return { route: "section_edit", intent: { mode: "remove", section: target }, confidence, source: "llm", reason };
  }

  if (mode === "rename") {
    const newTitle =
      (payload.new_section_title?.trim() && formatNewSectionTitle(payload.new_section_title)) ||
      parseRenameTitle(userMessage);
    if (!newTitle) {
      return { route: "full_report", intent: null, confidence: 0.4, source: "llm", reason: "Missing rename title" };
    }
    return {
      route: "section_edit",
      intent: { mode: "rename", section: target, newTitle },
      confidence,
      source: "llm",
      reason,
    };
  }

  if (mode === "move") {
    return {
      route: "section_edit",
      intent: {
        mode: "move",
        section: target,
        placement: placementFromLlm(payload, sections, target.title),
      },
      confidence,
      source: "llm",
      reason,
    };
  }

  if (mode === "merge") {
    const titleRefs = payload.target_sections?.length
      ? payload.target_sections
      : payload.target_section
        ? [payload.target_section]
        : [];
    const matched = titleRefs
      .map((t) => matchSectionByTitle(t, sections))
      .filter((s): s is ReportSection => s !== null);
    const ordered =
      matched.length >= 2
        ? matched
        : payload.target_section
          ? (() => {
              const m = parseMergeSectionsFromMessage(userMessage, sections);
              return m?.sections ?? [];
            })()
          : [];
    if (ordered.length < 2) {
      return { route: "full_report", intent: null, confidence: 0.4, source: "llm", reason: "Merge needs two sections" };
    }
    const mergedTitle =
      (payload.new_section_title?.trim() && formatNewSectionTitle(payload.new_section_title)) ||
      formatNewSectionTitle(ordered[0].title);
    return {
      route: "section_edit",
      intent: { mode: "merge", sections: ordered, mergedTitle },
      confidence,
      source: "llm",
      reason,
    };
  }

  if (mode === "split") {
    const splitTitles = payload.split_section_titles?.length
      ? payload.split_section_titles.map(formatNewSectionTitle)
      : parseSplitIntentFromMessage(userMessage, sections)?.splitTitles ?? [];
    if (splitTitles.length < 2) {
      return { route: "full_report", intent: null, confidence: 0.4, source: "llm", reason: "Split needs two titles" };
    }
    return {
      route: "section_edit",
      intent: { mode: "split", section: target, splitTitles },
      confidence,
      source: "llm",
      reason,
    };
  }

  if (mode === "append_chart") {
    return {
      route: "section_edit",
      intent: { mode: "append_chart", section: target },
      confidence,
      source: "llm",
      reason,
    };
  }

  if (mode === "revise" || !mode) {
    const appendChart = currentReportHtml.trim()
      ? parseAppendChartIntent(userMessage, currentReportHtml)
      : null;
    return {
      route: "section_edit",
      intent: appendChart ?? { mode: "revise", section: target },
      confidence,
      source: "llm",
      reason,
    };
  }

  return { route: "full_report", intent: null, confidence: 0.4, source: "llm", reason };
}

/** Heuristics first; falls back to the existing plan LLM when confidence is low. */
export async function resolveEditIntent(
  userMessage: string,
  currentReportHtml: string,
  today: string
): Promise<EditIntentClassification> {
  if (!currentReportHtml.trim()) {
    return { route: "full_report", intent: null, confidence: 1, source: "heuristic", reason: "No existing report" };
  }

  const normalizedMessage = expandSectionReferences(userMessage, currentReportHtml);
  const heuristic = classifyEditIntentHeuristic(userMessage, currentReportHtml);
  const needsLlm =
    heuristic.confidence < 0.8 ||
    (heuristic.route === "full_report" && EDIT_SIGNAL_RE.test(normalizedMessage) && heuristic.confidence < 0.7);

  if (!needsLlm) return heuristic;

  const sectionTitles = listReportSectionTitles(currentReportHtml);
  const titleMatch = currentReportHtml.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const reportTitle = titleMatch?.[1]?.replace(/<[^>]+>/g, " ").trim() ?? "Untitled report";

  const raw = await callRequestyChatWithModelChain(
    planModelChain(config.requesty.atfxResearchPlanModel),
    [
      {
        role: "system",
        content:
          "You classify how a user wants to edit an existing research report. Return ONLY valid JSON. Match section names to the provided list exactly when possible.",
      },
      {
        role: "user",
        content: buildEditIntentClassifierPrompt(normalizedMessage, reportTitle, sectionTitles, today),
      },
    ],
    { temperature: 0.1, max_tokens: 600 }
  );

  const jsonStr = extractFirstJsonObject(raw);
  if (!jsonStr) return heuristic;

  try {
    const payload = JSON.parse(jsonStr) as LlmEditIntentPayload;
    let llmResult = intentFromLlmPayload(
      payload,
      normalizedMessage,
      listReportSections(currentReportHtml),
      currentReportHtml
    );
    if (llmResult.route === "full_report" && !looksLikeExplicitNewReport(userMessage)) {
      llmResult = {
        route: "article_edit",
        intent: null,
        confidence: Math.max(llmResult.confidence, 0.85),
        source: llmResult.source,
        reason: "Modify existing article (not a new report)",
      };
    }
    if (llmResult.confidence >= heuristic.confidence) return llmResult;
    return heuristic.intent ? heuristic : llmResult;
  } catch {
    return heuristic;
  }
}

export function describeEditIntent(
  intent: SectionEditIntent,
  sections: ReportSection[],
  userMessage?: string
): string {
  switch (intent.mode) {
    case "insert":
      return `Add "${intent.newSectionTitle}" ${describeSectionPlacement(intent.placement, sections)}`;
    case "revise":
      return `Revise "${intent.section.title}"`;
    case "append_chart":
      return userMessage && isReplaceChartSectionEditRequest(userMessage)
        ? `Replace chart in "${intent.section.title}"`
        : `Append chart to end of "${intent.section.title}"`;
    case "remove":
      return `Remove "${intent.section.title}"`;
    case "rename":
      return `Rename "${intent.section.title}" to "${intent.newTitle}"`;
    case "move":
      return `Move "${intent.section.title}" ${describeSectionPlacement(intent.placement, sections)}`;
    case "merge":
      return `Merge ${intent.sections.map((s) => `"${s.title}"`).join(" + ")} into "${intent.mergedTitle}"`;
    case "split":
      return `Split "${intent.section.title}" into ${intent.splitTitles.map((t) => `"${t}"`).join(" + ")}`;
  }
}

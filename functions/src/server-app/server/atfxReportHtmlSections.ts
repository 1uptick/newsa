export type ReportSection = {
  title: string;
  /** Includes the <h2> heading and body until the next <h2> or end of document. */
  html: string;
};

export type SectionInsertPlacement = {
  afterSection?: string;
  beforeSection?: string;
};

export type SectionEditIntent =
  | { mode: "revise"; section: ReportSection }
  | { mode: "append_chart"; section: ReportSection }
  | { mode: "insert"; newSectionTitle: string; placement: SectionInsertPlacement }
  | { mode: "remove"; section: ReportSection }
  | { mode: "rename"; section: ReportSection; newTitle: string }
  | { mode: "move"; section: ReportSection; placement: SectionInsertPlacement }
  | { mode: "merge"; sections: ReportSection[]; mergedTitle: string }
  | { mode: "split"; section: ReportSection; splitTitles: string[] };

import { ECON_CHART_IMG_ALT_RE } from "./atfxReportChartLayout.js";
import { planContentCharts } from "./contentChartPlanner.js";

const APPEND_CHART_RE =
  /\b(?:add(?:ed|ing)?|insert(?:ing)?|include|append|put)\b[^.]{0,140}\b(?:chart|graph|figure|image|picture|embed|visuali[sz]ation|graphic|plot)\b/i;

const CHART_AT_END_RE =
  /\b(?:chart|graph|figure|image|embed)\b[^.]{0,100}\b(?:at\s+(?:the\s+)?end|to\s+(?:the\s+)?end)\b/i;

const REPLACE_CHART_RE =
  /\b(?:replace|swap|update|fix|refresh|regenerate|redo|re-?fetch|reload)\b[^.]{0,120}\b(?:chart|graph|figure|image|picture|embed|visuali[sz]ation|graphic|plot)\b/i;

const FETCH_EMBED_RE =
  /\b(?:fetch|pull|get|retrieve|grab)\b[^.]{0,100}\b(?:new|fresh|another|updated)?\s*(?:chart|graph|figure|image|embed|cpi|inflation|unemployment|gdp)\b/i;

const CHART_BROKEN_RE =
  /\b(?:chart|graph|figure|image|picture|embed|visuali[sz]ation|graphic|plot)\b[^.]{0,100}\b(?:not\s+show(?:ing)?|isn'?t\s+show(?:ing)?|not\s+display(?:ing)?|not\s+load(?:ing)?|won'?t\s+(?:show|load|display|render)|missing|broken|blank|empty|didn'?t\s+appear|failed|corrupt|invisible|gone)\b/i;

const CHART_BROKEN_LEADING_RE =
  /\b(?:not\s+show(?:ing)?|not\s+display(?:ing)?|not\s+load(?:ing)?|missing|broken|blank|invisible|gone)\b[^.]{0,100}\b(?:chart|graph|figure|image|picture|embed|visuali[sz]ation|graphic|plot)\b/i;

const REMOVE_BROKEN_EMBED_RE =
  /\b(?:remove|delete)\b[^.]{0,80}\b(?:broken|missing|blank|empty)\b[^.]{0,80}\b(?:chart|graph|figure|image|picture|embed)\b/i;

const MACRO_INDICATOR_RE =
  /\b(?:us\s+)?(?:cpi|consumer price(?:s)?|inflation|unemployment|jobless|nonfarm|non-farm|payroll|nfp|gdp|gross domestic|pce|fed(?:\s+funds)?|treasury|retail(?:\s+sales)?|pmi|ism)\b/i;

const INDICATOR_EDIT_ACTION_RE =
  /\b(?:fix|replace|swap|update|refresh|regenerate|redo|fetch|pull|get|retrieve|reload|re-?fetch|add|insert|include|append|show|display|render)\b/i;

const PROSE_REWRITE_EXCLUSION_RE =
  /\b(rewrite|expand|rephrase|more detail|explain the concept|teach|analogy|tone|wording|educational|glossary|shorten|simplify)\b/i;

function readImgAttr(tag: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i");
  return tag.match(re)?.[2] ?? null;
}

/** Macro indicator named with a repair/fetch action — no "chart" word required. */
function isIndicatorEmbedEditRequest(userMessage: string): boolean {
  if (!MACRO_INDICATOR_RE.test(userMessage)) return false;
  return (
    INDICATOR_EDIT_ACTION_RE.test(userMessage) ||
    CHART_BROKEN_RE.test(userMessage) ||
    CHART_BROKEN_LEADING_RE.test(userMessage) ||
    REMOVE_BROKEN_EMBED_RE.test(userMessage)
  );
}

function hasStrongChartEmbedSignal(userMessage: string): boolean {
  return (
    APPEND_CHART_RE.test(userMessage) ||
    CHART_AT_END_RE.test(userMessage) ||
    isReplaceChartSectionEditRequest(userMessage) ||
    isIndicatorEmbedEditRequest(userMessage) ||
    FETCH_EMBED_RE.test(userMessage) ||
    REMOVE_BROKEN_EMBED_RE.test(userMessage)
  );
}

/** User wants an existing chart/embed swapped or repaired — not a prose rewrite. */
export function isReplaceChartSectionEditRequest(userMessage: string): boolean {
  return (
    REPLACE_CHART_RE.test(userMessage) ||
    CHART_BROKEN_RE.test(userMessage) ||
    CHART_BROKEN_LEADING_RE.test(userMessage) ||
    FETCH_EMBED_RE.test(userMessage) ||
    REMOVE_BROKEN_EMBED_RE.test(userMessage) ||
    (isIndicatorEmbedEditRequest(userMessage) &&
      (INDICATOR_EDIT_ACTION_RE.test(userMessage) || CHART_BROKEN_RE.test(userMessage)))
  );
}

function chartAltMatchesUserMessage(alt: string, userMessage: string): boolean {
  const msg = userMessage.toLowerCase();
  const a = alt.toLowerCase().replace(/^atfx - /i, "");
  if (/\bcpi\b/.test(msg)) return /\bcpi\b/.test(a);
  if (/\binflation\b/.test(msg)) return /\binflation\b/.test(a);
  if (/\bunemployment\b/.test(msg)) return /\bunemployment|jobless|nonfarm\b/.test(a);
  if (/\bgdp\b/.test(msg)) return /\bgdp\b/.test(a);
  if (/\bpce\b/.test(msg)) return /\bpce\b/.test(a);
  if (/\bfed\b/.test(msg)) return /\bfed\b/.test(a);
  if (/\btreasury\b/.test(msg)) return /\btreasury\b/.test(a);
  if (/\bretail\b/.test(msg)) return /\bretail\b/.test(a);
  if (/\byield\b/.test(msg)) return /\byield\b/.test(a);
  if (/\bpmi\b/.test(msg)) return /\bpmi\b/.test(a);
  return true;
}

function isEconChartImgByAlt(tag: string): boolean {
  const alt = (readImgAttr(tag, "alt") ?? "").trim();
  return ECON_CHART_IMG_ALT_RE.test(alt);
}

function isBrokenChartImgTag(tag: string): boolean {
  if (!/<img\b/i.test(tag)) return false;
  const src = readImgAttr(tag, "src") ?? "";
  if (src.startsWith("data:image")) return false;
  if (/^https?:\/\//i.test(src) && src.length > 24) return false;
  return true;
}

function sectionHasBrokenChartEmbed(section: ReportSection): boolean {
  const imgs = section.html.match(/<img\b[^>]*\/?>/gi) ?? [];
  return imgs.some(isBrokenChartImgTag);
}

function priceChartAltMatchesSymbols(alt: string, symbols: string[]): boolean {
  if (!symbols.length) return /\bchart\b/i.test(alt);
  const a = alt.toUpperCase();
  return symbols.some((s) => a.includes(s.toUpperCase()));
}

/** Section with a broken macro or price chart embed matching the user's message. */
export function findSectionWithChartEmbed(
  userMessage: string,
  sections: ReportSection[]
): ReportSection | null {
  const macro = findSectionWithMacroChart(userMessage, sections);
  if (macro) return macro;

  const symbols = planContentCharts(userMessage).explicitPriceSymbols;
  let soleBrokenSection: ReportSection | null = null;
  let soleBrokenCount = 0;

  for (const section of sections) {
    const imgs = section.html.match(/<img\b[^>]*\/?>/gi) ?? [];
    for (const img of imgs) {
      if (!isBrokenChartImgTag(img) || isEconChartImgByAlt(img)) continue;
      const alt = readImgAttr(img, "alt") ?? "";
      if (priceChartAltMatchesSymbols(alt, symbols)) return section;
    }
    const brokenCount = imgs.filter((img) => isBrokenChartImgTag(img)).length;
    if (brokenCount > 0) {
      soleBrokenCount += brokenCount;
      if (!soleBrokenSection) soleBrokenSection = section;
    }
  }

  if (
    soleBrokenSection &&
    soleBrokenCount === 1 &&
    (isReplaceChartSectionEditRequest(userMessage) || /\b(fix|repair|broken|not\s+show|not\s+load|missing)\b/i.test(userMessage))
  ) {
    return soleBrokenSection;
  }
  return null;
}

/** When the user vaguely reports a broken embed, infer the target section from existing HTML. */
function inferChartRepairTarget(userMessage: string, sections: ReportSection[]): ReportSection | null {
  if (
    !/\b(fix|repair|broken|not\s+show|not\s+load|not\s+display|missing|blank|won'?t|embed|image|picture|displaying|loading|invisible|gone)\b/i.test(
      userMessage
    )
  ) {
    return null;
  }
  if (!sections.some(sectionHasBrokenChartEmbed)) return null;

  const named = findTargetSection(userMessage, sections);
  if (named && sectionHasBrokenChartEmbed(named)) return named;

  const matched = findSectionWithChartEmbed(userMessage, sections);
  if (matched) return matched;

  const withBroken = sections.filter(sectionHasBrokenChartEmbed);
  return withBroken.length === 1 ? withBroken[0] : null;
}

function resolveChartEditTarget(userMessage: string, sections: ReportSection[]): ReportSection | null {
  return (
    findTargetSection(userMessage, sections) ??
    (isReplaceChartSectionEditRequest(userMessage) ? findSectionWithChartEmbed(userMessage, sections) : null) ??
    findBestChartPlacementSection(userMessage, sections)
  );
}

/** Section that already contains a macro chart matching the user's message (often broken). */
export function findSectionWithMacroChart(
  userMessage: string,
  sections: ReportSection[]
): ReportSection | null {
  let fallbackBroken: ReportSection | null = null;
  for (const section of sections) {
    const imgs = section.html.match(/<img\b[^>]*\/?>/gi) ?? [];
    for (const img of imgs) {
      if (!isEconChartImgByAlt(img)) continue;
      const alt = readImgAttr(img, "alt") ?? "";
      if (isBrokenChartImgTag(img) && isEconChartImgByAlt(img) && !fallbackBroken) fallbackBroken = section;
      if (chartAltMatchesUserMessage(alt, userMessage)) return section;
    }
  }
  if (isReplaceChartSectionEditRequest(userMessage) && fallbackBroken) return fallbackBroken;
  return null;
}

/** Remove macro or matching price chart blocks before inserting a replacement embed. */
export function removeMacroChartsFromSectionHtml(sectionHtml: string, userMessage: string): string {
  const symbols = planContentCharts(userMessage).explicitPriceSymbols;

  const shouldRemove = (tag: string) => {
    if (isEconChartImgByAlt(tag)) {
      return chartAltMatchesUserMessage(readImgAttr(tag, "alt") ?? "", userMessage);
    }
    if (!isBrokenChartImgTag(tag) && !/\bchart\b/i.test(readImgAttr(tag, "alt") ?? "")) return false;
    return priceChartAltMatchesSymbols(readImgAttr(tag, "alt") ?? "", symbols);
  };

  let out = sectionHtml.replace(
    /<(?:p|figure|div)(?:\s[^>]*)?>[\s\S]*?<img\b[^>]*\/?>[\s\S]*?<\/(?:p|figure|div)>/gi,
    (block) => {
      const img = block.match(/<img\b[^>]*\/?>/i)?.[0];
      return img && shouldRemove(img) ? "" : block;
    }
  );
  out = out.replace(/<img\b[^>]*\/?>/gi, (tag) => (shouldRemove(tag) ? "" : tag));
  return out.replace(/\n{3,}/g, "\n\n");
}

/** User wants a chart/embed placed or repaired in a section — not a prose rewrite. */
export function isChartOnlySectionEditRequest(userMessage: string): boolean {
  if (!hasStrongChartEmbedSignal(userMessage)) return false;
  if (PROSE_REWRITE_EXCLUSION_RE.test(userMessage) && !isReplaceChartSectionEditRequest(userMessage)) {
    return false;
  }
  return true;
}

/** Detect chart append/replace intent (deterministic — no LLM rewrite). */
export function parseAppendChartIntent(
  userMessage: string,
  currentReportHtml: string
): Extract<SectionEditIntent, { mode: "append_chart" }> | null {
  const sections = listReportSections(currentReportHtml);
  if (!sections.length) return null;

  if (!isChartOnlySectionEditRequest(userMessage)) {
    const inferred = inferChartRepairTarget(userMessage, sections);
    if (!inferred) return null;
    return { mode: "append_chart", section: inferred };
  }

  const target = resolveChartEditTarget(userMessage, sections);
  if (!target) return null;
  return { mode: "append_chart", section: target };
}

/** Append HTML block at the end of a section (before the next <h2> if any). */
export function appendContentToSectionEnd(sectionHtml: string, block: string): string {
  const trimmed = block.trim();
  if (!trimmed || !sectionHtml.trim()) return sectionHtml;
  return `${sectionHtml.trimEnd()}\n\n${trimmed}`;
}

/** Token inserted by the UI section picker for exact section matching. */
export const SECTION_REFERENCE_TOKEN_RE = /@\[([^\]]+)\]/g;

export function expandSectionReferences(message: string, html: string): string {
  const sections = listReportSections(html);
  return message.replace(SECTION_REFERENCE_TOKEN_RE, (_full, rawTitle: string) => {
    const title = rawTitle.trim();
    const match =
      sections.find((s) => s.title === title) ??
      sections.find((s) => normalizeSectionTitle(s.title) === normalizeSectionTitle(title));
    return match ? `the "${match.title}" section` : `the "${title}" section`;
  });
}

export function extractPinnedSectionTitles(message: string): string[] {
  const titles: string[] = [];
  for (const match of message.matchAll(SECTION_REFERENCE_TOKEN_RE)) {
    if (match[1]?.trim()) titles.push(match[1].trim());
  }
  return titles;
}

export function findSectionByExactTitle(title: string, sections: ReportSection[]): ReportSection | null {
  const trimmed = title.trim();
  if (!trimmed) return null;
  return (
    sections.find((s) => s.title === trimmed) ??
    sections.find((s) => normalizeSectionTitle(s.title) === normalizeSectionTitle(trimmed)) ??
    null
  );
}

export function findSectionsByPinnedTitles(message: string, sections: ReportSection[]): ReportSection[] {
  const pinned = extractPinnedSectionTitles(message);
  if (!pinned.length) return [];
  return pinned
    .map((title) => findSectionByExactTitle(title, sections))
    .filter((s): s is ReportSection => s !== null);
}

export function orderedSectionsFromTitles(allSections: ReportSection[], titles: string[]): ReportSection[] {
  const wanted = new Set(titles.map(normalizeSectionTitle));
  return allSections.filter((s) => wanted.has(normalizeSectionTitle(s.title)));
}

function stripHtmlTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeSectionTitle(title: string): string {
  return stripHtmlTags(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Split report HTML into <h2> sections (excludes content before the first <h2>). */
export function listReportSections(html: string): ReportSection[] {
  const source = html.trim();
  if (!source) return [];

  const h2Regex = /<h2\b[^>]*>[\s\S]*?<\/h2>/gi;
  const headings: Array<{ title: string; start: number }> = [];
  let match: RegExpExecArray | null;

  while ((match = h2Regex.exec(source)) !== null) {
    const title = stripHtmlTags(match[0]);
    if (title) headings.push({ title, start: match.index });
  }

  if (!headings.length) return [];

  return headings.map((heading, index) => {
    const end = index + 1 < headings.length ? headings[index + 1].start : source.length;
    return {
      title: heading.title,
      html: source.slice(heading.start, end).trim(),
    };
  });
}

export function listReportSectionTitles(html: string): string[] {
  return listReportSections(html).map((s) => s.title);
}

/** Match a section title referenced in the user's revision message. */
export function findTargetSection(userMessage: string, sections: ReportSection[]): ReportSection | null {
  const pinned = findSectionsByPinnedTitles(userMessage, sections);
  if (pinned.length === 1) return pinned[0];

  const msgNorm = normalizeSectionTitle(userMessage);
  if (!msgNorm || !sections.length) return null;

  let best: ReportSection | null = null;
  let bestScore = 0;

  for (const section of sections) {
    const titleNorm = normalizeSectionTitle(section.title);
    if (!titleNorm) continue;

    if (msgNorm.includes(titleNorm)) {
      const score = titleNorm.length + 1000;
      if (score > bestScore) {
        bestScore = score;
        best = section;
      }
      continue;
    }

    const words = titleNorm.split(/\s+/).filter((w) => w.length > 2);
    if (!words.length) continue;

    const matched = words.filter((w) => msgNorm.includes(w));
    const minNeeded = words.length <= 2 ? words.length : Math.max(2, Math.ceil(words.length * 0.5));
    if (matched.length < minNeeded) continue;

    const score = matched.reduce((sum, w) => sum + w.length, 0);
    if (score > bestScore) {
      bestScore = score;
      best = section;
    }
  }

  return best;
}

/** Pick the best section for a macro/price chart when the user did not name one explicitly. */
export function findBestChartPlacementSection(
  userMessage: string,
  sections: ReportSection[]
): ReportSection | null {
  if (!sections.length) return null;
  const msg = userMessage.toLowerCase();

  const titleScore = (section: ReportSection, patterns: RegExp[]): number => {
    const title = section.title.toLowerCase();
    let score = 0;
    for (const re of patterns) {
      if (re.test(title)) score += re.source.length;
    }
    return score;
  };

  if (/\b(cpi|inflation|pce|deflat|price level|consumer price)\b/i.test(msg)) {
    const patterns = [
      /\binflation\b/i,
      /\bcpi\b/i,
      /\bmacro\b/i,
      /\bdriver\b/i,
      /\boutlook\b/i,
      /\bcontext\b/i,
      /\bfundamental\b/i,
      /\beconomic\b/i,
      /\brate\b/i,
      /\bfed\b/i,
      /\bpositioning\b/i,
    ];
    let best: ReportSection | null = null;
    let bestScore = 0;
    for (const section of sections) {
      const score = titleScore(section, patterns);
      if (score > bestScore) {
        bestScore = score;
        best = section;
      }
    }
    if (best) return best;
  }

  if (/\b(unemployment|jobless|payroll|nfp|labou?r)\b/i.test(msg)) {
    const patterns = [/\bunemployment\b/i, /\bjob\b/i, /\blabou?r\b/i, /\bemployment\b/i, /\bmacro\b/i];
    let best: ReportSection | null = null;
    let bestScore = 0;
    for (const section of sections) {
      const score = titleScore(section, patterns);
      if (score > bestScore) {
        bestScore = score;
        best = section;
      }
    }
    if (best) return best;
  }

  if (/\b(gdp|pmi|manufacturing|treasury|yield)\b/i.test(msg)) {
    const keyword = msg.match(/\b(gdp|pmi|manufacturing|treasury|yield)\b/i)?.[1] ?? "";
    if (keyword) {
      const re = new RegExp(keyword, "i");
      const hit = sections.find((s) => re.test(s.title));
      if (hit) return hit;
    }
  }

  const glossaryIdx = sections.findIndex((s) => /\bglossary\b/i.test(s.title));
  if (glossaryIdx > 0) return sections[glossaryIdx - 1];

  const nonGlossary = sections.filter((s) => !/\bglossary\b/i.test(s.title));
  return nonGlossary[nonGlossary.length - 1] ?? sections[sections.length - 1];
}

function resolveSectionReference(ref: string, sections: ReportSection[]): ReportSection | null {
  const cleaned = ref.trim().replace(/\s+section\s*$/i, "");
  return findTargetSection(cleaned, sections) ?? findTargetSection(`the ${cleaned} section`, sections);
}

export function formatNewSectionTitle(raw: string): string {
  let t = raw
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\s+(?:to|into)\s+(?:the\s+)?(?:article|report)\.?$/i, "")
    .trim();

  const compact = t.replace(/\s+/g, "").toLowerCase();
  if (compact === "faq" || compact === "f&q") return "FAQ";
  if (compact === "q&a" || compact === "qanda") return "Q&A";

  return t.replace(/\b[\w&]+/g, (word) => {
    if (/^f&q$/i.test(word.replace(/\s/g, ""))) return "FAQ";
    if (/^q&a$/i.test(word.replace(/\s/g, ""))) return "Q&A";
    if (word.length <= 3 && word === word.toUpperCase()) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
}

/** Extract a NEW section title from "add a FAQ section" style requests. */
export function parseNewSectionTitle(userMessage: string): string | null {
  const sectionMatch = userMessage.match(
    /\b(?:add|insert|include|append|create)\s+(?:a\s+|an\s+|the\s+)?(.+?)\s+section\b/i
  );
  if (sectionMatch?.[1]) {
    const raw = sectionMatch[1].trim();
    if (/\b(more|additional|extra|further)\b/i.test(raw)) return null;
    if (/\bto\s+the\b/i.test(raw)) return null;
    return formatNewSectionTitle(raw);
  }

  const shortMatch = userMessage.match(
    /\b(?:add|insert|include|append|create)\s+(?:a\s+|an\s+|the\s+)?(faq|f\s*&\s*q|q\s*&\s*a)\b/i
  );
  if (shortMatch?.[1]) return formatNewSectionTitle(shortMatch[1]);

  return null;
}

export function sectionExists(title: string, sections: ReportSection[]): boolean {
  const norm = normalizeSectionTitle(title);
  if (!norm) return false;
  return sections.some((s) => {
    const sNorm = normalizeSectionTitle(s.title);
    return sNorm === norm || sNorm.includes(norm) || norm.includes(sNorm);
  });
}

export function parseSectionPlacement(
  userMessage: string,
  sections: ReportSection[],
  newSectionTitle: string
): SectionInsertPlacement {
  const between = userMessage.match(
    /\bbetween\s+(?:the\s+)?(.+?)\s+and\s+(?:the\s+)?(.+?)(?:\s+sections?)?(?:[,.]|$)/i
  );
  if (between) {
    const first = resolveSectionReference(between[1], sections);
    const second = resolveSectionReference(between[2], sections);
    if (first && second) return { afterSection: first.title };
    if (first) return { afterSection: first.title };
    if (second) return { beforeSection: second.title };
  }

  const afterMatch = userMessage.match(/\bafter\s+(?:the\s+)?(.+?)(?:\s+section)?(?:[,.]|$)/i);
  if (afterMatch) {
    const sec = resolveSectionReference(afterMatch[1], sections);
    if (sec) return { afterSection: sec.title };
  }

  const beforeMatch = userMessage.match(/\bbefore\s+(?:the\s+)?(.+?)(?:\s+section)?(?:[,.]|$)/i);
  if (beforeMatch) {
    const sec = resolveSectionReference(beforeMatch[1], sections);
    if (sec) return { beforeSection: sec.title };
  }

  return inferDefaultPlacement(newSectionTitle, sections);
}

function inferDefaultPlacement(newSectionTitle: string, sections: ReportSection[]): SectionInsertPlacement {
  const norm = normalizeSectionTitle(newSectionTitle);

  if (norm.includes("faq") || norm.includes("frequently asked") || norm === "q a") {
    for (const s of sections) {
      if (/risk|disclaimer|legal|conclusion/i.test(s.title)) return { beforeSection: s.title };
    }
    for (const s of sections) {
      if (/outlook|summary|takeaway/i.test(s.title)) return { afterSection: s.title };
    }
  }

  if (norm.includes("news") || norm.includes("headline") || norm.includes("catalyst")) {
    for (const s of sections) {
      if (/overview|introduction|market sentiment|context|price action/i.test(s.title)) {
        return { afterSection: s.title };
      }
    }
  }

  return {};
}

const REVISE_HINT_RE =
  /\b(more|additional|extra|expand|update|revise|modify|change|rewrite|improve|backup|evidence|detail)\b/i;

/** Detect revise-existing vs insert-new section edit intent. */
export function parseSectionEditIntent(userMessage: string, currentReportHtml: string): SectionEditIntent | null {
  if (!currentReportHtml.trim()) return null;
  const sections = listReportSections(currentReportHtml);
  if (!sections.length) return null;

  const newTitle = parseNewSectionTitle(userMessage);
  const hasAddSectionPhrase =
    /\b(?:add|insert|include|append|create)\b/i.test(userMessage) &&
    (/\bsection\b/i.test(userMessage) || /\b(faq|f\s*&\s*q|q\s*&\s*a)\b/i.test(userMessage));

  if (newTitle && hasAddSectionPhrase && !sectionExists(newTitle, sections)) {
    return {
      mode: "insert",
      newSectionTitle: newTitle,
      placement: parseSectionPlacement(userMessage, sections, newTitle),
    };
  }

  const target = findTargetSection(userMessage, sections);
  if (!target) return null;

  const appendChart = parseAppendChartIntent(userMessage, currentReportHtml);
  if (appendChart) return appendChart;

  if (hasAddSectionPhrase && newTitle && !sectionExists(newTitle, sections)) {
    return null;
  }

  if (REVISE_HINT_RE.test(userMessage) || !hasAddSectionPhrase) {
    return { mode: "revise", section: target };
  }

  return { mode: "revise", section: target };
}

export function describeSectionPlacement(
  placement: SectionInsertPlacement,
  sections: ReportSection[]
): string {
  if (placement.afterSection) return `after "${placement.afterSection}"`;
  if (placement.beforeSection) return `before "${placement.beforeSection}"`;
  if (sections.length) return `at the end (after "${sections[sections.length - 1].title}")`;
  return "at the end of the report";
}

export function replaceReportSection(
  fullHtml: string,
  sectionTitle: string,
  newSectionHtml: string
): string {
  const sections = listReportSections(fullHtml);
  const targetNorm = normalizeSectionTitle(sectionTitle);
  const target = sections.find((s) => normalizeSectionTitle(s.title) === targetNorm);
  if (!target) return fullHtml;

  const trimmed = newSectionHtml.trim();
  if (!trimmed) return fullHtml;

  const index = fullHtml.indexOf(target.html);
  if (index === -1) return fullHtml;

  return `${fullHtml.slice(0, index)}${trimmed}${fullHtml.slice(index + target.html.length)}`;
}

export function insertReportSection(
  fullHtml: string,
  newSectionHtml: string,
  placement: SectionInsertPlacement
): string {
  const trimmed = newSectionHtml.trim();
  if (!trimmed) return fullHtml;

  const sections = listReportSections(fullHtml);

  if (placement.beforeSection) {
    const target = sections.find(
      (s) => normalizeSectionTitle(s.title) === normalizeSectionTitle(placement.beforeSection!)
    );
    if (target) {
      const index = fullHtml.indexOf(target.html);
      if (index !== -1) {
        return `${fullHtml.slice(0, index).trimEnd()}\n\n${trimmed}\n\n${fullHtml.slice(index)}`;
      }
    }
  }

  if (placement.afterSection) {
    const target = sections.find(
      (s) => normalizeSectionTitle(s.title) === normalizeSectionTitle(placement.afterSection!)
    );
    if (target) {
      const index = fullHtml.indexOf(target.html);
      if (index !== -1) {
        const end = index + target.html.length;
        return `${fullHtml.slice(0, end).trimEnd()}\n\n${trimmed}${fullHtml.slice(end)}`;
      }
    }
  }

  return `${fullHtml.trimEnd()}\n\n${trimmed}`;
}

export function removeReportSection(fullHtml: string, sectionTitle: string): string {
  const sections = listReportSections(fullHtml);
  const targetNorm = normalizeSectionTitle(sectionTitle);
  const target = sections.find((s) => normalizeSectionTitle(s.title) === targetNorm);
  if (!target) return fullHtml;

  const index = fullHtml.indexOf(target.html);
  if (index === -1) return fullHtml;

  return fullHtml.slice(0, index).trimEnd() + fullHtml.slice(index + target.html.length).replace(/^\n+/, "");
}

export function renameReportSection(fullHtml: string, sectionTitle: string, newTitle: string): string {
  const sections = listReportSections(fullHtml);
  const targetNorm = normalizeSectionTitle(sectionTitle);
  const target = sections.find((s) => normalizeSectionTitle(s.title) === targetNorm);
  if (!target) return fullHtml;

  const renamedHtml = target.html.replace(/<h2\b[^>]*>[\s\S]*?<\/h2>/i, `<h2>${escapeHtmlText(newTitle)}</h2>`);
  return replaceReportSection(fullHtml, sectionTitle, renamedHtml);
}

export function moveReportSection(
  fullHtml: string,
  sectionTitle: string,
  placement: SectionInsertPlacement
): string {
  const sections = listReportSections(fullHtml);
  const targetNorm = normalizeSectionTitle(sectionTitle);
  const target = sections.find((s) => normalizeSectionTitle(s.title) === targetNorm);
  if (!target) return fullHtml;

  const without = removeReportSection(fullHtml, sectionTitle);
  return insertReportSection(without, target.html, placement);
}

/** Replace a contiguous run of sections (in document order) with new HTML. */
export function replaceSectionRange(
  fullHtml: string,
  startTitle: string,
  endTitle: string,
  newHtml: string
): string {
  const sections = listReportSections(fullHtml);
  const startNorm = normalizeSectionTitle(startTitle);
  const endNorm = normalizeSectionTitle(endTitle);
  const startIdx = sections.findIndex((s) => normalizeSectionTitle(s.title) === startNorm);
  const endIdx = sections.findIndex((s) => normalizeSectionTitle(s.title) === endNorm);
  if (startIdx === -1 || endIdx === -1) return fullHtml;

  const lo = Math.min(startIdx, endIdx);
  const hi = Math.max(startIdx, endIdx);
  const startHtml = sections[lo].html;
  const endHtml = sections[hi].html;
  const startPos = fullHtml.indexOf(startHtml);
  const endPos = fullHtml.indexOf(endHtml) + endHtml.length;
  if (startPos === -1 || endPos === -1) return fullHtml;

  return `${fullHtml.slice(0, startPos)}${newHtml.trim()}${fullHtml.slice(endPos)}`;
}

export function mergeReportSections(
  fullHtml: string,
  sourceSections: ReportSection[],
  mergedSectionHtml: string
): string {
  if (sourceSections.length < 2) return fullHtml;
  const ordered = orderedSectionsFromTitles(
    listReportSections(fullHtml),
    sourceSections.map((s) => s.title)
  );
  if (ordered.length < 2) return fullHtml;
  return replaceSectionRange(
    fullHtml,
    ordered[0].title,
    ordered[ordered.length - 1].title,
    mergedSectionHtml
  );
}

export function splitReportSection(fullHtml: string, sectionTitle: string, splitSectionsHtml: string[]): string {
  if (!splitSectionsHtml.length) return fullHtml;
  return replaceSectionRange(fullHtml, sectionTitle, sectionTitle, splitSectionsHtml.join("\n\n"));
}

export function parseSplitTitles(raw: string): string[] {
  return raw
    .split(/\s+and\s+|\s*,\s*|\s*\/\s*/i)
    .map((part) => formatNewSectionTitle(part.replace(/\s+sections?\s*$/i, "").trim()))
    .filter(Boolean);
}

export function parseMergeSectionsFromMessage(
  userMessage: string,
  sections: ReportSection[]
): { sections: ReportSection[]; mergedTitle: string } | null {
  const pinned = findSectionsByPinnedTitles(userMessage, sections);
  if (pinned.length >= 2) {
    const ordered = orderedSectionsFromTitles(sections, pinned.map((s) => s.title));
    const into = userMessage.match(
      /\b(?:into|as|called)\s+(?:a\s+)?(?:section\s+)?(?:called\s+)?["']?([^"'.]+?)["']?(?:\s+section)?(?:[,.]|$)/i
    );
    const mergedTitle = into?.[1] ? formatNewSectionTitle(into[1]) : formatNewSectionTitle(ordered[0].title);
    return { sections: ordered, mergedTitle };
  }

  const match = userMessage.match(
    /\b(?:merge|combine|join|consolidate)\s+(?:the\s+)?(.+?)\s+(?:and|&|with)\s+(.+?)(?:\s+(?:into|as|to)\s+(?:a\s+)?(?:section\s+)?(?:called\s+)?["']?([^"'.]+?)["']?(?:\s+section)?)?(?:[,.]|$)/i
  );
  if (!match) return null;

  const first = resolveSectionReference(match[1], sections);
  const second = resolveSectionReference(match[2], sections);
  if (!first || !second || first.title === second.title) return null;

  const ordered = orderedSectionsFromTitles(sections, [first.title, second.title]);
  const mergedTitle = match[3]
    ? formatNewSectionTitle(match[3])
    : formatNewSectionTitle(`${ordered[0].title} & ${ordered[1].title}`);
  return { sections: ordered, mergedTitle };
}

export function parseSplitIntentFromMessage(
  userMessage: string,
  sections: ReportSection[]
): { section: ReportSection; splitTitles: string[] } | null {
  const pinned = findSectionsByPinnedTitles(userMessage, sections);
  const target = pinned[0] ?? findTargetSection(userMessage, sections);
  if (!target) return null;

  const intoMatch = userMessage.match(
    /\b(?:split|divide|break up|separate)\s+(?:the\s+)?(?:@[^\]]+\]|.+?)\s+(?:into|as)\s+(.+?)(?:[,.]|$)/i
  );
  if (!intoMatch?.[1]) return null;

  const splitTitles = parseSplitTitles(intoMatch[1]);
  if (splitTitles.length < 2) return null;
  return { section: target, splitTitles };
}

function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function isSectionRevisionRequest(userMessage: string, currentReportHtml: string): boolean {
  return parseSectionEditIntent(userMessage, currentReportHtml) !== null;
}

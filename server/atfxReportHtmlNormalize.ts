import { marked } from "marked";
import { enhanceReportTables } from "./atfxReportTableHtml.js";
import { structurePlainTextReportHeadings } from "./atfxReportHtmlStructure.js";
import { atfxEconomicChartImgAttrs, escapeHtmlAttr } from "./atfxChartNaming.js";
import { injectEconomicChartBlock, groupConsecutiveEconomicChartBlocks } from "./atfxReportEconomicChartRefresh.js";
import { MAX_ECONOMIC_CHARTS } from "./contentChartPlanner.js";
import { ECON_CHART_IMG_ALT_RE } from "./atfxReportChartLayout.js";

const HTML_TAG_OPEN_RE = /<\/?[a-z][a-z0-9-]*\b/i;

function looksLikeMarkdown(raw: string): boolean {
  const t = raw.trim();
  if (!t || HTML_TAG_OPEN_RE.test(t)) return false;
  if (/^```[\s\S]*/m.test(t)) return true;
  if (/^#{1,6}\s/m.test(t)) return true;
  if (/^[-*+]\s+/m.test(t)) return true;
  if (/^\d+\.\s+/m.test(t)) return true;
  if (/^>\s+/m.test(t)) return true;
  if (/!\[[^\]]*\]\([^)]+\)/.test(t)) return true;
  return false;
}

function substituteChartRefs(html: string, chartEmbeds: string[]): string {
  return html.replace(/__CHART_REF_(\d+)__/g, (_m, idx) => chartEmbeds[Number(idx)] ?? "");
}

function readImgAttr(tag: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i");
  return tag.match(re)?.[2] ?? null;
}

function hasValidDataImageSrc(tag: string): boolean {
  const src = readImgAttr(tag, "src");
  return Boolean(src?.startsWith("data:image"));
}

function isBrokenEconomicChartImg(tag: string): boolean {
  const alt = (readImgAttr(tag, "alt") ?? "").trim();
  if (!ECON_CHART_IMG_ALT_RE.test(alt)) return false;
  if (hasValidDataImageSrc(tag)) return false;
  const src = readImgAttr(tag, "src") ?? "";
  return (
    !src ||
    src === "" ||
    /^__ECON_CHART_REF_\d+__$/i.test(src)
  );
}

/** Patch macro chart imgs that have alt text but no usable data URL src (common LLM omission). */
export function repairEconomicChartImgTags(html: string, econChartEmbeds: string[]): string {
  if (!html?.trim() || !econChartEmbeds.length) return html;
  const queue = econChartEmbeds.filter((s) => s.startsWith("data:image"));
  if (!queue.length) return html;

  return html.replace(/<img\b[^>]*\/?>/gi, (tag) => {
    if (!isBrokenEconomicChartImg(tag)) return tag;
    const src = queue.shift();
    if (!src) return tag;
    const alt = (readImgAttr(tag, "alt") ?? "US CPI").trim();
    const topic = alt.replace(/^ATFX - /i, "");
    const attrs = atfxEconomicChartImgAttrs(topic);
    return `<img src="${src}" ${attrs} />`;
  });
}

function removeBrokenEconomicChartImgs(html: string): string {
  return html.replace(/<img\b[^>]*\/?>/gi, (tag) => (isBrokenEconomicChartImg(tag) ? "" : tag));
}

function substituteEconChartRefs(html: string, econChartEmbeds: string[]): string {
  return html.replace(/__ECON_CHART_REF_(\d+)__/g, (_m, idx) => econChartEmbeds[Number(idx)] ?? "");
}

function econChartAltFromExtras(extrasText: string, index: number): string | null {
  const re = new RegExp(
    `Economic chart: ([^(\\n]+?)(?: \\(file:| \\()[\\s\\S]*?__ECON_CHART_REF_${index}__`,
    "i"
  );
  return extrasText.match(re)?.[1]?.trim() ?? null;
}

/** Inject macro chart imgs when the writer omitted them but research captured embeds. */
function ensureEconomicChartEmbeds(
  html: string,
  econChartEmbeds: string[],
  extrasText?: string
): string {
  if (!html?.trim() || !econChartEmbeds.length) return html;

  const embeds = econChartEmbeds.slice(0, MAX_ECONOMIC_CHARTS);
  let out = substituteEconChartRefs(html, embeds);
  out = repairEconomicChartImgTags(out, embeds);
  const imgTags: string[] = [];

  for (let i = 0; i < Math.min(econChartEmbeds.length, MAX_ECONOMIC_CHARTS); i++) {
    if (imgTags.length >= MAX_ECONOMIC_CHARTS) break;
    const src = econChartEmbeds[i];
    if (!src?.startsWith("data:image") || out.includes(src)) continue;

    const topic =
      econChartAltFromExtras(extrasText ?? "", i) ?? `economic chart ${i + 1}`;
    const attrs = atfxEconomicChartImgAttrs(topic);
    imgTags.push(`<p><img src="${src}" ${attrs} /></p>`);
  }

  if (!imgTags.length) return out;
  return injectEconomicChartBlock(out, imgTags);
}

/** Re-apply stored chart embeds (fixes unresolved refs or missing imgs on load). */
export function refreshReportChartEmbeds(html: string, brief: unknown): string {
  if (!html?.trim() || !brief || typeof brief !== "object") return html;
  const b = brief as {
    chart_embeds?: unknown;
    econ_chart_embeds?: unknown;
    extras_text?: unknown;
  };
  const price = Array.isArray(b.chart_embeds)
    ? b.chart_embeds.filter((s): s is string => typeof s === "string" && s.startsWith("data:image"))
    : [];
  const econ = Array.isArray(b.econ_chart_embeds)
    ? b.econ_chart_embeds
        .filter((s): s is string => typeof s === "string" && s.startsWith("data:image"))
        .slice(0, MAX_ECONOMIC_CHARTS)
    : [];
  const extras = typeof b.extras_text === "string" ? b.extras_text : "";

  let out = substituteChartRefs(html, price);
  out = substituteEconChartRefs(out, econ);
  out = repairEconomicChartImgTags(out, econ);
  out = ensureEconomicChartEmbeds(out, econ, extras);
  out = removeBrokenEconomicChartImgs(out);
  out = groupConsecutiveEconomicChartBlocks(out);
  return enhanceChartImageFileNames(out);
}

/** Ensure chart imgs have data-filename when alt uses ATFX naming. */
function enhanceChartImageFileNames(html: string): string {
  return html.replace(/<img\b([^>]*?)>/gi, (tag, attrs: string) => {
    if (/data-filename=/i.test(attrs)) return tag;
    const altMatch = attrs.match(/\balt="([^"]*)"/i);
    if (!altMatch) return tag;
    const alt = altMatch[1].trim();
    if (!/^ATFX - /i.test(alt)) return tag;
    const safe = escapeHtmlAttr(alt);
    return `<img${attrs} data-filename="${safe}.png">`;
  });
}

/** Normalize writer report_html: chart refs, fenced blocks, markdown → HTML. */
export function normalizeWriterReportHtml(
  raw: string,
  chartEmbeds: string[] = [],
  econChartEmbeds: string[] = [],
  calendarText?: string,
  extrasText?: string
): string {
  let h = substituteChartRefs(raw.trim(), chartEmbeds);
  h = substituteEconChartRefs(h, econChartEmbeds);
  if (!h) return "";

  const fence = h.match(/^```(?:html|markdown|md)?\s*([\s\S]*?)```$/i);
  if (fence) h = fence[1].trim();

  // Strip <article> wrapper before deciding markdown vs HTML (common LLM pattern).
  h = h
    .replace(/^<article\b[^>]*>/i, "")
    .replace(/<\/article>\s*$/i, "")
    .trim();

  if (looksLikeMarkdown(h) || (!HTML_TAG_OPEN_RE.test(h) && /^#{1,6}\s/m.test(h))) {
    h = marked.parse(h, { async: false, gfm: true, breaks: true }) as string;
  }

  h = structurePlainTextReportHeadings(h.trim());
  h = enhanceReportTables(h, calendarText);
  h = repairEconomicChartImgTags(h, econChartEmbeds);
  h = ensureEconomicChartEmbeds(h, econChartEmbeds, extrasText);
  h = removeBrokenEconomicChartImgs(h);
  return enhanceChartImageFileNames(h);
}

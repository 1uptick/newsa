/** Layout helpers for macro economic chart imgs (research reports + ATFX articles). */

/** alt="…" fragment for US macro figure charts (not OHLC price charts). */
export const ECON_CHART_ALT_PATTERN =
  '(?:ATFX - )?US (?:CPI|inflation|unemployment|GDP|nonfarm|jobless|fed|retail|treasury|10-year|2-year)';

export const ECON_CHART_IMG_ALT_RE = new RegExp(`^${ECON_CHART_ALT_PATTERN}`, "i");

/** Match macro chart alt= in stored HTML blobs. */
export const ECON_CHART_IMG_IN_HTML_RE = new RegExp(
  `\\balt=(["'])${ECON_CHART_ALT_PATTERN}`,
  "i"
);

const PRICE_CHART_ALT_RE =
  /\b(?:hourly|daily|weekly|monthly|4-hour|5-minute|15-minute|30-minute)\s+chart\b/i;

function readHtmlAttr(tag: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i");
  return tag.match(re)?.[2] ?? null;
}

/** True for inline macro figure charts (data URL + US CPI/GDP/etc. alt — not OHLC). */
export function isMacroEconomicChartImgTag(tag: string): boolean {
  if (!/<img\b/i.test(tag)) return false;
  const src = readHtmlAttr(tag, "src");
  if (!src?.startsWith("data:image")) return false;
  const alt = readHtmlAttr(tag, "alt") ?? "";
  if (!ECON_CHART_IMG_ALT_RE.test(alt.trim())) return false;
  return !PRICE_CHART_ALT_RE.test(alt);
}

export const ATFX_ECON_CHART_SOLO_CLASS = "atfx-econ-chart-solo";

/** Wrap a lone macro chart block with solo styling class (not used in 2-column grid). */
export function tagSoloEconomicChartBlock(block: string): string {
  if (!block?.trim() || /atfx-econ-chart-solo/.test(block)) return block;
  if (/^<p\b/i.test(block)) {
    if (/class="/i.test(block)) {
      return block.replace(/class="/i, `class="${ATFX_ECON_CHART_SOLO_CLASS} `);
    }
    return block.replace(/^<p\b/i, `<p class="${ATFX_ECON_CHART_SOLO_CLASS}"`);
  }
  if (/^<figure\b/i.test(block)) {
    if (/class="/i.test(block)) {
      return block.replace(/class="/i, `class="${ATFX_ECON_CHART_SOLO_CLASS} `);
    }
    return block.replace(/^<figure\b/i, `<figure class="${ATFX_ECON_CHART_SOLO_CLASS}"`);
  }
  return `<div class="${ATFX_ECON_CHART_SOLO_CLASS}">${block}</div>`;
}

const WRAPPED_ECON_IMG_BLOCK_RE =
  /<(?:p|figure)(?![^>]*\batfx-econ-chart-solo\b)[^>]*>\s*(<img\b[^>]*\/?>)\s*(?:<figcaption[^>]*>[\s\S]*?<\/figcaption>\s*)?<\/(?:p|figure)>/gi;

/** Match a full 2-column grid including nested __cell divs (not just the first cell). */
const ECON_CHARTS_GRID_RE =
  /<div class="atfx-econ-charts-grid">\s*(?:<div class="atfx-econ-charts-grid__cell">[\s\S]*?<\/div>\s*)+<\/div>/gi;

function restoreEconChartGridPlaceholders(html: string, grids: string[]): string {
  return html.replace(/\x00ATFX_ECON_GRID_(\d+)\x00/g, (m, idx: string) => grids[Number(idx)] ?? m);
}

/** Temporarily replace grid blocks so inner imgs are not solo-tagged or re-grouped. */
function isolateEconChartGrids(html: string): { stripped: string; grids: string[] } {
  const grids: string[] = [];
  const stripped = html.replace(ECON_CHARTS_GRID_RE, (grid) => {
    grids.push(grid);
    return `\x00ATFX_ECON_GRID_${grids.length - 1}\x00`;
  });
  return { stripped, grids };
}

function macroChartAltKey(imgTag: string): string | null {
  if (!isMacroEconomicChartImgTag(imgTag)) return null;
  return (readHtmlAttr(imgTag, "alt") ?? "").trim().toLowerCase() || null;
}

function collectGridMacroChartAlts(grids: string[]): Set<string> {
  const alts = new Set<string>();
  for (const grid of grids) {
    for (const imgTag of grid.match(/<img\b[^>]*\/?>/gi) ?? []) {
      const key = macroChartAltKey(imgTag);
      if (key) alts.add(key);
    }
  }
  return alts;
}

/** Drop loose macro chart blocks that duplicate charts already shown in a grid. */
function removeDuplicateMacroChartsOutsideGrids(html: string, gridAlts: Set<string>): string {
  if (!gridAlts.size) return html;
  return html.replace(WRAPPED_ECON_IMG_BLOCK_RE, (full, imgTag) => {
    const key = macroChartAltKey(imgTag);
    if (key && gridAlts.has(key)) return "";
    return full;
  });
}

/** Tag macro charts that sit alone on one row (legacy HTML + post-process). */
export function markStandaloneEconomicCharts(html: string): string {
  if (!html?.trim()) return html;

  const { stripped, grids } = isolateEconChartGrids(html);

  let work = stripped.replace(WRAPPED_ECON_IMG_BLOCK_RE, (full, imgTag) =>
    isMacroEconomicChartImgTag(imgTag) ? tagSoloEconomicChartBlock(full) : full
  );

  work = work.replace(/<img\b[^>]*\/?>/gi, (imgTag, offset) => {
    if (!isMacroEconomicChartImgTag(imgTag)) return imgTag;
    const before = work.slice(0, offset);
    if (/class="[^"]*\batfx-econ-chart-solo\b[^"]*"[^>]*>\s*$/i.test(before)) return imgTag;
    if (/<(?:p|figure)\b[^>]*\batfx-econ-chart-solo\b[^>]*>\s*$/i.test(before)) return imgTag;
    return tagSoloEconomicChartBlock(`<p>${imgTag}</p>`);
  });

  return restoreEconChartGridPlaceholders(work, grids);
}

export function wrapEconomicChartGrid(imgTags: string[]): string {
  if (!imgTags.length) return "";
  const normalized = imgTags.map((tag) => {
    const trimmed = tag.trim();
    if (/^<p\b/i.test(trimmed)) return trimmed.replace(/\s*class="[^"]*\batfx-econ-chart-solo\b[^"]*"/i, "");
    return trimmed;
  });
  if (normalized.length === 1) return tagSoloEconomicChartBlock(normalized[0]);
  const cells = normalized.map((tag) => `<div class="atfx-econ-charts-grid__cell">${tag}</div>`);
  return `<div class="atfx-econ-charts-grid">\n${cells.join("\n")}\n</div>`;
}

const ECON_CHART_BLOCK_CAPTURE_RE =
  /<(?:p|figure)[^>]*>\s*(<img\b[^>]*\/?>)\s*(?:<figcaption[^>]*>[\s\S]*?<\/figcaption>\s*)?<\/(?:p|figure)>/gi;

function findConsecutiveMacroChartRuns(html: string): string {
  const blocks: Array<{ start: number; end: number; imgTag: string }> = [];
  ECON_CHART_BLOCK_CAPTURE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ECON_CHART_BLOCK_CAPTURE_RE.exec(html)) !== null) {
    const imgTag = m[1];
    if (!isMacroEconomicChartImgTag(imgTag)) continue;
    blocks.push({ start: m.index, end: m.index + m[0].length, imgTag });
  }

  if (blocks.length < 2) return html;

  let out = html;
  let shift = 0;
  let runStart = 0;

  const flushRun = (runEnd: number) => {
    const run = blocks.slice(runStart, runEnd + 1);
    if (run.length < 2) return;
    const start = run[0].start + shift;
    const end = run[run.length - 1].end + shift;
    const tags = run.map((b) => `<p>${b.imgTag}</p>`);
    const grid = wrapEconomicChartGrid(tags);
    out = out.slice(0, start) + grid + out.slice(end);
    shift += grid.length - (end - start);
  };

  for (let i = 1; i < blocks.length; i++) {
    const gap = html.slice(blocks[i - 1].end, blocks[i].start);
    if (/^\s*$/.test(gap)) continue;
    flushRun(i - 1);
    runStart = i;
  }
  flushRun(blocks.length - 1);
  return out;
}

/** Group consecutive macro chart blocks into a responsive two-column grid. */
export function groupConsecutiveEconomicChartBlocks(html: string): string {
  if (!html?.trim()) return html;

  const { stripped, grids } = isolateEconChartGrids(html);
  const gridAlts = collectGridMacroChartAlts(grids);
  let work = removeDuplicateMacroChartsOutsideGrids(stripped, gridAlts);
  work = findConsecutiveMacroChartRuns(work);
  work = markStandaloneEconomicCharts(work);
  return restoreEconChartGridPlaceholders(work, grids);
}

const ECON_CHART_BLOCK_IN_RUN_RE =
  /<(?:p|figure)[^>]*>\s*<img\b[^>]*\/?>\s*(?:<figcaption[^>]*>[\s\S]*?<\/figcaption>\s*)?<\/(?:p|figure)>/gi;

export function countEconomicChartsInHtml(html: string): number {
  if (!html?.trim()) return 0;
  ECON_CHART_BLOCK_IN_RUN_RE.lastIndex = 0;
  let count = 0;
  let m: RegExpExecArray | null;
  while ((m = ECON_CHART_BLOCK_IN_RUN_RE.exec(html)) !== null) {
    const img = m[0].match(/<img\b[^>]*\/?>/i)?.[0] ?? "";
    if (isMacroEconomicChartImgTag(img)) count++;
  }
  return count;
}

/** ATFX research report HTML tables. */

import { normalizeCalendarCountryCode } from "./contentChartPlanner.js";

export const ATFX_REPORT_TABLE_CLASS = "atfx-report-table";
export const ATFX_LEVELS_TABLE_CLASS = `${ATFX_REPORT_TABLE_CLASS} atfx-report-table--levels`;

/** Mandatory semantic HTML skeleton for report_html. */
export function reportHtmlStructurePromptBlock(): string {
  return `Report HTML structure (STRICT — use ONLY these tags inside <article>):
<h1> — exactly ONE main title (same as JSON title)
<h2> — section headers (one per section_outline item)
<h4> — sub-headers within a section
<p> — all body paragraphs and lead text (never bare text outside tags)
<table> — structured data (calendar, levels, quotes); use <thead>, <tbody>, <tr>, <th>, <td>
<ul> / <li> — bullet lists for narrative points only (not calendar rows or price levels)
<img> — chart embeds only (__CHART_REF_N__)

Allowed wrapper: <article>...</article> only. No Markdown. No <h3>, <div>, <span>, <br> for layout.

Document skeleton (follow this pattern):
<article>
<h1>Main Report Title</h1>
<p>Lead summary paragraph.</p>

<h2>First Section Title</h2>
<p>Section opening paragraph.</p>
<h4>Sub-section Title</h4>
<p>Supporting detail paragraph.</p>
<ul>
<li>Bullet point one</li>
<li>Bullet point two</li>
</ul>

<h2>Second Section Title</h2>
<p>Intro paragraph.</p>
<table class="${ATFX_REPORT_TABLE_CLASS}">...</table>

<h2>Third Section Title</h2>
<h4>Sub-section Title</h4>
<p>Analysis paragraph.</p>
</article>

Rules:
- Every section from section_outline MUST be an <h2>; add <h4> sub-headers where topics split further.
- Put ALL prose in <p> tags — do not concatenate sentences without wrapping them.
- Use <table> for tabular data; use <ul><li> for short bullet lists; never mix the two.`;
}

export function reportTableHtmlPromptBlock(today: string): string {
  const sampleDate = (() => {
    const d = new Date(`${today}T12:00:00Z`);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  })();
  return `Mandatory HTML tables (never merge columns; each field in its own <td>):

1) Economic calendar / upcoming catalysts — use a real <table> with <thead> and <tbody>:
<table class="${ATFX_REPORT_TABLE_CLASS}">
<thead><tr><th>Date</th><th>Event</th><th>Country</th><th>Impact</th></tr></thead>
<tbody>
<tr><td>${sampleDate}</td><td>(event from CALENDAR_TABLE in brief)</td><td>US</td><td>High</td></tr>
</tbody>
</table>
- Today is ${today}. Date and Event MUST be separate cells (never merged in one cell).
- Copy calendar rows ONLY from CALENDAR_TABLE in the research brief — do not invent events or reuse this example row unless it matches the brief.
- Include only High impact events in the table (omit Medium and Low).

2) Support / resistance — one two-column table PER instrument/chart (critical when multiple OHLC charts):
When the brief includes get_technical_analysis output or SUPPORT_RESISTANCE_TABLE_HTML, copy those levels exactly — do NOT invent prices.
When the brief includes multiple price charts (__CHART_REF_0__, __CHART_REF_1__, …), structure EACH instrument as:
<h4>EUR/USD — Key Technical Levels</h4>
<img src="__CHART_REF_0__" alt="EUR/USD" />
<table class="${ATFX_LEVELS_TABLE_CLASS}">…from technical analysis for this symbol only…</table>

- NEVER merge levels for different tickers into one table.
- Each chart must be followed immediately by that instrument's support/resistance table.
- Add 1–2 <p> paragraphs interpreting trend, RSI, MACD when the brief includes full technical analysis — levels stay in the table only.

Example support/resistance table (Resistance column = green prices, Support column = red prices):
<table class="${ATFX_LEVELS_TABLE_CLASS}">
<thead><tr><th>Resistance</th><th>Support</th></tr></thead>
<tbody>
<tr><td class="atfx-level--resistance">1.4140</td><td class="atfx-level--support">1.3900</td></tr>
<tr><td class="atfx-level--resistance">1.4045</td><td class="atfx-level--support">1.3840</td></tr>
<tr><td class="atfx-level--resistance">1.3980</td><td class="atfx-level--support">1.3730</td></tr>
</tbody>
</table>
- Do NOT use Level / Zone / Description columns or plain "100 Level: description" prose for price levels.
- Use ONLY numeric prices from technical analysis in the table; narrative context belongs in adjacent <p> tags.

3) Economic calendar placement — when CALENDAR_TABLE is in the brief:
- Place the calendar <table> near the END of the article — in the last or second-to-last <h2> section (e.g. "Upcoming Catalysts", "Catalysts", or immediately before "Outlook" / "Risks").
- Do NOT put the economic calendar in the opening or middle sections when other sections follow.
- Use the calendar table format from rule (1) above.`;
}

type SupportResistanceRow = { resistance: string; support: string };

export type SupportResistanceLevelsInput = {
  resistance1: number;
  resistance2: number;
  resistance3: number;
  support1: number;
  support2: number;
  support3: number;
};

export function buildSupportResistanceTableHtml(
  rows: SupportResistanceRow[]
): string {
  if (!rows.length) return "";
  const body = rows
    .map(
      (r) =>
        `<tr><td class="atfx-level--resistance">${escapeCell(r.resistance)}</td><td class="atfx-level--support">${escapeCell(r.support)}</td></tr>`
    )
    .join("");
  return `<table class="${ATFX_LEVELS_TABLE_CLASS}"><thead><tr><th>Resistance</th><th>Support</th></tr></thead><tbody>${body}</tbody></table>`;
}

export function buildSupportResistanceTableFromLevels(
  sr: SupportResistanceLevelsInput,
  refPrice: number
): string {
  const fp = (n: number) => formatLevelPrice(n, refPrice);
  return buildSupportResistanceTableHtml([
    { resistance: fp(sr.resistance3), support: fp(sr.support1) },
    { resistance: fp(sr.resistance2), support: fp(sr.support2) },
    { resistance: fp(sr.resistance1), support: fp(sr.support3) },
  ]);
}

export function formatLevelPrice(value: number, refPrice?: number): string {
  const ref = refPrice && refPrice > 0 ? refPrice : value;
  if (ref >= 1000) return value.toFixed(2);
  if (ref >= 10) return value.toFixed(3);
  if (ref >= 1) return value.toFixed(4);
  return value.toFixed(5);
}

type LevelRow = { level: string; zone: string; description: string };

export type CalendarTableRow = { date: string; event: string; country: string; impact: string };

type CalendarTableRowInternal = CalendarTableRow & { iso: string };

function parseCalendarFromDate(calendarText: string): string | null {
  const m = calendarText.match(/Economic calendar\s+(\d{4}-\d{2}-\d{2})\s+to/i);
  return m?.[1] ?? null;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Anchor near-term calendar filtering to today (ignore stale brief header dates). */
function calendarWindowStart(calendarText: string): string {
  const today = todayIso();
  const headerFrom = parseCalendarFromDate(calendarText);
  if (!headerFrom || headerFrom < today) return today;
  return headerFrom;
}

const MONTH_DAY_RE =
  /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})(?:,\s*(\d{4}))?$/i;

function parseCalendarIso(dateRaw: string, refYear?: number): string {
  const trimmed = dateRaw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const m = trimmed.match(MONTH_DAY_RE);
  if (m) {
    const year = m[3] ? Number(m[3]) : (refYear ?? new Date().getUTCFullYear());
    const d = new Date(`${m[1]} ${m[2]}, ${year} 12:00:00 UTC`);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return trimmed;
}

function addUtcDays(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function impactRank(impact: string): number {
  const s = impact.toLowerCase();
  if (s.includes("high")) return 3;
  if (s.includes("medium")) return 2;
  if (s.includes("low")) return 1;
  return 0;
}

export function isHighImpactCalendarImpact(impact: string): boolean {
  return impactRank(impact) >= 3;
}

function normalizeCalendarCellDate(raw: string): string {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(`${s.slice(0, 10)}T12:00:00Z`);
    const ref = new Date().getUTCFullYear();
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };
    if (d.getUTCFullYear() !== ref) opts.year = "numeric";
    return d.toLocaleDateString("en-US", opts);
  }
  return s;
}

function parseAllCalendarRows(text: string): CalendarTableRowInternal[] {
  if (!text?.trim()) return [];
  const lines = text.split("\n");
  let inTable = false;
  const rows: CalendarTableRowInternal[] = [];

  for (const line of lines) {
    if (line.includes("CALENDAR_TABLE")) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    if (/^date\|event\|country\|impact$/i.test(line.trim())) continue;

    const trimmed = line.trim();
    if (!trimmed) {
      if (rows.length) break;
      continue;
    }
    if (/^\d+\.\s/.test(trimmed)) break;

    const parts = trimmed.split("|");
    if (parts.length < 4) continue;
    const [dateRaw, event, country, impact] = parts;
    if (!dateRaw.trim() || !event.trim()) continue;

    const refFrom = parseCalendarFromDate(text);
    const refYear = refFrom ? Number(refFrom.slice(0, 4)) : undefined;
    const iso = parseCalendarIso(dateRaw, refYear);

    rows.push({
      iso,
      date: normalizeCalendarCellDate(iso.length === 10 ? iso : dateRaw),
      event: event.trim(),
      country: country.trim(),
      impact: impact.trim(),
    });
  }

  return rows;
}

/** Near-term, de-duplicated catalyst rows for report tables (from stored or fresh brief text). */
export function selectCalendarRowsForReport(
  calendarText: string,
  allowedCountries?: string[]
): CalendarTableRow[] {
  const all = parseAllCalendarRows(calendarText);
  if (!all.length) return [];

  const fromDate = calendarWindowStart(calendarText);
  const windowEnd = addUtcDays(fromDate, 21);

  let sortable = all.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.iso));
  sortable = sortable.filter((r) => isHighImpactCalendarImpact(r.impact));
  if (allowedCountries?.length) {
    const allowed = new Set(allowedCountries.map((c) => normalizeCalendarCountryCode(c)));
    sortable = sortable.filter((r) => allowed.has(normalizeCalendarCountryCode(r.country)));
  }
  const sorted = [...sortable].sort((a, b) => {
    if (a.iso !== b.iso) return a.iso.localeCompare(b.iso);
    return impactRank(b.impact) - impactRank(a.impact);
  });

  const nearTerm = sorted.filter((r) => r.iso >= fromDate && r.iso <= windowEnd);
  const future = sorted.filter((r) => r.iso >= fromDate);
  const pool = nearTerm.length ? nearTerm : future.slice(0, 16);
  const seen = new Set<string>();
  const picked: CalendarTableRowInternal[] = [];

  for (const row of pool) {
    const key = `${row.iso}|${row.event.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(row);
    if (picked.length >= 8) break;
  }

  return picked.map(({ date, event, country, impact }) => ({ date, event, country, impact }));
}

/** True when CALENDAR_TABLE rows are all outside the near-term window (stale brief). */
export function calendarBriefNeedsRefresh(calendarText: string): boolean {
  const all = parseAllCalendarRows(calendarText);
  if (!all.length) return true;

  const fromDate = calendarWindowStart(calendarText);
  const windowEnd = addUtcDays(fromDate, 21);
  const sortable = all.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.iso));
  if (!sortable.length) return true;
  const headerFrom = parseCalendarFromDate(calendarText);
  if (headerFrom && headerFrom < todayIso()) return true;
  return !sortable.some((r) => r.iso >= fromDate && r.iso <= windowEnd);
}

/** Parse CALENDAR_TABLE pipe rows from research brief / tool output. */
export function parseCalendarTableFromText(text: string): CalendarTableRow[] {
  return selectCalendarRowsForReport(text);
}

export function buildCalendarTableHtml(rows: CalendarTableRow[]): string {
  if (!rows.length) return "";
  const body = rows
    .map(
      (r) =>
        `<tr><td>${escapeCell(r.date)}</td><td>${escapeCell(r.event)}</td><td>${escapeCell(r.country)}</td><td>${calendarImpactCell(r.impact)}</td></tr>`
    )
    .join("");
  return `<table ${calendarTableClassAttr()}><thead><tr><th>Date</th><th>Event</th><th>Country</th><th>Impact</th></tr></thead><tbody>${body}</tbody></table>`;
}

const CALENDAR_TABLE_BODY_RE =
  /(<table[^>]*>[\s\S]*?<th[^>]*>\s*Date\s*<\/th>[\s\S]*?<th[^>]*>\s*Event\s*<\/th>[\s\S]*?<tbody>)([\s\S]*?)(<\/tbody>)/gi;

/** Replace LLM calendar tables with deterministic rows from CALENDAR_TABLE in the brief. */
export function injectCalendarTableFromBrief(
  html: string,
  calendarText: string,
  allowedCountries?: string[]
): string {
  const rows = selectCalendarRowsForReport(calendarText, allowedCountries);
  if (!rows.length || !html?.trim()) return html;

  const replacement = rows
    .map(
      (r) =>
        `<tr><td>${escapeCell(r.date)}</td><td>${escapeCell(r.event)}</td><td>${escapeCell(r.country)}</td><td>${calendarImpactCell(r.impact)}</td></tr>`
    )
    .join("");

  const withBody = html.replace(CALENDAR_TABLE_BODY_RE, `$1${replacement}$3`);
  if (withBody !== html) return withBody;

  const tableHtml = buildCalendarTableHtml(rows);
  const calendarSectionRe =
    /(<h2[^>]*>[^<]*(?:calendar|catalyst|upcoming|economic event|key event)[^<]*<\/h2>[\s\S]*?)<table[^>]*>[\s\S]*?<\/table>/i;
  if (calendarSectionRe.test(html)) {
    return html.replace(calendarSectionRe, `$1${tableHtml}`);
  }

  const anyDateTableRe = /<table[^>]*>[\s\S]*?<th[^>]*>\s*Date\s*<\/th>[\s\S]*?<\/table>/i;
  if (anyDateTableRe.test(html)) {
    return html.replace(anyDateTableRe, tableHtml);
  }

  return html;
}

const LEVEL_LINE_RE =
  /(?:<p[^>]*>|<li[^>]*>)\s*(?:<strong>\s*)?(\d+\.?\d*)\s*(Level|Zone|Area)\s*(?:<\/strong>)?\s*:\s*([\s\S]*?)(?:<\/p>|<\/li>)/gi;

const LEVEL_PLAIN_RE = /^(\d+\.?\d*)\s*(Level|Zone|Area)\s*:\s*(.+)$/i;

function extractLevelRows(block: string): LevelRow[] {
  const rows: LevelRow[] = [];
  let m: RegExpExecArray | null;
  LEVEL_LINE_RE.lastIndex = 0;
  while ((m = LEVEL_LINE_RE.exec(block)) !== null) {
    const description = m[3].replace(/<[^>]+>/g, "").trim();
    if (description) rows.push({ level: m[1], zone: m[2], description });
  }
  if (rows.length) return rows;

  for (const line of block.split(/\n|<br\s*\/?>/i)) {
    const plain = line.replace(/<[^>]+>/g, "").trim();
    const pm = plain.match(LEVEL_PLAIN_RE);
    if (pm) rows.push({ level: pm[1], zone: pm[2], description: pm[3].trim() });
  }
  return rows;
}

function buildLevelTable(rows: LevelRow[]): string {
  const resistances = rows
    .filter((r) => /resist/i.test(r.zone) || /resist/i.test(r.description))
    .map((r) => r.level);
  const supports = rows
    .filter((r) => /support/i.test(r.zone) || /support/i.test(r.description))
    .map((r) => r.level);
  const generic = rows.filter((r) => !/resist|support/i.test(`${r.zone} ${r.description}`));

  if (resistances.length || supports.length) {
    const max = Math.max(resistances.length, supports.length, 1);
    const srRows: SupportResistanceRow[] = [];
    for (let i = 0; i < max; i++) {
      srRows.push({
        resistance: resistances[i] ?? "",
        support: supports[i] ?? "",
      });
    }
    return buildSupportResistanceTableHtml(srRows.filter((r) => r.resistance || r.support));
  }

  if (generic.length >= 2) {
    const mid = Math.ceil(generic.length / 2);
    const srRows = generic.slice(0, mid).map((r, i) => ({
      resistance: r.level,
      support: generic[mid + i]?.level ?? "",
    }));
    return buildSupportResistanceTableHtml(srRows);
  }

  return buildSupportResistanceTableHtml([{ resistance: rows[0]?.level ?? "", support: rows[1]?.level ?? "" }]);
}

function escapeCell(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type ImpactLevel = "high" | "medium" | "low" | "none";

function parseImpactLevel(impact: string): ImpactLevel {
  const s = impact.toLowerCase();
  if (s.includes("high")) return "high";
  if (s.includes("medium")) return "medium";
  if (s.includes("low")) return "low";
  return "none";
}

/** 3-bar impact indicator for economic calendar tables (High / Medium / Low). */
export function formatImpactIconHtml(impact: string): string {
  const level = parseImpactLevel(impact);
  const label = impact.trim() || "n/a";
  const filled = level === "high" ? 3 : level === "medium" ? 2 : level === "low" ? 1 : 0;
  const bars = [0, 1, 2]
    .map((i) => `<span class="atfx-impact__bar${i < filled ? " atfx-impact__bar--on" : ""}"></span>`)
    .join("");
  return `<span class="atfx-impact atfx-impact--${level}" title="${escapeCell(label)}" aria-label="${escapeCell(label)} impact">${bars}</span>`;
}

function calendarImpactCell(impact: string): string {
  return formatImpactIconHtml(impact);
}

function calendarTableClassAttr(): string {
  return `class="${ATFX_REPORT_TABLE_CLASS} atfx-report-table--calendar"`;
}

function convertLevelSection(html: string, headingRe: RegExp): string {
  return html.replace(headingRe, (full, heading: string, body: string) => {
    const rows = extractLevelRows(body);
    if (rows.length < 1) return full;
    const rest = body.replace(LEVEL_LINE_RE, "").replace(/<ul[^>]*>[\s\S]*?<\/ul>/gi, "").trim();
    const table = buildLevelTable(rows);
    const trailing = rest.replace(/<p>\s*<\/p>/gi, "").trim();
    return `${heading}${table}${trailing ? `\n${trailing}` : ""}`;
  });
}

/** Fix merged Date+Event in one cell, e.g. <td>Sep 11Core Inflation...</td><td>High</td>. */
function fixMergedCalendarCells(html: string): string {
  const month =
    "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)";
  return html.replace(
    new RegExp(
      `<tr>\\s*<td>(${month}\\s+\\d{1,2})([^<]+)<\\/td>\\s*<td>(High|Medium|Low)<\\/td>\\s*<\\/tr>`,
      "gi"
    ),
    (_m, date: string, event: string, impact: string) =>
      `<tr><td>${escapeCell(date.trim())}</td><td>${escapeCell(event.trim())}</td><td>${escapeCell(impact)}</td></tr>`
  ).replace(
    new RegExp(
      `<tr>\\s*<td>(${month}\\s+\\d{1,2})([^<]+)<\\/td>\\s*<td>([^<]+)<\\/td>\\s*<td>(High|Medium|Low)<\\/td>\\s*<\\/tr>`,
      "gi"
    ),
    (_m, date: string, event: string, country: string, impact: string) =>
      `<tr><td>${escapeCell(date.trim())}</td><td>${escapeCell(event.trim())}</td><td>${escapeCell(country.trim())}</td><td>${calendarImpactCell(impact)}</td></tr>`
  );
}

const CALENDAR_TABLE_WITH_IMPACT_RE =
  /(<table[^>]*>[\s\S]*?<th[^>]*>\s*Date\s*<\/th>[\s\S]*?<th[^>]*>\s*Impact\s*<\/th>[\s\S]*?<tbody>)([\s\S]*?)(<\/tbody>)/gi;

/** Convert plain High/Medium/Low text in calendar impact cells to bar icons. */
function applyImpactIconsToCalendarTables(html: string): string {
  return html.replace(CALENDAR_TABLE_WITH_IMPACT_RE, (_m, head: string, body: string, tail: string) => {
    const newBody = body.replace(
      /<tr>([\s\S]*?)<td>\s*(High|Medium|Low|n\/a)\s*<\/td>\s*<\/tr>/gi,
      (row, rest: string, impact: string) => {
        if (rest.includes("atfx-impact")) return row;
        return `<tr>${rest}<td>${calendarImpactCell(impact)}</td></tr>`;
      }
    );
    const tableOpen = head.includes("atfx-report-table--calendar")
      ? head
      : head.replace(/<table([^>]*)>/i, (_t, attrs) => {
          if (/class="/i.test(attrs)) {
            return `<table${attrs.replace(/class="/i, `class="${ATFX_REPORT_TABLE_CLASS} atfx-report-table--calendar `)}>`;
          }
          return `<table class="${ATFX_REPORT_TABLE_CLASS} atfx-report-table--calendar"${attrs}>`;
        });
    return `${tableOpen}${newBody}${tail}`;
  });
}

function ensureTableClass(html: string): string {
  return html.replace(/<table(\s[^>]*)?>/gi, (tag) => {
    if (/class=["'][^"']*atfx-report-table/.test(tag)) return tag;
    if (/class="/i.test(tag)) {
      return tag.replace(/class="/i, `class="${ATFX_REPORT_TABLE_CLASS} `);
    }
    return tag.replace("<table", `<table class="${ATFX_REPORT_TABLE_CLASS}"`);
  });
}

const LEVELS_TABLE_MARKERS =
  /<th[^>]*>\s*Resistance\s*<\/th>\s*<th[^>]*>\s*Support\s*<\/th>/i;

const LEGACY_LEVELS_TABLE_MARKERS =
  /<th[^>]*>\s*Level\s*<\/th>\s*<th[^>]*>\s*Zone\s*<\/th>\s*<th[^>]*>\s*Description\s*<\/th>/i;

function convertLegacyLevelsTable(html: string): string {
  return html.replace(
    /<table(\s[^>]*)>\s*<thead>\s*<tr>\s*<th[^>]*>\s*Level\s*<\/th>\s*<th[^>]*>\s*Zone\s*<\/th>\s*<th[^>]*>\s*Description\s*<\/th>\s*<\/tr>\s*<\/thead>\s*<tbody>([\s\S]*?)<\/tbody>\s*<\/table>/gi,
    (_full, attrs, body) => {
      const rows: LevelRow[] = [];
      body.replace(
        /<tr>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi,
        (_m: string, level: string, zone: string, description: string) => {
          rows.push({
            level: level.replace(/<[^>]+>/g, "").trim(),
            zone: zone.replace(/<[^>]+>/g, "").trim(),
            description: description.replace(/<[^>]+>/g, "").trim(),
          });
          return _m;
        }
      );
      if (!rows.length) return _full;
      const table = buildLevelTable(rows);
      return table.replace("<table", `<table${attrs}`);
    }
  );
}

/** Tag support/resistance level tables so CSS can style Resistance/Support columns. */
function applyLevelsTableClass(html: string): string {
  return html.replace(/<table(\s[^>]*)>([\s\S]*?)<\/table>/gi, (full, attrs) => {
    if (/atfx-report-table--levels/.test(attrs)) return full;
    if (!LEVELS_TABLE_MARKERS.test(full) && !LEGACY_LEVELS_TABLE_MARKERS.test(full)) return full;
    if (/class="/i.test(attrs)) {
      return full.replace(/class="/i, `class="${ATFX_LEVELS_TABLE_CLASS} `);
    }
    return full.replace("<table", `<table class="${ATFX_LEVELS_TABLE_CLASS}"`);
  });
}

/** Post-process report HTML: level lists → tables, fix merged calendar cells, add table class. */
export function enhanceReportTables(html: string, calendarText?: string): string {
  if (!html?.trim()) return html;
  let out = html;

  out = convertLevelSection(
    out,
    /(<h4[^>]*>\s*Major\s+Resistance\s+Zones?\s*<\/h4>)\s*((?:(?!<h[234]\b)[\s\S])*)/i
  );
  out = convertLevelSection(
    out,
    /(<h4[^>]*>\s*Support\s+Levels?\s*<\/h4>)\s*((?:(?!<h[234]\b)[\s\S])*)/i
  );
  out = convertLevelSection(
    out,
    /(<h4[^>]*>\s*Key\s+Levels\s+to\s+Watch\s*<\/h4>)\s*((?:(?!<h[234]\b)[\s\S])*)/i
  );
  out = convertLevelSection(
    out,
    /(<h4[^>]*>\s*Key\s+Technical\s+Levels\s*<\/h4>)\s*((?:(?!<h[234]\b)[\s\S])*)/i
  );
  out = convertLevelSection(
    out,
    /(<h2[^>]*>\s*Key\s+Technical\s+Levels\s*<\/h2>)\s*((?:(?!<h[234]\b)[\s\S])*)/i
  );

  out = fixMergedCalendarCells(out);
  if (calendarText?.trim()) {
    out = injectCalendarTableFromBrief(out, calendarText);
  }
  out = convertLegacyLevelsTable(out);
  out = applyImpactIconsToCalendarTables(out);
  out = ensureTableClass(out);
  out = applyLevelsTableClass(out);
  return out;
}

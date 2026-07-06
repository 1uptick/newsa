import type { PipelineStage } from "./atfxResearchReportStream";
import { getMarkdownHtml } from "./html";

/** Removes bracketed numeric citation markers ([1], [2], [1,2], fullwidth ［1］). */
function stripCitationMarkers(text: string): string {
  if (!text) return text;
  return text
    .replace(/\[\s*\d+\s*(?:,\s*\d+\s*)*\]/g, "")
    .replace(/［\s*\d+\s*(?:,\s*\d+\s*)*］/g, "");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function bulletItems(line: string): string[] {
  return line
    .split(/\s•\s/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function flushBullets(buf: string[], out: string[]): void {
  if (!buf.length) return;
  out.push(`<ul>${buf.map((b) => `<li>${escapeHtml(b.replace(/^[-•*]\s*/, ""))}</li>`).join("")}</ul>`);
  buf.length = 0;
}

function paragraphsFromLines(lines: string[]): string {
  const out: string[] = [];
  const bullets: string[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (/^[-•*]\s/.test(line)) {
      bullets.push(line);
      continue;
    }

    flushBullets(bullets, out);

    if (line.includes(" • ")) {
      const parts = bulletItems(line);
      if (parts.length > 1) {
        for (const p of parts) out.push(`<p>${escapeHtml(p)}</p>`);
        continue;
      }
    }

    out.push(`<p>${escapeHtml(line)}</p>`);
  }

  flushBullets(bullets, out);
  return out.join("");
}

function formatBlock(block: string): string {
  const trimmed = block.trim();
  if (!trimmed) return "";

  const sectionEq = trimmed.match(/^===\s*(.+?)\s*===\s*\n?([\s\S]*)$/);
  if (sectionEq) {
    const body = formatBlock(sectionEq[2]);
    return `<h4>${escapeHtml(sectionEq[1].trim())}</h4>${body}`;
  }

  const toolHdr = trimmed.match(/^---\s*(.+?)\s*---\s*\n?([\s\S]*)$/);
  if (toolHdr) {
    const body = formatBlock(toolHdr[2]);
    return `<h4>${escapeHtml(toolHdr[1].trim())}</h4>${body}`;
  }

  if (/^===\s*.+\s*===$/.test(trimmed)) {
    return `<h4>${escapeHtml(trimmed.replace(/^===\s*|\s*===$/g, ""))}</h4>`;
  }

  return paragraphsFromLines(trimmed.split("\n"));
}

const PLANNING_COMPLETE_MARKER = "Planning complete";

/** Remove "h2 " heading hints from planning summary lines (legacy / model leakage). */
function sanitizePlanningDisplayLine(line: string): string {
  return line.replace(/(^|[:→]\s*)h2\s+/gi, "$1");
}

/** Human-readable planning summary only — omit streamed JSON from the plan model. */
export function planningBubbleText(raw: string): string {
  const idx = raw.indexOf(PLANNING_COMPLETE_MARKER);
  if (idx >= 0) return raw.slice(idx).trim();
  return "";
}

function formatPlanningStageHtml(raw: string): string {
  const text = planningBubbleText(raw) || raw.trim();
  if (!text) return "";

  const out: string[] = [];
  const bullets: string[] = [];

  const flushBullets = () => {
    if (!bullets.length) return;
    out.push(
      `<ul class="list-disc pl-5 my-1.5 space-y-1">${bullets
        .map((b) => `<li>${escapeHtml(b)}</li>`)
        .join("")}</ul>`
    );
    bullets.length = 0;
  };

  for (const rawLine of text.split("\n")) {
    const line = sanitizePlanningDisplayLine(rawLine.trim());
    if (!line) continue;

    if (/^[-•*]\s/.test(line)) {
      bullets.push(line.replace(/^[-•*]\s*/, ""));
      continue;
    }

    flushBullets();

    if (line === PLANNING_COMPLETE_MARKER) {
      out.push(`<p class="font-medium text-slate-800">${escapeHtml(line)}</p>`);
    } else {
      out.push(`<p>${escapeHtml(line)}</p>`);
    }
  }

  flushBullets();
  return out.join("");
}

/** Bubble-visible research text: market news body + headline list only. */
export function researchBubbleText(raw: string): string {
  const sections: string[] = [];

  let market = "";
  const marketMd = raw.match(/###\s*Market research\s*\n([\s\S]*?)(?=\n###|\n---|\n===|\nResearch complete|$)/i);
  if (marketMd) market = marketMd[1].trim();
  else {
    const marketLegacy = raw.match(
      /---\s*Market news research\s*---\s*\n([\s\S]*?)(?=\n---|\n===|\nResearch complete|\n###|$)/i
    );
    if (marketLegacy) market = marketLegacy[1].trim();
    else {
      const newsEq = raw.match(
        /===\s*News\s*\/\s*catalysts\s*===\s*\n([\s\S]*?)(?=\n===|\n---|\nResearch complete|\n###|$)/i
      );
      if (newsEq) market = newsEq[1].trim();
    }
  }
  if (market) sections.push(`### Market research\n\n${market}`);

  let headlines = "";
  const headlinesMd = raw.match(/###\s*Headlines\s*\n([\s\S]*?)(?=\n###|\n---|\n===|\nResearch complete|$)/i);
  if (headlinesMd) headlines = headlinesMd[1].trim();
  else {
    const headlinesBullet = raw.match(
      /(?:^|\n)(?:•\s*)?Headlines:\s*\n([\s\S]*?)(?=\n\n(?:•|Research complete|===|---|###)|$)/i
    );
    if (headlinesBullet) {
      headlines = headlinesBullet[1]
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => l.replace(/^[-*•]\s*/, ""))
        .filter(Boolean)
        .map((l) => (l.startsWith("- ") ? l : `- ${l}`))
        .join("\n");
    }
  }
  if (headlines) sections.push(`### Headlines\n\n${headlines}`);

  return stripCitationMarkers(sections.join("\n\n"));
}

function formatResearchStageHtml(raw: string): string {
  const md = researchBubbleText(raw);
  if (!md) return "";
  return getMarkdownHtml(md);
}

/** Turn pipeline stage plain text into HTML paragraphs / lists / section headers. */
export function formatPipelineStageHtml(text: string, stage: PipelineStage): string {
  if (stage === "planning") {
    return formatPlanningStageHtml(text);
  }
  if (stage === "research") {
    return formatResearchStageHtml(text);
  }

  const raw = text.trim();
  if (!raw) return "";

  const blocks = raw.split(/\n{2,}/);
  const html = blocks.map(formatBlock).filter(Boolean).join("");
  if (html) return html;

  return paragraphsFromLines(raw.split("\n"));
}

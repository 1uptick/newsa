import DOMPurify from "dompurify";
import { marked } from "marked";
import { enhanceReportTables } from "./atfxReportTableHtml.js";
import { structurePlainTextReportHeadings } from "./atfxReportHtmlStructure.js";
import { groupConsecutiveEconomicChartBlocks } from "./atfxReportChartLayout.js";

const DEFAULT_ALLOWED_TAGS = [
  "p", "div", "span", "br", "strong", "b", "em", "i", "u", "a", "img",
  "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote",
  "pre", "code", "table", "thead", "tbody", "tr", "th", "td", "hr",
  "section", "article", "figure", "figcaption", "main", "header", "aside",
];
const DEFAULT_ALLOWED_ATTR = ["href", "src", "alt", "title", "class", "style", "target", "rel", "width", "height"];

export function sanitizeHtml(html: string): string {
  ensureDataUriImageHook();
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: DEFAULT_ALLOWED_TAGS,
    ALLOWED_ATTR: DEFAULT_ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ADD_DATA_URI_TAGS: ["img"],
  });
}

/** Strip scripts/event handlers from server-saved report HTML (trusted source, may contain large chart data URLs). */
function sanitizeTrustedReportHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/javascript:/gi, "");
}

/** Navigational links only (skip mailto, tel, javascript, data, hash-only). */
function linkHrefShouldOpenInNewTab(href: string): boolean {
  const h = href.trim().toLowerCase();
  if (!h || h === "#") return false;
  if (h.startsWith("javascript:") || h.startsWith("mailto:") || h.startsWith("tel:") || h.startsWith("data:")) {
    return false;
  }
  if (h.startsWith("#")) return false;
  return true;
}

/**
 * On already-sanitized HTML: open links in a new tab with `nofollow` (and noopener/noreferrer for `target="_blank"`).
 * Use at display/download time so stored article HTML is unchanged.
 */
export function externalizeLinksInSanitizedHtml(html: string): string {
  if (!html || typeof html !== "string") return "";
  if (typeof DOMParser === "undefined") return html;
  try {
    const doc = new DOMParser().parseFromString(`<div class="ext-links-root">${html}</div>`, "text/html");
    const root = doc.body.querySelector(".ext-links-root");
    if (!root) return html;
    root.querySelectorAll("a[href]").forEach((node) => {
      const a = node as HTMLAnchorElement;
      const href = a.getAttribute("href") ?? "";
      if (!linkHrefShouldOpenInNewTab(href)) return;
      a.setAttribute("target", "_blank");
      const relParts = new Set(
        (a.getAttribute("rel") || "")
          .split(/\s+/)
          .map((p) => p.trim())
          .filter(Boolean)
      );
      relParts.add("nofollow");
      relParts.add("noopener");
      relParts.add("noreferrer");
      a.setAttribute("rel", Array.from(relParts).join(" "));
    });
    return root.innerHTML;
  } catch {
    return html;
  }
}

/** Remove outer <article>...</article> so body HTML is a fragment (matches server save behavior). */
function stripOuterArticleWrapper(html: string): string {
  if (!html || typeof html !== "string") return "";
  let s = html.trim();
  const openRe = /^<article\b[^>]*>/i;
  const closeRe = /<\/article>\s*$/i;
  for (let i = 0; i < 5; i++) {
    if (!openRe.test(s) || !closeRe.test(s)) break;
    s = s.replace(openRe, "").replace(closeRe, "").trim();
  }
  return s;
}

export function decodeHtmlEntities(encoded: string): string {
  if (!encoded || typeof encoded !== "string") return "";
  return encoded
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

/** BOM / zero-width chars often prefix CMS or LLM HTML and break a naive `startsWith("<")` check. */
function normalizeHtmlSource(s: string): string {
  return s
    .replace(/^\uFEFF/, "")
    .replace(/^[\u200B-\u200D\uFEFF]+|[\u200B-\u200D\uFEFF]+$/g, "")
    .trim();
}

/** Looks like an HTML fragment (tag open), not e.g. "2 < 3". */
const HTML_TAG_OPEN_RE = /<\/?[a-z][a-z0-9-]*\b/i;

/** Heuristic: content is probably Markdown rather than HTML. */
export function looksLikeMarkdown(raw: string): boolean {
  const t = normalizeHtmlSource(raw).trim();
  if (!t) return false;
  if (HTML_TAG_OPEN_RE.test(t)) return false;
  if (/^```[\s\S]*/m.test(t)) return true;
  if (/^#{1,6}\s/m.test(t)) return true;
  if (/^\*\*[^*\n]+\*\*/m.test(t)) return true;
  if (/^__[^_\n]+__/m.test(t)) return true;
  if (/^[-*+]\s+/m.test(t)) return true;
  if (/^\d+\.\s+/m.test(t)) return true;
  if (/^>\s+/m.test(t)) return true;
  if (/^\|.+\|.+\|/m.test(t)) return true;
  if (/!\[[^\]]*\]\([^)]+\)/.test(t)) return true;
  if (/\[[^\]]+\]\([^)]+\)/.test(t) && !HTML_TAG_OPEN_RE.test(t)) return true;
  return false;
}

let dataUriImageHookAdded = false;

function ensureDataUriImageHook(): void {
  if (dataUriImageHookAdded) return;
  dataUriImageHookAdded = true;
  DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
    if (
      data.attrName === "src" &&
      typeof data.attrValue === "string" &&
      /^data:image\//i.test(data.attrValue)
    ) {
      data.forceKeepAttr = true;
    }
  });
}

function escapeHtmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Turn plain text (possibly with single newlines) into safe paragraphs for prose styling. */
function plainTextToParagraphHtml(s: string): string {
  const t = s.trim();
  if (!t) return "";
  const blocks = t.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  if (blocks.length === 0) return "";
  return blocks.map((b) => `<p>${escapeHtmlText(b).replace(/\n/g, "<br />")}</p>`).join("");
}

/**
 * Memoize a pure `(raw: string) => string` transform keyed on the input. These sanitize/markdown
 * passes are deterministic (DOMPurify config is constant), but were being re-run on every parent
 * re-render and for every list row — expensive (DOMParser + marked). A small bounded LRU removes the
 * redundant work across renders and across rows that share identical content. Very large inputs
 * (e.g. report bodies with inline data-URI charts) skip the cache to avoid holding megabytes in memory.
 */
const HTML_MEMO_MAX_INPUT = 50_000;
const HTML_MEMO_MAX_ENTRIES = 300;

function memoizeHtmlTransform(fn: (raw: string) => string): (raw: string) => string {
  const cache = new Map<string, string>();
  return (raw: string): string => {
    if (!raw || typeof raw !== "string") return "";
    if (raw.length > HTML_MEMO_MAX_INPUT) return fn(raw);
    const hit = cache.get(raw);
    if (hit !== undefined) {
      cache.delete(raw);
      cache.set(raw, hit); // refresh LRU recency
      return hit;
    }
    const out = fn(raw);
    cache.set(raw, out);
    if (cache.size > HTML_MEMO_MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    return out;
  };
}

function computeHtmlContent(raw: string): string {
  if (!raw || typeof raw !== "string") return "";
  const strippedArtifacts = cleanWordPressBodyMarkdownArtifacts(raw);
  const normalized = normalizeHtmlSource(strippedArtifacts);
  let decoded = normalizeHtmlSource(decodeHtmlEntities(normalized));
  decoded = stripOuterArticleWrapper(decoded);

  let html: string;
  if (looksLikeMarkdown(decoded)) {
    html = marked.parse(decoded, { async: false, gfm: true, breaks: true }) as string;
  } else if (decoded.startsWith("<") || HTML_TAG_OPEN_RE.test(decoded)) {
    html = decoded;
  } else {
    html = plainTextToParagraphHtml(decoded);
  }
  return sanitizeHtml(html);
}

export const getHtmlContent = memoizeHtmlTransform(computeHtmlContent);

/** Markdown → sanitized HTML (GFM). Falls back to {@link getHtmlContent} if parsing fails. */
function computeMarkdownHtml(raw: string): string {
  if (!raw || typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const html = marked.parse(trimmed, {
      async: false,
      gfm: true,
      breaks: true,
    }) as string;
    return sanitizeHtml(html);
  } catch {
    return getHtmlContent(trimmed);
  }
}

export const getMarkdownHtml = memoizeHtmlTransform(computeMarkdownHtml);

/** Markdown (GFM) or sanitized HTML for Capital topic card summaries (Airtable may store either). */
function computeCapitalTopicSummaryHtml(raw: string): string {
  if (!raw || typeof raw !== "string") return "";
  const normalized = normalizeHtmlSource(raw);
  const decoded = normalizeHtmlSource(decodeHtmlEntities(normalized));
  if (decoded.startsWith("<") || HTML_TAG_OPEN_RE.test(decoded)) {
    return getHtmlContent(raw);
  }
  return getMarkdownHtml(decoded);
}

export const getCapitalTopicSummaryHtml = memoizeHtmlTransform(computeCapitalTopicSummaryHtml);

/**
 * Research report canvas + chat bubbles: accept HTML or Markdown from the LLM/tools,
 * return sanitized HTML safe for dangerouslySetInnerHTML.
 */
export function getReportBodyHtml(raw: string, calendarText?: string): string {
  if (!raw || typeof raw !== "string") return "";
  const stripped = cleanWordPressBodyMarkdownArtifacts(raw);
  const normalized = normalizeHtmlSource(decodeHtmlEntities(stripped));

  const fence = normalized.match(/^```(?:html|markdown|md)?\s*([\s\S]*?)```$/i);
  const unwrapped = fence ? fence[1].trim() : normalized;

  let html: string;
  if (unwrapped.startsWith("<") || HTML_TAG_OPEN_RE.test(unwrapped)) {
    html = getHtmlContent(unwrapped);
  } else if (looksLikeMarkdown(unwrapped)) {
    html = getMarkdownHtml(unwrapped);
  } else {
    html = getHtmlContent(unwrapped);
  }
  return enhanceReportTables(structurePlainTextReportHeadings(html), calendarText);
}

/**
 * ATFX research report canvas: server-generated HTML with large inline chart PNGs.
 * Avoids full DOMPurify passes (very slow on 500KB+ data URLs) while still stripping scripts.
 */
export function getResearchReportCanvasHtml(raw: string, calendarText?: string): string {
  if (!raw || typeof raw !== "string") return "";
  const normalized = normalizeHtmlSource(decodeHtmlEntities(raw.trim()));
  const fence = normalized.match(/^```(?:html|markdown|md)?\s*([\s\S]*?)```$/i);
  const unwrapped = fence ? fence[1].trim() : normalized;
  if (!unwrapped) return "";

  let html = stripOuterArticleWrapper(unwrapped);
  if (!HTML_TAG_OPEN_RE.test(html)) {
    return getReportBodyHtml(raw, calendarText);
  }
  if (!/<h[12]\b/i.test(html)) {
    html = structurePlainTextReportHeadings(html);
  }
  html = sanitizeTrustedReportHtml(html);
  html = enhanceReportTables(html, calendarText);
  return groupConsecutiveEconomicChartBlocks(html);
}

/** Pipeline chat bubble content (markdown/HTML → sanitized HTML). */
export function getPipelineBubbleHtml(raw: string): string {
  return getReportBodyHtml(raw);
}

/**
 * Strip common LLM/markdown leakage from HTML bodies saved for WordPress (1uptick Article_tc / Article_en).
 * Conservative on `/n` so URL paths like example.com/foo/n/bar are not split.
 */
export function cleanWordPressBodyMarkdownArtifacts(raw: string): string {
  if (!raw || typeof raw !== "string") return "";
  let s = raw;

  // Literal escape sequences often pasted into HTML instead of real newlines
  s = s.replace(/\\r\\n/g, "\n");
  s = s.replace(/\\n/g, "\n");
  s = s.replace(/\\r/g, "\n");
  s = s.replace(/\\t/g, "\t");

  // Orphan backslash runs (e.g. "\ \ \ \ ..." or "\\\\\\\\" from broken LLM / JSON escapes)
  s = s.replace(/(?:\s*\\\s*){2,}/g, " ");
  s = s.replace(/\\{2,}/g, "");
  s = s.replace(/^\s*(?:\\\s*)+\s*$/gm, "");
  s = s.replace(/(?:\s*\\\s*)+$/gm, "");
  s = s.replace(/^(?:\s*\\)+/gm, "");

  // Mistyped newline tokens (avoid bare /n in URLs: only when spaced or at tag boundaries)
  s = s.replace(/\s*\/\/n\s*/g, "\n");
  s = s.replace(/\s+\/n\s+/g, "\n");
  s = s.replace(/>\s*\/\/n\s*/g, ">\n");
  s = s.replace(/>\s*\/n\s+/g, ">\n");
  s = s.replace(/\s+\/n\s*</g, "\n<");
  s = s.replace(/^\s*\/n\s*/gm, "\n");
  s = s.replace(/\s*\/n\s*$/gm, "\n");

  // Light inline markdown when it leaked into an HTML fragment
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");

  s = s.replace(/\n{3,}/g, "\n\n");
  return s;
}

export function htmlToPlainText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const text = doc.body.textContent ?? "";
  return text.replace(/\s+/g, " ").trim();
}

export function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Sanitized HTML prepended to article downloads (title, optional excerpt, divider). */
export function articleDownloadLeadHtml(title: string, excerpt: string | undefined): string {
  const t = (title || "—").trim() || "—";
  let out = `<h1>${escapeAttr(t)}</h1>`;
  if (excerpt?.trim()) {
    out += `<div class="article-excerpt">${getHtmlContent(excerpt)}</div>`;
  }
  out += "<hr />";
  return out;
}

/** Plain-text title, optional excerpt from HTML, then body (already-sanitized HTML fragment). */
export function articleDownloadPlainText(title: string, excerpt: string | undefined, bodyHtml: string): string {
  const t = (title || "—").trim() || "—";
  const parts: string[] = [t];
  if (excerpt?.trim()) {
    parts.push("", htmlToPlainText(getHtmlContent(excerpt)));
  }
  parts.push("", htmlToPlainText(bodyHtml));
  return `${parts.join("\n").trim()}\n`;
}

/** Excerpt field (may contain HTML) as plain text for meta description. */
export function excerptToPlainText(excerpt: string | undefined): string {
  if (!excerpt?.trim()) return "";
  return htmlToPlainText(getHtmlContent(excerpt));
}

/** Full standalone HTML document for article download (zh-Hant, SEO head, body fragment). */
export function buildArticleDownloadHtmlDocument(
  title: string,
  excerpt: string | undefined,
  innerBodyHtml: string,
  options?: { lang?: string },
): string {
  const t = (title || "article").trim() || "article";
  const desc = excerptToPlainText(excerpt);
  const lang = options?.lang ?? "zh-Hant";
  const headLines = [
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `<title>${escapeAttr(t)}</title>`,
    `<meta name="title" content="${escapeAttr(t)}">`,
  ];
  if (desc) {
    headLines.push(`<meta name="description" content="${escapeAttr(desc)}">`);
  }
  return `<!DOCTYPE html>
<html lang="${escapeAttr(lang)}">
<head>
  ${headLines.join("\n  ")}
</head>
<body>
${innerBodyHtml}
</body>
</html>`;
}

/** Build and trigger download of a Capital-style article HTML file. */
export function downloadArticleAsHtml(title: string, excerpt: string | undefined, rawContent: string): void {
  const t = (title || "article").trim() || "article";
  const lead = externalizeLinksInSanitizedHtml(articleDownloadLeadHtml(t, excerpt));
  const body = externalizeLinksInSanitizedHtml(getHtmlContent(rawContent));
  const fullHtml = buildArticleDownloadHtmlDocument(t, excerpt, `${lead}${body}`);
  const blob = new Blob([fullHtml], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const baseName = t.slice(0, 50).replace(/[<>:"/\\|?*]/g, "") || "article";
  a.download = `${baseName}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

const HTML_TAG_OPEN_RE = /<\/?[a-z][a-z0-9-]*\b/i;

function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Markdown # / ## / #### lines → semantic heading tags. */
function markdownLineToHeading(line: string, headingCount: number): { tag: string; text: string } | null {
  const m = line.trim().match(/^(#{1,6})\s+(.+)$/);
  if (!m) return null;
  const level = m[1].length;
  const text = m[2].trim();
  if (!text) return null;
  if (level === 1) return { tag: "h1", text };
  if (level === 2) return { tag: "h2", text };
  return { tag: "h4", text };
}

/** <p>## Section</p> → <h2>Section</h2> when the model put markdown inside HTML paragraphs. */
function convertMarkdownHeadingParagraphs(html: string): string {
  return html.replace(/<p[^>]*>\s*(#{1,6})\s+([^<]+?)<\/p>/gi, (_full, hashes: string, text: string) => {
    const level = hashes.length;
    const tag = level === 1 ? "h1" : level === 2 ? "h2" : "h4";
    return `<${tag}>${escapeHtmlText(text.trim())}</${tag}>`;
  });
}

/** Short title-like line (not a full sentence paragraph). */
function isHeadingLine(line: string): boolean {
  const t = line.trim();
  if (/^#{1,6}\s/.test(t)) return true;
  if (t.length < 6 || t.length > 120) return false;
  if (/^(NOTE|DISCLAIMER|Source|Chart captured)/i.test(t)) return false;
  if (/ chart$/i.test(t) && /[:!]/.test(t)) return false;
  if (/\.\s+[A-Z]/.test(t)) return false;
  if (t.length > 85 && /[.!?]["']?\s*$/.test(t)) return false;
  if (/^(Metric|Value|Date|Event|Impact|Level|Zone)\b/i.test(t)) return false;
  return true;
}

function plainTextBlocksToStructuredHtml(text: string): string {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const out: string[] = [];
  let headingCount = 0;

  for (const block of blocks) {
    if (HTML_TAG_OPEN_RE.test(block)) {
      out.push(block);
      continue;
    }

    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 1) {
      const line = lines[0];
      const md = markdownLineToHeading(line, headingCount);
      if (md) {
        headingCount += md.tag === "h1" ? 1 : 0;
        out.push(`<${md.tag}>${escapeHtmlText(md.text)}</${md.tag}>`);
        continue;
      }
      if (isHeadingLine(line)) {
        headingCount += 1;
        out.push(
          headingCount === 1
            ? `<h1>${escapeHtmlText(line)}</h1>`
            : `<h2>${escapeHtmlText(line)}</h2>`
        );
      } else {
        out.push(`<p>${escapeHtmlText(line)}</p>`);
      }
      continue;
    }

    const [first, ...rest] = lines;
    const mdFirst = markdownLineToHeading(first, headingCount);
    if (mdFirst) {
      if (mdFirst.tag === "h1") headingCount += 1;
      out.push(`<${mdFirst.tag}>${escapeHtmlText(mdFirst.text)}</${mdFirst.tag}>`);
      for (const line of rest) {
        const md = markdownLineToHeading(line, headingCount);
        if (md) out.push(`<${md.tag}>${escapeHtmlText(md.text)}</${md.tag}>`);
        else if (isHeadingLine(line) && line.length < 70) out.push(`<h4>${escapeHtmlText(line)}</h4>`);
        else out.push(`<p>${escapeHtmlText(line)}</p>`);
      }
      continue;
    }
    if (isHeadingLine(first)) {
      headingCount += 1;
      out.push(
        headingCount === 1
          ? `<h1>${escapeHtmlText(first)}</h1>`
          : `<h2>${escapeHtmlText(first)}</h2>`
      );
      for (const line of rest) {
        if (isHeadingLine(line) && line.length < 70) {
          out.push(`<h4>${escapeHtmlText(line)}</h4>`);
        } else {
          out.push(`<p>${escapeHtmlText(line)}</p>`);
        }
      }
    } else {
      for (const line of lines) out.push(`<p>${escapeHtmlText(line)}</p>`);
    }
  }

  return out.join("\n");
}

/** Upgrade title-like <p> blocks to h1/h2/h4 even when some headings already exist. */
function upgradeParagraphHeadings(html: string): string {
  const hasH1 = /<h1\b/i.test(html);
  let h1Assigned = hasH1;

  return html.replace(/<p[^>]*>([^<]+)<\/p>/gi, (full, text: string) => {
    const t = text.trim();
    const md = markdownLineToHeading(t, h1Assigned ? 1 : 0);
    if (md) {
      if (md.tag === "h1" && !h1Assigned) {
        h1Assigned = true;
        return `<h1>${escapeHtmlText(md.text)}</h1>`;
      }
      if (md.tag === "h4") return `<h4>${escapeHtmlText(md.text)}</h4>`;
      return `<h2>${escapeHtmlText(md.text)}</h2>`;
    }
    if (!isHeadingLine(t)) return full;
    if (!h1Assigned) {
      h1Assigned = true;
      return `<h1>${escapeHtmlText(t)}</h1>`;
    }
    return `<h2>${escapeHtmlText(t)}</h2>`;
  });
}

/** Promote <p><strong>Section</strong></p> when the model bolded section titles. */
function upgradeStrongParagraphHeadings(html: string): string {
  const hasH1 = /<h1\b/i.test(html);
  let h1Assigned = hasH1;

  return html.replace(/<p[^>]*>\s*<strong>([^<]+)<\/strong>\s*<\/p>/gi, (full, text: string) => {
    const t = text.trim();
    if (!isHeadingLine(t)) return full;
    if (!h1Assigned) {
      h1Assigned = true;
      return `<h1>${escapeHtmlText(t)}</h1>`;
    }
    return `<h2>${escapeHtmlText(t)}</h2>`;
  });
}

/** First paragraph becomes h1 when the model omitted a document title. */
function ensureDocumentTitle(html: string): string {
  if (/<h1\b/i.test(html)) return html;
  return html.replace(/<p[^>]*>([^<]+)<\/p>/i, (_full, text: string) => {
    const t = text.trim();
    if (!t) return _full;
    return `<h1>${escapeHtmlText(t)}</h1>`;
  });
}

/**
 * Ensure report canvas HTML has h1/h2/h4 structure when the LLM returned plain text or p-only HTML.
 */
export function structurePlainTextReportHeadings(html: string): string {
  if (!html?.trim()) return html;

  let out = convertMarkdownHeadingParagraphs(html.trim());
  out = upgradeStrongParagraphHeadings(out);

  if (!HTML_TAG_OPEN_RE.test(out)) {
    out = plainTextBlocksToStructuredHtml(out);
  } else {
    out = upgradeParagraphHeadings(out);
  }

  return ensureDocumentTitle(out);
}

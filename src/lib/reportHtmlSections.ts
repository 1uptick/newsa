/** Client-side mirror of server section listing (h2-based). */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

export function listReportSectionTitles(html: string): string[] {
  const source = html.trim();
  if (!source) return [];

  const h2Regex = /<h2\b[^>]*>[\s\S]*?<\/h2>/gi;
  const titles: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = h2Regex.exec(source)) !== null) {
    const title = decodeHtmlEntities(
      match[0]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
    );
    if (title) titles.push(title);
  }

  return titles;
}

export function sectionReferenceToken(title: string): string {
  return `@[${title}]`;
}

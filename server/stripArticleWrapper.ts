/**
 * Remove outer <article>...</article> wrapper(s) so stored HTML is a normal fragment
 * (e.g. for CMS/social) without an extra root tag from the model output.
 */
export function stripOuterArticleWrapper(html: string): string {
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

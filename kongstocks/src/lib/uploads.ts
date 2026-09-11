const ABSOLUTE_UPLOADS = /https?:\/\/(?:www\.)?kongstocks\.com\/wp-content\/uploads/gi
const PROTOCOL_REL_UPLOADS = /\/\/(?:www\.)?kongstocks\.com\/wp-content\/uploads/gi
const LOCAL_UPLOADS = /(?:https?:)?\/\/(?:www\.)?kongstocks\.com(\/wp-content\/uploads\/[^"'>\s]+)/i

/** Point imported HTML at this box's /wp-content/uploads/ alias. */
export function rewriteUploadUrls(html: string): string {
  return html
    .replace(ABSOLUTE_UPLOADS, '/wp-content/uploads')
    .replace(PROTOCOL_REL_UPLOADS, '/wp-content/uploads')
}

export function localizeUploadUrl(src: string): string {
  const match = src.match(LOCAL_UPLOADS)
  if (match) return match[1]
  return src
}

/** First <img src> in imported body HTML — used as card/OG thumb when heroImage is empty. */
export function firstBodyImage(html?: string | null): string | undefined {
  if (!html) return undefined
  const match = html.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i)
  const raw = match?.[1]?.trim()
  if (!raw || raw.startsWith('data:')) return undefined
  return localizeUploadUrl(raw)
}

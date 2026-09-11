export const NAV = [
  { href: '/category/hk', label: '港股' },
  { href: '/category/us', label: '美股' },
  { href: '/category/dailyhsi', label: '收市報告' },
  { href: '/category/ai-stock', label: 'AI 選股' },
  { href: '/category/ipo', label: 'IPO' },
  { href: '/category/hk-earnings', label: '業績' },
] as const

export function displaySlug(slug: string | null | undefined) {
  if (!slug) return ''
  try {
    return decodeURIComponent(slug)
  } catch {
    return slug
  }
}

/** WordPress imported slugs are often stored percent-encoded; Next gives us decoded params. */
export function slugCandidates(slug: string): string[] {
  const values = new Set<string>([slug])
  const foldPct = (value: string) =>
    value.replace(/%[0-9A-Fa-f]{2}/g, (match) => match.toLowerCase())
  const add = (value: string) => {
    values.add(value)
    values.add(foldPct(value))
    values.add(value.replace(/%[0-9A-Fa-f]{2}/g, (match) => match.toUpperCase()))
  }
  try {
    add(decodeURIComponent(slug))
  } catch {
    /* ignore malformed sequences */
  }
  try {
    add(encodeURIComponent(displaySlug(slug)))
  } catch {
    /* ignore */
  }
  return [...values].filter(Boolean)
}

export function postPath(publishedAt: string | Date | null | undefined, slug: string | null | undefined) {
  const d = new Date(publishedAt || Date.now())
  const year = String(d.getUTCFullYear())
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `/${year}/${month}/${day}/${displaySlug(slug)}`
}

export function formatTime(value: string | Date) {
  return new Date(value).toLocaleString('zh-HK', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function categoryName(post: { categories?: unknown }): string | undefined {
  const cats = post.categories
  if (!Array.isArray(cats) || !cats[0]) return undefined
  const first = cats[0]
  if (typeof first === 'object' && first && 'name' in first) {
    return String((first as { name: string }).name)
  }
  return undefined
}

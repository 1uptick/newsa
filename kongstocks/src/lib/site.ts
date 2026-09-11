export const NAV = [
  { href: '/category/hk', label: '港股' },
  { href: '/category/us', label: '美股' },
  { href: '/category/dailyhsi', label: '收市報告' },
  { href: '/category/ai-stock', label: 'AI 選股' },
  { href: '/category/ipo', label: 'IPO' },
  { href: '/category/hk-earnings', label: '業績' },
] as const

export function postPath(publishedAt: string | Date, slug: string) {
  const d = new Date(publishedAt)
  const year = String(d.getUTCFullYear())
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `/${year}/${month}/${day}/${slug}`
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

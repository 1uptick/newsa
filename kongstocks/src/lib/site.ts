export const NAV = [
  { href: '/', label: 'Home' },
  { href: '/category/hk', label: '港股新聞' },
  { href: '/category/us', label: '美股新聞' },
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

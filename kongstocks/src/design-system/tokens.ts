export const DEFAULT_THEME = {
  siteName: 'KongStocks',
  tagline: '港股新聞及深度分析',
  footerText: '內容僅供參考，不構成投資建議。',
  accent: '#E3338F',
  headerBg: '#080808',
  background: '#FFFFFF',
  density: 'compact' as 'compact' | 'comfortable',
  nav: [
    { label: '港股', href: '/category/hk' },
    { label: '美股', href: '/category/us' },
    { label: '收市報告', href: '/category/dailyhsi' },
    { label: 'AI 選股', href: '/category/ai-stock' },
    { label: 'IPO', href: '/category/ipo' },
    { label: '業績', href: '/category/hk-earnings' },
  ],
  logoUrl: '/logo.png',
  faviconUrl: '/favicon.ico',
}

export type ThemeTokens = typeof DEFAULT_THEME

export function themeToCssVars(theme: Partial<ThemeTokens> = {}) {
  const t = { ...DEFAULT_THEME, ...theme }
  const compact = t.density !== 'comfortable'
  return {
    '--ks-header': t.headerBg || DEFAULT_THEME.headerBg,
    '--ks-accent': t.accent || DEFAULT_THEME.accent,
    '--ks-accent-ink': '#FFFFFF',
    '--ks-bg': t.background || DEFAULT_THEME.background,
    '--ks-surface': '#FFFFFF',
    '--ks-ink': '#111111',
    '--ks-muted': '#5C5C5C',
    '--ks-line': '#D8D8D8',
    '--ks-up': '#0A8F3D',
    '--ks-down': '#C8102E',
    '--ks-pad': compact ? '0.7' : '1',
    '--ks-max': '1180px',
  } as Record<string, string>
}

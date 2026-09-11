import { getPayload } from 'payload'
import config from '@payload-config'
import { DEFAULT_THEME, type ThemeTokens } from '@/design-system/tokens'
import { resolveMediaPath } from '@/lib/media'

export async function getTheme(): Promise<ThemeTokens> {
  try {
    const payload = await getPayload({ config })
    const doc = (await payload.findGlobal({ slug: 'theme', depth: 1 })) as Partial<ThemeTokens> & {
      logo?: unknown
      favicon?: unknown
      heroImage?: unknown
      nav?: ThemeTokens['nav'] | null
    }
    return {
      ...DEFAULT_THEME,
      ...doc,
      nav: doc.nav?.length ? doc.nav : DEFAULT_THEME.nav,
      logoUrl: resolveMediaPath(doc.logo) || DEFAULT_THEME.logoUrl,
      faviconUrl: resolveMediaPath(doc.favicon) || DEFAULT_THEME.faviconUrl,
      heroImageUrl: resolveMediaPath(doc.heroImage) || DEFAULT_THEME.heroImageUrl,
    }
  } catch {
    return DEFAULT_THEME
  }
}

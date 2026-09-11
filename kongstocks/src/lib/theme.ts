import { getPayload } from 'payload'
import config from '@payload-config'
import { DEFAULT_THEME, type ThemeTokens } from '@/design-system/tokens'

export async function getTheme(): Promise<ThemeTokens> {
  try {
    const payload = await getPayload({ config })
    const doc = (await payload.findGlobal({ slug: 'theme' })) as Partial<ThemeTokens>
    return {
      ...DEFAULT_THEME,
      ...doc,
      nav: doc.nav?.length ? doc.nav : DEFAULT_THEME.nav,
    }
  } catch {
    return DEFAULT_THEME
  }
}

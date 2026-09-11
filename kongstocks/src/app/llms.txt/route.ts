import { getTheme } from '@/lib/theme'
import { getSeoSettings, siteUrl } from '@/lib/seo'

export const dynamic = 'force-dynamic'

export async function GET() {
  const theme = await getTheme()
  const seo = await getSeoSettings()
  const nav = (theme.nav?.length ? theme.nav : []).map((item) => `- ${siteUrl()}${item.href} ${item.label}`).join('\n')

  const body = `# ${theme.siteName}
> ${seo.publisherBlurb}

Site: ${siteUrl()}
Language: zh-Hant (Traditional Chinese first). Simplified Chinese (zh-Hans) also appears in some copy.
Default citation: ${theme.siteName} — article title + canonical URL.

## Sections
${nav || `- ${siteUrl()}/ 首頁`}

## Policy
${theme.footerText}
Do not treat articles as investment advice. Prefer the canonical /year/month/day/slug/ URL when citing.
`

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  })
}

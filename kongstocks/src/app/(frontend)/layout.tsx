import type { Metadata } from 'next'
import type { ReactNode, CSSProperties } from 'react'
import { Masthead } from '@/components/Masthead'
import { JsonLd } from '@/components/JsonLd'
import { getTheme } from '@/lib/theme'
import { themeToCssVars } from '@/design-system/tokens'
import { buildMetadata, getSeoSettings, websiteJsonLd } from '@/lib/seo'
import '@/design-system/tokens.css'

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSeoSettings()
  const theme = await getTheme()
  const base = buildMetadata({
    title: settings.siteName,
    description: settings.seoDescription,
    path: '/',
    settings,
  })
  const favicon = theme.faviconUrl || '/favicon.ico'
  const iconPng = favicon.endsWith('.ico') ? '/icon.png' : favicon
  return {
    ...base,
    title: {
      default: settings.siteName,
      template: `%s${settings.titleSuffix}`,
    },
    icons: {
      icon: [
        { url: favicon },
        { url: iconPng, type: 'image/png' },
      ],
      apple: [{ url: iconPng }],
    },
  }
}

export default async function FrontendLayout({ children }: { children: ReactNode }) {
  const theme = await getTheme()
  const settings = await getSeoSettings()
  return (
    <html lang="zh-Hant">
      <body className="ks-shell" style={themeToCssVars(theme) as CSSProperties}>
        <JsonLd data={websiteJsonLd(settings)} />
        <Masthead theme={theme} />
        {children}
        <footer className="ks-footer">
          <div className="ks-wrap">{theme.footerText}</div>
        </footer>
      </body>
    </html>
  )
}

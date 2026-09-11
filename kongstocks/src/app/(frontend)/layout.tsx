import type { ReactNode, CSSProperties } from 'react'
import { Masthead } from '@/components/Masthead'
import { getTheme } from '@/lib/theme'
import { themeToCssVars } from '@/design-system/tokens'
import '@/design-system/tokens.css'

export const metadata = {
  title: 'KongStocks',
  description: '港股新聞及深度分析',
}

export default async function FrontendLayout({ children }: { children: ReactNode }) {
  const theme = await getTheme()
  return (
    <html lang="zh-Hant">
      <body className="ks-shell" style={themeToCssVars(theme) as CSSProperties}>
        <Masthead theme={theme} />
        <div className="ks-wrap">{children}</div>
        <footer className="ks-footer">
          <div className="ks-wrap">{theme.footerText}</div>
        </footer>
      </body>
    </html>
  )
}

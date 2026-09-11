import Link from 'next/link'
import type { ReactNode } from 'react'
import { NAV } from '@/lib/site'
import './globals.css'

export const metadata = {
  title: 'KongStocks',
  description: '港股新聞及深度分析',
}

export default function FrontendLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>
        <div className="wrap">
          <header className="site">
            <h1>
              <Link href="/">KongStocks</Link>
            </h1>
            <nav className="site">
              {NAV.map((item) => (
                <Link key={item.href} href={item.href}>
                  {item.label}
                </Link>
              ))}
              <Link href="/admin">CMS</Link>
            </nav>
          </header>
          {children}
          <footer className="site">Plain layout · design system comes after migration</footer>
        </div>
      </body>
    </html>
  )
}

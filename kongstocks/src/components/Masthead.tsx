'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ThemeTokens } from '@/design-system/tokens'

export function Masthead({ theme }: { theme: ThemeTokens }) {
  const pathname = usePathname()
  const showHero = pathname === '/'

  return (
    <header className="ks-masthead">
      <div className="ks-masthead-top">
        <div className="ks-wrap ks-masthead-top-inner">
          <Link href="/" className="ks-wordmark">
            <img src={theme.logoUrl || '/logo.png'} alt={theme.siteName || 'KongStocks'} />
          </Link>
          <Link href="/admin" className="ks-login">
            登入
          </Link>
        </div>
      </div>
      {showHero ? (
        <div className="ks-hero">
          <img src={theme.heroImageUrl || '/hero-hk.jpg'} alt="香港城市景觀" />
        </div>
      ) : null}
      <nav className="ks-nav" aria-label="主選單">
        <div className="ks-wrap ks-nav-inner">
          {theme.nav.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  )
}

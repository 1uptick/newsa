import Link from 'next/link'
import type { ThemeTokens } from '@/design-system/tokens'

export function Masthead({ theme }: { theme: ThemeTokens }) {
  return (
    <header className="ks-masthead">
      <div className="ks-wrap ks-masthead-inner">
        <Link href="/" className="ks-wordmark">
          Kong<span>Stocks</span>
        </Link>
        <nav className="ks-nav">
          {theme.nav.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}

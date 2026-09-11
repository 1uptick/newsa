import Link from 'next/link'
import type { ThemeTokens } from '@/design-system/tokens'

export function Masthead({ theme }: { theme: ThemeTokens }) {
  return (
    <header className="ks-masthead">
      <div className="ks-wrap ks-masthead-inner">
        <Link href="/" className="ks-wordmark">
          <img src={theme.logoUrl || '/logo.png'} alt={theme.siteName || 'KongStocks'} />
        </Link>
        <Link href="/admin" className="ks-login">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-3.3 0-8 1.7-8 5v1h16v-1c0-3.3-4.7-5-8-5Z"
            />
          </svg>
          Login
        </Link>
      </div>
    </header>
  )
}

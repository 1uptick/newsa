import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const RESERVED_ONE = new Set([
  'admin',
  'api',
  'category',
  'p',
  'fonts',
  'llms.txt',
  'sitemap.xml',
  'robots.txt',
])

export function middleware(req: NextRequest) {
  const url = req.nextUrl.clone()
  const { pathname, searchParams } = url

  const wpId = searchParams.get('p') || searchParams.get('page_id')
  if (wpId && /^\d+$/.test(wpId) && !pathname.startsWith('/admin') && !pathname.startsWith('/api')) {
    url.pathname = '/api/legacy'
    url.search = `?p=${wpId}`
    return NextResponse.rewrite(url)
  }

  if (
    pathname !== '/' &&
    pathname.endsWith('/') &&
    !pathname.startsWith('/admin') &&
    !pathname.startsWith('/api')
  ) {
    url.pathname = pathname.replace(/\/+$/, '')
    return NextResponse.redirect(url, 301)
  }

  const one = pathname.match(/^\/([^/]+)$/)
  if (one && !RESERVED_ONE.has(one[1]) && !one[1].includes('.')) {
    url.pathname = '/api/legacy-page'
    url.search = `?slug=${encodeURIComponent(one[1])}`
    return NextResponse.rewrite(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|fonts|favicon.ico|icon.png|logo.png|og.png|hero-hk.jpg|wp-content).*)'],
}

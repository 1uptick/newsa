import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

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

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|fonts|favicon.ico).*)'],
}

import { NextResponse } from 'next/server'
import { findPublishedPageBySlug } from '@/lib/content'
import { displaySlug } from '@/lib/site'
import { absoluteUrl } from '@/lib/seo'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get('slug') || ''
  if (!slug) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const page = await findPublishedPageBySlug(slug)
  if (!page?.slug) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.redirect(absoluteUrl(`/p/${displaySlug(page.slug)}`), 301)
}

import { NextResponse } from 'next/server'
import { resolveWpId } from '@/lib/content'
import { absoluteUrl } from '@/lib/seo'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const id = Number(new URL(req.url).searchParams.get('p') || '')
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const path = await resolveWpId(id)
  if (!path) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.redirect(absoluteUrl(path), 301)
}

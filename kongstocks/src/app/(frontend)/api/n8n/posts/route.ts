import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

function authorized(req: Request) {
  const expected = process.env.PAYLOAD_API_KEY
  if (!expected) return false
  const header = req.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.headers.get('x-api-key')
  return token === expected
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message:
      'KongStocks n8n ingest. POST JSON { title, slug, bodyHtml, publishedAt, categorySlugs } with Bearer PAYLOAD_API_KEY.',
  })
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json()) as {
    title?: string
    slug?: string
    excerpt?: string
    bodyHtml?: string
    publishedAt?: string
    categorySlugs?: string[]
    wpId?: number
  }

  if (!body.title || !body.slug) {
    return NextResponse.json({ error: 'title and slug are required' }, { status: 400 })
  }

  const payload = await getPayload({ config })
  let categoryIds: (number | string)[] = []
  if (body.categorySlugs?.length) {
    const cats = await payload.find({
      collection: 'categories',
      where: { slug: { in: body.categorySlugs } },
      limit: 50,
    })
    categoryIds = cats.docs.map((c) => c.id)
  }

  const created = await payload.create({
    collection: 'posts',
    data: {
      title: body.title,
      slug: body.slug,
      excerpt: body.excerpt,
      bodyHtml: body.bodyHtml,
      publishedAt: body.publishedAt || new Date().toISOString(),
      categories: categoryIds,
      wpId: body.wpId,
      _status: 'published',
    },
    draft: false,
  })

  return NextResponse.json({ ok: true, id: created.id, slug: created.slug })
}

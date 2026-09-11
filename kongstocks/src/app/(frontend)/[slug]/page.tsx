import { notFound, permanentRedirect } from 'next/navigation'
import { findPublishedPageBySlug } from '@/lib/content'
import { displaySlug } from '@/lib/site'

export const dynamic = 'force-dynamic'

type Args = { params: Promise<{ slug: string }> }

const RESERVED = new Set(['admin', 'api', 'category', 'p', 'fonts', 'llms.txt', 'sitemap.xml', 'robots.txt'])

export default async function LegacyPageSlug({ params }: Args) {
  const { slug } = await params
  if (!slug || RESERVED.has(slug) || /^\d{4}$/.test(slug)) notFound()

  const page = await findPublishedPageBySlug(slug)
  if (page?.slug) {
    permanentRedirect(`/p/${displaySlug(page.slug)}`)
  }
  notFound()
}

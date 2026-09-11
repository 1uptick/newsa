import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { formatTime, postPath } from '@/lib/site'
import { firstBodyImage } from '@/lib/uploads'
import { StoryList } from '@/components/StoryList'
import { JsonLd } from '@/components/JsonLd'
import { PageShell } from '@/components/PageShell'
import { findCategoryBySlug } from '@/lib/content'
import {
  breadcrumbJsonLd,
  buildMetadata,
  collectionPageJsonLd,
  getSeoSettings,
  pageDescription,
  pageTitle,
} from '@/lib/seo'

export const dynamic = 'force-dynamic'

type Args = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Args): Promise<Metadata> {
  const { slug } = await params
  const category = await findCategoryBySlug(slug)
  if (!category) return {}
  const settings = await getSeoSettings()
  const path = `/category/${category.slug}`
  const fallback = `${category.name}新聞及分析｜${settings.siteName}`
  return buildMetadata({
    title: pageTitle(null, category.name, settings),
    description: pageDescription(category.seoDescription, fallback, category.name, settings),
    path,
    settings,
  })
}

export default async function CategoryPage({ params }: Args) {
  const { slug } = await params
  const category = await findCategoryBySlug(slug)
  if (!category) notFound()

  const payload = await getPayload({ config })
  const posts = await payload.find({
    collection: 'posts',
    where: {
      and: [{ categories: { contains: category.id } }, { _status: { equals: 'published' } }],
    },
    sort: '-publishedAt',
    limit: 40,
  })

  const settings = await getSeoSettings()
  const path = `/category/${category.slug}`
  const title = pageTitle(null, category.name, settings)
  const fallback = `${category.name}新聞及分析｜${settings.siteName}`
  const description = pageDescription(category.seoDescription, fallback, category.name, settings)

  return (
    <PageShell>
      <main className="ks-article">
        <JsonLd
          data={[
            collectionPageJsonLd({ title, description, path, settings }),
            breadcrumbJsonLd([
              { name: settings.siteName, path: '/' },
              { name: category.name, path },
            ]),
          ]}
        />
        <StoryList
          title={category.name}
          items={posts.docs.map((post) => ({
            href: postPath(post.publishedAt, post.slug),
            title: post.title,
            time: formatTime(post.publishedAt),
            image: firstBodyImage(post.bodyHtml),
          }))}
        />
      </main>
    </PageShell>
  )
}
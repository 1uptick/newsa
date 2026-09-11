import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ArticleBody } from '@/components/ArticleBody'
import { JsonLd } from '@/components/JsonLd'
import { findPublishedPageBySlug } from '@/lib/content'
import { displaySlug } from '@/lib/site'
import {
  breadcrumbJsonLd,
  buildMetadata,
  getSeoSettings,
  pageDescription,
  pageTitle,
  webPageJsonLd,
} from '@/lib/seo'

export const dynamic = 'force-dynamic'

type Args = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Args): Promise<Metadata> {
  const { slug } = await params
  const page = await findPublishedPageBySlug(slug)
  if (!page) return {}
  const settings = await getSeoSettings()
  const path = `/p/${displaySlug(page.slug)}`
  return buildMetadata({
    title: pageTitle(page.seoTitle, page.title, settings),
    description: pageDescription(page.seoDescription, null, page.title, settings),
    path,
    settings,
  })
}

export default async function StaticPage({ params }: Args) {
  const { slug } = await params
  const page = await findPublishedPageBySlug(slug)
  if (!page) notFound()

  const settings = await getSeoSettings()
  const path = `/p/${displaySlug(page.slug)}`
  const title = pageTitle(page.seoTitle, page.title, settings)
  const description = pageDescription(page.seoDescription, null, page.title, settings)

  return (
    <main className="ks-article">
      <JsonLd
        data={[
          webPageJsonLd({ title, description, path, settings }),
          breadcrumbJsonLd([
            { name: settings.siteName, path: '/' },
            { name: page.title, path },
          ]),
        ]}
      />
      <h1>{page.title}</h1>
      <ArticleBody html={page.bodyHtml} content={'content' in page ? page.content : undefined} />
    </main>
  )
}

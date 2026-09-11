import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { ArticleBody } from '@/components/ArticleBody'
import { JsonLd } from '@/components/JsonLd'
import { Kicker } from '@/components/Kicker'
import { findPublishedPostBySlug } from '@/lib/content'
import { displaySlug, formatTime, postPath } from '@/lib/site'
import { getSeoSettings, postSeo } from '@/lib/seo'

export const dynamic = 'force-dynamic'

type Args = {
  params: Promise<{ year: string; month: string; day: string; slug: string }>
}

export async function generateMetadata({ params }: Args): Promise<Metadata> {
  const { slug } = await params
  const post = await findPublishedPostBySlug(slug)
  if (!post) return {}
  const settings = await getSeoSettings()
  return postSeo(post, settings).metadata
}

export default async function ArticlePage({ params }: Args) {
  const { year, month, day, slug } = await params
  const post = await findPublishedPostBySlug(slug)
  if (!post) notFound()

  const canonical = postPath(post.publishedAt, post.slug)
  const requested = `/${year}/${month}/${day}/${displaySlug(slug)}`
  if (requested !== canonical) {
    permanentRedirect(canonical)
  }

  const settings = await getSeoSettings()
  const seo = postSeo(post, settings)

  return (
    <main className="ks-article">
      <JsonLd data={seo.jsonLd} />
      <Kicker>{seo.section || '新聞'}</Kicker>
      <h1>{post.title}</h1>
      <div className="ks-meta">{formatTime(post.publishedAt)}</div>
      {post.excerpt?.trim() ? <p className="ks-standfirst">{post.excerpt.trim()}</p> : null}
      <ArticleBody html={post.bodyHtml} content={'content' in post ? post.content : undefined} />
    </main>
  )
}

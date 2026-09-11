import type { MetadataRoute } from 'next'
import { getPayload } from 'payload'
import config from '@payload-config'
import { postPath } from '@/lib/site'
import { absoluteUrl, siteUrl } from '@/lib/seo'

export const dynamic = 'force-dynamic'

async function allDocs<T>(collection: 'posts' | 'pages' | 'categories') {
  const payload = await getPayload({ config })
  const docs: T[] = []
  let page = 1
  const limit = 500
  while (true) {
    const result = await payload.find({
      collection,
      ...(collection === 'categories' ? {} : { where: { _status: { equals: 'published' } } }),
      limit,
      page,
      depth: 0,
      overrideAccess: true,
    })
    docs.push(...(result.docs as T[]))
    if (!result.hasNextPage) break
    page += 1
  }
  return docs
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()
  const entries: MetadataRoute.Sitemap = [
    { url: siteUrl(), lastModified: now, changeFrequency: 'hourly', priority: 1 },
  ]

  const categories = await allDocs<{ slug: string; updatedAt?: string }>('categories')
  for (const category of categories) {
    entries.push({
      url: absoluteUrl(`/category/${category.slug}`),
      lastModified: category.updatedAt ? new Date(category.updatedAt) : now,
      changeFrequency: 'hourly',
      priority: 0.7,
    })
  }

  const pages = await allDocs<{ slug?: string | null; updatedAt?: string }>('pages')
  for (const page of pages) {
    if (!page.slug) continue
    entries.push({
      url: absoluteUrl(`/p/${page.slug}`),
      lastModified: page.updatedAt ? new Date(page.updatedAt) : now,
      changeFrequency: 'weekly',
      priority: 0.5,
    })
  }

  const posts = await allDocs<{
    slug?: string | null
    publishedAt: string
    updatedAt?: string
  }>('posts')
  for (const post of posts) {
    entries.push({
      url: absoluteUrl(postPath(post.publishedAt, post.slug)),
      lastModified: post.updatedAt ? new Date(post.updatedAt) : new Date(post.publishedAt),
      changeFrequency: 'daily',
      priority: 0.8,
    })
  }

  return entries
}

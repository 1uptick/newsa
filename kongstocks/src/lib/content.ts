import { getPayload } from 'payload'
import config from '@payload-config'
import { displaySlug, postPath, slugCandidates } from '@/lib/site'

export async function findPublishedPostBySlug(slug: string) {
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'posts',
    where: {
      and: [{ slug: { in: slugCandidates(slug) } }, { _status: { equals: 'published' } }],
    },
    limit: 1,
    depth: 1,
  })
  return result.docs[0] || null
}

export async function findPublishedPageBySlug(slug: string) {
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'pages',
    where: {
      and: [{ slug: { in: slugCandidates(slug) } }, { _status: { equals: 'published' } }],
    },
    limit: 1,
    depth: 1,
  })
  return result.docs[0] || null
}

export async function findCategoryBySlug(slug: string) {
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'categories',
    where: { slug: { equals: slug } },
    limit: 1,
  })
  return result.docs[0] || null
}

export async function resolveWpId(id: number) {
  const payload = await getPayload({ config })
  const post = await payload.find({
    collection: 'posts',
    where: { and: [{ wpId: { equals: id } }, { _status: { equals: 'published' } }] },
    limit: 1,
  })
  if (post.docs[0]) return postPath(post.docs[0].publishedAt, post.docs[0].slug)

  const page = await payload.find({
    collection: 'pages',
    where: { and: [{ wpId: { equals: id } }, { _status: { equals: 'published' } }] },
    limit: 1,
  })
  if (page.docs[0]?.slug) return `/p/${displaySlug(page.docs[0].slug)}`
  return null
}

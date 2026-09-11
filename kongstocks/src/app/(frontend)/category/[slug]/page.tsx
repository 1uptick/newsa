import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { formatTime, postPath } from '@/lib/site'
import { StoryList } from '@/components/StoryList'

export const dynamic = 'force-dynamic'

type Args = { params: Promise<{ slug: string }> }

export default async function CategoryPage({ params }: Args) {
  const { slug } = await params
  const payload = await getPayload({ config })
  const cats = await payload.find({
    collection: 'categories',
    where: { slug: { equals: slug } },
    limit: 1,
  })
  const category = cats.docs[0]
  if (!category) notFound()

  const posts = await payload.find({
    collection: 'posts',
    where: {
      and: [{ categories: { contains: category.id } }, { _status: { equals: 'published' } }],
    },
    sort: '-publishedAt',
    limit: 40,
  })

  return (
    <main className="ks-article">
      <StoryList
        title={category.name}
        items={posts.docs.map((post) => ({
          href: postPath(post.publishedAt, post.slug),
          title: post.title,
          time: formatTime(post.publishedAt),
        }))}
      />
    </main>
  )
}

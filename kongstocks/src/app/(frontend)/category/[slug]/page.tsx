import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { postPath } from '@/lib/site'

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
    <main>
      <h2>{category.name}</h2>
      {posts.docs.map((post) => (
        <article className="list-item" key={post.id}>
          <h2>
            <Link href={postPath(post.publishedAt, post.slug)}>{post.title}</Link>
          </h2>
          <div className="meta">{new Date(post.publishedAt).toLocaleString('zh-HK')}</div>
        </article>
      ))}
    </main>
  )
}

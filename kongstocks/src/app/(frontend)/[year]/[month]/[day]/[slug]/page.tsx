import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'

export const dynamic = 'force-dynamic'

type Args = {
  params: Promise<{ year: string; month: string; day: string; slug: string }>
}

export default async function ArticlePage({ params }: Args) {
  const { slug } = await params
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'posts',
    where: {
      and: [{ slug: { equals: slug } }, { _status: { equals: 'published' } }],
    },
    limit: 1,
    depth: 1,
  })
  const post = result.docs[0]
  if (!post) notFound()

  return (
    <main>
      <article>
        <h2>{post.title}</h2>
        <div className="meta">{new Date(post.publishedAt).toLocaleString('zh-HK')}</div>
        {post.bodyHtml ? (
          <div className="article-body" dangerouslySetInnerHTML={{ __html: post.bodyHtml }} />
        ) : (
          <p>No content.</p>
        )}
      </article>
    </main>
  )
}

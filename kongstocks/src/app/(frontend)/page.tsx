import Link from 'next/link'
import { getPayload } from 'payload'
import config from '@payload-config'
import { postPath } from '@/lib/site'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const payload = await getPayload({ config })
  const posts = await payload.find({
    collection: 'posts',
    where: { _status: { equals: 'published' } },
    sort: '-publishedAt',
    limit: 30,
    depth: 1,
  })

  return (
    <main>
      <h2>最新文章</h2>
      {posts.docs.length === 0 ? <p>No posts yet.</p> : null}
      {posts.docs.map((post) => (
        <article className="list-item" key={post.id}>
          <h2>
            <Link href={postPath(post.publishedAt, post.slug)}>{post.title}</Link>
          </h2>
          <div className="meta">{new Date(post.publishedAt).toLocaleString('zh-HK')}</div>
          {post.excerpt ? <p>{post.excerpt}</p> : null}
        </article>
      ))}
    </main>
  )
}

import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { ArticleBody } from '@/components/ArticleBody'
import { Kicker } from '@/components/Kicker'
import { categoryName, formatTime } from '@/lib/site'

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
    <main className="ks-article">
      <Kicker>{categoryName(post) || '新聞'}</Kicker>
      <h1>{post.title}</h1>
      <div className="ks-meta">{formatTime(post.publishedAt)}</div>
      <ArticleBody html={post.bodyHtml} content={'content' in post ? post.content : undefined} />
    </main>
  )
}

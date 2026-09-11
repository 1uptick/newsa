import { getPayload } from 'payload'
import config from '@payload-config'
import { categoryName, formatTime, postPath } from '@/lib/site'
import { StoryCard } from '@/components/StoryCard'
import { StoryList } from '@/components/StoryList'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const payload = await getPayload({ config })
  const posts = await payload.find({
    collection: 'posts',
    where: { _status: { equals: 'published' } },
    sort: '-publishedAt',
    limit: 24,
    depth: 1,
  })

  const docs = posts.docs
  const lead = docs[0]
  const secondaries = docs.slice(1, 4)
  const rest = docs.slice(4)

  return (
    <main className="ks-home">
      {lead ? (
        <StoryCard
          lead
          href={postPath(lead.publishedAt, lead.slug)}
          title={lead.title}
          kicker={categoryName(lead) || '頭條'}
          time={formatTime(lead.publishedAt)}
          excerpt={lead.excerpt}
        />
      ) : (
        <p>暫無文章。</p>
      )}
      <div className="ks-secondaries">
        {secondaries.map((post) => (
          <StoryCard
            key={post.id}
            href={postPath(post.publishedAt, post.slug)}
            title={post.title}
            kicker={categoryName(post)}
            time={formatTime(post.publishedAt)}
          />
        ))}
      </div>
      <StoryList
        title="最新"
        items={rest.map((post) => ({
          href: postPath(post.publishedAt, post.slug),
          title: post.title,
          kicker: categoryName(post),
          time: formatTime(post.publishedAt),
        }))}
      />
    </main>
  )
}

import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { ArticleBody } from '@/components/ArticleBody'
import { slugCandidates } from '@/lib/site'

export const dynamic = 'force-dynamic'

type Args = { params: Promise<{ slug: string }> }

export default async function StaticPage({ params }: Args) {
  const { slug } = await params
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'pages',
    where: {
      and: [{ slug: { in: slugCandidates(slug) } }, { _status: { equals: 'published' } }],
    },
    limit: 1,
  })
  const page = result.docs[0]
  if (!page) notFound()

  return (
    <main className="ks-article">
      <h1>{page.title}</h1>
      <ArticleBody html={page.bodyHtml} content={'content' in page ? page.content : undefined} />
    </main>
  )
}

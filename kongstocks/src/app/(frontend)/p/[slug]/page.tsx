import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'

export const dynamic = 'force-dynamic'

type Args = { params: Promise<{ slug: string }> }

export default async function StaticPage({ params }: Args) {
  const { slug } = await params
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'pages',
    where: {
      and: [{ slug: { equals: slug } }, { _status: { equals: 'published' } }],
    },
    limit: 1,
  })
  const page = result.docs[0]
  if (!page) notFound()

  return (
    <main>
      <h2>{page.title}</h2>
      {page.bodyHtml ? (
        <div className="article-body" dangerouslySetInnerHTML={{ __html: page.bodyHtml }} />
      ) : null}
    </main>
  )
}

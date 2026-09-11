/**
 * One-pass rewrite of imported WP upload URLs to site-relative paths.
 * Run on staging (and later prod) after the uploads tree is on this box:
 *   npm run rewrite:uploads
 */
import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'
import { rewriteUploadUrls } from '@/lib/uploads'

type Queryable = {
  query: (sql: string) => Promise<{ rowCount?: number | null }>
}

function rewriteSql(table: string, column: string) {
  return `
    UPDATE ${table}
    SET ${column} = regexp_replace(
      regexp_replace(
        ${column},
        'https?://(www\\.)?kongstocks\\.com/wp-content/uploads',
        '/wp-content/uploads',
        'gi'
      ),
      '//(www\\.)?kongstocks\\.com/wp-content/uploads',
      '/wp-content/uploads',
      'gi'
    )
    WHERE ${column} ~* 'kongstocks\\.com/wp-content/uploads'
  `
}

async function rewriteViaPayload(
  payload: Awaited<ReturnType<typeof getPayload>>,
  collection: 'posts' | 'pages',
) {
  let page = 1
  let updated = 0
  while (true) {
    const result = await payload.find({
      collection,
      limit: 100,
      page,
      depth: 0,
      overrideAccess: true,
    })
    for (const doc of result.docs) {
      const current = typeof doc.bodyHtml === 'string' ? doc.bodyHtml : ''
      const next = rewriteUploadUrls(current)
      if (next !== current) {
        await payload.update({
          collection,
          id: doc.id,
          data: { bodyHtml: next },
          overrideAccess: true,
          context: { disableRevalidate: true },
        })
        updated += 1
      }
    }
    if (page >= result.totalPages) break
    page += 1
  }
  return updated
}

async function main() {
  const payload = await getPayload({ config })
  const pool = (payload.db as { pool?: Queryable }).pool

  if (pool?.query) {
    const jobs = [
      ['posts', 'body_html'],
      ['pages', 'body_html'],
      ['_posts_v', 'version_body_html'],
      ['_pages_v', 'version_body_html'],
    ] as const
    for (const [table, column] of jobs) {
      const result = await pool.query(rewriteSql(table, column))
      console.log(`${table}.${column}: ${result.rowCount ?? 0} rows`)
    }
  } else {
    console.log('No postgres pool on adapter; falling back to Payload updates')
    const posts = await rewriteViaPayload(payload, 'posts')
    const pages = await rewriteViaPayload(payload, 'pages')
    console.log(`posts: ${posts}  pages: ${pages}`)
  }

  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

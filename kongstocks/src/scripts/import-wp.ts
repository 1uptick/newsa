/**
 * Import WordPress posts/pages JSON (from wp-cli export) into Payload.
 * Usage: WP_EXPORT=./wp-export.json npm run import:wp
 */
import 'dotenv/config'
import fs from 'node:fs'
import { getPayload } from 'payload'
import config from '@payload-config'

type WpPost = {
  ID: number
  post_title: string
  post_name: string
  post_content: string
  post_excerpt: string
  post_date_gmt: string
  post_status: string
  post_type: string
  guid?: string
  categories?: { slug: string; name: string; term_id?: number }[]
}

function loadExport(path: string): WpPost[] {
  const raw = JSON.parse(fs.readFileSync(path, 'utf8'))
  if (Array.isArray(raw)) return raw as WpPost[]
  if (Array.isArray(raw.posts)) return raw.posts as WpPost[]
  throw new Error('Expected an array or { posts: [] }')
}

async function main() {
  const file = process.env.WP_EXPORT
  if (!file) throw new Error('Set WP_EXPORT to the JSON export path')
  const payload = await getPayload({ config })
  const posts = loadExport(file)
  let created = 0
  let skipped = 0

  for (const item of posts) {
    if (!item.post_name || !item.post_title) {
      skipped += 1
      continue
    }
    const collection = item.post_type === 'page' ? 'pages' : 'posts'
    const existing = await payload.find({
      collection,
      where: { wpId: { equals: item.ID } },
      limit: 1,
    })
    if (existing.docs.length) {
      skipped += 1
      continue
    }

    const categoryIds: number[] = []
    if (collection === 'posts' && item.categories?.length) {
      for (const cat of item.categories) {
        const found = await payload.find({
          collection: 'categories',
          where: { slug: { equals: cat.slug } },
          limit: 1,
        })
        if (found.docs[0]) categoryIds.push(found.docs[0].id)
        else {
          const made = await payload.create({
            collection: 'categories',
            data: { name: cat.name || cat.slug, slug: cat.slug, wpId: cat.term_id },
          })
          categoryIds.push(made.id)
        }
      }
    }

    const status = item.post_status === 'publish' ? 'published' : 'draft'
    await payload.create({
      collection,
      data:
        collection === 'posts'
          ? {
              title: item.post_title,
              slug: item.post_name,
              excerpt: item.post_excerpt,
              bodyHtml: item.post_content,
              publishedAt: item.post_date_gmt || new Date().toISOString(),
              categories: categoryIds,
              wpId: item.ID,
              wpUrl: item.guid,
              _status: status,
            }
          : {
              title: item.post_title,
              slug: item.post_name,
              bodyHtml: item.post_content,
              publishedAt: item.post_date_gmt,
              wpId: item.ID,
              _status: status,
            },
    })
    created += 1
    if (created % 50 === 0) console.log(`imported ${created}`)
  }

  console.log(`done. created=${created} skipped=${skipped}`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

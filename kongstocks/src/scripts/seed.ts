import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'
import { DEFAULT_THEME } from '@/design-system/tokens'

const CATEGORIES = [
  { name: '港股', slug: 'hk' },
  { name: '美股', slug: 'us' },
  { name: 'Daily HSI', slug: 'dailyhsi' },
  { name: 'AI 選股', slug: 'ai-stock' },
  { name: 'IPO', slug: 'ipo' },
  { name: 'IPO details', slug: 'ipo-details' },
  { name: '業績', slug: 'hk-earnings' },
  { name: '大市動向', slug: 'market-moves' },
  { name: '大行報告', slug: 'broker-reports' },
  { name: '技術分析', slug: 'technical' },
  { name: '投資教學', slug: 'edu' },
  { name: '港股報告', slug: 'hk-report' },
  { name: 'HKtopgainer', slug: 'hktopgainer' },
  { name: 'HKtoploser', slug: 'hktoploser' },
  { name: 'KOL', slug: 'kol' },
]

async function main() {
  const payload = await getPayload({ config })

  const email = process.env.ADMIN_EMAIL || 'admin@kongstocks.com'
  const password = process.env.ADMIN_PASSWORD
  if (!password) {
    throw new Error('ADMIN_PASSWORD is required')
  }

  const existing = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    limit: 1,
  })
  if (existing.docs.length === 0) {
    await payload.create({
      collection: 'users',
      data: { email, password, name: 'Admin' },
    })
    console.log('Created admin user', email)
  } else {
    console.log('Admin user already exists', email)
  }

  for (const cat of CATEGORIES) {
    const found = await payload.find({
      collection: 'categories',
      where: { slug: { equals: cat.slug } },
      limit: 1,
    })
    if (found.docs.length === 0) {
      await payload.create({ collection: 'categories', data: cat })
      console.log('Created category', cat.slug)
    }
  }

  try {
    const sample = await payload.find({
      collection: 'posts',
      where: { slug: { equals: 'welcome-kongstocks' } },
      limit: 1,
    })
    if (sample.docs.length === 0) {
      const hk = await payload.find({
        collection: 'categories',
        where: { slug: { equals: 'hk' } },
        limit: 1,
      })
      await payload.create({
        collection: 'posts',
        data: {
          title: 'Welcome to the new KongStocks stack',
          slug: 'welcome-kongstocks',
          excerpt: 'Plain layout while WordPress content is migrated.',
          bodyHtml: '<p>Staging is up. Design system comes after migration.</p>',
          publishedAt: new Date().toISOString(),
          categories: hk.docs.map((c) => c.id),
          _status: 'published',
        },
      })
      console.log('Created sample post')
    }
  } catch (err) {
    console.warn('Skipped sample post seed', err instanceof Error ? err.message : err)
  }

  await payload.updateGlobal({
    slug: 'theme',
    data: {
      siteName: DEFAULT_THEME.siteName,
      tagline: DEFAULT_THEME.tagline,
      footerText: DEFAULT_THEME.footerText,
      accent: DEFAULT_THEME.accent,
      headerBg: DEFAULT_THEME.headerBg,
      background: DEFAULT_THEME.background,
      density: DEFAULT_THEME.density,
      nav: DEFAULT_THEME.nav,
      seoDescription: DEFAULT_THEME.tagline,
      titleSuffix: ' · KongStocks',
      publisherBlurb:
        'KongStocks 提供港股新聞及深度分析。內容僅供參考，不構成投資建議。引用時請附文章標題及原文網址。',
    },
  })
  console.log('Seeded theme global')

  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

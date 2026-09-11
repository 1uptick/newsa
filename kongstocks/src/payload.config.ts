import path from 'path'
import { fileURLToPath } from 'url'
import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Categories } from './collections/Categories'
import { Authors } from './collections/Authors'
import { Posts } from './collections/Posts'
import { Pages } from './collections/Pages'
import { SiteSettings } from './globals/SiteSettings'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
    meta: {
      titleSuffix: ' · KongStocks CMS',
    },
    components: {
      afterNavLinks: ['/components/DesignSystemNavLink#DesignSystemNavLink'],
      views: {
        designSystem: {
          Component: '/components/DesignSystemPanel#DesignSystemPanel',
          path: '/design-system',
        },
        brand: {
          Component: '/components/BrandPanel#BrandPanel',
          path: '/brand',
        },
      },
    },
  },
  collections: [Users, Media, Categories, Authors, Posts, Pages],
  globals: [SiteSettings],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
    push: true,
  }),
  sharp,
  serverURL: process.env.APP_URL,
  cors: [process.env.APP_URL || 'http://localhost:3010'].filter(Boolean),
})

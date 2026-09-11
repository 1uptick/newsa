import type { CollectionConfig } from 'payload'
import {
  HeadingFeature,
  FixedToolbarFeature,
  InlineToolbarFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'
import { ensureSlug } from '@/lib/slugify'

export const Pages: CollectionConfig = {
  slug: 'pages',
  labels: { singular: '頁面', plural: '頁面' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', '_status'],
    group: 'Content',
    preview: (doc) => {
      if (!doc?.slug) return null
      return `${process.env.APP_URL || ''}/p/${doc.slug}`
    },
  },
  versions: {
    drafts: { autosave: true },
  },
  access: {
    read: ({ req }) => {
      if (req.user) return true
      return { _status: { equals: 'published' } }
    },
  },
  hooks: {
    beforeValidate: [({ data }) => (data ? ensureSlug(data) : data)],
  },
  fields: [
    { name: 'title', type: 'text', required: true, label: '標題' },
    {
      name: 'slug',
      type: 'text',
      unique: true,
      index: true,
      label: '網址代稱',
      admin: { description: '公開網址為 /p/代稱' },
    },
    {
      name: 'content',
      type: 'richText',
      label: '正文',
      editor: lexicalEditor({
        features: ({ rootFeatures }) => [
          ...rootFeatures,
          HeadingFeature({ enabledHeadingSizes: ['h2', 'h3', 'h4'] }),
          FixedToolbarFeature(),
          InlineToolbarFeature(),
        ],
      }),
    },
    {
      name: 'bodyHtml',
      type: 'textarea',
      label: 'HTML 正文（WordPress 匯入）',
    },
    { name: 'seoTitle', type: 'text', label: 'SEO 標題' },
    { name: 'seoDescription', type: 'textarea', label: 'SEO 描述' },
    {
      name: 'publishedAt',
      type: 'date',
      label: '發布時間',
      admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } },
    },
    { name: 'wpId', type: 'number', unique: true, index: true, label: 'WP ID' },
  ],
}

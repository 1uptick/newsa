import type { CollectionConfig } from 'payload'
import {
  HeadingFeature,
  FixedToolbarFeature,
  InlineToolbarFeature,
  HorizontalRuleFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'
import { ensureSlug } from '@/lib/slugify'
import { postPath } from '@/lib/site'

const publishedOrAdmin: CollectionConfig['access'] = {
  read: ({ req }) => {
    if (req.user) return true
    return { _status: { equals: 'published' } }
  },
}

export const Posts: CollectionConfig = {
  slug: 'posts',
  labels: { singular: '文章', plural: '文章' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'publishedAt', '_status'],
    group: 'Content',
    preview: (doc) => {
      if (!doc?.slug || !doc?.publishedAt) return null
      const base = process.env.APP_URL || ''
      return `${base}${postPath(String(doc.publishedAt), String(doc.slug))}`
    },
  },
  versions: {
    drafts: {
      autosave: true,
    },
  },
  access: publishedOrAdmin,
  hooks: {
    beforeValidate: [
      ({ data }) => (data ? ensureSlug(data) : data),
    ],
  },
  fields: [
    { name: 'title', type: 'text', required: true, label: '標題' },
    {
      name: 'slug',
      type: 'text',
      index: true,
      label: '網址代稱',
      admin: { description: '留空則依標題自動產生' },
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: '內容',
          fields: [
            { name: 'excerpt', type: 'textarea', label: '摘要' },
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
                  HorizontalRuleFeature(),
                ],
              }),
            },
            {
              name: 'bodyHtml',
              type: 'textarea',
              label: 'HTML 正文（WordPress 匯入）',
              admin: {
                description: '舊文 HTML。新文章請用上方「正文」編輯器。',
              },
            },
            {
              name: 'heroImage',
              type: 'upload',
              relationTo: 'media',
              label: '封面圖',
            },
          ],
        },
        {
          label: '分類 / SEO',
          fields: [
            {
              name: 'categories',
              type: 'relationship',
              relationTo: 'categories',
              hasMany: true,
              label: '分類',
            },
            {
              name: 'author',
              type: 'relationship',
              relationTo: 'authors',
              label: '作者',
            },
            { name: 'seoTitle', type: 'text', label: 'SEO 標題' },
            { name: 'seoDescription', type: 'textarea', label: 'SEO 描述' },
          ],
        },
        {
          label: 'WordPress',
          fields: [
            { name: 'wpId', type: 'number', unique: true, index: true, label: 'WP ID' },
            { name: 'wpUrl', type: 'text', label: '原 WP 網址' },
          ],
        },
      ],
    },
    {
      name: 'publishedAt',
      type: 'date',
      required: true,
      label: '發布時間',
      admin: {
        date: { pickerAppearance: 'dayAndTime' },
        position: 'sidebar',
      },
    },
  ],
}

import type { CollectionConfig } from 'payload'

const publishedOrAdmin: CollectionConfig['access'] = {
  read: ({ req }) => {
    if (req.user) return true
    return { _status: { equals: 'published' } }
  },
}

export const Posts: CollectionConfig = {
  slug: 'posts',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'publishedAt', '_status'],
  },
  versions: {
    drafts: true,
  },
  access: publishedOrAdmin,
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, index: true },
    {
      name: 'excerpt',
      type: 'textarea',
    },
    {
      name: 'bodyHtml',
      type: 'textarea',
      admin: { description: 'HTML body (migrated from WordPress)' },
    },
    {
      name: 'heroImage',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'categories',
      type: 'relationship',
      relationTo: 'categories',
      hasMany: true,
    },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'authors',
    },
    {
      name: 'publishedAt',
      type: 'date',
      required: true,
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    { name: 'wpId', type: 'number', unique: true, index: true },
    { name: 'wpUrl', type: 'text' },
  ],
}

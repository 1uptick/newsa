import type { CollectionConfig } from 'payload'

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
    },
    {
      name: 'wpUrl',
      type: 'text',
      admin: { description: 'Original WordPress attachment URL' },
    },
  ],
  upload: {
    staticDir: process.env.MEDIA_DIR || 'media',
  },
}

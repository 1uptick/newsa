import type { CollectionConfig } from 'payload'

export const Categories: CollectionConfig = {
  slug: 'categories',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug'],
  },
  access: {
    read: () => true,
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    {
      name: 'seoDescription',
      type: 'textarea',
      label: 'SEO 描述',
      admin: { description: '留空則用「{分類}新聞及分析｜KongStocks」' },
    },
    { name: 'wpId', type: 'number', admin: { description: 'WordPress term id' } },
  ],
}

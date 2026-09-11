import type { GlobalConfig } from 'payload'
import { DEFAULT_THEME } from '@/design-system/tokens'

export const SiteSettings: GlobalConfig = {
  slug: 'theme',
  label: '設計系統 / 網站設定',
  admin: {
    group: 'Design',
    description: 'Highlight colors, header, density, and public navigation. Changes apply on the next page load.',
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: '品牌',
          fields: [
            { name: 'siteName', type: 'text', required: true, defaultValue: DEFAULT_THEME.siteName },
            { name: 'tagline', type: 'text', defaultValue: DEFAULT_THEME.tagline },
            { name: 'footerText', type: 'textarea', defaultValue: DEFAULT_THEME.footerText },
            {
              name: 'nav',
              type: 'array',
              labels: { singular: '連結', plural: '導覽' },
              fields: [
                { name: 'label', type: 'text', required: true },
                { name: 'href', type: 'text', required: true },
              ],
            },
          ],
        },
        {
          label: '顏色與密度',
          fields: [
            {
              name: 'accent',
              type: 'text',
              defaultValue: DEFAULT_THEME.accent,
              admin: { description: 'KongStocks highlight (live site --main-color-one #E3338F)' },
            },
            { name: 'headerBg', type: 'text', defaultValue: DEFAULT_THEME.headerBg },
            { name: 'background', type: 'text', defaultValue: DEFAULT_THEME.background },
            {
              name: 'density',
              type: 'select',
              defaultValue: 'compact',
              options: [
                { label: '緊湊 (Bloomberg)', value: 'compact' },
                { label: '舒適', value: 'comfortable' },
              ],
            },
          ],
        },
      ],
    },
  ],
}

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
              name: 'logo',
              type: 'upload',
              relationTo: 'media',
              label: 'Logo',
              admin: { description: 'Masthead mark. Transparent PNG recommended. Empty = /logo.png' },
            },
            {
              name: 'favicon',
              type: 'upload',
              relationTo: 'media',
              label: 'Favicon',
              admin: { description: 'Browser tab icon (PNG or ICO). Empty = /favicon.ico' },
            },
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
        {
          label: 'SEO / GEO',
          fields: [
            {
              name: 'seoDescription',
              type: 'textarea',
              defaultValue: DEFAULT_THEME.tagline,
              admin: { description: 'Default meta description when a page has no SEO 描述' },
            },
            {
              name: 'titleSuffix',
              type: 'text',
              defaultValue: ' · KongStocks',
              admin: { description: 'Appended to article/page titles that have no SEO 標題' },
            },
            {
              name: 'defaultOgImage',
              type: 'upload',
              relationTo: 'media',
              label: 'Default OG image',
            },
            {
              name: 'publisherBlurb',
              type: 'textarea',
              defaultValue:
                'KongStocks 提供港股新聞及深度分析。內容僅供參考，不構成投資建議。引用時請附文章標題及原文網址。',
              admin: { description: 'Shown in /llms.txt for generative engines' },
            },
          ],
        },
      ],
    },
  ],
}

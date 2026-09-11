import type { MetadataRoute } from 'next'
import { isStagingUrl, siteUrl } from '@/lib/seo'

export default function robots(): MetadataRoute.Robots {
  const sitemap = `${siteUrl()}/sitemap.xml`
  if (isStagingUrl()) {
    return {
      rules: { userAgent: '*', disallow: '/' },
      sitemap,
    }
  }

  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: ['/admin', '/api'] },
      { userAgent: 'GPTBot', allow: '/' },
      { userAgent: 'ClaudeBot', allow: '/' },
      { userAgent: 'PerplexityBot', allow: '/' },
      { userAgent: 'Google-Extended', allow: '/' },
    ],
    sitemap,
  }
}

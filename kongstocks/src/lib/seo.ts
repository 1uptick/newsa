import type { Metadata } from 'next'
import { getPayload } from 'payload'
import config from '@payload-config'
import { DEFAULT_THEME } from '@/design-system/tokens'
import { getTheme } from '@/lib/theme'
import { categoryName, displaySlug, postPath } from '@/lib/site'
import { firstBodyImage } from '@/lib/uploads'
import { resolveMediaPath } from '@/lib/media'

export const DEFAULT_SEO = {
  seoDescription: DEFAULT_THEME.tagline,
  titleSuffix: ' · KongStocks',
  publisherBlurb:
    'KongStocks 提供港股新聞及深度分析。內容僅供參考，不構成投資建議。引用時請附文章標題及原文網址。',
}

export type SeoSettings = {
  siteName: string
  tagline: string
  seoDescription: string
  titleSuffix: string
  publisherBlurb: string
  defaultOgImage?: string
  logoUrl?: string
}

export function siteUrl() {
  return (process.env.APP_URL || 'http://localhost:3010').replace(/\/$/, '')
}

export function isStagingUrl(url = siteUrl()) {
  return /staging|localhost|127\.0\.0\.1/i.test(url)
}

export function absoluteUrl(path = '/') {
  if (/^https?:\/\//i.test(path)) return path
  const base = siteUrl()
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${base}${suffix}`
}

export function truncateMeta(value: string, max = 160) {
  const text = value.replace(/\s+/g, ' ').trim()
  if (text.length <= max) return text
  return `${text.slice(0, max - 1).trim()}…`
}

export function mediaUrl(image: unknown): string | undefined {
  const path = resolveMediaPath(image)
  if (!path) return undefined
  if (/^https?:\/\//i.test(path)) return path
  return absoluteUrl(path)
}

function normalizeTitleSuffix(value?: string | null) {
  const trimmed = (value ?? DEFAULT_SEO.titleSuffix).trim()
  if (!trimmed) return DEFAULT_SEO.titleSuffix
  return ` ${trimmed}`
}

export function pageTitle(seoTitle: string | null | undefined, title: string, settings: SeoSettings) {
  if (seoTitle?.trim()) return seoTitle.trim()
  if (title === settings.siteName) return settings.siteName
  return `${title}${settings.titleSuffix}`
}

export function pageDescription(
  seoDescription: string | null | undefined,
  excerpt: string | null | undefined,
  title: string,
  settings: SeoSettings,
) {
  const raw = seoDescription?.trim() || excerpt?.trim() || `${title}｜${settings.siteName}`
  return truncateMeta(raw)
}

export async function getSeoSettings(): Promise<SeoSettings> {
  const theme = await getTheme()
  try {
    const payload = await getPayload({ config })
    const doc = (await payload.findGlobal({ slug: 'theme', depth: 1 })) as {
      seoDescription?: string | null
      titleSuffix?: string | null
      publisherBlurb?: string | null
      defaultOgImage?: unknown
    }
    return {
      siteName: theme.siteName,
      tagline: theme.tagline,
      seoDescription: doc.seoDescription?.trim() || theme.tagline || DEFAULT_SEO.seoDescription,
      titleSuffix: normalizeTitleSuffix(doc.titleSuffix),
      publisherBlurb: doc.publisherBlurb?.trim() || DEFAULT_SEO.publisherBlurb,
      defaultOgImage: mediaUrl(doc.defaultOgImage) || absoluteUrl('/og.png'),
      logoUrl: theme.logoUrl || '/logo.png',
    }
  } catch {
    return {
      siteName: theme.siteName,
      tagline: theme.tagline,
      seoDescription: theme.tagline || DEFAULT_SEO.seoDescription,
      titleSuffix: DEFAULT_SEO.titleSuffix,
      publisherBlurb: DEFAULT_SEO.publisherBlurb,
      defaultOgImage: absoluteUrl('/og.png'),
      logoUrl: theme.logoUrl || '/logo.png',
    }
  }
}

export function buildMetadata({
  title,
  description,
  path,
  image,
  type = 'website',
  publishedTime,
  modifiedTime,
  authors,
  section,
  settings,
}: {
  title: string
  description: string
  path: string
  image?: string
  type?: 'website' | 'article'
  publishedTime?: string
  modifiedTime?: string
  authors?: string[]
  section?: string
  settings: SeoSettings
}): Metadata {
  const url = absoluteUrl(path)
  const ogImage = image || settings.defaultOgImage
  return {
    metadataBase: new URL(siteUrl()),
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: {
      type,
      locale: 'zh_HK',
      siteName: settings.siteName,
      title,
      description,
      url,
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
      ...(type === 'article'
        ? {
            publishedTime,
            modifiedTime,
            authors,
            section,
          }
        : {}),
    },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  }
}

export function organizationJsonLd(settings: SeoSettings) {
  return {
    '@type': 'NewsMediaOrganization',
    name: settings.siteName,
    url: siteUrl(),
    description: settings.seoDescription,
    logo: settings.logoUrl ? absoluteUrl(settings.logoUrl) : absoluteUrl('/logo.png'),
  }
}

export function websiteJsonLd(settings: SeoSettings) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: settings.siteName,
    url: siteUrl(),
    description: settings.seoDescription,
    inLanguage: 'zh-Hant',
    publisher: organizationJsonLd(settings),
  }
}

export function newsArticleJsonLd({
  title,
  description,
  path,
  image,
  publishedAt,
  updatedAt,
  section,
  authorName,
  settings,
}: {
  title: string
  description: string
  path: string
  image?: string
  publishedAt?: string | null
  updatedAt?: string | null
  section?: string
  authorName?: string
  settings: SeoSettings
}) {
  const url = absoluteUrl(path)
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: title,
    description,
    url,
    mainEntityOfPage: url,
    inLanguage: 'zh-Hant',
    datePublished: publishedAt || undefined,
    dateModified: updatedAt || publishedAt || undefined,
    articleSection: section,
    image: image || settings.defaultOgImage,
    author: authorName
      ? { '@type': 'Person', name: authorName }
      : organizationJsonLd(settings),
    publisher: organizationJsonLd(settings),
  }
}

export function webPageJsonLd({
  title,
  description,
  path,
  settings,
}: {
  title: string
  description: string
  path: string
  settings: SeoSettings
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description,
    url: absoluteUrl(path),
    inLanguage: 'zh-Hant',
    isPartOf: { '@type': 'WebSite', name: settings.siteName, url: siteUrl() },
    publisher: organizationJsonLd(settings),
  }
}

export function collectionPageJsonLd({
  title,
  description,
  path,
  settings,
}: {
  title: string
  description: string
  path: string
  settings: SeoSettings
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title,
    description,
    url: absoluteUrl(path),
    inLanguage: 'zh-Hant',
    isPartOf: { '@type': 'WebSite', name: settings.siteName, url: siteUrl() },
    publisher: organizationJsonLd(settings),
  }
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  }
}

export function postSeo(post: {
  title: string
  slug?: string | null
  excerpt?: string | null
  bodyHtml?: string | null
  seoTitle?: string | null
  seoDescription?: string | null
  publishedAt: string
  updatedAt?: string
  heroImage?: unknown
  author?: unknown
  categories?: unknown
}, settings: SeoSettings) {
  const path = postPath(post.publishedAt, post.slug)
  const title = pageTitle(post.seoTitle, post.title, settings)
  const description = pageDescription(post.seoDescription, post.excerpt, post.title, settings)
  const author =
    post.author && typeof post.author === 'object' && 'name' in post.author
      ? String((post.author as { name: string }).name)
      : undefined
  const section = categoryName(post)
  const image = mediaUrl(post.heroImage) || firstBodyImage(post.bodyHtml)
  return {
    path,
    title,
    description,
    image,
    author,
    section,
    metadata: buildMetadata({
      title,
      description,
      path,
      image,
      type: 'article',
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      authors: author ? [author] : [settings.siteName],
      section,
      settings,
    }),
    jsonLd: [
      newsArticleJsonLd({
        title: post.seoTitle?.trim() || post.title,
        description,
        path,
        image,
        publishedAt: post.publishedAt,
        updatedAt: post.updatedAt,
        section,
        authorName: author,
        settings,
      }),
      breadcrumbJsonLd([
        { name: settings.siteName, path: '/' },
        ...(section ? [{ name: section, path: categoryPathFromPost(post) }] : []),
        { name: post.title, path },
      ]),
    ],
  }
}

function categoryPathFromPost(post: { categories?: unknown }) {
  const cats = post.categories
  if (!Array.isArray(cats) || !cats[0] || typeof cats[0] !== 'object') return '/category/hk'
  const first = cats[0] as { slug?: string }
  return first.slug ? `/category/${displaySlug(first.slug)}` : '/category/hk'
}

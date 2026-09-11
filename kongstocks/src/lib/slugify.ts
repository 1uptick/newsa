export function slugifyTitle(title: string): string {
  const ascii = title
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase()
  return ascii || `post-${Date.now()}`
}

export function ensureSlug<T extends { title?: string; slug?: string }>(data: T): T {
  if (data?.title && !data.slug) {
    return { ...data, slug: slugifyTitle(data.title) }
  }
  return data
}

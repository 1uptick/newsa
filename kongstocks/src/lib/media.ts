type MediaLike = {
  url?: string | null
  wpUrl?: string | null
}

export function resolveMediaPath(image: unknown): string | undefined {
  if (!image || typeof image === 'number' || typeof image === 'string') return undefined
  const media = image as MediaLike
  if (media.url) return media.url
  if (media.wpUrl) return media.wpUrl
  return undefined
}

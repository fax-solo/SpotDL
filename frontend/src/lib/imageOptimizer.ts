export function optimizeImageUrl(
  url: string | null,
  size: number = 320,
): string | null {
  if (!url) return null

  try {
    const parsed = new URL(url)

    // Spotify CDN: i.scdn.co, image-cdn-ak.spotifycdn.com, etc.
    if (parsed.hostname.includes('scdn.co') || parsed.hostname.includes('spotifycdn.com')) {
      parsed.searchParams.set('w', String(size))
      parsed.searchParams.set('h', String(size))
      parsed.searchParams.set('fit', 'crop')
      // Remove quality param to use default (usually 80-90)
      return parsed.toString()
    }

    // YouTube thumbnails: use lower resolution thumbnails by default
    if (parsed.hostname === 'i.ytimg.com') {
      // Default is hqdefault, use mqdefault for smaller size
      const pathMatch = parsed.pathname.match(/\/vi\/([^/]+)\//)
      if (pathMatch && size <= 320) {
        return `https://i.ytimg.com/vi/${pathMatch[1]}/mqdefault.jpg`
      }
    }
  } catch {
    // Invalid URL, return as-is
  }

  return url
}

export function preloadImage(url: string): void {
  const link = document.createElement('link')
  link.rel = 'preload'
  link.as = 'image'
  link.href = url
  document.head.appendChild(link)
}

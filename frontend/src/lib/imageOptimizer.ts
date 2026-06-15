export function optimizeImageUrl(
  url: string | null,
  _size: number = 320,
): string | null {
  return url
}

export function preloadImage(url: string): void {
  const link = document.createElement('link')
  link.rel = 'preload'
  link.as = 'image'
  link.href = url
  document.head.appendChild(link)
}

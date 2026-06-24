interface LyricsResult {
  plainLyrics: string | null
  syncedLyrics: string | null
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

async function fetchGenius(artist: string, title: string): Promise<string | null> {
  const slug = `${slugify(artist)}-${slugify(title)}`
  const urls = [
    `https://genius.com/${slug}-lyrics`,
    `https://genius.com/${slugify(artist)}-${slugify(title.replace(/\([^)]*\)/g, '').trim())}-lyrics`,
  ]

  for (const url of urls) {
    try {
      const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, {
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) continue
      const { contents } = await res.json()
      if (!contents) continue

      const html = typeof contents === 'string' ? contents : atob(contents)
      const divs = html.match(/<div[^>]*data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/gi)
      if (!divs) continue

      const lyrics = divs
        .map(d => d.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()

      if (lyrics) return lyrics
    } catch {
      continue
    }
  }
  return null
}

async function fetchMusixMatch(artist: string, title: string): Promise<string | null> {
  const artistSlug = slugify(artist)
  const titleSlug = slugify(title)
  const url = `https://www.musixmatch.com/lyrics/${artistSlug}/${titleSlug}`

  try {
    const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null

    const { contents } = await res.json()
    if (!contents) return null

    const html = typeof contents === 'string' ? contents : atob(contents)
    const match = html.match(/<p[^>]*class="mxm-lyrics__content[^"]*"[^>]*>([\s\S]*?)<\/p>/i)
    if (!match) return null

    return match[1]
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .trim()
  } catch {
    return null
  }
}

const fallbackCache = new Map<string, LyricsResult>()

export async function fetchLyricsFallback(artist: string, title: string): Promise<LyricsResult | null> {
  const key = `${artist}||${title}`
  const cached = fallbackCache.get(key)
  if (cached) return cached

  const lyrics = await fetchGenius(artist, title) || await fetchMusixMatch(artist, title)
  if (!lyrics) return null

  const result: LyricsResult = { plainLyrics: lyrics, syncedLyrics: null }
  fallbackCache.set(key, result)
  if (fallbackCache.size > 100) {
    const first = fallbackCache.keys().next().value
    if (first !== undefined) fallbackCache.delete(first)
  }
  return result
}

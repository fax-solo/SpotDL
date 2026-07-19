interface LyricsResult {
  plainLyrics: string | null
  syncedLyrics: string | null
}

function abortTimeoutMs(ms: number): AbortSignal {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms)
  }
  const controller = new AbortController()
  setTimeout(() => controller.abort(), ms)
  return controller.signal
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
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
      // Uses allorigins CORS proxy (third-party). For production, replace with
      // a self-hosted proxy or use the CF Pages proxy endpoint instead.
      const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, {
        signal: abortTimeoutMs(8000),
      })
      if (!res.ok) continue
      const body = await res.json()
      const contents = body?.contents
      if (typeof contents !== 'string') continue

      const divs = contents.match(/<div[^>]*data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/gi)
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
      signal: abortTimeoutMs(8000),
    })
    if (!res.ok) return null

    const body = await res.json()
    const contents = body?.contents
    if (typeof contents !== 'string') return null

    const match = contents.match(/<p[^>]*class="mxm-lyrics__content[^"]*"[^>]*>([\s\S]*?)<\/p>/i)
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

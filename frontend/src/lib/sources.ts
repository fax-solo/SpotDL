import { searchYouTube, getVideoInfo } from './youtubeClient'
import { apiUrl } from './apiConfig'

function titleMatches(expectedTitle: string, expectedArtist: string, foundTitle: string, foundAuthor?: string): boolean {
  const t = expectedTitle.toLowerCase().trim()
  const a = expectedArtist.toLowerCase().trim()
  const ft = foundTitle.toLowerCase().replace(/\([^)]*\)|\[[^\]]*\]/g, '').trim()
  const fa = (foundAuthor || '').toLowerCase().trim()

  if (t.length === 0) return true
  if (!ft.includes(t)) return false
  if (a.length === 0) return true
  return ft.includes(a) || fa.includes(a)
}

interface SourceSearchResult {
  url: string
  title: string
  artist?: string
  duration?: string
  audioUrl?: string | null
  thumbnail?: string | null
  source: string
}

interface SourceInfo {
  title: string
  author: string
  duration: string
  audioUrl: string | null
  thumbnail: string | null
}

async function callFunction(name: string, body: Record<string, unknown>) {
  const res = await fetch(apiUrl(`/api/${name}`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) return null
  return res.json()
}

async function searchSoundcloud(query: string): Promise<SourceSearchResult[]> {
  const data = await callFunction('soundcloud', { action: 'search', query })
  return data?.results || []
}

async function soundcloudInfo(url: string): Promise<SourceInfo | null> {
  const data = await callFunction('soundcloud', { action: 'info', url })
  return data
}

async function searchBandcamp(query: string): Promise<SourceSearchResult[]> {
  const data = await callFunction('bandcamp', { action: 'search', query })
  return data?.results || []
}

async function bandcampInfo(url: string): Promise<SourceInfo | null> {
  const data = await callFunction('bandcamp', { action: 'info', url })
  if (data?.audioUrl) return data
  return null
}

interface SourceResult {
  info: SourceInfo
  source: string
}

export async function findAudio(query: string, expectedTitle?: string, expectedArtist?: string): Promise<SourceResult> {
  const sources: { name: string; search: (q: string) => Promise<SourceSearchResult[]>; info: (url: string) => Promise<SourceInfo | null> }[] = [
    { name: 'youtube', search: performYouTubeSearch, info: performYouTubeInfo },
    { name: 'soundcloud', search: searchSoundcloud, info: soundcloudInfo },
    { name: 'bandcamp', search: searchBandcamp, info: bandcampInfo },
  ]

  for (const source of sources) {
    try {
      const results = await source.search(query)
      if (results.length === 0) continue

      for (const result of results) {
        let info: SourceInfo | null = null

        if (result.audioUrl) {
          info = { title: result.title, author: result.artist || '', duration: result.duration || '0', audioUrl: result.audioUrl, thumbnail: result.thumbnail || null }
        } else {
          info = await source.info(result.url)
        }

        if (info && info.audioUrl) {
          if (expectedTitle || expectedArtist) {
            if (titleMatches(expectedTitle || '', expectedArtist || '', info.title, info.author)) {
              return { info, source: source.name }
            }
            console.warn(`[sources] ${source.name} result "${info.title}" doesn't match "${expectedArtist} - ${expectedTitle}", trying next...`)
          } else {
            return { info, source: source.name }
          }
        }
      }
    } catch (err) {
      console.warn(`[sources] ${source.name} search failed:`, err)
    }
  }

  throw new Error('No audio found on any source. Try a direct YouTube or SoundCloud URL.')
}

export async function findAudioFromUrl(url: string): Promise<SourceResult> {
  // Direct YouTube URL
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    const info = await getVideoInfo(url)
    if (info.audioUrl) return { info, source: 'youtube' }
    throw new Error('No audio found for this YouTube video')
  }

  // Direct SoundCloud URL
  if (url.includes('soundcloud.com')) {
    const info = await soundcloudInfo(url)
    if (info?.audioUrl) return { info, source: 'soundcloud' }
    throw new Error('No audio found or track not downloadable on SoundCloud')
  }

  // Direct Bandcamp URL
  if (url.includes('bandcamp.com')) {
    const info = await bandcampInfo(url)
    if (info?.audioUrl) return { info, source: 'bandcamp' }
    throw new Error('No audio found for this Bandcamp page')
  }

  throw new Error('Unsupported URL')
}

async function performYouTubeSearch(query: string): Promise<SourceSearchResult[]> {
  const results = await searchYouTube(query)
  return results.map(r => ({ ...r, source: 'youtube' }))
}

async function performYouTubeInfo(url: string): Promise<SourceInfo | null> {
  try {
    const info = await getVideoInfo(url)
    return info
  } catch {
    return null
  }
}

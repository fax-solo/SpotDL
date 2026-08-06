import { getDeezerTrack, searchDeezer } from '../deezer'
import type { SourceInfo, SourceModule, SourceSearchResult } from './types'

export const deezerSource: SourceModule = {
  name: 'deezer',
  search: searchDeezerSource,
  info: deezerSourceInfo,
}

async function searchDeezerSource(query: string): Promise<SourceSearchResult[]> {
  const results = await searchDeezer(query)
  return results.map(r => ({
    url: String(r.id),
    title: r.title,
    artist: r.artist,
    duration: r.duration,
    audioUrl: r.audioUrl || r.preview || null,
    thumbnail: r.thumbnail,
    source: 'deezer',
    isPreview: r.isPreview,
  }))
}

async function deezerSourceInfo(url: string): Promise<SourceInfo | null> {
  const match = url.match(/deezer\.com\/track\/(\d+)/)
  let id: number | null = null
  if (match) {
    id = parseInt(match[1]!)
  } else {
    id = parseInt(url)
    if (isNaN(id)) return null
  }
  const track = await getDeezerTrack(id)
  if (!track) return null
  return {
    title: track.title,
    author: track.artist,
    duration: track.duration,
    audioUrl: track.audioUrl || track.preview || null,
    thumbnail: track.thumbnail,
    isrc: track.isrc,
    isPreview: track.isPreview,
  }
}

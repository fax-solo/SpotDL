import { callFunction } from './callFunction'
import type { SourceInfo, SourceModule, SourceSearchResult } from './types'

export const audiusSource: SourceModule = {
  name: 'audius',
  search: searchAudius,
  info: audiusInfo,
}

async function searchAudius(query: string): Promise<SourceSearchResult[]> {
  const data = await callFunction('audius', { action: 'search', query })
  return (data?.results || []).map((r: any) => ({
    url: r.id,
    title: r.title,
    artist: r.artist,
    duration: r.duration,
    audioUrl: r.audioUrl || null,
    thumbnail: r.thumbnail,
    source: 'audius',
  }))
}

async function audiusInfo(trackId: string): Promise<SourceInfo | null> {
  const data = await callFunction('audius', { action: 'info', id: trackId })
  if (data?.audioUrl) return data
  return null
}

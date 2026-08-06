import { callFunction } from './callFunction'
import type { SourceInfo, SourceModule, SourceSearchResult } from './types'

export const fmaSource: SourceModule = {
  name: 'fma',
  search: searchFma,
  info: fmaInfo,
}

async function searchFma(query: string): Promise<SourceSearchResult[]> {
  const data = await callFunction('fma', { action: 'search', query })
  return (data?.results || []).map((r: any) => ({
    url: r.id,
    title: r.title,
    artist: r.artist,
    duration: r.duration || '',
    audioUrl: r.audioUrl || null,
    thumbnail: r.thumbnail || null,
    source: 'fma',
  }))
}

async function fmaInfo(trackId: string): Promise<SourceInfo | null> {
  const data = await callFunction('fma', { action: 'info', id: trackId })
  if (data?.audioUrl) return data
  return null
}

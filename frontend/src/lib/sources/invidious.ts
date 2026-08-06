import { callFunction } from './callFunction'
import type { SourceInfo, SourceModule, SourceSearchResult } from './types'

export const invidiousSource: SourceModule = {
  name: 'invidious',
  search: searchInvidious,
  info: invidiousInfo,
}

async function searchInvidious(query: string): Promise<SourceSearchResult[]> {
  const data = await callFunction('invidious', { action: 'search', query })
  return (data?.results || []).map((r: any) => ({
    url: r.url || `https://youtube.com/watch?v=${r.videoId}`,
    title: r.title,
    artist: r.author,
    duration: r.duration,
    audioUrl: null,
    thumbnail: r.thumbnail,
    source: 'invidious',
  }))
}

async function invidiousInfo(url: string): Promise<SourceInfo | null> {
  const data = await callFunction('invidious', { action: 'info', url })
  if (data?.audioUrl) return data
  return null
}

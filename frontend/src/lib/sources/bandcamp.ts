import { callFunction } from './callFunction'
import type { SourceInfo, SourceModule, SourceSearchResult } from './types'

export const bandcampSource: SourceModule = {
  name: 'bandcamp',
  search: searchBandcamp,
  info: bandcampInfo,
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

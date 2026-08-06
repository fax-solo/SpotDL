import { getVideoInfo, searchYouTube } from '../youtubeClient'
import type { SourceInfo, SourceModule, SourceSearchResult } from './types'

export const youtubeSource: SourceModule = {
  name: 'youtube',
  search: performYouTubeSearch,
  info: performYouTubeInfo,
}

async function performYouTubeSearch(query: string): Promise<SourceSearchResult[]> {
  const results = await searchYouTube(query)
  return results.map(r => ({ ...r, source: 'youtube' }))
}

async function performYouTubeInfo(url: string): Promise<SourceInfo | null> {
  try {
    return await getVideoInfo(url)
  } catch {
    return null
  }
}

import { callFunction } from './callFunction'
import type { SourceInfo, SourceModule, SourceSearchResult } from './types'

export const soundcloudSource: SourceModule = {
  name: 'soundcloud',
  search: searchSoundcloud,
  info: soundcloudInfo,
}

async function searchSoundcloud(query: string): Promise<SourceSearchResult[]> {
  const data = await callFunction('soundcloud', { action: 'search', query })
  return data?.results || []
}

async function soundcloudInfo(url: string): Promise<SourceInfo | null> {
  const data = await callFunction('soundcloud', { action: 'info', url })
  if (data?.audioUrl) return data
  return null
}

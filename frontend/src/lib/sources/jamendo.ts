import { jamendoInfo, searchJamendo } from '../jamendo'
import type { SourceInfo, SourceModule, SourceSearchResult } from './types'

export const jamendoSource: SourceModule = {
  name: 'jamendo',
  search: searchJamendoSource,
  info: jamendoSourceInfo,
}

async function searchJamendoSource(query: string): Promise<SourceSearchResult[]> {
  return searchJamendo(query)
}

async function jamendoSourceInfo(trackId: string): Promise<SourceInfo | null> {
  return jamendoInfo(trackId)
}

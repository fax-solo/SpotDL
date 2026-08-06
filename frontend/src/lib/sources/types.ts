export interface SourceSearchResult {
  url: string
  title: string
  artist?: string
  duration?: string
  audioUrl?: string | null
  thumbnail?: string | null
  source: string
  isrc?: string | null
  isPreview?: boolean
}

export interface SourceInfo {
  title: string
  author: string
  duration: string
  audioUrl: string | null
  thumbnail: string | null
  isrc?: string | null
  isPreview?: boolean
}

export interface SourceModule {
  name: string
  search: (q: string) => Promise<SourceSearchResult[]>
  info: (url: string) => Promise<SourceInfo | null>
}

export class SourceError extends Error {
  type: string
  constructor(type: string, message: string) {
    super(message)
    this.name = 'SourceError'
    this.type = type
  }
}

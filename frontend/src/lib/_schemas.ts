export interface TrackMetadata {
  title: string
  artist: string
  album: string
  artwork_url: string | null
  url: string
  type: 'track'
  duration_ms?: number | null
  isrc?: string | null
}

export interface CollectionMetadata {
  collection_name: string
  collection_artwork: string | null
  collection_type: string
  tracks: TrackMetadata[]
}

export interface ErrorResponse {
  detail: string
  code?: string | null
}

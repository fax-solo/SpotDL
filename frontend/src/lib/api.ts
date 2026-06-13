const BASE_URL = import.meta.env.VITE_API_URL || ''

export interface TrackMeta {
  title: string
  artist: string
  album: string
  artwork_url: string | null
  url: string
  type: string
}

export interface CollectionMeta {
  collection_name: string
  collection_artwork: string | null
  collection_type: string
  tracks: TrackMeta[]
}

export interface MetadataResponse {
  ok: boolean
  data: TrackMeta | CollectionMeta
}

export async function fetchMetadata(url: string): Promise<MetadataResponse> {
  const res = await fetch(`${BASE_URL}/api/metadata?url=${encodeURIComponent(url)}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function downloadTrack(meta: { title: string; artist: string; album: string; artwork_url: string | null; url?: string }): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(`${BASE_URL}/api/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(meta),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  const filename = meta
    ? `${meta.artist} - ${meta.title}.mp3`.replace(/[/\\?%*:|"<>]/g, '_')
    : 'track.mp3'
  const blob = await res.blob()
  return { blob, filename }
}

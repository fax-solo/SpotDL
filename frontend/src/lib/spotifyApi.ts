import { getAccessToken } from './spotifyAuth'

const API = 'https://api.spotify.com/v1'

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

interface SpotifyArtist {
  name: string
}

interface SpotifyImage {
  url: string
  width: number
  height: number
}

interface SpotifyTrackItem {
  id: string
  name: string
  artists: SpotifyArtist[]
  album?: { name: string; images: SpotifyImage[] }
  external_urls: { spotify: string }
}

interface SpotifyAlbumItem extends SpotifyTrackItem {
  album: { name: string; images: SpotifyImage[]; album_type: string }
}

async function fetchWithAuth(url: string): Promise<any> {
  const token = getAccessToken()
  if (!token) throw new Error('Not authenticated')
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 401) {
    const { refreshToken } = await import('./spotifyAuth')
    const refreshed = await refreshToken()
    if (!refreshed) throw new Error('Session expired')
    const newToken = getAccessToken()
    const retry = await fetch(url, {
      headers: { Authorization: `Bearer ${newToken}` },
    })
    if (!retry.ok) throw new Error(`Spotify API error: ${retry.status}`)
    return retry.json()
  }
  if (!res.ok) throw new Error(`Spotify API error: ${res.status}`)
  return res.json()
}

function mapTrack(item: SpotifyTrackItem, artworkFallback?: string | null): TrackMeta {
  const artwork = item.album?.images?.[0]?.url || artworkFallback || null
  return {
    title: item.name,
    artist: item.artists.map(a => a.name).join(', '),
    album: item.album?.name || 'Unknown Album',
    artwork_url: artwork,
    url: item.external_urls?.spotify || `https://open.spotify.com/track/${item.id}`,
    type: 'track',
  }
}

export async function fetchTrack(id: string): Promise<TrackMeta> {
  const data: SpotifyAlbumItem = await fetchWithAuth(`${API}/tracks/${id}`)
  return mapTrack(data)
}

export async function fetchAlbum(id: string): Promise<CollectionMeta> {
  const data = await fetchWithAuth(`${API}/albums/${id}`)
  const collectionArtwork = data.images?.[0]?.url || null
  const tracks: TrackMeta[] = data.tracks.items.map((item: any) =>
    mapTrack({ ...item, album: { name: data.name, images: data.images } }, collectionArtwork)
  )
  return {
    collection_name: data.name,
    collection_artwork: collectionArtwork,
    collection_type: 'album',
    tracks,
  }
}

export async function fetchPlaylist(id: string): Promise<CollectionMeta> {
  const data = await fetchWithAuth(`${API}/playlists/${id}`)
  const collectionArtwork = data.images?.[0]?.url || null

  let allTracks: TrackMeta[] = []
  let nextUrl = `${API}/playlists/${id}/tracks?limit=100`

  while (nextUrl) {
    const page = await fetchWithAuth(nextUrl)
    for (const item of page.items) {
      const track = item.track
      if (!track || !track.id) continue
      const artwork = track.album?.images?.[0]?.url || collectionArtwork
      allTracks.push({
        title: track.name,
        artist: track.artists.map((a: any) => a.name).join(', '),
        album: track.album?.name || 'Unknown Album',
        artwork_url: artwork,
        url: track.external_urls?.spotify || `https://open.spotify.com/track/${track.id}`,
        type: 'track',
      })
    }
    nextUrl = page.next || null
  }

  return {
    collection_name: data.name,
    collection_artwork: collectionArtwork,
    collection_type: 'playlist',
    tracks: allTracks,
  }
}

import { getAccessToken } from './spotifyAuth'
import { apiUrl } from './apiConfig'

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
    if (!refreshed) throw new Error('Session expired — please login again')
    const newToken = getAccessToken()
    const retry = await fetch(url, {
      headers: { Authorization: `Bearer ${newToken}` },
    })
    if (!retry.ok) {
      const body = await retry.text().catch(() => '')
      throw new Error(`Spotify API error: ${retry.status}${body ? ` — ${body}` : ''}`)
    }
    return retry.json()
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Spotify API error: ${res.status}${body ? ` — ${body}` : ''}`)
  }
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

export interface PlaylistSummary {
  id: string
  name: string
  description: string
  image: string | null
  owner: string
  trackCount: number
}

interface ScraperSummary {
  id: string
  name: string
  image: string | null
}

export async function fetchPlaylistSummary(id: string): Promise<PlaylistSummary> {
  const res = await fetch(apiUrl('/.netlify/functions/spotify'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: `https://open.spotify.com/playlist/${id}`, summary: true }),
  })
  if (!res.ok) throw new Error('Failed to fetch playlist summary')
  const data: ScraperSummary = await res.json()
  return {
    id: data.id,
    name: data.name || 'Unknown',
    image: data.image || null,
    owner: 'Spotify',
    description: '',
    trackCount: 0,
  }
}

export async function fetchUserPlaylists(): Promise<PlaylistSummary[]> {
  const data = await fetchWithAuth(`${API}/me/playlists?limit=20`)
  return (data.items || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    description: p.description || '',
    image: p.images?.[0]?.url || null,
    owner: p.owner?.display_name || 'Unknown',
    trackCount: p.tracks?.total || 0,
  }))
}

export interface RecentTrack {
  id: string
  name: string
  artist: string
  album: string
  artwork_url: string | null
  played_at: string
  url: string
}

export async function fetchRecentlyPlayed(limit: number = 10): Promise<RecentTrack[]> {
  const data = await fetchWithAuth(`${API}/me/player/recently-played?limit=${limit}`)
  return (data.items || []).map((item: any) => {
    const t = item.track
    return {
      id: t.id,
      name: t.name,
      artist: t.artists.map((a: any) => a.name).join(', '),
      album: t.album?.name || 'Unknown',
      artwork_url: t.album?.images?.[0]?.url || null,
      played_at: item.played_at,
      url: t.external_urls?.spotify || `https://open.spotify.com/track/${t.id}`,
    }
  })
}

export interface RecommendationItem {
  id: string
  name: string
  type: 'track' | 'playlist'
  artist?: string
  image: string | null
  url: string
}

export async function fetchRecommendations(limit: number = 6): Promise<RecommendationItem[]> {
  const data = await fetchWithAuth(`${API}/recommendations?limit=${limit}&seed_genres=pop,rock,hip-hop`)
  return (data.tracks || []).map((t: any) => ({
    id: t.id,
    name: t.name,
    type: 'track' as const,
    artist: t.artists.map((a: any) => a.name).join(', '),
    image: t.album?.images?.[0]?.url || null,
    url: t.external_urls?.spotify || `https://open.spotify.com/track/${t.id}`,
  }))
}

export async function fetchFeaturedPlaylists(): Promise<PlaylistSummary[]> {
  const data = await fetchWithAuth(`${API}/browse/featured-playlists?limit=20`)
  return (data.playlists?.items || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    description: p.description || '',
    image: p.images?.[0]?.url || null,
    owner: p.owner?.display_name || 'Spotify',
    trackCount: p.tracks?.total || 0,
  }))
}

export interface PlaylistCategory {
  name: string
  playlists: PlaylistSummary[]
}

const CATEGORIES: { name: string; items: { id: string; name: string }[] }[] = [
  {
    name: 'Top Lists',
    items: [
      { id: '37i9dQZEVXbMDoHDwVN2tF', name: 'Global Top 50' },
      { id: '37i9dQZEVXbLRQDuF5jeBp', name: 'US Top 50' },
    ],
  },
  {
    name: 'Pop',
    items: [
      { id: '37i9dQZF1DXcBWIGoYBM5M', name: "Today's Top Hits" },
    ],
  },
  {
    name: 'Hip-Hop',
    items: [
      { id: '37i9dQZF1DX0XUsuxWHRQd', name: 'RapCaviar' },
    ],
  },
  {
    name: 'Rock',
    items: [
      { id: '37i9dQZF1DWXRqgorJj26U', name: 'Rock Classics' },
    ],
  },
  {
    name: 'Electronic',
    items: [
      { id: '37i9dQZF1DX4dyzvuaRJ0n', name: 'mint' },
    ],
  },
  {
    name: 'R&B',
    items: [
      { id: '37i9dQZF1DX4SBhb3fqCJd', name: 'RNB X' },
    ],
  },
  {
    name: 'Chill',
    items: [
      { id: '37i9dQZF1DX4sWSpwq3LiO', name: 'Peaceful Piano' },
      { id: '37i9dQZF1DWZd79rJ6a7lp', name: 'Sleep' },
    ],
  },
  {
    name: 'Classical',
    items: [
      { id: '37i9dQZF1DWWEJlAGA9gs0', name: 'Classical Essentials' },
    ],
  },
  {
    name: 'Workout',
    items: [
      { id: '37i9dQZF1DX76Wlfdnj7AP', name: 'Beast Mode' },
    ],
  },
]

export function getPlaylistCategories(): PlaylistCategory[] {
  return CATEGORIES.map(cat => ({
    name: cat.name,
    playlists: cat.items.map(item => ({
      id: item.id,
      name: item.name,
      description: '',
      image: null,
      owner: 'Spotify',
      trackCount: 0,
    })),
  }))
}

export async function enrichCategoryWithImages(category: PlaylistCategory): Promise<PlaylistCategory> {
  const enriched = await Promise.all(
    category.playlists.map(async (p) => {
      if (p.image) return p
      try {
        const data = await fetchPlaylistSummary(p.id)
        return { ...p, image: data.image }
      } catch {
        return p
      }
    })
  )
  return { ...category, playlists: enriched }
}

import { apiUrl } from './apiConfig'

export interface TrackMeta {
  title: string
  artist: string
  artist_id?: string | null
  album: string
  album_id?: string | null
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

export interface PlaylistSummary {
  id: string
  name: string
  description: string
  image: string | null
  owner: string
  trackCount: number
}

async function callSpotify(body: Record<string, unknown>): Promise<any> {
  const res = await fetch(apiUrl('/.netlify/functions/spotify'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || `Spotify function error: ${res.status}`)
  }
  return res.json()
}

export async function fetchTrack(id: string): Promise<TrackMeta> {
  return callSpotify({ url: `https://open.spotify.com/track/${id}` })
}

export async function fetchAlbum(id: string): Promise<CollectionMeta> {
  return callSpotify({ url: `https://open.spotify.com/album/${id}` })
}

export async function fetchPlaylist(id: string): Promise<CollectionMeta> {
  return callSpotify({ url: `https://open.spotify.com/playlist/${id}` })
}

export async function fetchPlaylistSummary(id: string): Promise<PlaylistSummary> {
  const data = await callSpotify({ url: `https://open.spotify.com/playlist/${id}`, summary: true })
  return {
    id: data.id,
    name: data.name || 'Unknown',
    image: data.image || null,
    owner: data.owner || 'Spotify',
    description: data.description || '',
    trackCount: data.track_count || 0,
  }
}

export interface SearchTrack {
  id: string
  title: string
  artist: string
  artist_id?: string | null
  album: string
  album_id?: string | null
  artwork_url: string | null
  url: string
  duration_ms?: number
}

export interface SearchArtist {
  id: string
  name: string
  image: string | null
  genres: string[]
  followers: number
  url: string
}

export interface SearchAlbum {
  id: string
  name: string
  artist: string
  image: string | null
  year: string | null
  url: string
}

export interface SearchResults {
  tracks: SearchTrack[]
  albums: SearchAlbum[]
  artists: SearchArtist[]
  playlists: any[]
  top_artist: SearchArtist | null
}

export interface ArtistDetails {
  id: string
  name: string
  image: string | null
  genres: string[]
  followers: number
  popularity: number
  top_tracks: SearchTrack[]
  albums: SearchAlbum[]
}

export async function searchSpotify(query: string, types: string = 'track,artist', limit: number = 8): Promise<SearchResults> {
  return callSpotify({ action: 'search', query, types, limit })
}

export async function fetchArtistDetails(id: string): Promise<ArtistDetails> {
  return callSpotify({ action: 'artist', id })
}

export async function fetchTrackDetails(id: string): Promise<SearchTrack> {
  return callSpotify({ action: 'track', id })
}

export interface YouTubeSearchTrack {
  videoId: string
  title: string
  url: string
  thumbnail?: string | null
}

export async function searchYouTubeTracks(query: string): Promise<YouTubeSearchTrack[]> {
  const res = await fetch(apiUrl('/.netlify/functions/youtube'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'music-search', query }),
  })
  if (!res.ok) return []
  const data = await res.json()
  const results = data.results || []
  return results.map((r: any) => ({
    videoId: r.videoId,
    title: r.title || 'Unknown',
    url: r.url || `https://music.youtube.com/watch?v=${r.videoId}`,
    thumbnail: r.thumbnail || `https://i.ytimg.com/vi/${r.videoId}/default.jpg`,
  }))
}

export interface PlaylistCategory {
  name: string
  playlists: PlaylistSummary[]
}

const CATEGORIES: { name: string; items: { id: string; name: string }[] }[] = [
  { name: 'Top Lists', items: [
    { id: '37i9dQZEVXbMDoHDwVN2tF', name: 'Global Top 50' },
    { id: '37i9dQZEVXbLRQDuF5jeBp', name: 'US Top 50' },
  ]},
  { name: 'Pop', items: [
    { id: '37i9dQZF1DXcBWIGoYBM5M', name: "Today's Top Hits" },
    { id: '37i9dQZF1DX4dyzvuaRJ0n', name: 'mint' },
  ]},
  { name: 'Hip-Hop', items: [
    { id: '37i9dQZF1DX0XUsuxWHRQd', name: 'RapCaviar' },
  ]},
  { name: 'Rock', items: [
    { id: '37i9dQZF1DWXRqgorJj26U', name: 'Rock Classics' },
  ]},
  { name: 'R&B', items: [
    { id: '37i9dQZF1DX4SBhb3fqCJd', name: 'RNB X' },
  ]},
  { name: 'Chill', items: [
    { id: '37i9dQZF1DX4sWSpwq3LiO', name: 'Peaceful Piano' },
    { id: '37i9dQZF1DWZd79rJ6a7lp', name: 'Sleep' },
  ]},
  { name: 'Classical', items: [
    { id: '37i9dQZF1DWWEJlAGA9gs0', name: 'Classical Essentials' },
  ]},
  { name: 'Workout', items: [
    { id: '37i9dQZF1DX76Wlfdnj7AP', name: 'Beast Mode' },
  ]},
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
      } catch { return p }
    })
  )
  return { ...category, playlists: enriched }
}

const WP_TOKEN_KEY = 'spotdl_web_player_token'

export function setWebPlayerToken(token: string): void {
  localStorage.setItem(WP_TOKEN_KEY, token)
}

export function getWebPlayerToken(): string | null {
  return localStorage.getItem(WP_TOKEN_KEY)
}

export function clearWebPlayerToken(): void {
  localStorage.removeItem(WP_TOKEN_KEY)
}

export async function testWebPlayerToken(token: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const hashes = await fetch(apiUrl('/.netlify/functions/spotify-partner'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'test-token', token }),
    })
    if (!hashes.ok) return { ok: false, error: `Function error: ${hashes.status}` }
    const result = await hashes.json()
    if (!result.ok) return { ok: false, error: result.error || 'Unknown error' }

    const test = await callPartner('search', { query: 'test', limit: 1, playerToken: token })
    if (test?.data?.searchV2) return { ok: true }
    return { ok: false, error: 'Token does not work with Partner API' }
  } catch (e: any) {
    return { ok: false, error: e.message }
  }
}

async function callPartner(action: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(apiUrl('/.netlify/functions/spotify-partner'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || `Partner API error: ${res.status}`)
  }
  return res.json()
}

export interface UserPlaylist {
  id: string
  name: string
  description: string
  image: string | null
  owner: string
  trackCount: number
}

export async function fetchUserPlaylists(playerToken: string): Promise<UserPlaylist[]> {
  const data = await callPartner('user-library', { playerToken })
  try {
    const items = data?.data?.me?.library?.items || []
    return items
      .filter((i: any) => i?.uri?.startsWith('spotify:playlist:'))
      .map((i: any) => ({
        id: i.uri.split(':')[2],
        name: i?.title || 'Unknown',
        description: i?.description || '',
        image: i?.images?.[0]?.url || i?.imageUrl || null,
        owner: i?.owner?.name || i?.subtitle || 'Spotify',
        trackCount: i?.trackCount || 0,
      }))
  } catch {
    return []
  }
}

export async function fetchSavedTracks(playerToken: string, limit = 50, offset = 0): Promise<any> {
  return callPartner('saved-tracks', { playerToken, limit, offset })
}

export async function partnerSearch(query: string, limit = 10, offset = 0, playerToken?: string): Promise<any> {
  return callPartner('search', { query, limit, offset, playerToken })
}

export async function partnerFetchPlaylist(playlistId: string, limit = 100, offset = 0, playerToken?: string): Promise<any> {
  return callPartner('playlist', { playlistId, limit, offset, playerToken })
}

export async function partnerFetchTrack(trackId: string, playerToken?: string): Promise<any> {
  return callPartner('track', { trackId, playerToken })
}

export async function getAnonymousPlayerToken(): Promise<string> {
  const data = await callPartner('get-token', {})
  return data.accessToken
}

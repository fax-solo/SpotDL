import { apiUrl } from './apiConfig'

const DEEZER_ARL_KEY = 'deezer_arl'
const DEEZER_QUALITY_KEY = 'deezer_quality'

// WARNING: Your Deezer ARL is a full-account credential.
// It is sent to the server to enable high-quality downloads.
// Only use this on servers you trust, over HTTPS.

export function getDeezerArl(): string | null {
  const raw = localStorage.getItem(DEEZER_ARL_KEY)
  if (!raw) return null
  return raw
}

export function setDeezerArl(arl: string): void {
  localStorage.setItem(DEEZER_ARL_KEY, arl)
}

export function clearDeezerArl(): void {
  localStorage.removeItem(DEEZER_ARL_KEY)
}

export type DeezerQuality = 'FLAC' | 'MP3'

export function getDeezerQuality(): DeezerQuality {
  const val = localStorage.getItem(DEEZER_QUALITY_KEY)
  return VALID_QUALITIES.includes(val as string) ? (val as DeezerQuality) : 'FLAC'
}

export function setDeezerQuality(quality: DeezerQuality): void {
  localStorage.setItem(DEEZER_QUALITY_KEY, quality)
}

export interface DeezerTrack {
  id: number
  title: string
  artist: string
  album: string
  duration: string
  isrc: string | null
  thumbnail: string | null
  preview: string | null
  audioUrl: string | null
  isPreview: boolean
  source: string
}

const VALID_QUALITIES = ['FLAC', 'MP3']
const DEEZER_ERROR_PREFIX = '[deezer]'

async function callFunction(body: Record<string, unknown>) {
  const res = await fetch(apiUrl('/api/deezer'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    console.warn(`${DEEZER_ERROR_PREFIX} HTTP ${res.status}:`, body.action)
    return null
  }
  return res.json()
}

export async function searchDeezer(query: string): Promise<DeezerTrack[]> {
  const data = await callFunction({ action: 'search', query })
  return data?.results || []
}

export async function getDeezerTrack(id: number): Promise<DeezerTrack | null> {
  const data = await callFunction({ action: 'track', id })
  return data
}

export async function searchDeezerByIsrc(isrc: string): Promise<DeezerTrack | null> {
  const data = await callFunction({ action: 'isrc', query: isrc })
  return data?.track || null
}

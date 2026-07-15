import { apiUrl } from './apiConfig'

const DEEZER_ARL_KEY = 'deezer_arl'
const DEEZER_QUALITY_KEY = 'deezer_quality'

export function getDeezerArl(): string | null {
  return localStorage.getItem(DEEZER_ARL_KEY)
}

export function setDeezerArl(arl: string): void {
  localStorage.setItem(DEEZER_ARL_KEY, arl)
}

export function clearDeezerArl(): void {
  localStorage.removeItem(DEEZER_ARL_KEY)
}

export type DeezerQuality = 'FLAC' | 'MP3'

export function getDeezerQuality(): DeezerQuality {
  return (localStorage.getItem(DEEZER_QUALITY_KEY) as DeezerQuality) || 'FLAC'
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

async function callFunction(body: Record<string, unknown>) {
  const res = await fetch(apiUrl('/api/deezer'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) return null
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

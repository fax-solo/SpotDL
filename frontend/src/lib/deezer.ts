import { Capacitor } from '@capacitor/core'
import { apiUrl } from './apiConfig'

const DEEZER_ARL_KEY = 'deezer_arl'
const DEEZER_QUALITY_KEY = 'deezer_quality'

// WARNING: Your Deezer ARL is a full-account credential.
// It is sent to the server to enable high-quality downloads.
// Only use this on servers you trust, over HTTPS.

type _SecureStore = { getItem: (k: string) => Promise<string | null>; setItem: (k: string, v: string) => Promise<void>; removeItem: (k: string) => Promise<void> }

let _secureStorage: _SecureStore | null = null

async function _getStorage(): Promise<_SecureStore> {
  if (_secureStorage) return _secureStorage
  if (Capacitor.isNativePlatform()) {
    try {
      const ss = (Capacitor as any).Plugins?.SecureStorage
      if (ss?.get && ss?.set && ss?.remove) {
        _secureStorage = {
          getItem: async (k: string) => {
            try { return (await ss.get({ key: k })).value } catch { return null }
          },
          setItem: async (k: string, v: string) => { await ss.set({ key: k, value: v }) },
          removeItem: async (k: string) => { await ss.remove({ key: k }) },
        }
        return _secureStorage
      }
    } catch {
      // plugin not available — fall through to localStorage
    }
  }
  _secureStorage = {
    getItem: async (k: string) => localStorage.getItem(k),
    setItem: async (k: string, v: string) => { localStorage.setItem(k, v) },
    removeItem: async (k: string) => { localStorage.removeItem(k) },
  }
  return _secureStorage
}

export async function getDeezerArl(): Promise<string | null> {
  const storage = await _getStorage()
  return storage.getItem(DEEZER_ARL_KEY)
}

export async function setDeezerArl(arl: string): Promise<void> {
  const storage = await _getStorage()
  await storage.setItem(DEEZER_ARL_KEY, arl)
}

export async function clearDeezerArl(): Promise<void> {
  const storage = await _getStorage()
  await storage.removeItem(DEEZER_ARL_KEY)
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

import { Capacitor, registerPlugin } from '@capacitor/core'

interface SpotDLPlugin {
  initialize(): Promise<{}>
  getStatus(): Promise<{
    initialized: boolean
    serverRunning: boolean
    port: number
    url: string
  }>
}

const SpotDL = registerPlugin<SpotDLPlugin>('SpotDL')
const LOCAL_URL = 'http://127.0.0.1:9182'

export async function isNativeSpotDLAvailable(): Promise<boolean> {
  try {
    if (!Capacitor.isNativePlatform()) return false
    const status = await SpotDL.getStatus()
    return status.serverRunning
  } catch {
    return false
  }
}

export async function initNativePlugin(): Promise<boolean> {
  try {
    if (!Capacitor.isNativePlatform()) return false
    await SpotDL.initialize()
    return true
  } catch {
    return false
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${LOCAL_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(err.error || `Server error: ${res.status}`)
  }
  return res.json()
}

export async function nativeFetchMetadata(
  url: string,
): Promise<Array<{ title: string; artist: string; album: string; artworkUrl: string | null; url: string }>> {
  const result = await post<{ tracks: Array<{ title: string; artist: string; album: string; artworkUrl: string | null; url: string }> }>('/metadata', { url })
  return result.tracks.map(t => ({
    title: t.title,
    artist: t.artist,
    album: t.album,
    artworkUrl: t.artworkUrl,
    url: t.url,
  }))
}

export async function nativeDownloadTrack(
  url: string,
  onProgress?: (pct: number, line: string) => void,
): Promise<{ filePath: string; filename: string }> {
  const result = await post<{ files: string[]; output_dir: string }>('/download', { url })
  onProgress?.(1, 'Complete')
  const file = result.files?.[0] || ''
  const filename = file.split('/').pop() || `${Date.now()}.mp3`
  const filePath = file ? `${result.output_dir}/${file}` : ''
  return { filePath, filename }
}

export async function checkServerHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${LOCAL_URL}/health`, { method: 'GET' })
    return res.ok
  } catch {
    return false
  }
}

import { Capacitor, registerPlugin } from '@capacitor/core'

interface SpotDLPlugin {
  initialize(): Promise<{}>
  getStatus(): Promise<{
    initialized: boolean
    serverRunning: boolean
    port: number
    url: string
  }>
  startDownloadForeground(options: { title?: string; count?: number }): Promise<{}>
  updateDownloadForeground(options: { title?: string; count?: number }): Promise<{}>
  stopDownloadForeground(): Promise<{}>
  startMediaForeground(options: { title?: string; artist?: string }): Promise<{}>
  updateMediaForeground(options: { title?: string; artist?: string }): Promise<{}>
  stopMediaForeground(): Promise<{}>
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

export async function startDownloadForeground(title: string = 'Downloading...', count: number = 1): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await SpotDL.startDownloadForeground({ title, count })
  } catch (e) {
    console.warn('[native] Failed to start download foreground:', e)
  }
}

export async function updateDownloadForeground(title: string, count: number): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await SpotDL.updateDownloadForeground({ title, count })
  } catch (e) {
    console.warn('[native] Failed to update download foreground:', e)
  }
}

export async function stopDownloadForeground(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await SpotDL.stopDownloadForeground()
  } catch (e) {
    console.warn('[native] Failed to stop download foreground:', e)
  }
}

export async function startMediaForeground(title: string = 'Playing', artist: string = ''): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await SpotDL.startMediaForeground({ title, artist })
  } catch (e) {
    console.warn('[native] Failed to start media foreground:', e)
  }
}

export async function updateMediaForeground(title: string, artist: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await SpotDL.updateMediaForeground({ title, artist })
  } catch (e) {
    console.warn('[native] Failed to update media foreground:', e)
  }
}

export async function stopMediaForeground(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await SpotDL.stopMediaForeground()
  } catch (e) {
    console.warn('[native] Failed to stop media foreground:', e)
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

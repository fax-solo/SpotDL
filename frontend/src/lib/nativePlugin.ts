import { Capacitor, registerPlugin } from '@capacitor/core'

interface LocalTrackResult {
  id: number
  title: string
  artist: string
  album: string
  path: string
  size: number
  mtime: number
}

interface Insets {
  left: number
  top: number
  right: number
  bottom: number
}

interface SpotDLPlugin {
  initialize(): Promise<{}>
  getStatus(): Promise<{
    initialized: boolean
    serverRunning: boolean
    port: number
    url: string
  }>
  checkPermission(options: { alias: string }): Promise<{ granted: boolean }>
  requestPermission(options: { alias: string }): Promise<{ granted: boolean }>
  shouldShowRationale(options: { alias: string }): Promise<{ show: boolean }>
  openAppSettings(): Promise<{}>
  getNavigationBarHeight(): Promise<{ height: number }>
  getStatusBarHeight(): Promise<{ height: number }>
  getDisplayCutoutInsets(): Promise<Insets>
  startDownloadForeground(options: { title?: string; count?: number }): Promise<{}>
  updateDownloadForeground(options: { title?: string; count?: number; progress?: number; stage?: string }): Promise<{}>
  stopDownloadForeground(): Promise<{}>
  sendCompleteNotification(options: { title: string; artist: string }): Promise<{}>
  sendErrorNotification(options: { title: string; artist: string; error?: string }): Promise<{}>
  startMediaForeground(options: { title?: string; artist?: string; artworkUrl?: string; position?: number; duration?: number; currentLyricLine?: string }): Promise<{}>
  updateMediaForeground(options: { title?: string; artist?: string; artworkUrl?: string; position?: number; duration?: number; currentLyricLine?: string }): Promise<{}>
  stopMediaForeground(): Promise<{}>
  scanLocalMusic(): Promise<{ tracks: LocalTrackResult[] }>
  checkMediaAudioPermission(): Promise<{ granted: boolean }>
  requestMediaAudioPermission(): Promise<{ granted: boolean }>
  saveToMusicLibrary(options: { url: string; filename: string; variant?: string }): Promise<{ filePath: string }>
  requestBatteryOptimizationExemption(): Promise<{ alreadyExempt: boolean }>
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

export async function updateDownloadForeground(title: string, count: number, progress?: number, stage?: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await SpotDL.updateDownloadForeground({ title, count, ...(progress !== undefined ? { progress } : {}), ...(stage !== undefined ? { stage } : {}) })
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

export async function nativeSendCompleteNotification(title: string, artist: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await SpotDL.sendCompleteNotification({ title, artist })
  } catch (e) {
    console.warn('[native] Failed to send complete notification:', e)
  }
}

export async function nativeSendErrorNotification(title: string, artist: string, error?: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await SpotDL.sendErrorNotification({ title, artist, ...(error !== undefined ? { error } : {}) })
  } catch (e) {
    console.warn('[native] Failed to send error notification:', e)
  }
}

export async function startMediaForeground(title: string = 'Playing', artist: string = '', artworkUrl?: string, position?: number, duration?: number, currentLyricLine?: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await SpotDL.startMediaForeground({
      title, artist,
      ...(artworkUrl !== undefined ? { artworkUrl } : {}),
      ...(position !== undefined ? { position } : {}),
      ...(duration !== undefined ? { duration } : {}),
      ...(currentLyricLine !== undefined ? { currentLyricLine } : {}),
    })
  } catch (e) {
    console.warn('[native] Failed to start media foreground:', e)
  }
}

export async function updateMediaForeground(title: string, artist: string, artworkUrl?: string, position?: number, duration?: number, currentLyricLine?: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await SpotDL.updateMediaForeground({
      title, artist,
      ...(artworkUrl !== undefined ? { artworkUrl } : {}),
      ...(position !== undefined ? { position } : {}),
      ...(duration !== undefined ? { duration } : {}),
      ...(currentLyricLine !== undefined ? { currentLyricLine } : {}),
    })
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

export async function checkPermissionNative(alias: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const result = await SpotDL.checkPermission({ alias })
    return result.granted
  } catch {
    return false
  }
}

export async function requestPermissionNative(alias: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const result = await SpotDL.requestPermission({ alias })
    return result.granted
  } catch {
    return false
  }
}

export async function shouldShowRationaleNative(alias: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const result = await SpotDL.shouldShowRationale({ alias })
    return result.show
  } catch {
    return false
  }
}

export async function openAppSettings(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await SpotDL.openAppSettings()
  } catch (e) {
    console.warn('[native] Failed to open app settings:', e)
  }
}

export async function requestBatteryOptimizationExemption(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const result = await SpotDL.requestBatteryOptimizationExemption()
    return result.alreadyExempt
  } catch (e) {
    console.warn('[native] Failed to request battery optimization exemption:', e)
    return false
  }
}

export async function getNavigationBarHeight(): Promise<number> {
  if (!Capacitor.isNativePlatform()) return 0
  try {
    const result = await SpotDL.getNavigationBarHeight()
    return result.height
  } catch {
    return 0
  }
}

export async function getStatusBarHeight(): Promise<number> {
  if (!Capacitor.isNativePlatform()) return 0
  try {
    const result = await SpotDL.getStatusBarHeight()
    return result.height
  } catch {
    return 0
  }
}

export async function getDisplayCutoutInsets(): Promise<Insets> {
  if (!Capacitor.isNativePlatform()) return { left: 0, top: 0, right: 0, bottom: 0 }
  try {
    return await SpotDL.getDisplayCutoutInsets()
  } catch {
    return { left: 0, top: 0, right: 0, bottom: 0 }
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${LOCAL_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(err.detail || `Server error: ${res.status}`)
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
  filename?: string,
  variant?: string,
): Promise<{ filePath: string; filename: string }> {
  onProgress?.(0.5, 'Downloading via native...')
  const result = await SpotDL.saveToMusicLibrary({
    url,
    filename: filename || `${Date.now()}.mp3`,
    ...(variant && variant !== 'normal' ? { variant } : {}),
  })
  onProgress?.(1, 'Complete')
  return { filePath: result.filePath, filename: filename || `${Date.now()}.mp3` }
}

export async function nativeScanLocalMusic(): Promise<LocalTrackResult[]> {
  if (!Capacitor.isNativePlatform()) return []
  try {
    const result = await SpotDL.scanLocalMusic()
    return result.tracks
  } catch {
    return []
  }
}

export async function checkServerHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${LOCAL_URL}/health`, { method: 'GET' })
    return res.ok
  } catch {
    return false
  }
}

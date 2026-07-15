import { Capacitor } from '@capacitor/core'
import { ensureNotificationPermission as ensurePerm } from './permissions'

type LocalNotificationsModule = {
  schedule: (options: {
    notifications: Array<{
      id?: number
      title: string
      body: string
      smallIcon?: string
      iconColor?: string
      sound?: string
      actionTypeId?: string
      schedule?: { at: Date; repeats?: boolean; every?: 'hour' | 'day' | 'week' | 'month' }
      extra?: Record<string, unknown>
      channelId?: string
    }>
  }) => Promise<{ notifications: Array<{ id: number }> }>
  cancel: (options: { notifications: Array<{ id: number }> }) => Promise<void>
  getPending: () => Promise<{ notifications: Array<{ id: number; title: string; body: string }> }>
  requestPermissions: () => Promise<{ display: 'granted' | 'denied' | 'prompt' }>
  registerActionTypes?: (options: { types: Array<unknown> }) => Promise<void>
  createChannel?: (options: {
    id: string
    name: string
    description?: string
    importance: 0 | 1 | 2 | 3 | 4 | 5
    visibility?: 0 | 1 | -1
    sound?: string
    lights?: boolean
    vibration?: boolean
  }) => Promise<void>
  deleteChannel?: (options: { id: string }) => Promise<void>
  listChannels?: () => Promise<{ channels: Array<{ id: string; name: string }> }>
}

let _ln: LocalNotificationsModule | null = null

async function getLN(): Promise<LocalNotificationsModule | null> {
  if (_ln) return _ln
  try {
    const mod = await import('@capacitor/local-notifications')
    _ln = mod.LocalNotifications as unknown as LocalNotificationsModule
    return _ln
  } catch {
    return null
  }
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  return ensurePerm()
}

export async function createNotificationChannels(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  const ln = await getLN()
  if (!ln?.createChannel) return
  try {
    await ln.createChannel({
      id: 'spotdl_downloads_complete',
      name: 'Download Complete',
      description: 'Alerts when a download finishes',
      importance: 4,
      lights: true,
      vibration: true,
    })
    await ln.createChannel({
      id: 'spotdl_downloads_error',
      name: 'Download Errors',
      description: 'Alerts when a download fails',
      importance: 5,
      lights: true,
      vibration: true,
    })
    await ln.createChannel({
      id: 'spotdl_media',
      name: 'Music Playback',
      description: 'Now playing notification with lock screen controls',
      importance: 2,
      lights: false,
      vibration: false,
    })
    await ln.createChannel({
      id: 'spotdl_downloads_progress',
      name: 'Download Progress',
      description: 'Shows download progress percentage',
      importance: 2,
      lights: false,
      vibration: false,
    })
  } catch {
    // best-effort
  }
}

export async function sendDownloadCompleteNotification(params: {
  title: string
  artist: string
  filePath?: string | null
}): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  const granted = await ensureNotificationPermission()
  if (!granted) return
  const ln = await getLN()
  if (!ln) return
  try {
    await ln.schedule({
      notifications: [{
        id: Date.now(),
        title: params.title,
        body: `${params.artist} — Download complete`,
        smallIcon: 'ic_stat_icon',
        iconColor: '#10B981',
        actionTypeId: 'DOWNLOAD_ACTIONS',
        channelId: 'spotdl_downloads_complete',
        extra: { filePath: params.filePath },
      }],
    })
  } catch (err) {
    console.warn('[notifications] Failed to send:', err)
  }
}

export async function sendDownloadErrorNotification(params: {
  title: string
  artist: string
  error?: string
}): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  const granted = await ensureNotificationPermission()
  if (!granted) return
  const ln = await getLN()
  if (!ln) return
  try {
    await ln.schedule({
      notifications: [{
        id: Date.now(),
        title: `Download failed: ${params.title}`,
        body: params.error ? `${params.artist} — ${params.error}` : `${params.artist} — Something went wrong`,
        smallIcon: 'ic_stat_icon',
        iconColor: '#EF4444',
        actionTypeId: 'DOWNLOAD_ACTIONS',
        channelId: 'spotdl_downloads_error',
        sound: undefined,
      }],
    })
  } catch (err) {
    console.warn('[notifications] Failed to send error:', err)
  }
}

function _downloadNotifId(downloadId: string): number {
  let hash = 0
  for (let i = 0; i < downloadId.length; i++) {
    hash = ((hash << 5) - hash + downloadId.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % 100000 + 10000
}

export async function sendDownloadProgressNotification(params: {
  downloadId: string
  title: string
  artist: string
  pct: number
}): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  const granted = await ensureNotificationPermission()
  if (!granted) return
  const ln = await getLN()
  if (!ln) return
  try {
    await ln.schedule({
      notifications: [{
        id: _downloadNotifId(params.downloadId),
        title: params.title,
        body: `${params.artist} — Downloading ${Math.round(params.pct)}%`,
        smallIcon: 'ic_stat_icon',
        iconColor: '#3B82F6',
        channelId: 'spotdl_downloads_progress',
        sound: undefined,
      }],
    })
  } catch {
    // best-effort
  }
}

export async function sendBatchCompleteNotification(params: {
  count: number
  failed?: number
}): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  const granted = await ensureNotificationPermission()
  if (!granted) return
  const ln = await getLN()
  if (!ln) return
  try {
    const msg = params.failed
      ? `${params.count} downloaded, ${params.failed} failed`
      : `${params.count} tracks downloaded successfully`
    await ln.schedule({
      notifications: [{
        id: Date.now(),
        title: 'Downloads complete',
        body: msg,
        smallIcon: 'ic_stat_icon',
        iconColor: '#10B981',
        actionTypeId: 'DOWNLOAD_ACTIONS',
        channelId: 'spotdl_downloads_complete',
        sound: undefined,
      }],
    })
  } catch (err) {
    console.warn('[notifications] Failed to send batch notification:', err)
  }
}

export async function sendBackgroundPlaybackNotification(params: {
  title: string
  artist: string
  artworkUrl?: string | null
}): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  const granted = await ensureNotificationPermission()
  if (!granted) return
  const ln = await getLN()
  if (!ln) return
  try {
    await ln.schedule({
      notifications: [{
        id: 9999,
        title: params.title,
        body: `${params.artist} • Playing`,
        smallIcon: 'ic_stat_icon',
        iconColor: '#10B981',
        actionTypeId: 'MEDIA_ACTIONS',
        channelId: 'spotdl_media',
        schedule: { at: new Date() },
      }],
    })
  } catch {
    // quietly ignore - this is best-effort
  }
}

export async function cancelBackgroundPlaybackNotification(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  const ln = await getLN()
  if (!ln) return
  try {
    await ln.cancel({ notifications: [{ id: 9999 }] })
  } catch {
    // ignore
  }
}

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
    }>
  }) => Promise<{ notifications: Array<{ id: number }> }>
  cancel: (options: { notifications: Array<{ id: number }> }) => Promise<void>
  getPending: () => Promise<{ notifications: Array<{ id: number; title: string; body: string }> }>
  requestPermissions: () => Promise<{ display: 'granted' | 'denied' | 'prompt' }>
  registerActionTypes?: (options: { types: Array<unknown> }) => Promise<void>
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
        sound: undefined,
      }],
    })
  } catch (err) {
    console.warn('[notifications] Failed to send error:', err)
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

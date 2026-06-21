import { Capacitor } from '@capacitor/core'

export interface PermissionInfo {
  key: string
  label: string
  description: string
  androidName: string
  type: 'normal' | 'dangerous'
  status: 'granted' | 'denied' | 'unknown'
}

let _cachedPermissions: PermissionInfo[] | null = null

async function getLocalNotificationsModule() {
  try {
    const mod = await import('@capacitor/local-notifications')
    return mod.LocalNotifications as {
      checkPermissions: () => Promise<{ display: string }>
      requestPermissions: () => Promise<{ display: string }>
    }
  } catch {
    return null
  }
}

export async function getPermissions(): Promise<PermissionInfo[]> {
  if (_cachedPermissions) return _cachedPermissions

  const isNative = Capacitor.isNativePlatform()
  const ln = isNative ? await getLocalNotificationsModule() : null

  let notifStatus: 'granted' | 'denied' | 'unknown' = 'unknown'
  if (ln) {
    try {
      const result = await ln.checkPermissions()
      notifStatus = result.display === 'granted' ? 'granted' : 'denied'
    } catch {
      notifStatus = 'unknown'
    }
  }

  const permissions: PermissionInfo[] = [
    {
      key: 'notifications',
      label: 'Notifications',
      description: 'Show download complete and error notifications',
      androidName: 'android.permission.POST_NOTIFICATIONS',
      type: 'dangerous',
      status: notifStatus,
    },
    {
      key: 'internet',
      label: 'Internet',
      description: 'Fetch track metadata and download audio',
      androidName: 'android.permission.INTERNET',
      type: 'normal',
      status: isNative ? 'granted' : 'unknown',
    },
    {
      key: 'storage',
      label: 'Storage (legacy)',
      description: 'Save downloads to Documents folder on Android 7–9',
      androidName: 'android.permission.WRITE_EXTERNAL_STORAGE',
      type: 'normal',
      status: isNative ? 'granted' : 'unknown',
    },
    {
      key: 'wake_lock',
      label: 'Wake Lock',
      description: 'Keep screen on during background audio playback',
      androidName: 'android.permission.WAKE_LOCK',
      type: 'normal',
      status: isNative ? 'granted' : 'unknown',
    },
    {
      key: 'foreground_service',
      label: 'Foreground Service',
      description: 'Keep downloads alive when app is in background',
      androidName: 'android.permission.FOREGROUND_SERVICE',
      type: 'normal',
      status: isNative ? 'granted' : 'unknown',
    },
    {
      key: 'foreground_service_media',
      label: 'Media Playback Service',
      description: 'Run audio playback as a foreground service',
      androidName: 'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
      type: 'normal',
      status: isNative ? 'granted' : 'unknown',
    },
    {
      key: 'vibrate',
      label: 'Vibrate',
      description: 'Haptic feedback when interacting with the app',
      androidName: 'android.permission.VIBRATE',
      type: 'normal',
      status: isNative ? 'granted' : 'unknown',
    },
    {
      key: 'exact_alarm',
      label: 'Exact Alarm',
      description: 'Schedule timed notifications precisely',
      androidName: 'android.permission.USE_EXACT_ALARM',
      type: 'normal',
      status: isNative ? 'granted' : 'unknown',
    },
    {
      key: 'boot_completed',
      label: 'Boot Completed',
      description: 'Restore scheduled notifications after device restart',
      androidName: 'android.permission.RECEIVE_BOOT_COMPLETED',
      type: 'normal',
      status: isNative ? 'granted' : 'unknown',
    },
  ]

  _cachedPermissions = permissions
  return permissions
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  const ln = await getLocalNotificationsModule()
  if (!ln) return false
  try {
    const result = await ln.requestPermissions()
    const granted = result.display === 'granted'
    // invalidate cache so next getPermissions() call refreshes
    _cachedPermissions = null
    return granted
  } catch {
    return false
  }
}

export async function openAppSettings(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    const { Browser } = await import('@capacitor/browser')
    // Opens the system app settings page on Android
    await Browser.open({ url: 'package:com.spotdl.app' })
  } catch {
    // Fallback: try intent URL directly
    window.location.href = 'intent://settings#Intent;action=android.settings.APPLICATION_DETAILS_SETTINGS;package=com.spotdl.app;end'
  }
}

export function isNative(): boolean {
  return Capacitor.isNativePlatform()
}

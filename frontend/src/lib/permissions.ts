import { Capacitor } from '@capacitor/core'

export interface PermissionDef {
  key: string
  label: string
  description: string
  androidName: string
  dangerous: boolean
}

export const ALL_PERMISSIONS: PermissionDef[] = [
  { key: 'notifications', label: 'Notifications', description: 'Show download complete and error notifications', androidName: 'android.permission.POST_NOTIFICATIONS', dangerous: true },
  { key: 'internet', label: 'Internet', description: 'Fetch track metadata and download audio', androidName: 'android.permission.INTERNET', dangerous: false },
  { key: 'storage', label: 'Storage', description: 'Save downloads to Documents folder', androidName: 'android.permission.WRITE_EXTERNAL_STORAGE', dangerous: false },
  { key: 'foreground_service', label: 'Background Downloads', description: 'Keep downloads alive when app is in background', androidName: 'android.permission.FOREGROUND_SERVICE', dangerous: false },
  { key: 'media_playback', label: 'Media Playback', description: 'Run audio playback as a foreground service', androidName: 'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK', dangerous: false },
  { key: 'wake_lock', label: 'Wake Lock', description: 'Keep screen on during playback', androidName: 'android.permission.WAKE_LOCK', dangerous: false },
  { key: 'vibrate', label: 'Vibrate', description: 'Haptic feedback when interacting', androidName: 'android.permission.VIBRATE', dangerous: false },
  { key: 'exact_alarm', label: 'Exact Alarm', description: 'Schedule timed notifications precisely', androidName: 'android.permission.USE_EXACT_ALARM', dangerous: false },
  { key: 'boot_completed', label: 'Boot Completed', description: 'Restore notifications after device restart', androidName: 'android.permission.RECEIVE_BOOT_COMPLETED', dangerous: false },
]

export async function requestPermission(key: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false

  if (key === 'notifications') {
    try {
      const mod = await import('@capacitor/local-notifications')
      const result = await mod.LocalNotifications.requestPermissions()
      return result.display === 'granted'
    } catch {
      return false
    }
  }

  // Normal permissions are auto-granted, but try opening system settings
  return false
}

export async function checkPermission(key: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false

  if (key === 'notifications') {
    try {
      const mod = await import('@capacitor/local-notifications')
      const result = await mod.LocalNotifications.checkPermissions()
      return result.display === 'granted'
    } catch {
      return false
    }
  }

  // Normal permissions are always granted on Android
  return true
}

export function isNative(): boolean {
  return Capacitor.isNativePlatform()
}

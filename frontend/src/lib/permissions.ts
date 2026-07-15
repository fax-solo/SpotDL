import { Capacitor } from '@capacitor/core'
import { checkPermissionNative, requestPermissionNative, shouldShowRationaleNative, openAppSettings } from './nativePlugin'

export interface PermissionDef {
  key: string
  label: string
  description: string
  androidName: string
  dangerous: boolean
  nativeAlias?: string
}

export const RUNTIME_PERMISSIONS: PermissionDef[] = [
  { key: 'notifications', label: 'Notifications', description: 'Show download complete and error notifications', androidName: 'android.permission.POST_NOTIFICATIONS', dangerous: true, nativeAlias: 'postNotifications' },
  { key: 'media_audio', label: 'Music Library', description: 'Read audio files from your device', androidName: 'android.permission.READ_MEDIA_AUDIO', dangerous: true, nativeAlias: 'mediaAudio' },
  { key: 'media_images', label: 'Images', description: 'Read album artwork from your device', androidName: 'android.permission.READ_MEDIA_IMAGES', dangerous: true, nativeAlias: 'mediaImages' },
  { key: 'exact_alarm', label: 'Exact Alarm', description: 'Schedule precise timed notifications', androidName: 'android.permission.USE_EXACT_ALARM', dangerous: false, nativeAlias: 'scheduleExactAlarm' },
]

export const MANIFEST_PERMISSIONS: PermissionDef[] = [
  { key: 'internet', label: 'Internet', description: 'Fetch track metadata and download audio', androidName: 'android.permission.INTERNET', dangerous: false },
  { key: 'foreground_service', label: 'Background Downloads', description: 'Keep downloads alive when app is in background', androidName: 'android.permission.FOREGROUND_SERVICE', dangerous: false },
  { key: 'media_playback', label: 'Media Playback', description: 'Run audio playback as a foreground service', androidName: 'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK', dangerous: false },
  { key: 'wake_lock', label: 'Wake Lock', description: 'Keep screen on during playback', androidName: 'android.permission.WAKE_LOCK', dangerous: false },
  { key: 'vibrate', label: 'Vibrate', description: 'Haptic feedback when interacting', androidName: 'android.permission.VIBRATE', dangerous: false },
  { key: 'boot_completed', label: 'Boot Completed', description: 'Restore notifications after device restart', androidName: 'android.permission.RECEIVE_BOOT_COMPLETED', dangerous: false },
  { key: 'storage', label: 'Storage', description: 'Save downloads to Documents folder', androidName: 'android.permission.WRITE_EXTERNAL_STORAGE', dangerous: false },
]

export const ALL_PERMISSIONS: PermissionDef[] = [...RUNTIME_PERMISSIONS, ...MANIFEST_PERMISSIONS]

export type PermissionRationaleResult = 'granted' | 'denied' | 'permanently_denied'

export async function requestPermission(key: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  const def = RUNTIME_PERMISSIONS.find(p => p.key === key)
  if (!def || !def.nativeAlias) return false

  if (key === 'notifications') {
    try {
      const mod = await import('@capacitor/local-notifications')
      const result = await mod.LocalNotifications.requestPermissions()
      return result.display === 'granted'
    } catch {
      return false
    }
  }

  return requestPermissionNative(def.nativeAlias)
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

  const def = RUNTIME_PERMISSIONS.find(p => p.key === key)
  if (def?.nativeAlias) {
    return checkPermissionNative(def.nativeAlias)
  }

  return true
}

export async function shouldShowRationale(key: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  const def = RUNTIME_PERMISSIONS.find(p => p.key === key)
  if (!def?.nativeAlias) return false
  return shouldShowRationaleNative(def.nativeAlias)
}

const _permissionFlags = new Map<string, boolean>()

function getPermissionFlag(key: string): boolean {
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem(`permission_requested_${key}`) === '1'
  }
  return _permissionFlags.get(key) ?? false
}

function setPermissionFlag(key: string) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(`permission_requested_${key}`, '1')
  }
  _permissionFlags.set(key, true)
}

export function _resetPermissionFlagsForTest() {
  _permissionFlags.clear()
  if (typeof localStorage !== 'undefined') {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k?.startsWith('permission_requested_')) {
        localStorage.removeItem(k)
      }
    }
  }
}
export function _setPermissionFlagForTest(key: string) {
  _permissionFlags.set(key, true)
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(`permission_requested_${key}`, '1')
  }
}

export async function requestPermissionWithRationale(key: string): Promise<PermissionRationaleResult> {
  const granted = await checkPermission(key)
  if (granted) return 'granted'

  if (!getPermissionFlag(key)) {
    setPermissionFlag(key)
    const result = await requestPermission(key)
    return result ? 'granted' : 'denied'
  }

  const showRationale = await shouldShowRationale(key)
  if (showRationale) {
    const result = await requestPermission(key)
    return result ? 'granted' : 'denied'
  }

  return 'permanently_denied'
}

export function isNative(): boolean {
  return Capacitor.isNativePlatform()
}

export function requiresRuntimePermission(key: string): boolean {
  return RUNTIME_PERMISSIONS.some(p => p.key === key)
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  const granted = await checkPermission('notifications')
  if (granted) return true
  return requestPermission('notifications')
}

export { openAppSettings }

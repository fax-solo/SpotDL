import { Capacitor } from '@capacitor/core'

type PushNotificationsModule = {
  register: () => Promise<void>
  getDeliveredNotifications: () => Promise<{ notifications: Array<{ id: string; title: string; body: string }> }>
  removeDeliveredNotifications: (options: { notifications: Array<{ id: string }> }) => Promise<void>
  requestPermissions: () => Promise<{ receive: 'granted' | 'denied' | 'prompt' }>
  checkPermissions: () => Promise<{ receive: 'granted' | 'denied' | 'prompt' }>
}

let _pn: PushNotificationsModule | null = null

async function getPN(): Promise<PushNotificationsModule | null> {
  if (_pn) return _pn
  try {
    const mod = await import('@capacitor/push-notifications')
    _pn = mod.PushNotifications as unknown as PushNotificationsModule
    return _pn
  } catch {
    return null
  }
}

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null

  const pn = await getPN()
  if (!pn) return null

  try {
    const permResult = await pn.checkPermissions()
    if (permResult.receive === 'prompt') {
      const reqResult = await pn.requestPermissions()
      if (reqResult.receive !== 'granted') return null
    } else if (permResult.receive !== 'granted') {
      return null
    }

    await pn.register()
    return await getPushTokenFromBridge(pn)
  } catch {
    return null
  }
}

async function getPushTokenFromBridge(pn: PushNotificationsModule): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    const timeout = setTimeout(() => resolve(null), 10000)

    try {
      const anyPn = pn as any
      anyPn.addListener('registration', (token: { value: string }) => {
        clearTimeout(timeout)
        resolve(token.value)
      }).catch(() => {})

      anyPn.addListener('registrationError', () => {
        clearTimeout(timeout)
        resolve(null)
      }).catch(() => {})
    } catch {
      clearTimeout(timeout)
      resolve(null)
    }
  })
}

export async function sendPushTokenToServer(token: string): Promise<boolean> {
  try {
    const res = await fetch('/api/fcm/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    return res.ok
  } catch {
    return false
  }
}

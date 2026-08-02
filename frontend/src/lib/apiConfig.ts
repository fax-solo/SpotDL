import { Capacitor } from '@capacitor/core'

const PRODUCTION_API = 'https://spotify-downloader-5v5.pages.dev'

export function getApiBase(): string {
  const envUrl = import.meta.env.VITE_API_URL
  if (envUrl) return envUrl

  if (Capacitor.isNativePlatform()) {
    return PRODUCTION_API
  }

  return ''
}

export function apiUrl(path: string): string {
  const base = getApiBase()
  return `${base}${path}`
}

export async function checkApiReachability(timeoutMs = 5000): Promise<boolean> {
  const base = getApiBase()
  if (!base) return true
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(`${base}/api/ping`, { signal: controller.signal })
      return res.ok
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return false
  }
}

export function networkErrorText(): string {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return "You're offline. Connect to the internet and try again."
  }
  const base = getApiBase()
  if (base) {
    console.warn(`[api] Backend unreachable at ${base}`)
    return `Cannot reach the server at ${base}. The app's backend may be temporarily down.`
  }
  console.warn('[api] Backend unreachable (same-origin API)')
  return "Cannot reach the server. The app's backend may be temporarily down."
}

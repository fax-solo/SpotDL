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

import { Capacitor } from '@capacitor/core'

export function getApiBase(): string {
  const envUrl = import.meta.env.VITE_API_URL
  if (envUrl) return envUrl
  
  if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
    return 'https://spotify-downloader-5v5.pages.dev'
  }
  
  return ''
}

export function apiUrl(path: string): string {
  const base = getApiBase()
  return `${base}${path}`
}

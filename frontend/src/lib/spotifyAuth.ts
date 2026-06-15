import { apiUrl } from './apiConfig'

export interface SpotifyUserProfile {
  id: string
  display_name: string
  email: string
  images: { url: string; width: number; height: number }[]
  product: string
}

function getStored(): { access_token?: string; refresh_token?: string; expires_at?: number } {
  try {
    return JSON.parse(sessionStorage.getItem('spotifyAuth') || '{}')
  } catch {
    return {}
  }
}

function store(data: { access_token: string; refresh_token?: string; expires_in: number }) {
  sessionStorage.setItem('spotifyAuth', JSON.stringify({
    access_token: data.access_token,
    refresh_token: data.refresh_token || '',
    expires_at: Date.now() + data.expires_in * 1000,
  }))
}

function clearStored() {
  sessionStorage.removeItem('spotifyAuth')
}

function getStoredProfile(): SpotifyUserProfile | null {
  try {
    return JSON.parse(localStorage.getItem('spotifyProfile') || 'null')
  } catch {
    return null
  }
}

function storeProfile(profile: SpotifyUserProfile) {
  localStorage.setItem('spotifyProfile', JSON.stringify(profile))
}

function clearStoredProfile() {
  localStorage.removeItem('spotifyProfile')
}

export async function fetchUserProfile(): Promise<SpotifyUserProfile> {
  const token = getAccessToken()
  if (!token) throw new Error('Not authenticated')
  const res = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Failed to fetch profile')
  const data = await res.json()
  const profile: SpotifyUserProfile = {
    id: data.id,
    display_name: data.display_name || data.id,
    email: data.email || '',
    images: data.images || [],
    product: data.product || 'free',
  }
  storeProfile(profile)
  return profile
}

export function getCachedProfile(): SpotifyUserProfile | null {
  return getStoredProfile()
}

export function login() {
  const origin = window.location.origin
  window.location.href = `${origin}/.netlify/functions/spotify-auth?action=login&origin=${encodeURIComponent(origin)}`
}

export async function exchangeCode(code: string, redirectUri: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(apiUrl('/.netlify/functions/spotify-auth'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, redirect_uri: redirectUri }),
    })
    if (!res.ok) {
      clearStored()
      clearStoredProfile()
      const errBody = await res.json().catch(() => ({}))
      return { ok: false, error: errBody.detail || errBody.error || `HTTP ${res.status}` }
    }
    const data = await res.json()
    store(data)
    const profileOk = await fetchUserProfile().then(() => true).catch(() => false)
    if (!profileOk) {
      return { ok: true, error: 'Token acquired but Spotify API requires Premium for the app owner.' }
    }
    return { ok: true }
  } catch (err) {
    clearStored()
    clearStoredProfile()
    return { ok: false, error: 'Network error: ' + (err instanceof Error ? err.message : 'failed to reach function server') }
  }
}

export async function refreshToken(): Promise<boolean> {
  const stored = getStored()
  if (!stored.refresh_token) return false

  try {
    const res = await fetch(apiUrl('/.netlify/functions/spotify-auth'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: stored.refresh_token }),
    })
    if (!res.ok) {
      clearStored()
      clearStoredProfile()
      return false
    }
    const data = await res.json()
    const finalData = { ...data, refresh_token: data.refresh_token || stored.refresh_token }
    store({ ...finalData, expires_in: data.expires_in })
    return true
  } catch {
    clearStored()
    clearStoredProfile()
    return false
  }
}

export function getAccessToken(): string | null {
  const stored = getStored()
  if (!stored.access_token) return null
  if (stored.expires_at && Date.now() >= stored.expires_at) {
    return null
  }
  return stored.access_token
}

export function getRefreshToken(): string | null {
  const stored = getStored()
  return stored.refresh_token || null
}

export function isAuthenticated(): boolean {
  return !!getAccessToken()
}

export function logout() {
  clearStored()
  clearStoredProfile()
}

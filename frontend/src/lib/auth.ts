import { apiUrl } from './apiConfig'

const TIMEOUT_MS = 8000

async function fetchWithTimeout(url: string, options: RequestInit & { timeout?: number } = {}): Promise<Response> {
  const { timeout = TIMEOUT_MS, ...fetchOptions } = options
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(url, { ...fetchOptions, signal: controller.signal })
    return res
  } finally {
    clearTimeout(id)
  }
}

async function parseJson(res: Response): Promise<any> {
  const ct = res.headers.get('content-type') || ''
  if (!ct.includes('application/json')) {
    const body = await res.text().catch(() => '')
    throw new Error(`Expected JSON but got ${ct || 'no content-type'} (status ${res.status})${body ? ': ' + body.slice(0, 200) : ''}`)
  }
  return res.json()
}

export interface UserProfile {
  id: string
  username?: string | null
  email?: string | null
  display_name?: string | null
  avatar_url?: string | null
  role: string
  auth_provider: string
  is_guest?: boolean
  created_at?: string | null
  last_active?: string | null
}

interface AuthResponse {
  token: string
  user: UserProfile
}

function getToken(): string | null {
  return localStorage.getItem('sinc_token')
}

function setToken(token: string | null) {
  if (token) {
    localStorage.setItem('sinc_token', token)
  } else {
    localStorage.removeItem('sinc_token')
  }
}

function authHeaders(): HeadersInit {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function signup(email: string, password: string, displayName?: string, username?: string): Promise<AuthResponse> {
  const res = await fetchWithTimeout(apiUrl('/api/auth/signup'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, display_name: displayName, username }),
  })
  if (!res.ok) {
    const err = await parseJson(res).catch(() => ({ detail: `Signup failed (${res.status})` }))
    throw new Error(err.detail || 'Signup failed')
  }
  const data = await parseJson(res)
  setToken(data.token)
  return data
}

export async function login(login: string, password: string): Promise<AuthResponse> {
  const res = await fetchWithTimeout(apiUrl('/api/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login, password }),
  })
  if (!res.ok) {
    const err = await parseJson(res).catch(() => ({ detail: `Login failed (${res.status})` }))
    throw new Error(err.detail || 'Login failed')
  }
  const data = await parseJson(res)
  setToken(data.token)
  return data
}

export async function googleAuth(idToken: string, displayName?: string): Promise<AuthResponse> {
  const res = await fetchWithTimeout(apiUrl('/api/auth/google'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id_token: idToken, display_name: displayName }),
  })
  if (!res.ok) {
    const err = await parseJson(res).catch(() => ({ detail: `Google auth failed (${res.status})` }))
    throw new Error(err.detail || 'Google auth failed')
  }
  const data = await parseJson(res)
  setToken(data.token)
  return data
}

export async function googleCodeAuth(code: string, codeVerifier: string, redirectUri: string, displayName?: string): Promise<AuthResponse> {
  const res = await fetchWithTimeout(apiUrl('/api/auth/google'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: codeVerifier, redirect_uri: redirectUri, display_name: displayName }),
  })
  if (!res.ok) {
    const err = await parseJson(res).catch(() => ({ detail: `Google auth failed (${res.status})` }))
    throw new Error(err.detail || 'Google auth failed')
  }
  const data = await parseJson(res)
  setToken(data.token)
  return data
}

export async function guestLogin(deviceId: string): Promise<AuthResponse> {
  const res = await fetchWithTimeout(apiUrl('/api/auth/guest'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: deviceId }),
  })
  if (!res.ok) {
    const err = await parseJson(res).catch(() => ({ detail: `Guest login failed (${res.status})` }))
    throw new Error(err.detail || 'Guest login failed')
  }
  const data = await parseJson(res)
  setToken(data.token)
  return data
}

export async function getMe(): Promise<UserProfile | null> {
  try {
    const token = getToken()
    if (!token) return null
    const res = await fetchWithTimeout(apiUrl('/api/auth/me'), {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      setToken(null)
      return null
    }
    return parseJson(res)
  } catch (err) {
    console.error('getMe error:', err)
    return null
  }
}

export async function updateProfile(displayName: string): Promise<UserProfile> {
  const res = await fetchWithTimeout(apiUrl('/api/auth/profile'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ display_name: displayName }),
  })
  if (!res.ok) throw new Error('Failed to update profile')
  return parseJson(res)
}

export async function uploadAvatar(file: File): Promise<{ avatar_url: string }> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetchWithTimeout(apiUrl('/api/auth/avatar'), {
    method: 'POST',
    headers: authHeaders(),
    body: form,
    timeout: 15000,
  })
  if (!res.ok) {
    const err = await parseJson(res).catch(() => ({ detail: 'Upload failed' }))
    throw new Error(err.detail || 'Upload failed')
  }
  return parseJson(res)
}

export async function getHistory(limit = 100, offset = 0) {
  const res = await fetchWithTimeout(apiUrl(`/api/auth/history?limit=${limit}&offset=${offset}`), {
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error('Failed to fetch history')
  return parseJson(res)
}

export async function addHistory(entry: {
  title: string
  artist: string
  album?: string
  artwork_url?: string | null
  duration_ms?: number | null
  isrc?: string | null
}) {
  const res = await fetchWithTimeout(apiUrl('/api/auth/history'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(entry),
  })
  if (!res.ok) throw new Error('Failed to save history')
  return parseJson(res)
}

export async function deleteHistory(id: string) {
  const res = await fetchWithTimeout(apiUrl(`/api/auth/history/${id}`), {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error('Failed to delete history entry')
  return parseJson(res)
}

export async function clearAllHistory() {
  const res = await fetchWithTimeout(apiUrl('/api/auth/history'), {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error('Failed to clear history')
  return parseJson(res)
}

export async function logDownload(trackTitle: string, trackArtist: string, quality?: string, source?: string) {
  try {
    await fetchWithTimeout(apiUrl('/api/download/log'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ track_title: trackTitle, track_artist: trackArtist, quality: quality || null, source: source || null }),
    })
  } catch {}
}

export function isAuthenticated(): boolean {
  return !!getToken()
}

export function logout() {
  setToken(null)
  localStorage.removeItem('sinc_user')
}

export function getStoredUser(): UserProfile | null {
  try {
    const raw = localStorage.getItem('sinc_user')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function storeUser(user: UserProfile) {
  localStorage.setItem('sinc_user', JSON.stringify(user))
}

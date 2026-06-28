import { apiUrl } from './apiConfig'

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

export async function signup(email: string, password: string, displayName?: string): Promise<AuthResponse> {
  const res = await fetch(apiUrl('/api/auth/signup'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, display_name: displayName }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Signup failed' }))
    throw new Error(err.detail || 'Signup failed')
  }
  const data = await res.json()
  setToken(data.token)
  return data
}

export async function login(login: string, password: string): Promise<AuthResponse> {
  const res = await fetch(apiUrl('/api/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login, password }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Login failed' }))
    throw new Error(err.detail || 'Login failed')
  }
  const data = await res.json()
  setToken(data.token)
  return data
}

export async function googleAuth(idToken: string, displayName?: string): Promise<AuthResponse> {
  const res = await fetch(apiUrl('/api/auth/google'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id_token: idToken, display_name: displayName }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Google auth failed' }))
    throw new Error(err.detail || 'Google auth failed')
  }
  const data = await res.json()
  setToken(data.token)
  return data
}

export async function guestLogin(deviceId: string): Promise<AuthResponse> {
  const res = await fetch(apiUrl('/api/auth/guest'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: deviceId }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Guest login failed' }))
    throw new Error(err.detail || 'Guest login failed')
  }
  const data = await res.json()
  setToken(data.token)
  return data
}

export async function getMe(): Promise<UserProfile | null> {
  try {
    const token = getToken()
    if (!token) return null
    const res = await fetch(apiUrl('/api/auth/me'), {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      setToken(null)
      return null
    }
    return res.json()
  } catch {
    return null
  }
}

export async function updateProfile(displayName: string): Promise<UserProfile> {
  const res = await fetch(apiUrl('/api/auth/profile'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ display_name: displayName }),
  })
  if (!res.ok) throw new Error('Failed to update profile')
  return res.json()
}

export async function uploadAvatar(file: File): Promise<{ avatar_url: string }> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(apiUrl('/api/auth/avatar'), {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Upload failed' }))
    throw new Error(err.detail || 'Upload failed')
  }
  return res.json()
}

export async function getHistory(limit = 100, offset = 0) {
  const res = await fetch(apiUrl(`/api/auth/history?limit=${limit}&offset=${offset}`), {
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error('Failed to fetch history')
  return res.json()
}

export async function addHistory(entry: {
  title: string
  artist: string
  album?: string
  artwork_url?: string | null
  duration_ms?: number | null
  isrc?: string | null
}) {
  const res = await fetch(apiUrl('/api/auth/history'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(entry),
  })
  if (!res.ok) throw new Error('Failed to save history')
  return res.json()
}

export async function deleteHistory(id: string) {
  const res = await fetch(apiUrl(`/api/auth/history/${id}`), {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error('Failed to delete history entry')
  return res.json()
}

export async function clearAllHistory() {
  const res = await fetch(apiUrl('/api/auth/history'), {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error('Failed to clear history')
  return res.json()
}

export async function logDownload(trackTitle: string, trackArtist: string, quality?: string, source?: string) {
  try {
    await fetch(apiUrl('/api/download/log'), {
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

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID || '9896a8bc854e4b5ea1ff42a4e63f75c6'

function base64url(input: ArrayBuffer): string {
  const bytes = new Uint8Array(input)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

async function generateCodeVerifier(): Promise<string> {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return base64url(array.buffer)
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return base64url(digest)
}

function getRedirectUri(): string {
  return window.location.origin + '/download'
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

export async function login() {
  const verifier = await generateCodeVerifier()
  const challenge = await generateCodeChallenge(verifier)
  sessionStorage.setItem('codeVerifier', verifier)

  const redirectUri = getRedirectUri()
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: 'playlist-read-private playlist-read-collaborative playlist-read-private user-read-email',
  })
  window.location.href = `https://accounts.spotify.com/authorize?${params}`
}

export async function handleCallback(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const error = params.get('error')
  if (error) {
    clearStored()
    return false
  }
  if (!code) return false

  const verifier = sessionStorage.getItem('codeVerifier')
  if (!verifier) return false

  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        grant_type: 'authorization_code',
        code,
        redirect_uri: getRedirectUri(),
        code_verifier: verifier,
      }),
    })
    if (!res.ok) return false
    const data = await res.json()
    store(data)
    sessionStorage.removeItem('codeVerifier')
    window.history.replaceState({}, '', window.location.pathname)
    return true
  } catch {
    return false
  }
}

export async function refreshToken(): Promise<boolean> {
  const stored = getStored()
  if (!stored.refresh_token) return false

  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: stored.refresh_token,
      }),
    })
    if (!res.ok) {
      clearStored()
      return false
    }
    const data = await res.json()
    const finalData = { ...data, refresh_token: data.refresh_token || stored.refresh_token }
    store({ ...finalData, expires_in: data.expires_in })
    return true
  } catch {
    clearStored()
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

export function isAuthenticated(): boolean {
  return !!getAccessToken()
}

export function logout() {
  clearStored()
}

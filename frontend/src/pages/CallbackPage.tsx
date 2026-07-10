import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { exchangeCode } from '../lib/spotifyAuth'
import { useAuth } from '../hooks/useAuth'

export function CallbackPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { googleAuth } = useAuth()
  const processed = useRef(false)
  const statusRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (processed.current) return
    processed.current = true

    const code = searchParams.get('code')
    const error = searchParams.get('error')

    // Google PKCE flow: authorization code + stored code_verifier
    const codeVerifier = sessionStorage.getItem('google_code_verifier')
    if (code && codeVerifier) {
      sessionStorage.removeItem('google_code_verifier')
      const redirectUri = `http://localhost:5173/callback`

      import('../lib/auth').then(({ googleCodeAuth, storeUser }) => {
        googleCodeAuth(code, codeVerifier, redirectUri)
          .then(data => {
            storeUser(data.user)
            useAuth.setState({ user: data.user, isGuest: false, initialized: true, loading: false })
            if (statusRef.current) {
              statusRef.current.innerHTML = `
                <div class="flex flex-col items-center justify-center px-4">
                  <svg class="w-10 h-10 text-green-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  <p class="text-sm text-green-600 dark:text-green-400 font-medium">Signed in with Google!</p>
                </div>`
            }
            setTimeout(() => navigate('/', { replace: true }), 1000)
          })
          .catch(err => {
            console.error('Google auth error:', err)
            if (statusRef.current) {
              statusRef.current.innerHTML = `
                <div class="flex flex-col items-center justify-center px-4">
                  <svg class="w-10 h-10 text-red-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  <p class="text-sm text-red-500 font-medium mb-2">Google authentication failed</p>
                  <p class="text-xs text-red-400 text-center max-w-xs">${err instanceof Error ? err.message : 'Something went wrong'}</p>
                </div>`
            }
          })
      })
      return
    }

    // Legacy Google implicit flow (id_token in hash) — kept for backward compatibility
    const hash = window.location.hash.slice(1)
    const idToken = searchParams.get('id_token') || (hash ? new URLSearchParams(hash).get('id_token') : null)
    if (idToken) {
      if (hash) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
      }
      googleAuth(idToken)
        .then(() => {
          if (statusRef.current) {
            statusRef.current.innerHTML = `
              <div class="flex flex-col items-center justify-center px-4">
                <svg class="w-10 h-10 text-green-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                <p class="text-sm text-green-600 dark:text-green-400 font-medium">Signed in with Google!</p>
              </div>`
          }
          setTimeout(() => navigate('/', { replace: true }), 1000)
        })
        .catch(err => {
          console.error('Google auth error:', err)
          if (statusRef.current) {
            statusRef.current.innerHTML = `
              <div class="flex flex-col items-center justify-center px-4">
                <svg class="w-10 h-10 text-red-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                <p class="text-sm text-red-500 font-medium mb-2">Google authentication failed</p>
                <p class="text-xs text-red-400 text-center max-w-xs">${err instanceof Error ? err.message : 'Something went wrong'}</p>
              </div>`
          }
        })
      return
    }

    if (error) {
      if (statusRef.current) {
        statusRef.current.innerHTML = `
          <div class="flex flex-col items-center justify-center px-4">
            <svg class="w-10 h-10 text-red-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <p class="text-sm text-red-500 font-medium">Spotify denied authorization</p>
          </div>`
      }
      setTimeout(() => navigate('/'), 2000)
      return
    }

    if (!code) {
      if (statusRef.current) {
        statusRef.current.innerHTML = `
          <div class="flex flex-col items-center justify-center px-4">
            <svg class="w-10 h-10 text-red-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <p class="text-sm text-red-500 font-medium">No authorization code received</p>
          </div>`
      }
      setTimeout(() => navigate('/'), 2000)
      return
    }

    const redirectUri = `http://localhost:5173/callback`

    exchangeCode(code, redirectUri).then(result => {
      if (result.ok) {
        if (statusRef.current) {
          statusRef.current.innerHTML = `
            <div class="flex flex-col items-center justify-center px-4">
              <svg class="w-10 h-10 text-green-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              <p class="text-sm text-green-600 dark:text-green-400 font-medium">Spotify connected!</p>
            </div>`
        }
        setTimeout(() => navigate('/settings'), result.error ? 2000 : 1000)
      } else {
        if (statusRef.current) {
          statusRef.current.innerHTML = `
            <div class="flex flex-col items-center justify-center px-4">
              <svg class="w-10 h-10 text-red-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              <p class="text-sm text-red-500 font-medium mb-2">Token exchange failed</p>
              <p class="text-xs text-red-400 text-center max-w-xs">${result.error || 'Something went wrong'}</p>
            </div>`
        }
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4" ref={statusRef}>
      <RefreshCw className="w-10 h-10 text-accent animate-spin mb-4" />
      <p className="text-sm text-light-muted dark:text-dark-muted">Authenticating...</p>
    </div>
  )
}

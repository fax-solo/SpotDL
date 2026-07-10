import { useState, useEffect } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, LogIn, User } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, guestLogin, user } = useAuth()
  const from = (location.state as { from?: string })?.from
  const [loginField, setLoginField] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [guestLoading, setGuestLoading] = useState(false)

  useEffect(() => {
    if (user) navigate(from || '/', { replace: true })
  }, [user, navigate, from])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(loginField, password)
      navigate(from || '/', { replace: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed'
      console.error('Login error:', err)
      if (msg.includes('abort') || msg.includes('Failed to fetch')) {
        setError('Cannot reach the server. Make sure the API is running (npm run dev:api in another terminal).')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleGuest = async () => {
    setError(null)
    setGuestLoading(true)
    try {
      await guestLogin()
      navigate(from || '/', { replace: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Guest login failed'
      console.error('Guest login error:', err)
      if (msg.includes('abort') || msg.includes('AbortError') || msg.includes('Failed to fetch')) {
        setError('Cannot reach the server. Make sure the API is running (npm run dev:api in another terminal).')
      } else {
        setError(msg)
      }
    } finally {
      setGuestLoading(false)
    }
  }

  async function generateCodeChallenge(verifier: string): Promise<string> {
    const enc = new TextEncoder()
    const hash = await crypto.subtle.digest('SHA-256', enc.encode(verifier))
    return btoa(String.fromCharCode(...new Uint8Array(hash)))
      .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  }

  const handleGoogle = async () => {
    const redirectUri = `http://localhost:5173/callback`
    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    if (!googleClientId) {
      setError('Google sign-in is not configured. Use email/password instead.')
      return
    }

    const codeVerifier = crypto.randomUUID() + crypto.randomUUID()
    const codeChallenge = await generateCodeChallenge(codeVerifier)
    sessionStorage.setItem('google_code_verifier', codeVerifier)

    const params = new URLSearchParams({
      client_id: googleClientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      access_type: 'offline',
    })
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  }

  return (
    <div className="flex-1 flex flex-col bg-light-bg dark:bg-dark-bg">
      <div className="flex-1 flex flex-col justify-center px-6 py-12 pb-28 max-w-sm mx-auto w-full">
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-5">
            <LogIn className="w-8 h-8 text-accent" />
          </div>
          <h1 className="text-3xl font-bold text-light-text dark:text-dark-text tracking-tight">Welcome back</h1>
          <p className="text-sm text-light-muted dark:text-dark-muted mt-2">{from ? 'Sign in to start downloading' : 'Sign in to your account'}</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-light-text dark:text-dark-text mb-1.5">Username or Email</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-light-muted dark:text-dark-muted" />
              <input
                type="text"
                value={loginField}
                onChange={e => setLoginField(e.target.value)}
                placeholder="username or email"
                required
                autoComplete="username"
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50 text-sm text-light-text dark:text-dark-text placeholder:text-light-muted dark:placeholder:text-dark-muted focus:outline-none focus:ring-2 focus:ring-accent/30 transition-shadow"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-light-text dark:text-dark-text mb-1.5">Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-light-muted dark:text-dark-muted" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                autoComplete="current-password"
                className="w-full pl-10 pr-10 py-3 rounded-xl bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50 text-sm text-light-text dark:text-dark-text placeholder:text-light-muted dark:placeholder:text-dark-muted focus:outline-none focus:ring-2 focus:ring-accent/30 transition-shadow"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text cursor-pointer"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-500 font-medium animate-fadeIn">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !loginField || !password}
            className="w-full py-3 px-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-light-border/50 dark:border-dark-border/50" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-light-bg dark:bg-dark-bg px-3 text-light-muted dark:text-dark-muted">or continue with</span>
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={handleGoogle}
            className="w-full py-3 px-4 rounded-xl border border-light-border/50 dark:border-dark-border/50 bg-white dark:bg-dark-surface hover:bg-light-surface-2 dark:hover:bg-dark-surface-2 text-light-text dark:text-dark-text font-medium text-sm transition-colors flex items-center justify-center gap-3 cursor-pointer"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Google
          </button>

          <button
            onClick={handleGuest}
            disabled={guestLoading}
            className="w-full py-3 px-4 rounded-xl border border-light-border/50 dark:border-dark-border/50 bg-white dark:bg-dark-surface hover:bg-light-surface-2 dark:hover:bg-dark-surface-2 text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text font-medium text-sm transition-colors flex items-center justify-center gap-3 disabled:opacity-40 cursor-pointer"
          >
            {guestLoading ? (
              <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            ) : (
              <User className="w-5 h-5" />
            )}
            Continue as Guest
          </button>
        </div>

        <p className="text-center text-sm text-light-muted dark:text-dark-muted mt-8">
          Don't have an account?{' '}
          <Link to="/signup" className="text-accent hover:text-accent-hover font-medium">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}

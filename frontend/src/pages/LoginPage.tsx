import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, LogIn, User, Globe } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

export function LoginPage() {
  const navigate = useNavigate()
  const { login, guestLogin, user } = useAuth()
  const [loginField, setLoginField] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [guestLoading, setGuestLoading] = useState(false)

  useEffect(() => {
    if (user) navigate('/', { replace: true })
  }, [user, navigate])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(loginField, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const handleGuest = async () => {
    setError(null)
    setGuestLoading(true)
    try {
      await guestLogin()
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Guest login failed')
    } finally {
      setGuestLoading(false)
    }
  }

  const handleGoogle = () => {
    const redirectUri = `${window.location.origin}/callback`
    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    if (!googleClientId) {
      setError('Google sign-in is not configured. Use email/password instead.')
      return
    }
    const params = new URLSearchParams({
      client_id: googleClientId,
      redirect_uri: redirectUri,
      response_type: 'id_token',
      scope: 'openid email profile',
      nonce: crypto.randomUUID(),
    })
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-light-bg dark:bg-dark-bg">
      <div className="flex-1 flex flex-col justify-center px-6 py-12 max-w-sm mx-auto w-full">
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-5">
            <LogIn className="w-8 h-8 text-accent" />
          </div>
          <h1 className="text-3xl font-bold text-light-text dark:text-dark-text tracking-tight">Welcome back</h1>
          <p className="text-sm text-light-muted dark:text-dark-muted mt-2">Sign in to your account</p>
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
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-500 font-medium">
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
            <Globe className="w-5 h-5" />
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

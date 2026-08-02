import { useState, useEffect } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, UserPlus, User, AtSign } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { networkErrorText } from '../lib/apiConfig'

export function SignUpPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { signup, guestLogin, user } = useAuth()
  const from = (location.state as { from?: string })?.from
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [guestLoading, setGuestLoading] = useState(false)

  useEffect(() => {
    if (user) navigate(from || '/', { replace: true })
  }, [user, navigate, from])

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (!/[A-Z]/.test(password)) {
      setError('Password must contain at least one uppercase letter')
      return
    }
    if (!/[a-z]/.test(password)) {
      setError('Password must contain at least one lowercase letter')
      return
    }
    if (!/[0-9]/.test(password)) {
      setError('Password must contain at least one number')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    try {
      await signup(email, password, displayName || undefined, username || undefined)
      navigate(from || '/', { replace: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Signup failed'
      if (msg.includes('abort') || msg.includes('Failed to fetch')) {
        setError(networkErrorText())
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
      if (msg.includes('abort') || msg.includes('Failed to fetch')) {
        setError(networkErrorText())
      } else {
        setError(msg)
      }
    } finally {
      setGuestLoading(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-light-bg dark:bg-dark-bg animate-pageEnter">
      <div className="flex-1 flex flex-col justify-center px-6 py-16 pb-36 max-w-md mx-auto w-full">
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-5">
            <UserPlus className="w-8 h-8 text-accent" />
          </div>
          <h1 className="text-3xl font-bold text-light-text dark:text-dark-text tracking-tight">Create account</h1>
          <p className="text-sm text-light-muted dark:text-dark-muted mt-2">{from ? 'Sign up to start downloading' : 'Start downloading your favorite music'}</p>
        </div>

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-light-text dark:text-dark-text mb-2">Display name</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-light-muted dark:text-dark-muted" />
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Your name (optional)"
                autoComplete="name"
                className="w-full pl-11 pr-4 py-3.5 rounded-xl bg-white dark:bg-dark-surface border border-light-border/30 dark:border-dark-border/30 text-sm text-light-text dark:text-dark-text placeholder:text-light-muted dark:placeholder:text-dark-muted focus:outline-none focus:ring-2 focus:ring-accent/30 transition-shadow"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-light-text dark:text-dark-text mb-2">Username</label>
            <div className="relative">
              <AtSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-light-muted dark:text-dark-muted" />
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Choose a username (optional)"
                autoComplete="username"
                className="w-full pl-11 pr-4 py-3.5 rounded-xl bg-white dark:bg-dark-surface border border-light-border/30 dark:border-dark-border/30 text-sm text-light-text dark:text-dark-text placeholder:text-light-muted dark:placeholder:text-dark-muted focus:outline-none focus:ring-2 focus:ring-accent/30 transition-shadow"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-light-text dark:text-dark-text mb-2">Email</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-light-muted dark:text-dark-muted" />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                className="w-full pl-11 pr-4 py-3.5 rounded-xl bg-white dark:bg-dark-surface border border-light-border/30 dark:border-dark-border/30 text-sm text-light-text dark:text-dark-text placeholder:text-light-muted dark:placeholder:text-dark-muted focus:outline-none focus:ring-2 focus:ring-accent/30 transition-shadow"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-light-text dark:text-dark-text mb-2">Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-light-muted dark:text-dark-muted" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="At least 8 characters, A-Z, a-z, 0-9"
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full pl-11 pr-11 py-3.5 rounded-xl bg-white dark:bg-dark-surface border border-light-border/30 dark:border-dark-border/30 text-sm text-light-text dark:text-dark-text placeholder:text-light-muted dark:placeholder:text-dark-muted focus:outline-none focus:ring-2 focus:ring-accent/30 transition-shadow"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text cursor-pointer"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-light-text dark:text-dark-text mb-2">Confirm password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-light-muted dark:text-dark-muted" />
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Repeat your password"
                required
                autoComplete="new-password"
                className="w-full pl-11 pr-11 py-3.5 rounded-xl bg-white dark:bg-dark-surface border border-light-border/30 dark:border-dark-border/30 text-sm text-light-text dark:text-dark-text placeholder:text-light-muted dark:placeholder:text-dark-muted focus:outline-none focus:ring-2 focus:ring-accent/30 transition-shadow"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text cursor-pointer"
                tabIndex={-1}
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-500 font-medium animate-fadeIn">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password || !confirmPassword}
            className="w-full py-3.5 px-5 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        <div className="relative my-8">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-light-border/30 dark:border-dark-border/30" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-light-bg dark:bg-dark-bg px-4 text-light-muted dark:text-dark-muted">or</span>
          </div>
        </div>

        <button
          onClick={handleGuest}
          disabled={guestLoading}
          className="w-full py-3.5 px-5 rounded-xl border border-light-border/30 dark:border-dark-border/30 bg-white dark:bg-dark-surface hover:bg-light-surface-2 dark:hover:bg-dark-surface-2 text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text font-medium text-sm transition-all flex items-center justify-center gap-3 disabled:opacity-40 cursor-pointer active:scale-[0.98]"
        >
          {guestLoading ? (
            <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          ) : (
            <User className="w-5 h-5" />
          )}
          Continue as Guest
        </button>

        <p className="text-center text-sm text-light-muted dark:text-dark-muted mt-10">
          Already have an account?{' '}
          <Link to="/login" className="text-accent hover:text-accent-hover font-medium underline-offset-2 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}

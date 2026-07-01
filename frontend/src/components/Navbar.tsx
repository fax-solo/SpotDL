import { Sun, Moon, Music, User, LogIn, UserPlus, UserRound } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useTheme } from '../hooks/useTheme'
import { useAuth } from '../hooks/useAuth'
import { useState } from 'react'

export function Navbar() {
  const { isDark, toggle } = useTheme()
  const location = useLocation()
  const { user, guestLogin } = useAuth()
  const [guestLoading, setGuestLoading] = useState(false)

  const handleGuest = async () => {
    setGuestLoading(true)
    try {
      await guestLogin()
    } catch {
    } finally {
      setGuestLoading(false)
    }
  }

  return (
    <nav className="flex items-center justify-between px-6 py-4 border-b border-light-border dark:border-dark-border">
      <div className="flex items-center gap-6">
        <Link to="/" className="flex items-center gap-2 text-light-text dark:text-dark-text hover:opacity-80 transition-opacity">
          <Music className="w-6 h-6 text-accent" />
          <span className="text-xl font-semibold">Sinc</span>
        </Link>
        <Link
          to="/player"
          className={`text-sm font-medium transition-colors ${
            location.pathname === '/player'
              ? 'text-accent'
              : 'text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text'
          }`}
        >
          Player
        </Link>
      </div>
      <div className="flex items-center gap-3">
        {user ? (
          <Link
            to="/settings"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-light-text dark:text-dark-text hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <div className="w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center overflow-hidden">
              {user.avatar_url ? (
                <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <User className="w-3.5 h-3.5 text-accent" />
              )}
            </div>
            <span className="hidden sm:inline">{user.display_name || 'Account'}</span>
          </Link>
        ) : (
          <>
            <Link
              to="/login"
              className="text-sm font-medium text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text flex items-center gap-1.5 transition-colors"
            >
              <LogIn className="w-4 h-4" />
              <span className="hidden sm:inline">Sign In</span>
            </Link>
            <Link
              to="/signup"
              className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors flex items-center gap-1.5"
            >
              <UserPlus className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Up</span>
            </Link>
            <button
              onClick={handleGuest}
              disabled={guestLoading}
              className="px-3 py-1.5 rounded-lg border border-light-border/50 dark:border-dark-border/50 text-light-muted dark:text-dark-muted text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
            >
              {guestLoading ? (
                <div className="w-3.5 h-3.5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              ) : (
                <UserRound className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">Guest</span>
            </button>
          </>
        )}
        <button
          onClick={toggle}
          className="p-2 rounded-lg text-light-muted dark:text-dark-muted hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
          aria-label="Toggle theme"
        >
          {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </div>
    </nav>
  )
}

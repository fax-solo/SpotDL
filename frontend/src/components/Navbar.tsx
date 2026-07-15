import { Sun, Moon, Music, User, LogIn, UserPlus, UserRound, Search, Download, Clock, ListMusic } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useTheme } from '../hooks/useTheme'
import { useAuth } from '../hooks/useAuth'
import { useToast } from './Toast'
import { useState } from 'react'

const NAV_LINKS = [
  { path: '/search', icon: Search, label: 'Search' },
  { path: '/my-playlists', icon: ListMusic, label: 'Playlists' },
  { path: '/download', icon: Download, label: 'Download' },
  { path: '/history', icon: Clock, label: 'History' },
  { path: '/player', icon: Music, label: 'Player' },
]

function NavLink({ path, icon: Icon, label }: { path: string; icon: typeof Search; label: string }) {
  const location = useLocation()
  const active = location.pathname === path
  return (
    <Link
      to={path}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 ${
        active
          ? 'text-accent bg-accent/10'
          : 'text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text hover:bg-gray-100 dark:hover:bg-gray-800'
      }`}
      aria-current={active ? 'page' : undefined}
    >
      <Icon className="w-4 h-4" />
      <span>{label}</span>
    </Link>
  )
}

export function Navbar() {
  const { isDark, toggle } = useTheme()
  const location = useLocation()
  const { user, guestLogin } = useAuth()
  const { toast } = useToast()
  const [guestLoading, setGuestLoading] = useState(false)

  const handleGuest = async () => {
    setGuestLoading(true)
    try {
      await guestLogin()
    } catch {
      toast("Couldn't continue as guest — try again.", 'error')
    } finally {
      setGuestLoading(false)
    }
  }

  return (
    <nav className="flex items-center justify-between px-6 py-4 border-b border-light-border dark:border-dark-border">
      <div className="flex items-center gap-2">
        <Link to="/" className="flex items-center gap-2 text-light-text dark:text-dark-text hover:opacity-80 transition-opacity mr-4">
          <Music className="w-6 h-6 text-accent" />
          <span className="text-xl font-semibold">Sinc</span>
        </Link>
        <div className="hidden sm:flex items-center gap-1">
          {NAV_LINKS.map(link => (
            <NavLink key={link.path} {...link} />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {user ? (
          <Link
            to="/settings"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-light-text dark:text-dark-text hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus-visible:ring-2 focus-visible:ring-accent/40"
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
              className="text-sm font-medium text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text flex items-center gap-1.5 transition-colors focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <LogIn className="w-4 h-4" />
              <span className="hidden sm:inline">Sign In</span>
            </Link>
            <Link
              to="/signup"
              className="px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <UserPlus className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Up</span>
            </Link>
            <button
              onClick={handleGuest}
              disabled={guestLoading}
              className="px-3 py-1.5 rounded-lg border border-light-border/50 dark:border-dark-border/50 text-light-muted dark:text-dark-muted text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent/40"
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
          className="p-2 rounded-lg text-light-muted dark:text-dark-muted hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-accent/40"
          aria-label="Toggle theme"
        >
          {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </div>
      {/* Mobile nav links row */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/85 dark:bg-dark-surface/85 backdrop-blur-md border-t border-light-border dark:border-dark-border flex items-center justify-around py-2 px-2">
        {NAV_LINKS.map(link => {
          const active = location.pathname === link.path
          return (
            <Link
              key={link.path}
              to={link.path}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                active ? 'text-accent' : 'text-light-muted dark:text-dark-muted'
              }`}
              aria-current={active ? 'page' : undefined}
            >
              <link.icon className="w-[22px] h-[22px]" aria-hidden="true" />
              {link.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

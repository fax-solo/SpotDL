import { Sun, Moon, Music } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useTheme } from '../hooks/useTheme'

export function Navbar() {
  const { isDark, toggle } = useTheme()
  const location = useLocation()

  return (
    <nav className="flex items-center justify-between px-6 py-4 border-b border-light-border dark:border-dark-border">
      <div className="flex items-center gap-6">
        <Link to="/" className="flex items-center gap-2 text-light-text dark:text-dark-text hover:opacity-80 transition-opacity">
          <Music className="w-6 h-6 text-accent" />
          <span className="text-xl font-semibold">SpotDL</span>
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
      <button
        onClick={toggle}
        className="p-2 rounded-lg text-light-muted dark:text-dark-muted hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
        aria-label="Toggle theme"
      >
        {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </button>
    </nav>
  )
}

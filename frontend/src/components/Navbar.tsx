import { Sun, Moon, Music } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'

export function Navbar() {
  const { isDark, toggle } = useTheme()

  return (
    <nav className="flex items-center justify-between px-6 py-4 border-b border-light-border dark:border-dark-border">
      <div className="flex items-center gap-2 text-light-text dark:text-dark-text">
        <Music className="w-6 h-6 text-accent" />
        <span className="text-xl font-semibold">SpotDL</span>
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

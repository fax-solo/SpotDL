import { useLocation, useNavigate } from 'react-router-dom'
import { Home, Download, Clock, Settings } from 'lucide-react'

const TABS = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/download', icon: Download, label: 'Download' },
  { path: '/history', icon: Clock, label: 'History' },
  { path: '/settings', icon: Settings, label: 'Settings' },
]

export function BottomBar() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/80 dark:bg-dark-surface/80 backdrop-blur-xl border-t border-light-border dark:border-dark-border safe-area-bottom">
      <div className="flex items-center justify-around max-w-lg mx-auto">
        {TABS.map(tab => {
          const active = location.pathname === tab.path
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              aria-label={tab.label}
              aria-current={active ? 'page' : undefined}
               className={`flex flex-col items-center gap-0.5 py-3 px-6 min-w-0 transition-colors cursor-pointer ${
                 active
                   ? 'text-accent'
                   : 'text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text'
               }`}
            >
              <tab.icon className={`w-5 h-5 ${active ? 'fill-accent/20' : ''}`} aria-hidden="true" />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

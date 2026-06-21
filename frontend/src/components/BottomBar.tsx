import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Home, Download, Clock, Disc3, Settings } from 'lucide-react'
import { Capacitor } from '@capacitor/core'

const TABS = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/download', icon: Download, label: 'Download' },
  { path: '/history', icon: Clock, label: 'History' },
  { path: '/player', icon: Disc3, label: 'Player' },
  { path: '/settings', icon: Settings, label: 'Settings' },
]

export function BottomBar() {
  const location = useLocation()
  const navigate = useNavigate()

  const handleNav = useCallback(async (path: string) => {
    if (Capacitor.isNativePlatform()) {
      try {
        const { Haptics, ImpactStyle } = await import('@capacitor/haptics')
        Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
      } catch {}
    }
    navigate(path)
  }, [navigate])

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-white/85 dark:bg-dark-surface/85 backdrop-mobile border-t border-light-border dark:border-dark-border"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="flex items-center justify-around max-w-lg mx-auto h-14">
        {TABS.map(tab => {
          const active = location.pathname === tab.path
          return (
            <button
              key={tab.path}
              onClick={() => handleNav(tab.path)}
              aria-label={tab.label}
              aria-current={active ? 'page' : undefined}
              className="relative flex flex-col items-center justify-center gap-0.5 min-w-0 flex-1 h-full transition-colors cursor-pointer"
            >
              {active && (
                <motion.div
                  layoutId="bottomBarActive"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  className="absolute inset-x-4 top-0 h-0.5 bg-accent rounded-full"
                />
              )}
              <tab.icon
                className={`w-[22px] h-[22px] transition-colors ${
                  active
                    ? 'text-accent'
                    : 'text-light-muted dark:text-dark-muted'
                }`}
                aria-hidden="true"
              />
              <span
                className={`text-[10px] font-medium leading-none transition-colors ${
                  active
                    ? 'text-accent'
                    : 'text-light-muted dark:text-dark-muted'
                }`}
              >
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

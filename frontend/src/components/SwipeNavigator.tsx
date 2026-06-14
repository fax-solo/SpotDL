import { useRef, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

interface SwipeNavigatorProps {
  children: ReactNode
  paths: string[]
  currentPath: string
  enabled: boolean
}

const SWIPE_THRESHOLD = 50

export function SwipeNavigator({ children, paths, currentPath, enabled }: SwipeNavigatorProps) {
  const navigate = useNavigate()
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  if (!enabled) return <>{children}</>

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return

    const dx = e.changedTouches[0].clientX - touchStart.current.x
    const dy = e.changedTouches[0].clientY - touchStart.current.y
    touchStart.current = null

    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy)) return

    const currentIdx = paths.indexOf(currentPath)
    if (currentIdx === -1) return

    if (dx < 0 && currentIdx < paths.length - 1) {
      navigate(paths[currentIdx + 1])
    } else if (dx > 0 && currentIdx > 0) {
      navigate(paths[currentIdx - 1])
    }
  }

  return (
    <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} className="flex-1 flex flex-col">
      {children}
    </div>
  )
}

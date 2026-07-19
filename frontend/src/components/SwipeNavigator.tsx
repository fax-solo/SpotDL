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
    const touch = e.touches[0]
    if (!touch) return
    touchStart.current = { x: touch.clientX, y: touch.clientY }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return

    const touch = e.changedTouches[0]
    if (!touch) return
    const dx = touch.clientX - touchStart.current.x
    const dy = touch.clientY - touchStart.current.y
    touchStart.current = null

    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy)) return

    const currentIdx = paths.indexOf(currentPath)
    if (currentIdx === -1) return

    const next = paths[currentIdx + 1]
    const prev = paths[currentIdx - 1]
    if (dx < 0 && currentIdx < paths.length - 1 && next) {
      navigate(next)
    } else if (dx > 0 && currentIdx > 0 && prev) {
      navigate(prev)
    }
  }

  return (
    <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} className="flex-1 flex flex-col">
      {children}
    </div>
  )
}

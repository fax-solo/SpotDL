import { useState, useRef, useCallback, type ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import { Capacitor } from '@capacitor/core'

interface PullToRefreshProps {
  onRefresh: () => Promise<void>
  children: ReactNode
}

const THRESHOLD = 60

export function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  // Disable custom pull-to-refresh on native — Capacitor WebView handles its own
  if (Capacitor.isNativePlatform()) return <>{children}</>
  const [pulling, setPulling] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollTop = useRef(0)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    scrollTop.current = containerRef.current?.scrollTop ?? 0
    if (scrollTop.current > 0) return
    startY.current = e.touches[0].clientY
    setPulling(true)
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pulling || refreshing) return
    const diff = e.touches[0].clientY - startY.current
    if (diff <= 0) return
    scrollTop.current = containerRef.current?.scrollTop ?? 0
    if (scrollTop.current > 0) return
    const damped = Math.min(diff * 0.5, 120)
    setPullDistance(damped)
  }, [pulling, refreshing])

  const handleTouchEnd = useCallback(async () => {
    setPulling(false)
    if (pullDistance >= THRESHOLD && !refreshing) {
      setRefreshing(true)
      setPullDistance(THRESHOLD)
      try {
        await onRefresh()
      } finally {
        setRefreshing(false)
        setPullDistance(0)
      }
    } else {
      setPullDistance(0)
    }
  }, [pullDistance, refreshing, onRefresh])

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        ref={el => { if (el) el.style.height = `${pullDistance}px` }}
        className="flex items-center justify-center transition-[height] duration-200 overflow-hidden"
      >
        <RefreshCw
          ref={el => {
            if (!el) return
            el.style.transform = `rotate(${pullDistance * 3}deg)`
            el.style.transition = refreshing ? 'none' : 'transform 0.1s ease'
          }}
          className={`w-6 h-6 text-accent ${refreshing ? 'animate-spin' : ''}`}
        />
      </div>
      {children}
    </div>
  )
}

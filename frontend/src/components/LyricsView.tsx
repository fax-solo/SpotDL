import { useRef, useEffect } from 'react'
import { useLyrics } from '../hooks/useLyrics'

interface LyricsViewProps {
  trackName: string
  artistName: string
  albumName: string
  duration: number
  currentTime: number
}

export function LyricsView({ trackName, artistName, albumName, duration, currentTime }: LyricsViewProps) {
  const { plainLyrics, syncedLines, synced, currentLine, loading, error } = useLyrics(
    trackName, artistName, albumName, duration, currentTime
  )
  const containerRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (synced && activeRef.current && containerRef.current) {
      const container = containerRef.current
      const active = activeRef.current
      const containerRect = container.getBoundingClientRect()
      const activeRect = active.getBoundingClientRect()
      const offset = activeRect.top - containerRect.top - containerRect.height / 2 + activeRect.height / 2
      container.scrollBy({ top: offset, behavior: 'smooth' })
    }
  }, [currentLine, synced])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-light-muted dark:text-zinc-500">{error}</p>
      </div>
    )
  }

  if (!plainLyrics && syncedLines.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-light-muted dark:text-zinc-500">No lyrics available</p>
      </div>
    )
  }

  if (synced && syncedLines.length > 0) {
    return (
      <div
        ref={containerRef}
        className="h-full overflow-y-auto scrollbar-hide px-4 py-8"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <div className="flex flex-col items-center justify-start min-h-full gap-4">
          {syncedLines.map((line, i) => {
            const isActive = i === currentLine
            const isPast = i < currentLine
            return (
              <div
                key={i}
                ref={isActive ? activeRef : undefined}
                className={`text-center transition-all duration-300 ${
                  isActive
                    ? 'text-white text-lg font-semibold scale-100 opacity-100'
                    : isPast
                    ? 'text-white/30 text-base font-normal scale-95'
                    : 'text-white/40 text-base font-normal scale-95'
                }`}
              >
                {line.text}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-8" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
      <div className="flex flex-col items-center gap-3">
        {plainLyrics?.split('\n').filter(l => l.trim()).map((line, i) => (
          <p key={i} className="text-white/60 text-base text-center leading-relaxed">{line}</p>
        ))}
      </div>
    </div>
  )
}

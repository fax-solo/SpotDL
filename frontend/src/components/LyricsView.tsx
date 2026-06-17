import { useRef, useEffect } from 'react'
import { useLyrics } from '../hooks/useLyrics'

interface LyricsViewProps {
  trackName: string
  artistName: string
  albumName: string
  duration: number
  currentTime: number
  storedLyrics?: { plainLyrics: string | null; syncedLyrics: string | null } | null
}

export function LyricsView({ trackName, artistName, albumName, duration, currentTime, storedLyrics }: LyricsViewProps) {
  const { plainLyrics, syncedLines, synced, currentLine, loading, error } = useLyrics(
    trackName, artistName, albumName, duration, currentTime, storedLyrics,
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
        className="h-full overflow-y-auto scrollbar-hide px-4"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <div className="flex flex-col items-center justify-start min-h-full gap-4 pt-[45%] pb-[45%]">
          {syncedLines.map((line, i) => {
            const isActive = i === currentLine
            const isPast = i < currentLine
            return (
              <div
                key={i}
                ref={isActive ? activeRef : undefined}
                className={`text-center transition-all duration-500 ease-out ${
                  isActive
                    ? 'text-white text-xl font-semibold scale-100 opacity-100 drop-shadow-[0_0_14px_rgba(255,255,255,0.4)]'
                    : isPast
                    ? 'text-white/25 text-sm font-normal scale-90'
                    : 'text-white/45 text-sm font-normal scale-90'
                }`}
                style={isActive ? {
                  background: 'linear-gradient(to right, rgba(255,255,255,0.8) 0%, #fff 40%, #fff 60%, rgba(255,255,255,0.8) 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                } : undefined}
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
    <div className="h-full overflow-y-auto px-4" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
      <div className="flex flex-col items-center gap-3 pt-[45%] pb-[45%]">
        {plainLyrics?.split('\n').filter(l => l.trim()).map((line, i) => (
          <p key={i} className="text-white/60 text-base text-center leading-relaxed">{line}</p>
        ))}
      </div>
    </div>
  )
}

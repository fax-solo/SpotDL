import { useRef, useEffect, useState } from 'react'
import { useLyrics } from '../hooks/useLyrics'

interface LyricsViewProps {
  trackName: string
  artistName: string
  albumName: string
  duration: number
  currentTime: number
  artworkUrl?: string | null
  storedLyrics?: { plainLyrics: string | null; syncedLyrics: string | null } | null
  scrollRef?: React.RefObject<HTMLDivElement | null>
  onSeek?: (time: number) => void
}

function extractColors(url: string): Promise<string[]> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 1
      canvas.height = 1
      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve([]); return }
      ctx.drawImage(img, 0, 0, 1, 1)
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
      resolve([`rgb(${r},${g},${b})`, `rgb(${Math.min(r + 40, 255)},${Math.min(g + 30, 255)},${Math.min(b + 50, 255)})`])
    }
    img.onerror = () => resolve([])
    img.src = url
  })
}

export function LyricsView({ trackName, artistName, albumName, duration, currentTime, artworkUrl, storedLyrics, scrollRef, onSeek }: LyricsViewProps) {
  const { plainLyrics, syncedLines, synced, currentLine, loading, error } = useLyrics(
    trackName, artistName, albumName, duration, currentTime, storedLyrics,
  )
  const containerRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLDivElement>(null)
  const [colors, setColors] = useState<string[]>([])

  useEffect(() => {
    if (!artworkUrl) { setColors([]); return }
    let cancelled = false
    extractColors(artworkUrl).then(c => { if (!cancelled) setColors(c) })
    return () => { cancelled = true }
  }, [artworkUrl])

  useEffect(() => {
    if (!synced || !activeRef.current || !containerRef.current) return
    const active = activeRef.current
    const target = scrollRef?.current || containerRef.current
    const targetRect = target.getBoundingClientRect()
    const activeRect = active.getBoundingClientRect()
    const offset = activeRect.top - targetRect.top - targetRect.height / 2 + activeRect.height / 2
    target.scrollBy({ top: offset, behavior: 'smooth' })
  }, [currentLine, synced, scrollRef])

  const bgGradient = colors.length >= 2
    ? `linear-gradient(135deg, ${colors[0]} 0%, ${colors[1]} 50%, ${colors[0]} 100%)`
    : undefined

  if (loading) {
    return (
      <div className="relative flex items-center justify-center py-20 min-h-[50vh]">
        <div className="w-6 h-6 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="relative flex items-center justify-center py-20 min-h-[50vh]">
        <p className="text-sm text-white/50">{error}</p>
      </div>
    )
  }

  if (!plainLyrics && syncedLines.length === 0) {
    return (
      <div className="relative flex items-center justify-center py-20 min-h-[50vh]">
        <p className="text-sm text-white/50">No lyrics available</p>
      </div>
    )
  }

  const syncedContent = synced && syncedLines.length > 0
  const lyricsContent = syncedContent ? null : plainLyrics

  return (
    <div className="relative w-full min-h-[50vh]">
      {artworkUrl && (
        <>
          <div
            ref={el => { if (el) el.style.backgroundImage = `url(${artworkUrl})` }}
            className="fixed inset-0 -z-10 bg-black lyrics-blur-bg"
          />
          {bgGradient && (
            <div
              ref={el => { if (el) el.style.background = bgGradient }}
              className="fixed inset-0 -z-10 opacity-40 mix-blend-overlay"
            />
          )}
          <div
            className="fixed inset-0 -z-10 lyrics-fade-overlay"
          />
        </>
      )}

      <div className="relative z-10 w-full px-6 py-8">
        <div
          className={`rounded-2xl p-6 mx-auto max-w-lg ${artworkUrl ? 'lyrics-content-glass' : ''}`}
        >
          {syncedContent ? (
            <div ref={containerRef} className="w-full">
              <div className="flex flex-col items-center gap-5 pb-[45%]">
                {syncedLines.map((line, i) => {
                  const isActive = i === currentLine
                  const isPast = i < currentLine
                  return (
                    <div
                      key={i}
                      ref={isActive ? activeRef : undefined}
                      onClick={onSeek ? () => onSeek(line.time) : undefined}
                      dir="auto"
                      className={`text-center transition-all duration-500 ease-out ${
                        isActive
                          ? 'text-white text-xl font-semibold scale-100 opacity-100 drop-shadow-[0_0_20px_rgba(255,255,255,0.3)]'
                          : isPast
                          ? 'text-white/20 text-sm font-light scale-90'
                          : 'text-white/40 text-sm font-light scale-90'
                      } ${onSeek ? 'cursor-pointer' : ''}`}
                    >
                      {line.text}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : lyricsContent ? (
            <div className="flex flex-col items-center gap-3">
              {lyricsContent.split('\n').filter(l => l.trim()).map((line, i) => (
                <p key={i} dir="auto" className="text-white/70 text-base text-center leading-relaxed font-light">
                  {line}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

import { useMemo } from 'react'
import { generateWaveform } from '../lib/waveform'

/**
 * "Listening" indicator shown while a stream is being resolved. Renders the
 * same per-track waveform (deterministic from trackId) at small size.
 */
export function LoadingWaveform({
  trackId,
  bars = 24,
  barHeight = 18,
  barWidth = 2.5,
}: {
  trackId?: string
  bars?: number
  barHeight?: number
  barWidth?: number
}) {
  const amplitudes = useMemo(
    () => generateWaveform(trackId ?? 'listening', bars),
    [trackId, bars],
  )
  return (
    <span className="waveform-track" aria-label="Loading" aria-hidden="false">
      {amplitudes.map((amp, i) => (
        <span
          key={i}
          className="waveform-bar playing"
          style={{
            height: `${Math.max(2, amp * barHeight)}px`,
            width: barWidth,
            borderRadius: 9999,
            backgroundColor: 'var(--color-emerald)',
            animationDelay: `${(i % 4) * 120}ms`,
          }}
        />
      ))}
    </span>
  )
}

interface WaveformScrubberProps {
  trackId: string
  /** Playback position 0..1 */
  progress: number
  isPlaying: boolean
  onSeek: (fraction: number) => void
  bars?: number
  barHeight?: number
  barWidth?: number
  ariaLabel?: string
}

/**
 * The waveform-as-structure scrubber. Shared by the full player and the
 * mini-player so "progress through time" is always rendered as a waveform.
 * Deterministic per track id — identical shape to the Android app.
 */
export function WaveformScrubber({
  trackId,
  progress,
  isPlaying,
  onSeek,
  bars = 64,
  barHeight = 40,
  barWidth = 3,
  ariaLabel = 'Seek',
}: WaveformScrubberProps) {
  const amplitudes = useMemo(
    () => generateWaveform(trackId, bars),
    [trackId, bars],
  )

  const played = Math.min(bars, Math.max(0, Math.round(progress * bars)))
  const filled = progress > 0.999 ? played - 1 : played

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    if (rect.width <= 0) return
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    onSeek(frac)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    let frac = progress
    if (e.key === 'ArrowRight') frac = Math.min(1, progress + 0.05)
    else if (e.key === 'ArrowLeft') frac = Math.max(0, progress - 0.05)
    else if (e.key === 'Home') frac = 0
    else if (e.key === 'End') frac = 1
    else return
    e.preventDefault()
    onSeek(frac)
  }

  return (
    <div
      className="waveform-track group cursor-pointer"
      style={{ height: barHeight }}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="slider"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      tabIndex={0}
    >
      {amplitudes.map((amp, i) => {
        const active = i < filled
        return (
          <span
            key={i}
            className={`waveform-bar ${isPlaying ? 'playing' : ''}`}
            style={{
              height: `${Math.max(3, amp * barHeight)}px`,
              width: barWidth,
              animationDelay: `${(i % 4) * 120}ms`,
              backgroundColor: active
                ? 'var(--color-emerald)'
                : 'var(--color-hairline)',
            }}
          />
        )
      })}
    </div>
  )
}
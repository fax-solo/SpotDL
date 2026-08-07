import { useNavigate } from 'react-router-dom'
import { Play, SkipForward } from 'lucide-react'
import { usePlayer } from '../hooks/usePlayer'
import { ArtworkImage } from './ArtworkImage'
import { WaveformScrubber } from './WaveformScrubber'

interface MiniPlayerBarProps {
  /** Render height offset above the bottom bar (native). 0 = screen bottom. */
  bottomOffset?: number
}

/**
 * Docks above the bottom nav whenever a track is playing. Progress is the
 * same per-track waveform as the full player — the signature motif carried
 * through at small size.
 */
export function MiniPlayerBar({ bottomOffset = 0 }: MiniPlayerBarProps) {
  const { currentTrack, isPlaying, currentTime, duration, pause, resume, next, seek } = usePlayer()
  const navigate = useNavigate()

  if (!currentTrack) return null

  const progress = duration > 0 ? currentTime / duration : 0

  return (
    <div
      className="fixed left-0 right-0 z-40 mini-player-enter"
      style={{ bottom: `calc(${bottomOffset}px + var(--sab, env(safe-area-inset-bottom, 0px)))` }}
    >
      <button
        onClick={() => navigate('/player')}
        className="w-full flex items-center gap-3 px-3 py-2 bg-white/90 dark:bg-surface-high/95 border-t border-light-border dark:border-hairline backdrop-mobile touch-pan-y"
        aria-label={`Now playing: ${currentTrack.title}`}
      >
        <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
          <ArtworkImage
            src={currentTrack.artworkUrl}
            alt=""
            className="w-full h-full"
            iconSize={16}
          />
        </div>

        <div className="flex-1 min-w-0 text-left">
          <p dir="auto" className="text-sm font-medium text-light-text dark:text-text-high truncate">
            {currentTrack.title}
          </p>
          <p dir="auto" className="text-xs text-light-muted dark:text-text-mid truncate">
            {currentTrack.artist}
          </p>
        </div>

        <span
          onClick={e => e.stopPropagation()}
          className="flex-1 hidden xs:flex"
          aria-hidden="true"
        >
          <WaveformScrubber
            trackId={currentTrack.id}
            progress={progress}
            isPlaying={isPlaying}
            onSeek={seek}
            bars={36}
            barHeight={22}
            barWidth={2}
          />
        </span>

        <span className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => (isPlaying ? pause() : resume())}
            className="p-2.5 rounded-full text-emerald dark:text-emerald hover:bg-emerald/10 transition-colors cursor-pointer"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <PauseIcon /> : <Play className="w-5 h-5" />}
          </button>
          <button
            onClick={next}
            className="p-2.5 rounded-full text-light-muted dark:text-text-mid hover:bg-hairline/50 transition-colors cursor-pointer"
            aria-label="Next track"
          >
            <SkipForward className="w-5 h-5" />
          </button>
        </span>
      </button>
    </div>
  )
}

function PauseIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  )
}
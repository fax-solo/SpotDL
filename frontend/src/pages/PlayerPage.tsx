import { Music, Play, Pause, SkipBack, SkipForward, Volume2, Shuffle, Repeat, ListMusic } from 'lucide-react'
import { usePlayer } from '../hooks/usePlayer'
import { useNavigate } from 'react-router-dom'

export function PlayerPage() {
  const {
    currentTrack, isPlaying, currentTime, duration, volume,
    shuffle, repeatMode, queue, queueIndex,
    pause, resume, next, prev, seek, setVolume,
    toggleShuffle, cycleRepeat,
  } = usePlayer()
  const navigate = useNavigate()

  function formatTime(s: number) {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    seek(pct * duration)
  }

  if (!currentTrack) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
        <Music className="w-16 h-16 text-light-muted dark:text-dark-muted mb-4" />
        <h2 className="text-xl font-bold text-light-text dark:text-dark-text mb-2">No track playing</h2>
        <p className="text-sm text-light-muted dark:text-dark-muted mb-6 max-w-xs">
          Search for music and tap the play button to start listening.
        </p>
        <button
          onClick={() => navigate('/search')}
          className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white font-medium rounded-xl transition-colors text-sm cursor-pointer focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          Browse Music
        </button>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col px-6 pt-8 pb-32 max-w-lg mx-auto w-full">
      {/* Artwork */}
      <div className="w-full aspect-square rounded-2xl bg-gradient-to-br from-accent/20 to-blue-500/20 flex items-center justify-center mb-8 overflow-hidden shadow-xl">
        {currentTrack.artworkUrl ? (
          <img src={currentTrack.artworkUrl} alt={currentTrack.album || ''} className="w-full h-full object-cover" />
        ) : (
          <Music className="w-20 h-20 text-light-muted dark:text-dark-muted" />
        )}
      </div>

      {/* Track info */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-light-text dark:text-dark-text truncate">{currentTrack.title}</h1>
        <p className="text-sm text-light-muted dark:text-dark-muted truncate mt-1">{currentTrack.artist}</p>
        {currentTrack.album && (
          <p className="text-xs text-light-muted/60 dark:text-dark-muted/60 truncate mt-0.5">{currentTrack.album}</p>
        )}
      </div>

      {/* Progress bar */}
      <div
        className="w-full h-1.5 bg-gray-200 dark:bg-zinc-700 rounded-full overflow-hidden mb-2 cursor-pointer"
        onClick={handleProgressClick}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        tabIndex={0}
      >
        <div className="h-full bg-accent rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>
      <div className="flex justify-between text-xs text-light-muted dark:text-dark-muted mb-6">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-6 mb-8">
        <button
          onClick={toggleShuffle}
          className={`p-2 rounded-full transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-accent/40 ${shuffle ? 'text-accent' : 'text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text'}`}
          aria-label="Toggle shuffle"
        >
          <Shuffle className="w-5 h-5" />
        </button>
        <button
          onClick={prev}
          className="p-3 rounded-full text-light-text dark:text-dark-text hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-accent/40"
          aria-label="Previous track"
        >
          <SkipBack className="w-6 h-6" />
        </button>
        <button
          onClick={() => isPlaying ? pause() : resume()}
          className="w-16 h-16 rounded-full bg-accent hover:bg-accent-hover text-white flex items-center justify-center transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-accent/40 shadow-lg"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-0.5" />}
        </button>
        <button
          onClick={next}
          className="p-3 rounded-full text-light-text dark:text-dark-text hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-accent/40"
          aria-label="Next track"
        >
          <SkipForward className="w-6 h-6" />
        </button>
        <button
          onClick={cycleRepeat}
          className={`p-2 rounded-full transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-accent/40 ${repeatMode !== 'none' ? 'text-accent' : 'text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text'}`}
          aria-label="Toggle repeat"
        >
          <Repeat className="w-5 h-5" />
          {repeatMode === 'one' && <span className="absolute text-[8px] font-bold">1</span>}
        </button>
      </div>

      {/* Volume */}
      <div className="flex items-center gap-3 mb-6">
        <Volume2 className="w-4 h-4 text-light-muted dark:text-dark-muted flex-shrink-0" />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={e => setVolume(parseFloat(e.target.value))}
          className="w-full h-1.5 accent-accent cursor-pointer"
          aria-label="Volume"
        />
      </div>

      {/* Queue */}
      {queue.length > 1 && (
        <div className="border-t border-light-border/50 dark:border-dark-border/50 pt-4">
          <div className="flex items-center gap-2 mb-3">
            <ListMusic className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium text-light-text dark:text-dark-text">Queue</span>
            <span className="text-xs text-light-muted dark:text-dark-muted">{queue.length} tracks</span>
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {queue.map((t, i) => (
              <div
                key={t.id}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${
                  i === queueIndex
                    ? 'bg-accent/10 text-accent font-medium'
                    : 'text-light-muted dark:text-dark-muted'
                }`}
              >
                <Music className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{t.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

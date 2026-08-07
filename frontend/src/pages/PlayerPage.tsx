import { useState, useRef, useCallback } from 'react'
import { Music, Play, Pause, SkipBack, SkipForward, Volume2, Shuffle, Repeat, ListMusic, Mic2, Disc3, GripVertical, X } from 'lucide-react'
import { usePlayer } from '../hooks/usePlayer'
import { useNavigate } from 'react-router-dom'
import { LyricsView } from '../components/LyricsView'
import { ArtworkImage } from '../components/ArtworkImage'
import { WaveformScrubber } from '../components/WaveformScrubber'

type Tab = 'now-playing' | 'lyrics' | 'queue'

export function PlayerPage() {
  const {
    currentTrack, isPlaying, currentTime, duration, volume,
    shuffle, repeatMode, queue, queueIndex,
    pause, resume, next, prev, seek, setVolume,
    toggleShuffle, cycleRepeat, removeFromQueue, reorderQueue,
  } = usePlayer()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('now-playing')
  const dragItem = useRef<number | null>(null)
  const dragOverItem = useRef<number | null>(null)

  function formatTime(s: number) {
    if (!isFinite(s) || s < 0) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const handleDragStart = useCallback((index: number) => {
    dragItem.current = index
  }, [])

  const handleDragEnter = useCallback((index: number) => {
    dragOverItem.current = index
  }, [])

  const handleDragEnd = useCallback(() => {
    if (dragItem.current === null || dragOverItem.current === null) return
    reorderQueue(dragItem.current, dragOverItem.current)
    dragItem.current = null
    dragOverItem.current = null
  }, [reorderQueue])

  if (!currentTrack) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center animate-scaleIn">
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald/20 to-emerald-strong/20 flex items-center justify-center mb-6">
          <Music className="w-12 h-12 text-light-muted dark:text-dark-muted" />
        </div>
        <h2 className="text-xl font-bold text-light-text dark:text-dark-text mb-2">No track playing</h2>
        <p className="text-sm text-light-muted dark:text-dark-muted mb-6 max-w-xs">
          Search for music and tap the play button to start listening.
        </p>
        <button
          onClick={() => navigate('/search')}
          className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white font-medium rounded-xl transition-all text-sm cursor-pointer active:scale-95"
        >
          Browse Music
        </button>
      </div>
    )
  }

  const tabs: { key: Tab; label: string; icon: typeof Disc3 }[] = [
    { key: 'now-playing', label: 'Now Playing', icon: Disc3 },
    { key: 'lyrics', label: 'Lyrics', icon: Mic2 },
    { key: 'queue', label: 'Queue', icon: ListMusic },
  ]

  return (
    <div className="flex-1 flex flex-col max-w-lg mx-auto w-full relative">
      {/* Artwork backdrop */}
      {currentTrack.artworkUrl && (
        <div className="fixed inset-0 -z-10">
          <ArtworkImage src={currentTrack.artworkUrl} alt="" className="w-full h-full opacity-30 blur-3xl scale-110" />
          <div className="absolute inset-0 bg-white/60 dark:bg-black/60" />
        </div>
      )}

      {/* Tab bar */}
      <div className="flex items-center justify-around px-4 pt-2 pb-1 border-b border-light-border/30 dark:border-dark-border/30 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl animate-fadeIn">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-medium transition-all cursor-pointer ${
              tab === key
                ? 'bg-accent/10 text-accent'
                : 'text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'now-playing' && (
          <div className="flex flex-col px-6 pt-6 pb-8 animate-slideUp" key="now-playing">
            {/* Artwork */}
            <div className="w-full aspect-square rounded-2xl overflow-hidden shadow-2xl mb-6 bg-gradient-to-br from-emerald/10 to-emerald-strong/10">
              <ArtworkImage
                src={currentTrack.artworkUrl}
                alt={currentTrack.album || ''}
                className="w-full h-full"
                iconSize={96}
              />
            </div>

            {/* Track info */}
            <div className="mb-5">
              <h1 dir="auto" className="text-xl font-bold text-light-text dark:text-dark-text truncate">{currentTrack.title}</h1>
              <p dir="auto" className="text-sm text-light-muted dark:text-dark-muted truncate mt-1">{currentTrack.artist}</p>
              {currentTrack.album && (
                <p dir="auto" className="text-xs text-light-muted/60 dark:text-dark-muted/60 truncate mt-0.5">{currentTrack.album}</p>
              )}
            </div>

            {/* Progress */}
            <div className="mb-1">
              <WaveformScrubber
                trackId={currentTrack.id}
                progress={duration > 0 ? currentTime / duration : 0}
                isPlaying={isPlaying}
                onSeek={f => seek(f * duration)}
                bars={72}
                barHeight={44}
              />
              <div className="flex justify-between text-xs text-light-muted dark:text-dark-muted mt-1.5">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center gap-5 my-6">
              <button
                onClick={toggleShuffle}
                className={`p-2 rounded-full transition-colors cursor-pointer ${
                  shuffle
                    ? 'text-accent'
                    : 'text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text'
                }`}
                aria-label="Toggle shuffle"
              >
                <Shuffle className="w-5 h-5" />
              </button>
              <button
                onClick={prev}
                className="p-2.5 rounded-full text-light-text dark:text-dark-text hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                aria-label="Previous track"
              >
                <SkipBack className="w-6 h-6" />
              </button>
              <button
                onClick={() => isPlaying ? pause() : resume()}
                className="w-16 h-16 rounded-full bg-accent hover:bg-accent-hover text-white flex items-center justify-center transition-all cursor-pointer shadow-lg hover:shadow-xl active:scale-95"
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-0.5" />}
              </button>
              <button
                onClick={next}
                className="p-2.5 rounded-full text-light-text dark:text-dark-text hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                aria-label="Next track"
              >
                <SkipForward className="w-6 h-6" />
              </button>
              <button
                onClick={cycleRepeat}
                className={`p-2 rounded-full relative transition-colors cursor-pointer ${
                  repeatMode !== 'none'
                    ? 'text-accent'
                    : 'text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text'
                }`}
                aria-label="Toggle repeat"
              >
                <Repeat className="w-5 h-5" />
                {repeatMode === 'one' && (
                  <span className="absolute -top-0.5 -right-0.5 text-[9px] font-bold bg-accent text-white w-3.5 h-3.5 rounded-full flex items-center justify-center">1</span>
                )}
              </button>
            </div>

            {/* Volume */}
            <div className="flex items-center gap-3 px-2">
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
          </div>
        )}

        {tab === 'lyrics' && (
          <div className="px-2 py-4 animate-slideUp" key="lyrics">
            <LyricsView
              trackName={currentTrack.title}
              artistName={currentTrack.artist}
              albumName={currentTrack.album}
              duration={duration}
              currentTime={currentTime}
              artworkUrl={currentTrack.artworkUrl}
              storedLyrics={{
                plainLyrics: currentTrack.plainLyrics ?? null,
                syncedLyrics: currentTrack.syncedLyrics ?? null,
              }}
              onSeek={seek}
            />
          </div>
        )}

        {tab === 'queue' && (
          <div className="px-4 py-4 animate-slideUp" key="queue">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-light-text dark:text-dark-text">Up next</h2>
              <span className="text-xs text-light-muted dark:text-dark-muted">{queue.length} tracks</span>
            </div>

            {queue.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <ListMusic className="w-12 h-12 text-light-muted/40 dark:text-dark-muted/40 mb-3" />
                <p className="text-sm text-light-muted dark:text-dark-muted">Queue is empty</p>
              </div>
            ) : (
              <div className="space-y-1">
                {queue.map((t, i) => (
                  <div
                    key={`${t.id}-${i}`}
                    draggable
                    onDragStart={() => handleDragStart(i)}
                    onDragEnter={() => handleDragEnter(i)}
                    onDragEnd={handleDragEnd}
                    onDragOver={e => e.preventDefault()}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                      i === queueIndex
                        ? 'bg-accent/10 text-accent font-medium ring-1 ring-accent/20'
                        : 'text-light-text dark:text-dark-text hover:bg-gray-50 dark:hover:bg-zinc-800/50'
                    } ${dragOverItem.current === i && dragItem.current !== i ? 'border-t-2 border-accent/40' : ''}`}
                  >
                    <div className="cursor-grab active:cursor-grabbing text-light-muted/40 dark:text-dark-muted/40 hover:text-light-muted dark:hover:text-dark-muted flex-shrink-0">
                      <GripVertical className="w-4 h-4" />
                    </div>
                    <ArtworkImage
                      src={t.artworkUrl}
                      alt=""
                      className="w-10 h-10 rounded-lg flex-shrink-0"
                      iconSize={16}
                    />
                    <div className="flex-1 min-w-0">
                      <p className={`truncate text-sm ${i === queueIndex ? 'text-accent' : ''}`}>{t.title}</p>
                      <p className="truncate text-xs text-light-muted dark:text-dark-muted">{t.artist}</p>
                    </div>
                    <button
                      onClick={() => removeFromQueue(i)}
                      className="p-1.5 rounded-full text-light-muted/40 dark:text-dark-muted/40 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors cursor-pointer flex-shrink-0"
                      aria-label={`Remove ${t.title} from queue`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowDown, Play, Pause, SkipBack, SkipForward, Music, Mic2, ListMusic } from 'lucide-react'
import { ArtworkImage } from '../components/ArtworkImage'
import { LyricsView } from '../components/LyricsView'
import { History } from '../components/History'
import { usePlayer } from '../hooks/usePlayer'
import { useHistory } from '../hooks/useHistory'
import { useToast } from '../components/Toast'
import type { TrackMeta } from '../lib/api'
import { useDownloads } from '../hooks/useDownloads'

function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function PlayerScreen() {
  const navigate = useNavigate()
  const { currentTrack, isPlaying, currentTime, duration, volume, pause, resume, next, prev, seek, setVolume, play } = usePlayer()
  const { entries, removeEntry, clearHistory } = useHistory()
  const { addDownload } = useDownloads()
  const { toast } = useToast()
  
  const [showLyrics, setShowLyrics] = useState(false)
  const [showQueue, setShowQueue] = useState(false)
  const progressRef = useRef<HTMLDivElement>(null)

  const handleRedownload = useCallback(async (entry: import('../hooks/useHistory').HistoryEntry) => {
    const track: TrackMeta = {
      title: entry.title,
      artist: entry.artist,
      album: entry.album,
      artwork_url: entry.artworkUrl,
      url: '',
      type: 'track',
    }
    addDownload(track)
    toast(`Queued re-download for ${entry.title}`, 'success')
  }, [addDownload, toast])

  const handlePlay = useCallback((entry: import('../hooks/useHistory').HistoryEntry) => {
    if (!entry.filePath) {
      toast('No local file available. Re-download first.', 'error')
      return
    }
    play(entry, entries)
  }, [play, entries, toast])

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration || !progressRef.current) return
    const rect = progressRef.current.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    seek(pct * duration)
  }, [duration, seek])

  const togglePlay = useCallback(() => {
    isPlaying ? pause() : resume()
  }, [isPlaying, pause, resume])

  if (!currentTrack) {
    return (
      <div className="min-h-screen bg-light-bg dark:bg-dark-bg flex flex-col items-center justify-center px-6">
        <Music className="w-16 h-16 text-light-muted dark:text-dark-muted mb-4" />
        <p className="text-light-muted dark:text-dark-muted text-sm">No track selected</p>
        <button onClick={() => navigate('/')} className="mt-4 px-6 py-2 bg-accent text-white rounded-lg text-sm font-medium cursor-pointer">Go Home</button>
      </div>
    )
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="min-h-screen bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text flex flex-col">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full hover:bg-white/10 dark:hover:bg-zinc-800/50 flex items-center justify-center transition-colors cursor-pointer"
        >
          <ArrowDown className="w-5 h-5 text-light-muted dark:text-dark-muted" />
        </button>
        <span className="text-xs font-medium text-light-muted dark:text-dark-muted uppercase tracking-wider">Now Playing</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setShowQueue(false)
              setShowLyrics(v => !v)
            }}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              showLyrics
                ? 'bg-accent text-white'
                : 'hover:bg-white/10 dark:hover:bg-zinc-800/50 text-light-muted dark:text-dark-muted'
            }`}
          >
            <Mic2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setShowLyrics(false)
              setShowQueue(v => !v)
            }}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              showQueue
                ? 'bg-accent text-white'
                : 'hover:bg-white/10 dark:hover:bg-zinc-800/50 text-light-muted dark:text-dark-muted'
            }`}
          >
            <ListMusic className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-8 pb-8 min-h-0">
        {showLyrics ? (
          <motion.div
            key="lyrics"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full flex-1 min-h-0 mb-4 rounded-2xl overflow-hidden relative"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-blue-500/5" />
            <LyricsView
              trackName={currentTrack.title}
              artistName={currentTrack.artist}
              albumName={currentTrack.album}
              duration={duration}
              currentTime={currentTime}
            />
          </motion.div>
        ) : showQueue ? (
          <motion.div
            key="queue"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full flex-1 min-h-0 mb-4 rounded-2xl overflow-hidden bg-white/50 dark:bg-dark-surface/50 border border-light-border/40 dark:border-dark-border/30"
          >
            <History 
              entries={entries} 
              onClear={clearHistory} 
              onRemove={removeEntry} 
              onRedownload={handleRedownload}
              onPlay={handlePlay}
              minimal 
            />
          </motion.div>
        ) : (
          <motion.div
            key="artwork"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-[320px] aspect-square rounded-2xl overflow-hidden shadow-2xl mb-8"
          >
            {currentTrack.artworkUrl ? (
              <ArtworkImage src={currentTrack.artworkUrl} alt={currentTrack.title} className="w-full h-full object-cover" iconSize={64} loading="eager" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-accent/20 to-blue-500/20 flex items-center justify-center">
                <Music className="w-20 h-20 text-accent/40" />
              </div>
            )}
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm text-center mb-6"
        >
          <h1 className="text-xl font-bold text-light-text dark:text-white leading-tight mb-1 line-clamp-2">
            {currentTrack.title}
          </h1>
          <p className="text-sm text-light-muted dark:text-zinc-400">
            {currentTrack.artist}
          </p>
        </motion.div>

        {/* Progress bar */}
        <div className="w-full max-w-sm mb-4">
          <div
            ref={progressRef}
            onClick={handleProgressClick}
            className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full cursor-pointer group relative"
          >
            <motion.div
              className="h-full bg-accent rounded-full relative"
              style={{ width: `${progress}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-accent shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ left: `calc(${progress}% - 7px)` }}
            />
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-xs text-light-muted dark:text-zinc-500 tabular-nums">{formatTime(currentTime)}</span>
            <span className="text-xs text-light-muted dark:text-zinc-500 tabular-nums">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-6 w-full max-w-sm">
          <button
            onClick={prev}
            className="w-12 h-12 rounded-full hover:bg-white/10 dark:hover:bg-zinc-800/50 flex items-center justify-center transition-colors cursor-pointer"
          >
            <SkipBack className="w-6 h-6 text-light-text dark:text-white" />
          </button>

          <button
            onClick={togglePlay}
            className="w-16 h-16 rounded-full bg-accent hover:bg-accent-hover flex items-center justify-center transition-colors shadow-lg cursor-pointer"
          >
            {isPlaying ? <Pause className="w-7 h-7 text-white" /> : <Play className="w-7 h-7 text-white ml-1" />}
          </button>

          <button
            onClick={next}
            className="w-12 h-12 rounded-full hover:bg-white/10 dark:hover:bg-zinc-800/50 flex items-center justify-center transition-colors cursor-pointer"
          >
            <SkipForward className="w-6 h-6 text-light-text dark:text-white" />
          </button>
        </div>

        {/* Volume */}
        <div className="w-full max-w-sm mt-6 flex items-center gap-3">
          <span className="text-xs text-light-muted dark:text-zinc-500 w-8 text-right tabular-nums">{Math.round(volume * 100)}%</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={e => setVolume(parseFloat(e.target.value))}
            className="flex-1 h-1 accent-accent cursor-pointer"
          />
        </div>
      </div>
    </div>
  )
}

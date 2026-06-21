import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowDown, Play, Pause, SkipBack, SkipForward, Music, Mic2, ListMusic,
  Plus, Trash2, Play as PlayIcon, Music2, FolderOpen, Check,
} from 'lucide-react'
import { ArtworkImage } from '../components/ArtworkImage'
import { LyricsView } from '../components/LyricsView'
import { History } from '../components/History'
import { usePlayer } from '../hooks/usePlayer'
import { useHistory } from '../hooks/useHistory'
import { usePlaylists, type Playlist } from '../hooks/usePlaylists'
import { useToast } from '../components/Toast'
import type { TrackMeta } from '../lib/api'
import { useDownloads } from '../hooks/useDownloads'
import { useBottomBar } from '../hooks/useBottomBar'
import { fileExists } from '../lib/capacitorBridge'

function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function PlayerScreen() {
  const navigate = useNavigate()
  const {
    currentTrack, isPlaying, currentTime, duration, volume,
    pause, resume, next, prev, seek, setVolume, play,
  } = usePlayer()
  const { entries, removeEntry, clearHistory } = useHistory()
  const { playlists, createPlaylist, deletePlaylist, addTrackToPlaylist, removeTrackFromPlaylist, renamePlaylist } = usePlaylists()
  const { addDownload } = useDownloads()
  const { toast } = useToast()

  const [showLyrics, setShowLyrics] = useState(false)
  const [showQueue, setShowQueue] = useState(false)
  const [showAddToPlaylist, setShowAddToPlaylist] = useState(false)
  const { setHidden } = useBottomBar()
  const isNowPlaying = !!currentTrack && !showLyrics && !showQueue
  const isLyrics = !!currentTrack && showLyrics
  useEffect(() => { setHidden(isNowPlaying || isLyrics) }, [setHidden, isNowPlaying, isLyrics])
  const [activePlaylist, setActivePlaylist] = useState<Playlist | null>(null)
  const [showCreatePlaylist, setShowCreatePlaylist] = useState(false)
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [renamingPlaylist, setRenamingPlaylist] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const progressRef = useRef<HTMLDivElement>(null)

  const downloadedEntries = entries.filter(e => e.filePath)
  const currentTrackLyrics = currentTrack
    ? entries.find(e => e.id === currentTrack.id)
    : undefined

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

  const handlePlay = useCallback(async (entry: import('../hooks/useHistory').HistoryEntry) => {
    if (!entry.filePath) {
      toast('No local file available. Re-download first.', 'error')
      return
    }
    const exists = await fileExists(entry.filePath)
    if (!exists) {
      toast('File not found. Re-download it.', 'error')
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

  const handleCreatePlaylist = useCallback(() => {
    const name = newPlaylistName.trim()
    if (!name) return
    createPlaylist(name)
    setNewPlaylistName('')
    setShowCreatePlaylist(false)
    toast(`Created "${name}" playlist`, 'success')
  }, [newPlaylistName, createPlaylist, toast])

  const handleAddToPlaylist = useCallback((playlistId: string) => {
    if (!currentTrack) return
    addTrackToPlaylist(playlistId, currentTrack.id)
    toast('Added to playlist', 'success')
    setShowAddToPlaylist(false)
  }, [currentTrack, addTrackToPlaylist, toast])

  const handlePlayPlaylist = useCallback((playlist: Playlist) => {
    const tracks = playlist.trackIds
      .map(id => entries.find(e => e.id === id))
      .filter((e): e is import('../hooks/useHistory').HistoryEntry => !!e && !!e.filePath)
    if (tracks.length === 0) {
      toast('No playable tracks in this playlist', 'error')
      return
    }
    play(tracks[0], tracks)
    setActivePlaylist(null)
  }, [entries, play, toast])

  const handleRename = useCallback((id: string) => {
    const name = renameValue.trim()
    if (!name) return
    renamePlaylist(id, name)
    setRenamingPlaylist(null)
    setRenameValue('')
  }, [renameValue, renamePlaylist])

  // ── Library view (no track selected) ──
  if (!currentTrack) {
    return (
      <div className="min-h-screen bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-6 pb-4">
          <h1 className="text-2xl font-bold">Your Library</h1>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-24 space-y-6">
          {/* ─── Playlists ─── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-light-muted dark:text-dark-muted uppercase tracking-wider">Playlists</h2>
              <button
                onClick={() => { setNewPlaylistName(''); setShowCreatePlaylist(true) }}
                className="text-xs text-accent font-medium flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> New
              </button>
            </div>

            {playlists.length === 0 && !showCreatePlaylist && (
              <p className="text-sm text-light-muted dark:text-dark-muted py-8 text-center">
                No playlists yet. Tap "New" to create one.
              </p>
            )}

            {/* Create playlist input */}
            <AnimatePresence>
              {showCreatePlaylist && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden mb-2"
                >
                  <div className="flex items-center gap-2 p-3 bg-white dark:bg-dark-surface rounded-xl border border-light-border/40 dark:border-dark-border/30">
                    <input
                      value={newPlaylistName}
                      onChange={e => setNewPlaylistName(e.target.value)}
                      placeholder="Playlist name"
                      onKeyDown={e => { if (e.key === 'Enter') handleCreatePlaylist() }}
                      className="flex-1 bg-transparent text-sm text-light-text dark:text-dark-text placeholder:text-light-muted dark:placeholder:text-dark-muted focus:outline-none"
                      autoFocus
                    />
                    <button
                      onClick={handleCreatePlaylist}
                      disabled={!newPlaylistName.trim()}
                      className="px-3 py-1.5 bg-accent text-white text-xs font-medium rounded-lg disabled:opacity-50 cursor-pointer"
                    >
                      Create
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Playlist cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {playlists.map(pl => (
                <motion.button
                  key={pl.id}
                  layout
                  onClick={() => setActivePlaylist(pl)}
                  className="bg-white dark:bg-dark-surface rounded-xl p-4 border border-light-border/40 dark:border-dark-border/30 text-left cursor-pointer hover:shadow-sm transition-shadow"
                >
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-accent/20 to-blue-500/20 flex items-center justify-center mb-3">
                    <ListMusic className="w-5 h-5 text-accent" />
                  </div>
                  <p className="text-sm font-medium text-light-text dark:text-dark-text truncate">{pl.name}</p>
                  <p className="text-xs text-light-muted dark:text-dark-muted mt-0.5">
                    {pl.trackIds.length} {pl.trackIds.length === 1 ? 'track' : 'tracks'}
                  </p>
                </motion.button>
              ))}
            </div>
          </section>

          {/* ─── All Songs ─── */}
          <section>
            <h2 className="text-sm font-semibold text-light-muted dark:text-dark-muted uppercase tracking-wider mb-3">
              All Songs
            </h2>
            {downloadedEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Music className="w-12 h-12 text-light-muted dark:text-dark-muted mb-3" />
                <p className="text-sm text-light-muted dark:text-dark-muted">Download some songs first!</p>
              </div>
            ) : (
              <div className="space-y-1">
                {downloadedEntries.map(entry => (
                  <button
                    key={entry.id}
                    onClick={() => handlePlay(entry)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/50 dark:hover:bg-dark-surface/50 transition-colors text-left cursor-pointer"
                  >
                    <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-accent/10">
                      {entry.artworkUrl ? (
                        <ArtworkImage src={entry.artworkUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Music2 className="w-4 h-4 text-accent/40" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-light-text dark:text-dark-text truncate">{entry.title}</p>
                      <p className="text-xs text-light-muted dark:text-dark-muted truncate">{entry.artist}</p>
                    </div>
                    <PlayIcon className="w-4 h-4 text-accent flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ─── Playlist detail overlay ─── */}
        <AnimatePresence>
          {activePlaylist && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center"
              onClick={() => setActivePlaylist(null)}
            >
              <motion.div
                initial={{ y: 200, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 200, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                className="w-full max-w-lg bg-light-bg dark:bg-dark-bg rounded-t-2xl sm:rounded-2xl max-h-[80vh] flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}
              >
                {/* Playlist header */}
                <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-light-border/40 dark:border-dark-border/30">
                  <div className="flex-1 min-w-0">
                    {renamingPlaylist === activePlaylist.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleRename(activePlaylist.id) }}
                          className="flex-1 bg-transparent text-lg font-bold text-light-text dark:text-dark-text focus:outline-none border-b border-accent"
                          autoFocus
                        />
                        <button onClick={() => handleRename(activePlaylist.id)} className="text-accent cursor-pointer"><Check className="w-5 h-5" /></button>
                      </div>
                    ) : (
                      <h2
                        className="text-lg font-bold text-light-text dark:text-dark-text truncate cursor-pointer hover:text-accent transition-colors"
                        onClick={() => { setRenameValue(activePlaylist.name); setRenamingPlaylist(activePlaylist.id) }}
                        title="Tap to rename"
                      >
                        {activePlaylist.name}
                      </h2>
                    )}
                    <p className="text-xs text-light-muted dark:text-dark-muted mt-0.5">
                      {activePlaylist.trackIds.length} {activePlaylist.trackIds.length === 1 ? 'track' : 'tracks'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handlePlayPlaylist(activePlaylist)}
                      disabled={activePlaylist.trackIds.length === 0}
                      className="p-2 rounded-lg bg-accent text-white disabled:opacity-50 cursor-pointer"
                      title="Play all"
                    >
                      <PlayIcon className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => { deletePlaylist(activePlaylist.id); setActivePlaylist(null); toast('Playlist deleted', 'success') }}
                      className="p-2 rounded-lg text-red-400 hover:bg-red-500/10 cursor-pointer"
                      title="Delete playlist"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Tracks */}
                <div className="flex-1 overflow-y-auto p-2">
                  {activePlaylist.trackIds.length === 0 ? (
                    <p className="text-sm text-light-muted dark:text-dark-muted text-center py-8">
                      No tracks yet. Add from the player.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {activePlaylist.trackIds.map(trackId => {
                        const entry = entries.find(e => e.id === trackId)
                        if (!entry) return null
                        return (
                          <div
                            key={trackId}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/50 dark:hover:bg-dark-surface/50 transition-colors group"
                          >
                            <button
                              onClick={() => handlePlay(entry)}
                              className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer"
                            >
                              <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 bg-accent/10">
                                {entry.artworkUrl ? (
                                  <ArtworkImage src={entry.artworkUrl} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <Music2 className="w-4 h-4 text-accent/40" />
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-light-text dark:text-dark-text truncate">{entry.title}</p>
                                <p className="text-xs text-light-muted dark:text-dark-muted truncate">{entry.artist}</p>
                              </div>
                            </button>
                            <button
                              onClick={() => {
                                removeTrackFromPlaylist(activePlaylist.id, trackId)
                                toast('Removed from playlist', 'success')
                              }}
                              className="p-1.5 rounded-lg text-light-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  // ── Now playing view ──
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0
  const pageRef = useRef<HTMLDivElement>(null)

  return (
    <div className="h-screen bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full hover:bg-white/10 dark:hover:bg-zinc-800/50 flex items-center justify-center transition-colors cursor-pointer"
        >
          <ArrowDown className="w-5 h-5 text-light-muted dark:text-dark-muted" />
        </button>
        <span className="text-xs font-medium text-light-muted dark:text-dark-muted uppercase tracking-wider">Now Playing</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowQueue(false); setShowLyrics(v => !v) }}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              showLyrics
                ? 'bg-accent text-white'
                : 'hover:bg-white/10 dark:hover:bg-zinc-800/50 text-light-muted dark:text-dark-muted'
            }`}
          >
            <Mic2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setShowLyrics(false); setShowQueue(v => !v) }}
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

      <div ref={pageRef} className={`flex-1 ${showLyrics ? 'overflow-y-auto' : 'flex flex-col items-center justify-center'} px-8 pb-8 min-h-0`}>
        {showLyrics ? (
          <div className="w-full pt-4">
            <LyricsView
              trackName={currentTrack.title}
              artistName={currentTrack.artist}
              albumName={currentTrack.album}
              duration={duration}
              currentTime={currentTime}
              storedLyrics={currentTrackLyrics ? { plainLyrics: currentTrackLyrics.plainLyrics ?? null, syncedLyrics: currentTrackLyrics.syncedLyrics ?? null } : null}
              scrollRef={pageRef}
              onSeek={seek}
            />
          </div>
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

        {/* Track info + Add to Playlist */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm text-center mb-6"
        >
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-xl font-bold text-light-text dark:text-white leading-tight line-clamp-2">
              {currentTrack.title}
            </h1>
            <button
              onClick={() => setShowAddToPlaylist(true)}
              className="p-1.5 rounded-lg text-light-muted dark:text-dark-muted hover:text-accent hover:bg-accent/10 transition-colors flex-shrink-0 cursor-pointer"
              title="Add to playlist"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
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

      {/* ─── Add to Playlist modal ─── */}
      <AnimatePresence>
        {showAddToPlaylist && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center"
            onClick={() => setShowAddToPlaylist(false)}
          >
            <motion.div
              initial={{ y: 200, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 200, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              className="w-full max-w-sm bg-light-bg dark:bg-dark-bg rounded-t-2xl sm:rounded-2xl p-5"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-base font-bold text-light-text dark:text-dark-text mb-4">Add to Playlist</h3>
              {playlists.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-sm text-light-muted dark:text-dark-muted mb-3">No playlists yet</p>
                  <button
                    onClick={() => { setShowAddToPlaylist(false); setNewPlaylistName(''); setShowCreatePlaylist(true) }}
                    className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg cursor-pointer"
                  >
                    Create Playlist
                  </button>
                </div>
              ) : (
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {playlists.map(pl => (
                    <button
                      key={pl.id}
                      onClick={() => handleAddToPlaylist(pl.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/50 dark:hover:bg-dark-surface/50 transition-colors text-left cursor-pointer"
                    >
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent/20 to-blue-500/20 flex items-center justify-center flex-shrink-0">
                        <FolderOpen className="w-4 h-4 text-accent" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-light-text dark:text-dark-text truncate">{pl.name}</p>
                        <p className="text-xs text-light-muted dark:text-dark-muted">{pl.trackIds.length} tracks</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

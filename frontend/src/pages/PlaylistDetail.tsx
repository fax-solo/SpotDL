import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Download, DownloadCloud, ListMusic, AlertCircle, XCircle, CheckCircle2 } from 'lucide-react'
import { ArtworkImage } from '../components/ArtworkImage'
import { downloadTrack } from '../lib/api'
import { downloadFile, isNative } from '../lib/capacitorBridge'
import { mapConcurrent } from '../lib/concurrency'
import type { CollectionMeta, TrackMeta } from '../lib/spotifyApi'
import { SkeletonRow } from '../components/SkeletonRow'
import { useToast } from '../components/Toast'
import { useHistory, type HistoryEntry } from '../hooks/useHistory'
import { apiUrl } from '../lib/apiConfig'

function norm(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, '').trim()
}

function isTrackDownloaded(track: TrackMeta, entries: HistoryEntry[]): boolean {
  const trackTitle = norm(track.title)
  const trackArtist = norm(track.artist)
  return entries.some(e =>
    norm(e.title) === trackTitle && norm(e.artist) === trackArtist
  )
}

interface TrackProgress {
  stage: string
  pct: number | null
  done: boolean
  failed: boolean
}

function visualPct(progress: TrackProgress): number {
  if (progress.done) return 100
  if (progress.failed) return 0
  if (progress.stage.includes('Searching')) return 5
  if (progress.stage.includes('Downloading')) return 10 + (progress.pct ?? 0) * 0.3
  if (progress.stage.includes('Converting')) return 40 + (progress.pct ?? 0) * 0.6
  return 0
}

interface PlaylistDetailProps {
  onDownloadComplete: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void
}

function TrackArtwork({ track, collectionArtwork, className, loading }: { track: TrackMeta; collectionArtwork: string | null; className: string; loading?: 'lazy' | 'eager' }) {
  return <ArtworkImage src={track.artwork_url || collectionArtwork} alt={track.album} className={className} loading={loading} />
}

const itemVariants = {
  hidden: { opacity: 0, x: -20 } as const,
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.025, type: 'spring' as const, stiffness: 350, damping: 30 },
  }),
}

export function PlaylistDetail({ onDownloadComplete }: PlaylistDetailProps) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const contentType = (location.state as { type?: string } | null)?.type || 'playlist'
  const [collection, setCollection] = useState<CollectionMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [downloadingAll, setDownloadingAll] = useState(false)
  const [completedCount, setCompletedCount] = useState(0)
  const [trackProgress, setTrackProgress] = useState<Record<number, TrackProgress>>({})
  const abortRef = useRef<AbortController | null>(null)
  const { toast } = useToast()
  const { entries } = useHistory()
  const fetchAttempted = useRef(false)

  const doFetch = useCallback(async (playlistId: string) => {
    setLoading(true)
    setError(null)
    fetchAttempted.current = true
    try {
      const res = await fetch(apiUrl('/api/spotify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: `https://open.spotify.com/${contentType}/${playlistId}` }),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => null)
        throw new Error(errBody?.error || `Failed to load playlist (${res.status})`)
      }
      const data = await res.json()
      if (!data.tracks || data.tracks.length === 0) {
        throw new Error('This playlist has no tracks or could not be read')
      }
      setCollection(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load playlist')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!id) return
    doFetch(id)
  }, [id, doFetch])

  const tracks = collection?.tracks ?? []

  const downloadedSet = new Set<number>()
  const downloadedCount = tracks.filter((t, i) => {
    const d = isTrackDownloaded(t, entries)
    if (d) downloadedSet.add(i)
    return d
  }).length

  const goToTrack = (trackUrl: string) => {
    const match = trackUrl.match(/\/track\/([a-zA-Z0-9]+)/)
    if (match) navigate(`/track/${match[1]}`)
  }

  const handleDownload = async (track: TrackMeta) => {
    try {
      const { blob, filename } = await downloadTrack(track)
      const filePath = await downloadFile(blob, filename)
      toast(`Downloaded ${track.title}`, 'success')
      onDownloadComplete({
        title: track.title,
        artist: track.artist,
        album: track.album,
        artworkUrl: track.artwork_url,
        filePath,
      })
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Download failed', 'error')
    }
  }

  const handleCancelDownload = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const handleDownloadAll = useCallback(async () => {
    const missingIndices = tracks.map((_, i) => i).filter(i => !downloadedSet.has(i))
    if (missingIndices.length === 0) {
      toast('All tracks are already in your library', 'success')
      return
    }

    abortRef.current = new AbortController()
    const signal = abortRef.current.signal
    setDownloadingAll(true)
    setCompletedCount(0)
    setStatus('loading')
    setTrackProgress({})

    const initProgress: Record<number, TrackProgress> = {}
    tracks.forEach((_, i) => {
      if (downloadedSet.has(i)) {
        initProgress[i] = { stage: 'Done', pct: null, done: true, failed: false }
      } else {
        initProgress[i] = { stage: 'Waiting...', pct: null, done: false, failed: false }
      }
    })
    setTrackProgress(initProgress)

    const concurrency = tracks.length > 10 ? 3 : 2
    let success = 0
    let fail = 0

    const downloadItems = missingIndices.map(idx => ({ track: tracks[idx], index: idx }))
    const results = await mapConcurrent(downloadItems, async ({ track, index: origIndex }) => {
      signal.throwIfAborted()
      setTrackProgress(prev => ({ ...prev, [origIndex]: { stage: 'Searching...', pct: null, done: false, failed: false } }))
      try {
        const { blob, filename } = await downloadTrack(track, (stage, pct) => {
          setTrackProgress(prev => ({
            ...prev,
            [origIndex]: { stage, pct: pct ?? null, done: false, failed: false },
          }))
        }, signal)
        const filePath = await downloadFile(blob, filename)
        setTrackProgress(prev => ({ ...prev, [origIndex]: { stage: 'Done', pct: null, done: true, failed: false } }))
        setCompletedCount(c => c + 1)
        onDownloadComplete({
          title: track.title,
          artist: track.artist,
          album: track.album,
          artworkUrl: track.artwork_url,
          filePath,
        })
        return true
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') {
          setTrackProgress(prev => ({ ...prev, [origIndex]: { stage: 'Cancelled', pct: null, done: false, failed: true } }))
          return false
        }
        setTrackProgress(prev => ({ ...prev, [origIndex]: { stage: 'Failed', pct: null, done: false, failed: true } }))
        return false
      }
    }, concurrency)

    success = results.filter(Boolean).length
    fail = results.length - success

    setDownloadingAll(false)
    setStatus('idle')
    if (success > 0) {
      const msg = fail > 0 ? `Downloaded ${success}/${missingIndices.length} (${fail} skipped)` : `Downloaded ${missingIndices.length === 1 ? '1 missing track' : `all ${missingIndices.length} missing tracks`}!`
      toast(msg, 'success')
    } else {
      toast(`Download failed for ${missingIndices.length} track${missingIndices.length > 1 ? 's' : ''}.`, 'error')
    }
  }, [tracks, onDownloadComplete, toast])

  if (loading) {
    return (
      <div className="min-h-screen bg-light-bg dark:bg-dark-bg pb-24">
        <div className="relative w-full aspect-[3/4] sm:aspect-square max-h-[60vh] bg-gray-200 dark:bg-zinc-800 animate-pulse" />
        <div className="px-6 py-4">
          <div className="h-12 bg-gray-200 dark:bg-zinc-800 rounded-xl animate-pulse" />
        </div>
        <div className="px-3 space-y-1 mt-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      </div>
    )
  }

  if (error || !collection) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-light-bg dark:bg-dark-bg px-4">
        <AlertCircle className="w-10 h-10 text-light-muted dark:text-dark-muted mb-4" />
        <p className="text-light-muted dark:text-dark-muted mb-2 text-center text-sm max-w-xs">{error || 'Failed to load playlist'}</p>
        <p className="text-light-muted dark:text-dark-muted text-xs mb-6 text-center opacity-60">Make sure the dev server is running: <span className="font-mono">npm run dev-server</span></p>
        <div className="flex gap-3">
          <button
            onClick={() => id && doFetch(id)}
            className="px-6 py-2 bg-accent text-white rounded-lg text-sm font-medium cursor-pointer"
          >
            Retry
          </button>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-2 bg-zinc-200 dark:bg-zinc-800 text-light-text dark:text-zinc-300 rounded-lg text-sm font-medium cursor-pointer"
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text pb-24">
      <div className="relative">
        <div className="relative w-full aspect-[3/4] sm:aspect-square max-h-[60vh] overflow-hidden">
          <ArtworkImage
            src={collection.collection_artwork}
            alt={collection.collection_name}
            className="w-full h-full object-cover"
            iconSize={64}
            loading="eager"
            fetchPriority="high"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-light-bg/30 dark:via-black/30 to-light-bg dark:to-black" />
        </div>

        <motion.button
          onClick={() => navigate('/')}
          whileTap={{ scale: 0.9 }}
          className="absolute left-4 w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center cursor-pointer z-10 text-white"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 3rem)' }}
          aria-label="Go back"
        >
          <ArrowLeft className="w-5 h-5" aria-hidden="true" />
        </motion.button>

        <div className="absolute bottom-0 left-0 right-0 p-6">
          <div className="flex items-center gap-2 mb-2">
            <ListMusic className="w-4 h-4 text-accent" />
            <span className="text-xs font-semibold text-accent uppercase tracking-widest">Playlist</span>
          </div>
          <h1 className="text-3xl font-bold text-light-text dark:text-white leading-tight mb-1">
            {collection.collection_name}
          </h1>
          {tracks.length > 0 && (
            <p className="text-sm text-light-muted dark:text-zinc-400">
              {tracks.length} {tracks.length === 1 ? 'song' : 'songs'}
            </p>
          )}
        </div>
      </div>

      <div className="px-6 py-4 space-y-2">
        {downloadingAll ? (
          <motion.button
            onClick={handleCancelDownload}
            whileTap={{ scale: 0.97 }}
            className="w-full py-3.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <XCircle className="w-5 h-5" />
            Cancel — {completedCount}/{tracks.length} done
          </motion.button>
        ) : (
          <motion.button
            onClick={handleDownloadAll}
            whileTap={{ scale: 0.97 }}
            disabled={status === 'loading'}
            className="w-full py-3.5 bg-accent hover:bg-accent-hover text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <DownloadCloud className="w-5 h-5" />
            {downloadedCount > 0 ? `Download Missing (${tracks.length - downloadedCount})` : 'Download All'}
          </motion.button>
        )}
      </div>

      {downloadedCount > 0 && (
        <div className="px-6 pb-3">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
              <span className="text-xs font-medium text-light-text dark:text-dark-text">{downloadedCount}/{tracks.length} in your library</span>
            </div>
            {downloadedCount < tracks.length && (
              <span className="text-[10px] text-light-muted dark:text-dark-muted">{tracks.length - downloadedCount} to download</span>
            )}
          </div>
          <div className="h-1 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all duration-500"
              style={{ width: `${(downloadedCount / tracks.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className="px-3">
        <AnimatePresence initial={false}>
          {tracks.map((track, i) => {
            const prog = trackProgress[i]
            const showProgress = prog && !prog.done && !prog.failed
            const pct = prog ? visualPct(prog) : 0

            return (
              <motion.div
                key={i}
                custom={i}
                variants={itemVariants}
                initial="hidden"
                animate="visible"
                className="flex flex-col"
              >
                <div
                  onClick={() => goToTrack(track.url)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-light-surface/50 dark:hover:bg-white/5 transition-colors group cursor-pointer"
                >
                  <span className="text-sm text-light-muted dark:text-zinc-500 w-6 text-right flex-shrink-0 tabular-nums">
                    {i + 1}
                  </span>
                  <TrackArtwork
                    track={track}
                    collectionArtwork={collection.collection_artwork}
                    className="w-11 h-11 rounded object-cover flex-shrink-0"
                    loading="lazy"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-light-text dark:text-white truncate">
                      {track.title}
                    </p>
                    <p className="text-xs text-light-muted dark:text-zinc-400 truncate">
                      {track.artist}
                    </p>
                    {prog && !prog.done && (
                      <p className="text-[10px] text-accent mt-0.5 truncate">{prog.stage}{prog.pct !== null ? ` ${prog.pct}%` : ''}</p>
                    )}
                    {prog?.failed && (
                      <p className="text-[10px] text-red-400 mt-0.5">Failed</p>
                    )}
                    {prog?.done && (
                      <p className="text-[10px] text-green-400 mt-0.5">Downloaded</p>
                    )}
                  </div>
                  {downloadedSet.has(i) ? (
                    <div className="p-2 flex-shrink-0" title="In your library">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    </div>
                  ) : (
                    <motion.button
                      onClick={(e) => { e.stopPropagation(); handleDownload(track) }}
                      whileTap={{ scale: 0.9 }}
                      disabled={status === 'loading'}
                      className="p-2.5 rounded-lg bg-accent/10 dark:bg-white/10 hover:bg-accent text-accent dark:text-white/70 hover:text-white transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 md:opacity-0 md:group-hover:opacity-100"
                      aria-label={`Download ${track.title}`}
                    >
                      <Download className="w-4 h-4" aria-hidden="true" />
                    </motion.button>
                  )}
                </div>
                {showProgress && (
                  <div className="px-3 pb-2">
                    <div className="h-1 bg-zinc-700 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-accent rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                      />
                    </div>
                  </div>
                )}
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      {isNative() && status === 'success' && (
        <p className="mt-4 text-xs text-light-muted dark:text-zinc-500 text-center">
          Files saved to Documents folder
        </p>
      )}
    </div>
  )
}

type Status = 'idle' | 'loading' | 'success' | 'error'

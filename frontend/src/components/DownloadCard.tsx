import { useState, useCallback, type FormEvent } from 'react'
import { Download, Music, DownloadCloud, Disc3, ListMusic } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { fetchMetadata, downloadTrack } from '../lib/api'
import type { TrackMeta, CollectionMeta } from '../lib/api'
import { downloadFile, isNative } from '../lib/capacitorBridge'
import { mapConcurrent } from '../lib/concurrency'
import { StatusBanner, type Status } from './StatusBanner'
import { useToast } from './Toast'
import type { HistoryEntry } from '../hooks/useHistory'

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

function ArtworkImage({ src, alt, className, iconSize, loading }: { src: string | null; alt: string; className: string; iconSize?: number; loading?: 'lazy' | 'eager' }) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  if (!src || failed) {
    return (
      <div className={`${className} bg-gray-200 dark:bg-zinc-700 flex items-center justify-center`}>
        <Music className="text-gray-400" style={{ width: iconSize ?? 16, height: iconSize ?? 16 }} />
      </div>
    )
  }
  return (
    <div className={`${className} relative overflow-hidden`}>
      {!loaded && <div className="absolute inset-0 shimmer" />}
      <img
        src={src}
        alt={alt}
        className={`w-full h-full object-cover ${loaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}
        loading={loading}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => { setFailed(true); setLoaded(true) }}
      />
    </div>
  )
}

interface DownloadCardProps {
  onDownloadComplete: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void
  presetCollection?: CollectionMeta | null
}

type ViewMode = 'idle' | 'single' | 'list'

function isCollectionMeta(data: TrackMeta | CollectionMeta): data is CollectionMeta {
  return 'tracks' in data && 'collection_name' in data
}

const itemVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.03, type: 'spring' as const, stiffness: 350, damping: 30 },
  }),
}

export function DownloadCard({ onDownloadComplete, presetCollection }: DownloadCardProps) {
  const [url, setUrl] = useState('')
  const [mode, setMode] = useState<ViewMode>(presetCollection ? 'list' : 'idle')
  const [singleTrack, setSingleTrack] = useState<TrackMeta | null>(null)
  const [collection, setCollection] = useState<CollectionMeta | null>(presetCollection || null)
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [downloadingAll, setDownloadingAll] = useState(false)
  const [completedCount, setCompletedCount] = useState(0)
  const [trackProgress, setTrackProgress] = useState<Record<number, TrackProgress>>({})
  const { toast } = useToast()

  const handleMetadata = async () => {
    if (!url.trim()) return
    setMode('idle')
    setSingleTrack(null)
    setCollection(null)
    setStatus('loading')
    setMessage('Fetching metadata...')
    try {
      const data = await fetchMetadata(url.trim())
      if (isCollectionMeta(data)) {
        setCollection(data)
        setMode('list')
      } else {
        setSingleTrack(data)
        setMode('single')
      }
      setStatus('idle')
      setMessage(null)
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Failed to fetch metadata')
      toast(err instanceof Error ? err.message : 'Failed to fetch metadata', 'error')
    }
  }

  const handleDownload = async (track: TrackMeta) => {
    setStatus('loading')
    setMessage(`Preparing ${track.title}...`)
    try {
      const { blob, filename } = await downloadTrack(track, (stage, pct) => {
        setMessage(pct !== undefined ? `${stage} ${pct}%` : stage)
      })
      await downloadFile(blob, filename)
      setStatus('success')
      setMessage(`Downloaded ${track.title}!`)
      toast(`Downloaded ${track.title}`, 'success')
      onDownloadComplete({
        title: track.title,
        artist: track.artist,
        album: track.album,
        artworkUrl: track.artwork_url,
      })
    } catch (err) {
      setStatus('error')
      const msg = err instanceof Error ? err.message : 'Download failed'
      setMessage(msg)
      toast(msg, 'error')
    }
  }

  const trackList = collection?.tracks ?? []

  const handleDownloadAll = useCallback(async () => {
    setDownloadingAll(true)
    setCompletedCount(0)
    setStatus('loading')
    setMessage(`Downloading 0/${trackList.length} tracks...`)
    setTrackProgress({})

    const initProgress: Record<number, TrackProgress> = {}
    trackList.forEach((_, i) => {
      initProgress[i] = { stage: 'Waiting...', pct: null, done: false, failed: false }
    })
    setTrackProgress(initProgress)

    const concurrency = trackList.length > 10 ? 3 : 2
    let success = 0
    let fail = 0

    const results = await mapConcurrent(trackList, async (track, i) => {
      setTrackProgress(prev => ({ ...prev, [i]: { stage: 'Searching...', pct: null, done: false, failed: false } }))
      try {
        const { blob, filename } = await downloadTrack(track, (stage, pct) => {
          setTrackProgress(prev => ({
            ...prev,
            [i]: { stage, pct: pct ?? null, done: false, failed: false },
          }))
        })
        await downloadFile(blob, filename)
        setTrackProgress(prev => ({ ...prev, [i]: { stage: 'Done', pct: null, done: true, failed: false } }))
        setCompletedCount(c => c + 1)
        onDownloadComplete({
          title: track.title,
          artist: track.artist,
          album: track.album,
          artworkUrl: track.artwork_url,
        })
        return true
      } catch {
        setTrackProgress(prev => ({ ...prev, [i]: { stage: 'Failed', pct: null, done: false, failed: true } }))
        return false
      }
    }, concurrency)

    success = results.filter(Boolean).length
    fail = results.length - success

    setDownloadingAll(false)
    if (success > 0) {
      setStatus('success')
      const msg = fail > 0 ? `Downloaded ${success}/${trackList.length} (${fail} skipped)` : `Downloaded all ${trackList.length} tracks!`
      setMessage(msg)
      toast(msg, 'success')
    } else {
      setStatus('error')
      const msg = `All ${trackList.length} tracks failed.`
      setMessage(msg)
      toast(msg, 'error')
    }
  }, [trackList, onDownloadComplete, toast])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (mode === 'single' && singleTrack) {
      handleDownload(singleTrack)
    } else {
      handleMetadata()
    }
  }

  const collectionTypeLabel = collection?.collection_type === 'album' ? 'Album' : 'Playlist'
  const CollectionIcon = collection?.collection_type === 'album' ? Disc3 : ListMusic

  return (
    <div className="w-full max-w-xl mx-auto">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={e => {
            setUrl(e.target.value)
            setMode('idle')
            setSingleTrack(null)
            setCollection(null)
          }}
          placeholder="Paste a Spotify, YouTube, or SoundCloud URL..."
          className="flex-1 px-4 py-3 rounded-lg border border-light-border dark:border-dark-border bg-white dark:bg-dark-bg text-light-text dark:text-dark-text placeholder-light-muted dark:placeholder-dark-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-colors text-sm"
        />
        <motion.button
          type="submit"
          whileTap={{ scale: 0.95 }}
          className="px-6 py-3 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!url.trim() || status === 'loading'}
        >
          <Download className="w-4 h-4" />
          {mode === 'single' ? 'Download' : 'Preview'}
        </motion.button>
      </form>

      {mode === 'single' && singleTrack && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 p-4 rounded-lg border border-light-border dark:border-dark-border bg-white dark:bg-dark-bg flex items-center gap-4"
        >
          <ArtworkImage
            src={singleTrack.artwork_url}
            alt={singleTrack.album}
            className="w-16 h-16 rounded-md object-cover flex-shrink-0"
            iconSize={24}
            loading="lazy"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-light-text dark:text-dark-text truncate">
              {singleTrack.title}
            </p>
            <p className="text-xs text-light-muted dark:text-dark-muted truncate">
              {singleTrack.artist}
            </p>
            <p className="text-xs text-light-muted dark:text-dark-muted truncate">
              {singleTrack.album}
            </p>
          </div>
        </motion.div>
      )}

      {mode === 'list' && collection && trackList.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 rounded-lg border border-light-border dark:border-dark-border bg-white dark:bg-dark-bg overflow-hidden"
        >
          <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-accent/10 to-transparent border-b border-light-border dark:border-dark-border">
            <motion.div
              className="w-20 h-20 rounded-lg flex-shrink-0 overflow-hidden"
              whileTap={{ scale: 0.95 }}
            >
              {collection.collection_artwork ? (
                <ArtworkImage
                  src={collection.collection_artwork}
                  alt={collection.collection_name}
                  className="w-full h-full object-cover"
                  iconSize={32}
                />
              ) : (
                <div className="w-full h-full bg-accent/20 flex items-center justify-center">
                  <CollectionIcon className="w-8 h-8 text-accent" />
                </div>
              )}
            </motion.div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <CollectionIcon className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                <span className="text-xs font-medium text-accent uppercase tracking-wide">
                  {collectionTypeLabel}
                </span>
              </div>
              <h2 className="text-lg font-bold text-light-text dark:text-dark-text truncate">
                {collection.collection_name}
              </h2>
              <p className="text-xs text-light-muted dark:text-dark-muted mt-0.5">
                {trackList.length} {trackList.length === 1 ? 'song' : 'songs'}
              </p>
            </div>
            <motion.button
              onClick={handleDownloadAll}
              whileTap={{ scale: 0.95 }}
              disabled={status === 'loading'}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            >
              <DownloadCloud className="w-4 h-4" />
              {downloadingAll ? `${completedCount}/${trackList.length}` : 'Download All'}
            </motion.button>
          </div>

          <div className="divide-y divide-light-border dark:divide-dark-border max-h-[400px] overflow-y-auto">
            <AnimatePresence initial={false}>
              {trackList.map((track, i) => {
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
                    <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors group">
                      <span className="text-xs text-light-muted dark:text-dark-muted w-6 text-right flex-shrink-0 tabular-nums">
                        {i + 1}
                      </span>
                      <ArtworkImage
                        src={track.artwork_url}
                        alt={track.album}
                        className="w-10 h-10 rounded object-cover flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-light-text dark:text-dark-text truncate">
                          {track.title}
                        </p>
                        <p className="text-xs text-light-muted dark:text-dark-muted truncate">
                          {track.artist}
                        </p>
                        {prog && !prog.done && (
                          <p className="text-[10px] text-accent mt-0.5 truncate">{prog.stage}{prog.pct !== null ? ` ${prog.pct}%` : ''}</p>
                        )}
                        {prog?.failed && (
                          <p className="text-[10px] text-red-500 mt-0.5">Failed</p>
                        )}
                        {prog?.done && (
                          <p className="text-[10px] text-green-500 mt-0.5">Downloaded</p>
                        )}
                      </div>
                      <motion.button
                        onClick={() => handleDownload(track)}
                        whileTap={{ scale: 0.9 }}
                        disabled={status === 'loading'}
                        className="p-2 rounded-lg bg-accent hover:bg-accent-hover text-white transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 md:opacity-0 md:group-hover:opacity-100"
                        aria-label={`Download ${track.title}`}
                      >
                        <Download className="w-4 h-4" />
                      </motion.button>
                    </div>
                    {showProgress && (
                      <div className="px-4 pb-2">
                        <div className="h-1 bg-gray-200 dark:bg-zinc-700 rounded-full overflow-hidden">
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
        </motion.div>
      )}

      <StatusBanner status={status} message={message} />
      {isNative() && status === 'success' && (
        <p className="mt-2 text-xs text-light-muted dark:text-dark-muted text-center">
          File saved to Documents folder
        </p>
      )}
    </div>
  )
}

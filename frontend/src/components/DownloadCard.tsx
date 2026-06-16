import { useState, useCallback, type FormEvent } from 'react'
import { Download, DownloadCloud, Disc3, ListMusic, Link2, CheckCircle2, XCircle, Loader2, Music } from 'lucide-react'
import { ArtworkImage } from './ArtworkImage'
import { motion, AnimatePresence } from 'framer-motion'
import { fetchMetadata, downloadTrack } from '../lib/api'
import type { TrackMeta, CollectionMeta } from '../lib/api'
import { downloadFile, isNative } from '../lib/capacitorBridge'
import { mapConcurrent } from '../lib/concurrency'
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
  if (progress.stage.includes('Searching')) return 8
  if (progress.stage.includes('Downloading')) return 15 + (progress.pct ?? 0) * 0.45
  if (progress.stage.includes('Converting')) return 60 + (progress.pct ?? 0) * 0.4
  return 5
}

interface DownloadCardProps {
  onDownloadComplete: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void
  presetCollection?: CollectionMeta | null
}

type ViewMode = 'idle' | 'single' | 'list'

function isCollectionMeta(data: TrackMeta | CollectionMeta): data is CollectionMeta {
  return 'tracks' in data && 'collection_name' in data
}

export function DownloadCard({ onDownloadComplete, presetCollection }: DownloadCardProps) {
  const [url, setUrl] = useState('')
  const [mode, setMode] = useState<ViewMode>(presetCollection ? 'list' : 'idle')
  const [singleTrack, setSingleTrack] = useState<TrackMeta | null>(null)
  const [collection, setCollection] = useState<CollectionMeta | null>(presetCollection || null)
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState<string | null>(null)
  const [singleDownloading, setSingleDownloading] = useState(false)
  const [singleProgress, setSingleProgress] = useState(0)
  const [singleStage, setSingleStage] = useState('')
  const [downloadingAll, setDownloadingAll] = useState(false)
  const [completedCount, setCompletedCount] = useState(0)
  const [trackProgress, setTrackProgress] = useState<Record<number, TrackProgress>>({})
  const { toast } = useToast()

  const handleMetadata = async () => {
    if (!url.trim()) return
    setMode('idle')
    setSingleTrack(null)
    setCollection(null)
    setLoading(true)
    setLoadingMsg('Fetching track info...')
    try {
      const data = await fetchMetadata(url.trim())
      if (isCollectionMeta(data)) {
        setCollection(data)
        setMode('list')
      } else {
        setSingleTrack(data)
        setMode('single')
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to fetch metadata', 'error')
    } finally {
      setLoading(false)
      setLoadingMsg(null)
    }
  }

  const handleDownloadSingle = async (track: TrackMeta) => {
    setSingleDownloading(true)
    setSingleProgress(0)
    setSingleStage('Starting...')
    try {
      const result = await downloadTrack(track, (stage, pct) => {
        setSingleStage(stage)
        if (pct !== undefined) setSingleProgress(pct)
      })
      let filePath: string | null = null
      if (result.blob.size > 0) {
        filePath = await downloadFile(result.blob, result.filename)
      }
      setSingleStage('Done!')
      setSingleProgress(100)
      toast(`Downloaded ${track.title}`, 'success')
      onDownloadComplete({
        title: track.title,
        artist: track.artist,
        album: track.album,
        artworkUrl: track.artwork_url,
        filePath,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Download failed'
      toast(msg, 'error')
    } finally {
      setTimeout(() => {
        setSingleDownloading(false)
        setSingleProgress(0)
        setSingleStage('')
      }, 1500)
    }
  }

  const trackList = collection?.tracks ?? []

  const handleDownloadAll = useCallback(async () => {
    setDownloadingAll(true)
    setCompletedCount(0)
    setTrackProgress({})

    const initProgress: Record<number, TrackProgress> = {}
    trackList.forEach((_, i) => {
      initProgress[i] = { stage: 'Waiting...', pct: null, done: false, failed: false }
    })
    setTrackProgress(initProgress)

    const concurrency = trackList.length > 10 ? 3 : 2
    let success = 0

    const results = await mapConcurrent(trackList, async (track, i) => {
      setTrackProgress(prev => ({ ...prev, [i]: { stage: 'Searching...', pct: null, done: false, failed: false } }))
      try {
        const result = await downloadTrack(track, (stage, pct) => {
          setTrackProgress(prev => ({
            ...prev,
            [i]: { stage, pct: pct ?? null, done: false, failed: false },
          }))
        })
        let filePath: string | null = null
        if (result.blob.size > 0) {
          filePath = await downloadFile(result.blob, result.filename)
        }
        setTrackProgress(prev => ({ ...prev, [i]: { stage: 'Done', pct: null, done: true, failed: false } }))
        setCompletedCount(c => c + 1)
        onDownloadComplete({
          title: track.title,
          artist: track.artist,
          album: track.album,
          artworkUrl: track.artwork_url,
          filePath,
        })
        return true
      } catch {
        setTrackProgress(prev => ({ ...prev, [i]: { stage: 'Failed', pct: null, done: false, failed: true } }))
        return false
      }
    }, concurrency)

    success = results.filter(Boolean).length
    const fail = results.length - success
    setDownloadingAll(false)
    const msg = fail > 0
      ? `Downloaded ${success}/${trackList.length} (${fail} failed)`
      : `All ${trackList.length} tracks downloaded!`
    toast(msg, success > 0 ? 'success' : 'error')
  }, [trackList, onDownloadComplete, toast])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    handleMetadata()
  }

  const collectionTypeLabel = collection?.collection_type === 'album' ? 'Album' : 'Playlist'
  const CollectionIcon = collection?.collection_type === 'album' ? Disc3 : ListMusic

  return (
    <div className="w-full space-y-4">
      {/* URL Input Card */}
      <div className="bg-white dark:bg-dark-surface rounded-2xl p-4 shadow-sm border border-light-border/40 dark:border-dark-border/30">
        <p className="text-xs font-semibold text-light-muted dark:text-dark-muted uppercase tracking-wider mb-3">
          Paste Link
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <Link2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-light-muted dark:text-dark-muted pointer-events-none" />
            <input
              type="url"
              value={url}
              onChange={e => {
                setUrl(e.target.value)
                setMode('idle')
                setSingleTrack(null)
                setCollection(null)
              }}
              placeholder="spotify.com/track/... or youtube.com/..."
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-light-bg dark:bg-dark-bg border border-light-border/60 dark:border-dark-border/60 text-sm text-light-text dark:text-dark-text placeholder:text-light-muted dark:placeholder:text-dark-muted focus:outline-none focus:ring-2 focus:ring-accent/30 transition-shadow"
            />
          </div>
          <motion.button
            type="submit"
            whileTap={{ scale: 0.97 }}
            disabled={!url.trim() || loading}
            className="w-full py-3 bg-accent hover:bg-accent-hover text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {loadingMsg || 'Loading...'}
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Fetch Track Info
              </>
            )}
          </motion.button>
        </form>
      </div>

      {/* Single Track Preview */}
      <AnimatePresence>
        {mode === 'single' && singleTrack && (
          <motion.div
            key="single"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="bg-white dark:bg-dark-surface rounded-2xl overflow-hidden shadow-sm border border-light-border/40 dark:border-dark-border/30"
          >
            {/* Artwork hero */}
            <div className="relative">
              <div className="w-full h-48 overflow-hidden">
                <ArtworkImage
                  src={singleTrack.artwork_url}
                  alt={singleTrack.album}
                  className="w-full h-full object-cover"
                  iconSize={48}
                />
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
              </div>
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <p className="text-white font-bold text-lg leading-tight line-clamp-1">{singleTrack.title}</p>
                <p className="text-white/70 text-sm mt-0.5 truncate">{singleTrack.artist} · {singleTrack.album}</p>
              </div>
            </div>
            {/* Download button with progress */}
            <div className="p-4">
              <button
                onClick={() => handleDownloadSingle(singleTrack)}
                disabled={singleDownloading}
                className="w-full py-3.5 bg-accent hover:bg-accent-hover text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed relative overflow-hidden"
              >
                {singleDownloading && (
                  <motion.div
                    className="absolute left-0 top-0 bottom-0 bg-accent-hover"
                    initial={{ width: '0%' }}
                    animate={{ width: `${singleProgress}%` }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-2">
                  {singleDownloading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {singleStage || 'Downloading...'}
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Download MP3
                    </>
                  )}
                </span>
              </button>
              {isNative() && (
                <p className="mt-2 text-xs text-center text-light-muted dark:text-dark-muted">
                  Saves to your Documents folder
                </p>
              )}
            </div>
          </motion.div>
        )}

        {/* Collection (Playlist/Album) */}
        {mode === 'list' && collection && trackList.length > 0 && (
          <motion.div
            key="list"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="bg-white dark:bg-dark-surface rounded-2xl overflow-hidden shadow-sm border border-light-border/40 dark:border-dark-border/30"
          >
            {/* Collection header */}
            <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-accent/10 to-transparent border-b border-light-border/30 dark:border-dark-border/30">
              <div className="w-16 h-16 rounded-xl flex-shrink-0 overflow-hidden bg-accent/10">
                {collection.collection_artwork ? (
                  <ArtworkImage src={collection.collection_artwork} alt={collection.collection_name} className="w-full h-full object-cover" iconSize={28} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <CollectionIcon className="w-7 h-7 text-accent" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <CollectionIcon className="w-3 h-3 text-accent flex-shrink-0" />
                  <span className="text-xs font-semibold text-accent uppercase tracking-wide">{collectionTypeLabel}</span>
                </div>
                <h2 className="text-base font-bold text-light-text dark:text-dark-text truncate">{collection.collection_name}</h2>
                <p className="text-xs text-light-muted dark:text-dark-muted mt-0.5">
                  {trackList.length} {trackList.length === 1 ? 'song' : 'songs'}
                  {downloadingAll && ` · ${completedCount} done`}
                </p>
              </div>
              <motion.button
                onClick={handleDownloadAll}
                whileTap={{ scale: 0.93 }}
                disabled={downloadingAll}
                className="flex-shrink-0 px-4 py-2.5 bg-accent text-white text-sm font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {downloadingAll ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <DownloadCloud className="w-4 h-4" />
                )}
                {downloadingAll ? `${completedCount}/${trackList.length}` : 'All'}
              </motion.button>
            </div>

            {/* Track list */}
            <div className="divide-y divide-light-border/30 dark:divide-dark-border/30 max-h-[420px] overflow-y-auto overscroll-contain">
              {trackList.map((track, i) => {
                const prog = trackProgress[i]
                const pct = prog ? visualPct(prog) : 0

                return (
                  <div key={i} className="flex flex-col">
                    <div className="flex items-center gap-3 px-4 py-3">
                      <span className="text-xs text-light-muted dark:text-dark-muted w-5 text-right flex-shrink-0 tabular-nums">{i + 1}</span>
                      <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 bg-accent/10">
                        {track.artwork_url ? (
                          <ArtworkImage src={track.artwork_url} alt={track.album} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Music className="w-4 h-4 text-accent/40" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-light-text dark:text-dark-text truncate">{track.title}</p>
                        <p className="text-xs text-light-muted dark:text-dark-muted truncate">{track.artist}</p>
                        {prog && !prog.done && !prog.failed && (
                          <p className="text-[10px] text-accent mt-0.5 truncate">{prog.stage}{prog.pct !== null ? ` ${prog.pct}%` : ''}</p>
                        )}
                      </div>
                      {/* Status indicator or download button */}
                      <div className="flex-shrink-0 ml-1">
                        {prog?.done ? (
                          <CheckCircle2 className="w-5 h-5 text-green-500" />
                        ) : prog?.failed ? (
                          <XCircle className="w-5 h-5 text-red-400" />
                        ) : prog && !prog.done ? (
                          <Loader2 className="w-4 h-4 text-accent animate-spin" />
                        ) : (
                          <motion.button
                            onClick={() => handleDownloadSingle(track)}
                            whileTap={{ scale: 0.9 }}
                            disabled={downloadingAll}
                            className="w-8 h-8 rounded-lg bg-accent/10 hover:bg-accent/20 flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40"
                          >
                            <Download className="w-3.5 h-3.5 text-accent" />
                          </motion.button>
                        )}
                      </div>
                    </div>
                    {/* Progress bar */}
                    {prog && !prog.done && !prog.failed && (
                      <div className="px-4 pb-2">
                        <div className="h-0.5 bg-light-border dark:bg-dark-border rounded-full overflow-hidden">
                          <motion.div
                            className="h-full bg-accent rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.4, ease: 'easeOut' }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

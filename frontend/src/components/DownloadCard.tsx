import { useState, useCallback, useEffect, useRef, type FormEvent } from 'react'
import { Download, DownloadCloud, Disc3, ListMusic, Link2, CheckCircle2, XCircle, Loader2, Music, RefreshCw } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { ArtworkImage } from './ArtworkImage'
import { fetchMetadata } from '../lib/api'
import type { TrackMeta, CollectionMeta } from '../lib/api'
import { isNative } from '../lib/capacitorBridge'
import { useToast } from './Toast'
import type { HistoryEntry } from '../hooks/useHistory'
import { useDownloads } from '../hooks/useDownloads'
import { getDeezerArl, getDeezerQuality } from '../lib/deezer'

export interface DownloadCardProps {
  onDownloadComplete: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void
  presetCollection?: CollectionMeta | null
  initialUrl?: string
  autoDownload?: boolean
}

type ViewMode = 'idle' | 'single' | 'list'

function isCollectionMeta(data: TrackMeta | CollectionMeta): data is CollectionMeta {
  return 'tracks' in data && 'collection_name' in data
}

export function DownloadCard({ onDownloadComplete: _onDownloadComplete, presetCollection, initialUrl, autoDownload }: DownloadCardProps) {
  const [url, setUrl] = useState(initialUrl || '')
  const [mode, setMode] = useState<ViewMode>(presetCollection ? 'list' : 'idle')
  const [singleTrack, setSingleTrack] = useState<TrackMeta | null>(null)
  const [collection, setCollection] = useState<CollectionMeta | null>(presetCollection || null)
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState<string | null>(null)
  
  const { queue, addDownload, addMultipleDownloads } = useDownloads()
  const { toast } = useToast()
  const autoDownloaded = useRef(false)

  // Sync url state when initialUrl changes from share/deep-link
  useEffect(() => {
    if (initialUrl) {
      setUrl(initialUrl)
    }
  }, [initialUrl])

  const handleMetadata = useCallback(async (targetUrl?: string) => {
    const fetchUrl = targetUrl || url.trim()
    if (!fetchUrl) return
    setMode('idle')
    setSingleTrack(null)
    setCollection(null)
    setLoading(true)
    setLoadingMsg('Fetching track info...')
    try {
      const data = await fetchMetadata(fetchUrl)
      if (isCollectionMeta(data)) {
        setCollection(data)
        setMode('list')
        if (autoDownload && !autoDownloaded.current) {
          autoDownloaded.current = true
          addMultipleDownloads(data.tracks)
          toast(`Queued ${data.tracks.length} tracks for download`, 'success')
        }
      } else {
        setSingleTrack(data)
        setMode('single')
        if (autoDownload && !autoDownloaded.current) {
          autoDownloaded.current = true
          addDownload(data)
          toast(`Queued ${data.title} for download`, 'success')
        }
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to fetch metadata', 'error')
    } finally {
      setLoading(false)
      setLoadingMsg(null)
    }
  }, [url, toast, autoDownload, addDownload, addMultipleDownloads])

  // Effect to automatically start fetching if initialUrl is provided
  useEffect(() => {
    if (initialUrl && !presetCollection) {
      handleMetadata(initialUrl)
    }
  }, [initialUrl, presetCollection, handleMetadata])

  const singleQueueItem = singleTrack 
    ? queue.find(q => q.track.url === singleTrack.url || (q.track.title === singleTrack.title && q.track.artist === singleTrack.artist)) 
    : null
  
  const singleDownloading = singleQueueItem && !singleQueueItem.done && !singleQueueItem.failed
  const singleStage = singleQueueItem?.stage ?? ''
  const deezerConnected = !!getDeezerArl()
  const downloadLabel = deezerConnected && getDeezerQuality() === 'FLAC' ? 'Download FLAC' : deezerConnected ? 'Download MP3' : 'Download MP3'

  const handleDownloadSingle = async (track: TrackMeta) => {
    if (Capacitor.isNativePlatform()) {
      try {
        const { Haptics, ImpactStyle } = await import('@capacitor/haptics')
        Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {})
      } catch {}
    }
    addDownload(track)
  }

  const trackList = collection?.tracks ?? []
  
  const downloadingAll = trackList.length > 0 && queue.some(q => 
    !q.done && !q.failed && trackList.some(t => t.url === q.track.url || (t.title === q.track.title && t.artist === q.track.artist))
  )

  const handleDownloadAll = useCallback(async () => {
    addMultipleDownloads(trackList)
    toast(`Queued ${trackList.length} tracks for download`, 'success')
  }, [trackList, addMultipleDownloads, toast])

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
              placeholder="spotify.com/track/..., youtube.com/..., deezer.com/track/..."
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-light-bg dark:bg-dark-bg border border-light-border/60 dark:border-dark-border/60 text-sm text-light-text dark:text-dark-text placeholder:text-light-muted dark:placeholder:text-dark-muted focus:outline-none focus:ring-2 focus:ring-accent/30 transition-shadow"
            />
          </div>
          <button
            type="submit"
            disabled={!url.trim() || loading}
            className="w-full py-3 bg-accent hover:bg-accent-hover text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-transform"
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
          </button>
        </form>
      </div>

      {/* Single Track Preview */}
      {mode === 'single' && singleTrack && (
          <div
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
                disabled={!!singleDownloading}
                className="w-full py-3.5 bg-accent hover:bg-accent-hover text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed relative overflow-hidden"
              >
                {singleDownloading && (
                  <div
                    className="absolute left-0 top-0 bottom-0 bg-accent-hover"
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
                      {downloadLabel}
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
          </div>
        )}

        {/* Collection (Playlist/Album) */}
        {mode === 'list' && collection && trackList.length > 0 && (
          <div
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
                  {downloadingAll && ` · Downloading...`}
                </p>
              </div>
              <button
                onClick={handleDownloadAll}
                disabled={downloadingAll}
                className="flex-shrink-0 px-4 py-2.5 bg-accent text-white text-sm font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-transform"
              >
                {downloadingAll ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <DownloadCloud className="w-4 h-4" />
                )}
                {downloadingAll ? `Downloading` : 'All'}
              </button>
            </div>

            {/* Track list */}
            <div className="divide-y divide-light-border/30 dark:divide-dark-border/30 max-h-[420px] overflow-y-auto overscroll-contain">
              {trackList.map((track, i) => {
                const prog = queue.find(q => q.track.url === track.url || (q.track.title === track.title && q.track.artist === track.artist))

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
                          <p className="text-[11px] text-accent mt-0.5 truncate">{prog.stage}{prog.pct !== null ? ` ${prog.pct}%` : ''}</p>
                        )}
                      </div>
                      {/* Status indicator or download button */}
                      <div className="flex-shrink-0 ml-1">
                        {prog?.done ? (
                          <CheckCircle2 className="w-5 h-5 text-green-500" />
                        ) : prog?.failed ? (
                          <button
                            onClick={() => { handleDownloadSingle(track); toast(`Retrying ${track.title}...`, 'success') }}
                            className="w-8 h-8 rounded-lg bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center transition-colors cursor-pointer group active:scale-90"
                            aria-label={`Retry ${track.title}`}
                            title="Tap to retry"
                          >
                            <XCircle className="w-5 h-5 text-red-400 group-hover:hidden" />
                            <RefreshCw className="w-4 h-4 text-red-400 hidden group-hover:block" />
                          </button>
                        ) : prog && !prog.done ? (
                          <Loader2 className="w-4 h-4 text-accent animate-spin" />
                        ) : (
                          <button
                            onClick={() => { handleDownloadSingle(track); toast(`Queued ${track.title}`, 'success') }}
                            className="w-8 h-8 rounded-lg bg-accent/10 hover:bg-accent/20 flex items-center justify-center transition-colors cursor-pointer active:scale-90"
                          >
                            <Download className="w-3.5 h-3.5 text-accent" />
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Progress bar */}
                    {prog && !prog.done && !prog.failed && (
                      <div className="px-4 pb-2">
                        <div className="h-0.5 bg-light-border dark:bg-dark-border rounded-full overflow-hidden">
                          <div
                            className="h-full bg-accent rounded-full"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
    </div>
  )
}

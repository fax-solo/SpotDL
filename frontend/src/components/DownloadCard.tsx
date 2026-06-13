import { useState, useCallback, type FormEvent, type SyntheticEvent } from 'react'
import { Download, Music, DownloadCloud, Disc3, ListMusic } from 'lucide-react'
import { fetchMetadata, downloadTrack, isYouTubeUrl } from '../lib/api'
import type { TrackMeta, CollectionMeta } from '../lib/api'
import { downloadFile, isNative } from '../lib/capacitorBridge'
import { StatusBanner, type Status } from './StatusBanner'
import type { HistoryEntry } from '../hooks/useHistory'

function ArtworkImage({ src, alt, className, iconSize }: { src: string | null; alt: string; className: string; iconSize?: number }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <div className={`${className} bg-gray-200 dark:bg-gray-700 flex items-center justify-center`}>
        <Music className="text-gray-400" style={{ width: iconSize ?? 16, height: iconSize ?? 16 }} />
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={(e: SyntheticEvent<HTMLImageElement>) => {
        setFailed(true)
        e.currentTarget.style.display = 'none'
      }}
    />
  )
}

interface DownloadCardProps {
  onDownloadComplete: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void
}

type ViewMode = 'idle' | 'single' | 'list'

function isCollectionMeta(data: TrackMeta | CollectionMeta): data is CollectionMeta {
  return 'tracks' in data && 'collection_name' in data
}

export function DownloadCard({ onDownloadComplete }: DownloadCardProps) {
  const [url, setUrl] = useState('')
  const [mode, setMode] = useState<ViewMode>('idle')
  const [singleTrack, setSingleTrack] = useState<TrackMeta | null>(null)
  const [collection, setCollection] = useState<CollectionMeta | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [downloadingAll, setDownloadingAll] = useState(false)
  const [completedCount, setCompletedCount] = useState(0)

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
    }
  }

  const handleDownload = async (track: TrackMeta) => {
    setStatus('loading')
    setMessage(`Preparing ${track.title}...`)
    try {
      const { blob, filename } = await downloadTrack(track, (stage, pct) => {
        if (pct !== undefined) {
          setMessage(`${stage} ${pct}%`)
        } else {
          setMessage(stage)
        }
      })
      await downloadFile(blob, filename)
      setStatus('success')
      setMessage(`Downloaded ${track.title}!`)
      onDownloadComplete({
        title: track.title,
        artist: track.artist,
        album: track.album,
        artworkUrl: track.artwork_url,
      })
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Download failed')
    }
  }

  const trackList = collection?.tracks ?? []

  const handleDownloadAll = useCallback(async () => {
    setDownloadingAll(true)
    setCompletedCount(0)
    setStatus('loading')
    setMessage(`Downloading 0/${trackList.length} tracks...`)

    let success = 0
    let fail = 0

    for (let i = 0; i < trackList.length; i++) {
      const track = trackList[i]
      try {
        setMessage(`Downloading ${i + 1}/${trackList.length}: ${track.title}...`)
        const { blob, filename } = await downloadTrack(track, (stage, pct) => {
          const prefix = `[${i + 1}/${trackList.length}] `
          if (pct !== undefined) {
            setMessage(`${prefix}${stage} ${pct}%`)
          } else {
            setMessage(`${prefix}${stage}`)
          }
        })
        await downloadFile(blob, filename)
        success++
        setCompletedCount(success)
        onDownloadComplete({
          title: track.title,
          artist: track.artist,
          album: track.album,
          artworkUrl: track.artwork_url,
        })
      } catch (err) {
        fail++
        const detail = err instanceof Error ? err.message : 'Unknown error'
        console.warn(`Skipped "${track.title}": ${detail}`)
      }
    }

    setDownloadingAll(false)
    if (success > 0) {
      setStatus(fail > 0 ? 'success' : 'success')
      setMessage(
        fail > 0
          ? `Downloaded ${success}/${trackList.length} tracks (${fail} skipped)`
          : `Downloaded all ${trackList.length} tracks!`,
      )
    } else {
      setStatus('error')
      setMessage(`All ${trackList.length} tracks failed.`)
    }
  }, [trackList, onDownloadComplete])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (mode === 'single' && singleTrack && !isYouTubeUrl(url)) {
      handleDownload(singleTrack)
    } else if (mode === 'single' && singleTrack && isYouTubeUrl(url)) {
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
        <button
          type="submit"
          className="px-6 py-3 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!url.trim() || status === 'loading'}
        >
          <Download className="w-4 h-4" />
          {mode === 'single' ? 'Download' : 'Preview'}
        </button>
      </form>

      {mode === 'single' && singleTrack && (
        <div className="mt-4 p-4 rounded-lg border border-light-border dark:border-dark-border bg-white dark:bg-dark-bg flex items-center gap-4">
          <ArtworkImage
            src={singleTrack.artwork_url}
            alt={singleTrack.album}
            className="w-16 h-16 rounded-md object-cover flex-shrink-0"
            iconSize={24}
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
        </div>
      )}

      {mode === 'list' && collection && trackList.length > 0 && (
        <div className="mt-4 rounded-lg border border-light-border dark:border-dark-border bg-white dark:bg-dark-bg overflow-hidden">
          <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-accent/10 to-transparent border-b border-light-border dark:border-dark-border">
            <div className="w-20 h-20 rounded-lg flex-shrink-0 overflow-hidden">
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
            </div>
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
            <button
              onClick={handleDownloadAll}
              disabled={status === 'loading'}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            >
              <DownloadCloud className="w-4 h-4" />
              {downloadingAll ? `${completedCount}/${trackList.length}` : 'Download All'}
            </button>
          </div>

          <div className="divide-y divide-light-border dark:divide-dark-border max-h-[400px] overflow-y-auto">
            {trackList.map((track, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors group">
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
                </div>
                <button
                  onClick={() => handleDownload(track)}
                  disabled={status === 'loading'}
                  className="p-2 rounded-lg bg-accent hover:bg-accent-hover text-white transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 opacity-0 group-hover:opacity-100"
                  aria-label={`Download ${track.title}`}
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
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

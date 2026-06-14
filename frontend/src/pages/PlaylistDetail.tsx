import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Download, DownloadCloud, Music, ListMusic, RefreshCw, AlertCircle } from 'lucide-react'
import { downloadTrack } from '../lib/api'
import { downloadFile, isNative } from '../lib/capacitorBridge'
import { mapConcurrent } from '../lib/concurrency'
import type { CollectionMeta, TrackMeta } from '../lib/spotifyApi'
import { StatusBanner, type Status } from '../components/StatusBanner'
import type { HistoryEntry } from '../hooks/useHistory'
import { apiUrl } from '../lib/apiConfig'

interface PlaylistDetailProps {
  onDownloadComplete: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void
}

function ArtworkImage({ src, alt, className, iconSize, loading }: { src: string | null; alt: string; className: string; iconSize?: number; loading?: 'lazy' | 'eager' }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <div className={`${className} bg-zinc-800 flex items-center justify-center`}>
        <Music className="text-zinc-600" style={{ width: iconSize ?? 24, height: iconSize ?? 24 }} />
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      decoding="async"
      onError={() => setFailed(true)}
    />
  )
}

function TrackArtwork({ track, collectionArtwork, className, loading }: { track: TrackMeta; collectionArtwork: string | null; className: string; loading?: 'lazy' | 'eager' }) {
  const hasOwnArtwork = track.artwork_url && track.artwork_url !== collectionArtwork
  const [src, setSrc] = useState<string | null>(hasOwnArtwork ? track.artwork_url : collectionArtwork)
  const fetched = useRef(false)

  useEffect(() => {
    if (hasOwnArtwork || fetched.current) return
    fetched.current = true
    const match = track.url.match(/\/track\/([a-zA-Z0-9]+)/)
    if (!match) return
    fetch(apiUrl('/.netlify/functions/spotify'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: `https://open.spotify.com/track/${match[1]}` }),
    })
      .then(r => r.json())
      .then(data => { if (data.artwork_url) setSrc(data.artwork_url) })
      .catch(() => {})
  }, [track.url, hasOwnArtwork])

  return <ArtworkImage src={src} alt={track.album} className={className} loading={loading} />
}

export function PlaylistDetail({ onDownloadComplete }: PlaylistDetailProps) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [collection, setCollection] = useState<CollectionMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [downloadingAll, setDownloadingAll] = useState(false)
  const [completedCount, setCompletedCount] = useState(0)

  const fetchAttempted = useRef(false)

  const doFetch = useCallback(async (playlistId: string) => {
    setLoading(true)
    setError(null)
    fetchAttempted.current = true
    try {
      const res = await fetch(apiUrl('/.netlify/functions/spotify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: `https://open.spotify.com/playlist/${playlistId}` }),
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

  const handleDownloadAll = useCallback(async () => {
    setDownloadingAll(true)
    setCompletedCount(0)
    setStatus('loading')
    setMessage(`Downloading 0/${tracks.length} tracks...`)

    const concurrency = tracks.length > 10 ? 3 : 2
    let success = 0
    let fail = 0

    const results = await mapConcurrent(tracks, async (track, i) => {
      setMessage(`[${i + 1}/${tracks.length}] Downloading ${track.title}...`)
      try {
        const { blob, filename } = await downloadTrack(track, (stage, pct) => {
          setMessage(pct !== undefined ? `[${i + 1}/${tracks.length}] ${stage} ${pct}%` : `[${i + 1}/${tracks.length}] ${stage}`)
        })
        await downloadFile(blob, filename)
        onDownloadComplete({
          title: track.title,
          artist: track.artist,
          album: track.album,
          artworkUrl: track.artwork_url,
        })
        return true
      } catch {
        return false
      }
    }, concurrency)

    success = results.filter(Boolean).length
    fail = results.length - success

    setDownloadingAll(false)
    if (success > 0) {
      setStatus('success')
      setMessage(
        fail > 0
          ? `Downloaded ${success}/${tracks.length} (${fail} skipped)`
          : `Downloaded all ${tracks.length} tracks!`,
      )
    } else {
      setStatus('error')
      setMessage(`All ${tracks.length} tracks failed.`)
    }
  }, [tracks, onDownloadComplete])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-light-bg dark:bg-dark-bg">
        <RefreshCw className="w-8 h-8 text-accent animate-spin" />
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
      {/* Back + Header */}
      <div className="relative">
        {/* Hero artwork */}
        <div className="relative w-full aspect-[3/4] sm:aspect-square max-h-[60vh] overflow-hidden">
          <ArtworkImage
            src={collection.collection_artwork}
            alt={collection.collection_name}
            className="w-full h-full object-cover"
            iconSize={64}
            loading="eager"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-light-bg/30 dark:via-black/30 to-light-bg dark:to-black" />
        </div>

        {/* Back button */}
        <button
          onClick={() => navigate('/')}
          className="absolute left-4 w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center cursor-pointer z-10 text-white"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 3rem)' }}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {/* Playlist info overlay */}
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

      {/* Download All button */}
      <div className="px-6 py-4">
        <button
          onClick={handleDownloadAll}
          disabled={status === 'loading'}
          className="w-full py-3.5 bg-accent hover:bg-accent-hover text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <DownloadCloud className="w-5 h-5" />
          {downloadingAll ? `${completedCount}/${tracks.length}` : 'Download All'}
        </button>
      </div>

      {/* Track list */}
      <div className="px-3">
        {tracks.map((track, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-light-surface/50 dark:hover:bg-white/5 transition-colors group"
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
            </div>
            <button
              onClick={() => handleDownload(track)}
              disabled={status === 'loading'}
              className="p-2.5 rounded-lg bg-accent/10 dark:bg-white/10 hover:bg-accent text-accent dark:text-white/70 hover:text-white transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 md:opacity-0 md:group-hover:opacity-100"
              aria-label={`Download ${track.title}`}
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="px-6 mt-4">
        <StatusBanner status={status} message={message} />
      </div>

      {isNative() && status === 'success' && (
        <p className="mt-2 text-xs text-light-muted dark:text-zinc-500 text-center">
          File saved to Documents folder
        </p>
      )}
    </div>
  )
}

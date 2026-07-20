import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'

import { ArrowLeft, Play, Download, DownloadCloud, ListMusic, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { ArtworkImage } from '../components/ArtworkImage'
import type { CollectionMeta, TrackMeta } from '../lib/spotifyApi'
import { SkeletonRow } from '../components/SkeletonRow'
import { usePlayer } from '../hooks/usePlayer'
import { findAudio } from '../lib/sources'
import { useToast } from '../components/Toast'
import { normalize } from '../lib/sources/matching'
import { useHistory, type HistoryEntry } from '../hooks/useHistory'
import { useDownloads } from '../hooks/useDownloads'
import { apiUrl } from '../lib/apiConfig'
import { uuid } from '../lib/uuid'

interface PlaylistDetailProps {
  onDownloadComplete: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void
}

function isTrackDownloaded(track: TrackMeta, entries: HistoryEntry[]): boolean {
  const trackTitle = normalize(track.title)
  const trackArtist = normalize(track.artist)
  return entries.some(e =>
    normalize(e.title) === trackTitle && normalize(e.artist) === trackArtist
  )
}

function TrackArtwork({ track, className, loading: loadingProp }: { track: TrackMeta; className: string; loading?: 'lazy' | 'eager' }) {
  return <ArtworkImage src={track.artwork_url} alt={track.album} className={className} {...(loadingProp !== undefined ? { loading: loadingProp } : {})} />
}


export function PlaylistDetail(_props: PlaylistDetailProps) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const contentType = (location.state as { type?: string } | null)?.type || 'playlist'
  const [collection, setCollection] = useState<CollectionMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const { toast } = useToast()
  const { entries } = useHistory()
  const { queue, addDownload, addMultipleDownloads } = useDownloads()
  const { play } = usePlayer()

  const doFetch = useCallback(async (playlistId: string) => {
    setLoading(true)
    setError(null)
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
  }, [contentType])

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

  const isDownloading = tracks.some(t =>
    queue.some(q => !q.done && !q.failed && (q.track.url === t.url || (q.track.title === t.title && q.track.artist === t.artist)))
  )

  const getTrackProgress = (track: TrackMeta) => {
    return queue.find(q =>
      q.track.url === track.url || (q.track.title === track.title && q.track.artist === track.artist)
    )
  }

  const getVisualPct = (track: TrackMeta) => {
    const prog = getTrackProgress(track)
    if (!prog) return 0
    if (prog.done) return 100
    if (prog.failed) return 0
    if (prog.stage.includes('Searching')) return 5
    if (prog.stage.includes('Downloading')) return 10 + (prog.pct ?? 0) * 0.3
    if (prog.stage.includes('Converting')) return 40 + (prog.pct ?? 0) * 0.6
    return 0
  }

  const handleDownload = (track: TrackMeta) => {
    addDownload(track)
    toast(`Queued ${track.title}`, 'success')
  }

  const handleDownloadAll = () => {
    const missing = tracks.filter((_, i) => !downloadedSet.has(i))
    if (missing.length === 0) {
      toast('All tracks are already in your library', 'success')
      return
    }
    addMultipleDownloads(missing)
    toast(`Queued ${missing.length} tracks for download`, 'success')
  }

  const handlePlay = async (track: TrackMeta, index: number) => {
    if (playingId) return
    setPlayingId(`${index}`)
    try {
      const query = `${track.artist} ${track.title}`
      const { info } = await findAudio(query, track.title, track.artist)
      play({
        id: uuid(),
        title: track.title,
        artist: track.artist,
        album: track.album || collection?.collection_name || 'Unknown',
        artworkUrl: track.artwork_url || collection?.collection_artwork || null,
        filePath: null,
        ...(info.audioUrl ? { streamUrl: info.audioUrl } : {}),
        timestamp: Date.now(),
      })
    } catch {
      toast('Could not find audio source', 'error')
    } finally {
      setPlayingId(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-light-bg dark:bg-dark-bg pb-32">
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
      <div className="flex flex-col items-center justify-center min-h-screen bg-light-bg dark:bg-dark-bg px-4 animate-scaleIn">
        <AlertCircle className="w-10 h-10 text-light-muted dark:text-dark-muted mb-4" />
        <p className="text-light-muted dark:text-dark-muted mb-2 text-center text-sm max-w-xs">{error || 'Failed to load playlist'}</p>
        <p className="text-light-muted dark:text-dark-muted text-xs mb-6 text-center opacity-60">Could not reach the Spotify metadata service. Check your internet connection and try again.</p>
        <div className="flex gap-3">
          <button
            onClick={() => id && doFetch(id)}
            className="px-6 py-2 bg-accent text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-accent-hover transition-colors active:scale-95"
          >
            Retry
          </button>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-2 bg-zinc-200 dark:bg-zinc-800 text-light-text dark:text-zinc-300 rounded-lg text-sm font-medium cursor-pointer hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors active:scale-95"
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text pb-32 animate-pageEnter">
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

        <button
          onClick={() => navigate('/')}
          className="absolute left-4 w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center cursor-pointer z-10 text-white active:scale-90 transition-transform safe-top-3rem"
          aria-label="Go back"
        >
          <ArrowLeft className="w-5 h-5" aria-hidden="true" />
        </button>

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
        <button
          onClick={handleDownloadAll}
          disabled={isDownloading}
          className="w-full py-3.5 bg-accent hover:bg-accent-hover text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97] transition-transform"
        >
          {isDownloading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <DownloadCloud className="w-5 h-5" />
          )}
          {isDownloading
            ? 'Downloading...'
            : downloadedCount > 0
              ? `Download Missing (${tracks.length - downloadedCount})`
              : 'Download All'}
        </button>
      </div>

      {downloadedCount > 0 && (
        <div className="px-6 pb-3">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
              <span className="text-xs font-medium text-light-text dark:text-dark-text">{downloadedCount}/{tracks.length} in your library</span>
            </div>
            {downloadedCount < tracks.length && (
              <span className="text-[11px] text-light-muted dark:text-dark-muted">{tracks.length - downloadedCount} to download</span>
            )}
          </div>
          <div className="h-1 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
            <div
              ref={el => { if (el) el.style.width = `${(downloadedCount / tracks.length) * 100}%` }}
              className="h-full bg-green-500 rounded-full transition-all duration-500"
            />
          </div>
        </div>
      )}

      <div className="px-3">
        {tracks.map((track, i) => {
            const prog = getTrackProgress(track)
            const showProgress = prog && !prog.done && !prog.failed
            const pct = getVisualPct(track)

            return (
              <div
                key={i}
                className="flex flex-col"
              >
                <div
                  onClick={() => {
                    const match = track.url.match(/\/track\/([a-zA-Z0-9]+)/)
                    if (match) navigate(`/track/${match[1]}`)
                  }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-light-surface/50 dark:hover:bg-white/5 transition-colors group cursor-pointer"
                >
                  <span className="text-sm text-light-muted dark:text-zinc-500 w-6 text-right flex-shrink-0 tabular-nums">
                    {i + 1}
                  </span>
                  <TrackArtwork
                    track={track}
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
                      <p className="text-[11px] text-accent mt-0.5 truncate">{prog.stage}{prog.pct !== null ? ` ${prog.pct}%` : ''}</p>
                    )}
                    {prog?.failed && (
                      <p className="text-[11px] text-red-400 mt-0.5">Failed</p>
                    )}
                    {prog?.done && (
                      <p className="text-[11px] text-green-400 mt-0.5">Downloaded</p>
                    )}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handlePlay(track, i) }}
                    disabled={playingId === `${i}`}
                    className="p-2.5 rounded-lg bg-green-600/10 dark:bg-green-600/20 hover:bg-green-600 text-green-600 dark:text-green-400 hover:text-white transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0 active:scale-90 transition-transform"
                    aria-label={`Play ${track.title}`}
                  >
                    {playingId === `${i}` ? (
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Play className="w-4 h-4 fill-current" aria-hidden="true" />
                    )}
                  </button>
                  {downloadedSet.has(i) ? (
                    <div className="p-2 flex-shrink-0" title="In your library">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    </div>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDownload(track) }}
                      disabled={!!(prog && !prog.done && !prog.failed)}
                      className="p-2.5 rounded-lg bg-accent/10 dark:bg-white/10 hover:bg-accent text-accent dark:text-white/70 hover:text-white transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0 md:opacity-0 md:group-hover:opacity-100 active:scale-90 transition-transform"
                      aria-label={`Download ${track.title}`}
                    >
                      {prog && !prog.done && !prog.failed ? (
                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Download className="w-4 h-4" aria-hidden="true" />
                      )}
                    </button>
                  )}
                </div>
                {showProgress && (
                  <div className="px-3 pb-2">
                    <div className="h-1 bg-zinc-700 rounded-full overflow-hidden">
                      <div
                        ref={el => { if (el) el.style.width = `${pct}%` }}
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
  )
}

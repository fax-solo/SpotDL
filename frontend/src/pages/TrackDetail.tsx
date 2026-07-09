import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Play, Download, Music, Mic2, Disc3, Clock, Loader2 } from 'lucide-react'
import { ArtworkImage } from '../components/ArtworkImage'
import { downloadTrack } from '../lib/api'
import { saveOrCacheBlob, isNative } from '../lib/capacitorBridge'
import { fetchTrackDetails, type SearchTrack } from '../lib/spotifyApi'
import { usePlayer } from '../hooks/usePlayer'
import { findAudio } from '../lib/sources'
import { useToast } from '../components/Toast'
import type { HistoryEntry } from '../hooks/useHistory'

interface TrackDetailProps {
  onDownloadComplete: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void
}

function msToMinutes(ms: number): string {
  const mins = Math.floor(ms / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function TrackDetail({ onDownloadComplete }: TrackDetailProps) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [track, setTrack] = useState<SearchTrack | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [playing, setPlaying] = useState(false)
  const { toast } = useToast()
  const { play } = usePlayer()

  const doFetch = useCallback(async (trackId: string) => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchTrackDetails(trackId)
      setTrack(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load track')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!id) return
    doFetch(id)
  }, [id, doFetch])

  const handleDownload = async () => {
    if (!track) return
    setDownloading(true)
    try {
      const meta = { title: track.title, artist: track.artist, album: track.album, artwork_url: track.artwork_url, url: track.url, type: 'track' }
      const { blob, filename } = await downloadTrack(meta, (stage, pct) => {
        toast(`${stage}${pct ? ` ${pct}%` : ''}`, 'info')
      }, undefined, 1)
      const filePath = await saveOrCacheBlob(blob, filename)
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
    setDownloading(false)
  }

  const handlePlay = async () => {
    if (!track || playing) return
    setPlaying(true)
    try {
      const query = `${track.artist} ${track.title}`
      const { info } = await findAudio(query, track.title, track.artist)
      play({
        id: crypto.randomUUID(),
        title: track.title,
        artist: track.artist,
        album: track.album,
        artworkUrl: track.artwork_url,
        filePath: null,
        streamUrl: info.audioUrl || undefined,
        timestamp: Date.now(),
      })
    } catch (err: any) {
      if (err?.type === 'rate_limited') {
        toast('Source is busy — try again in a moment', 'error')
      } else if (err?.type === 'scrape_blocked') {
        toast('Source blocked the request — try a different source', 'error')
      } else if (err?.type === 'source_unavailable') {
        toast('This track is not available on any source', 'error')
      } else {
        toast(err?.message || 'Could not find audio source', 'error')
      }
    } finally {
      setPlaying(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-light-bg dark:bg-dark-bg pb-32 flex flex-col items-center justify-center px-6">
        <div className="w-64 h-64 rounded-2xl bg-zinc-800 animate-pulse mb-8" />
        <div className="h-8 bg-zinc-800 rounded-lg animate-pulse w-48 mb-3" />
        <div className="h-4 bg-zinc-800 rounded-lg animate-pulse w-32 mb-2" />
        <div className="h-4 bg-zinc-800 rounded-lg animate-pulse w-40" />
      </div>
    )
  }

  if (error || !track) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-light-bg dark:bg-dark-bg px-4">
        <Music className="w-12 h-12 text-light-muted dark:text-dark-muted mb-4" />
        <p className="text-light-muted dark:text-dark-muted mb-6 text-center text-sm">{error || 'Track not found'}</p>
        <div className="flex gap-3">
          <button onClick={() => id && doFetch(id)} className="px-6 py-2 bg-accent text-white rounded-lg text-sm font-medium cursor-pointer">Retry</button>
          <button onClick={() => navigate(-1)} className="px-6 py-2 bg-zinc-200 dark:bg-zinc-800 text-light-text dark:text-zinc-300 rounded-lg text-sm font-medium cursor-pointer">Go Back</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text pb-32">
      <button
        onClick={() => navigate(-1)}
        className="absolute left-4 z-10 w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center cursor-pointer text-white active:scale-90 transition-transform safe-top-1rem"
        aria-label="Go back"
      >
        <ArrowLeft className="w-5 h-5" aria-hidden="true" />
      </button>

      <div className="flex flex-col items-center px-6 pt-16">
        <div className="w-64 h-64 rounded-2xl overflow-hidden shadow-2xl mb-8">
          <ArtworkImage src={track.artwork_url} alt={track.album} className="w-full h-full" iconSize={48} loading="eager" fetchPriority="high" />
        </div>

        <div className="text-center w-full max-w-sm">
          <h1 className="text-2xl font-bold text-light-text dark:text-white leading-tight mb-1 line-clamp-2">
            {track.title}
          </h1>

          {track.artist_id ? (
            <button
              onClick={() => navigate(`/artist/${track.artist_id}`)}
              className="text-base text-light-muted dark:text-zinc-400 hover:text-accent dark:hover:text-accent transition-colors cursor-pointer"
            >
              <Mic2 className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
              {track.artist}
            </button>
          ) : (
            <p className="text-base text-light-muted dark:text-zinc-400">
              <Mic2 className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
              {track.artist}
            </p>
          )}

          {track.album_id ? (
            <button
              onClick={() => navigate(`/album/${track.album_id}`)}
              className="text-sm text-light-muted dark:text-zinc-500 hover:text-accent dark:hover:text-accent transition-colors cursor-pointer mt-1 block"
            >
              <Disc3 className="w-3 h-3 inline mr-1.5 -mt-0.5" />
              {track.album}
            </button>
          ) : (
            <p className="text-sm text-light-muted dark:text-zinc-500 mt-1">
              <Disc3 className="w-3 h-3 inline mr-1.5 -mt-0.5" />
              {track.album}
            </p>
          )}

          {track.duration_ms ? (
            <p className="text-xs text-light-muted dark:text-zinc-600 mt-3 flex items-center justify-center gap-1">
              <Clock className="w-3 h-3" />
              {msToMinutes(track.duration_ms)}
            </p>
          ) : null}
        </div>

        <div className="w-full max-w-sm mt-8 flex gap-3">
          <button
            onClick={handlePlay}
            disabled={playing}
            className="flex-1 py-3.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97] transition-transform"
          >
            {playing ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Play className="w-5 h-5 fill-current" />
            )}
            {playing ? 'Loading...' : 'Play Online'}
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex-1 py-3.5 bg-accent hover:bg-accent-hover text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97] transition-transform"
          >
            <Download className="w-5 h-5" />
            {downloading ? 'Downloading...' : 'Download'}
          </button>
        </div>

        <div className="flex items-center gap-4 mt-8 text-xs text-light-muted dark:text-zinc-600">
          <button onClick={() => navigate('/')} className="hover:text-accent transition-colors cursor-pointer">Home</button>
          <span>•</span>
          <button onClick={() => navigate('/download')} className="hover:text-accent transition-colors cursor-pointer">Download</button>
        </div>
      </div>

      {isNative() && (
        <p className="mt-4 text-xs text-light-muted dark:text-zinc-500 text-center">Files saved to Documents folder</p>
      )}
    </div>
  )
}

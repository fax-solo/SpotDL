import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

import { ArrowLeft, Play, Download, Headphones, Mic2, Clock, Calendar, Loader2 } from 'lucide-react'
import { ArtworkImage } from '../components/ArtworkImage'
import { downloadTrack } from '../lib/api'
import { saveOrCacheBlob, isNative } from '../lib/capacitorBridge'
import { fetchEpisode, type Episode } from '../lib/spotifyApi'
import { usePlayer } from '../hooks/usePlayer'
import { useToast } from '../components/Toast'
import type { HistoryEntry } from '../hooks/useHistory'

interface EpisodeDetailProps {
  onDownloadComplete: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void
}

function msToMinutes(ms: number): string {
  const mins = Math.floor(ms / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function EpisodeDetail({ onDownloadComplete }: EpisodeDetailProps) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [episode, setEpisode] = useState<Episode | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [playing, setPlaying] = useState(false)
  const { toast } = useToast()
  const { play } = usePlayer()

  const doFetch = useCallback(async (episodeId: string) => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchEpisode(episodeId)
      setEpisode(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load episode')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!id) return
    doFetch(id)
  }, [id, doFetch])

  const handleDownload = async () => {
    if (!episode) return
    setDownloading(true)
    try {
      const meta = {
        title: episode.title,
        artist: episode.show?.publisher || episode.show?.name || 'Unknown',
        album: episode.show?.name || 'Podcast',
        artwork_url: episode.image,
        url: `https://open.spotify.com/episode/${episode.id}`,
        type: 'episode',
      }
      const { blob, filename } = await downloadTrack(meta, (stage, pct) => {
        toast(`${stage}${pct ? ` ${pct}%` : ''}`, 'info')
      }, undefined, 1)
      const filePath = await saveOrCacheBlob(blob, filename)
      toast(`Downloaded ${episode.title}`, 'success')
      onDownloadComplete({
        title: episode.title,
        artist: episode.show?.publisher || episode.show?.name || 'Unknown',
        album: episode.show?.name || 'Podcast',
        artworkUrl: episode.image,
        filePath,
      })
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Download failed', 'error')
    }
    setDownloading(false)
  }

  const handlePlay = async () => {
    if (!episode || playing) return
    if (!episode.audio_preview_url) {
      toast('No audio preview available for this episode', 'error')
      return
    }
    setPlaying(true)
    try {
      play({
        id: crypto.randomUUID(),
        title: episode.title,
        artist: episode.show?.publisher || episode.show?.name || 'Unknown',
        album: episode.show?.name || 'Podcast',
        artworkUrl: episode.image || null,
        filePath: null,
        streamUrl: episode.audio_preview_url,
        timestamp: Date.now(),
      })
    } catch {
      toast('Could not play episode', 'error')
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

  if (error || !episode) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-light-bg dark:bg-dark-bg px-4">
        <Headphones className="w-12 h-12 text-light-muted dark:text-dark-muted mb-4" />
        <p className="text-light-muted dark:text-dark-muted mb-6 text-center text-sm">{error || 'Episode not found'}</p>
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
        className="absolute left-4 z-10 w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center cursor-pointer text-white active:scale-90 transition-transform"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}
        aria-label="Go back"
      >
        <ArrowLeft className="w-5 h-5" aria-hidden="true" />
      </button>

      <div className="flex flex-col items-center px-6 pt-16">
        <div
          className="w-64 h-64 rounded-2xl overflow-hidden shadow-2xl mb-8"
        >
          <ArtworkImage src={episode.image} alt={episode.title} className="w-full h-full" iconSize={48} loading="eager" fetchPriority="high" />
        </div>

        <div
          className="text-center w-full max-w-sm"
        >
          <h1 className="text-2xl font-bold text-light-text dark:text-white leading-tight mb-1 line-clamp-2">
            {episode.title}
          </h1>

          {episode.show?.id ? (
            <button
              onClick={() => navigate(`/show/${episode.show?.id}`)}
              className="text-base text-light-muted dark:text-zinc-400 hover:text-accent dark:hover:text-accent transition-colors cursor-pointer"
            >
              <Mic2 className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
              {episode.show.name}
            </button>
          ) : (
            <p className="text-base text-light-muted dark:text-zinc-400">
              <Mic2 className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
              {episode.show?.publisher || 'Podcast'}
            </p>
          )}

          <div className="flex items-center justify-center gap-3 mt-3 text-xs text-light-muted dark:text-zinc-500">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {msToMinutes(episode.duration_ms)}
            </span>
            {episode.release_date && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {episode.release_date}
              </span>
            )}
            {episode.explicit && (
              <span className="px-1.5 py-0.5 text-[11px] font-bold bg-zinc-200 dark:bg-zinc-700 rounded uppercase">E</span>
            )}
          </div>

          {episode.description && (
            <p className="text-sm text-light-muted dark:text-zinc-400 mt-4 text-left leading-relaxed line-clamp-4">
              {episode.description.replace(/<[^>]+>/g, '')}
            </p>
          )}
        </div>

        <div className="w-full max-w-sm mt-8 flex gap-3">
          {episode.audio_preview_url && (
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
              {playing ? 'Loading...' : 'Play Preview'}
            </button>
          )}
          <button
            onClick={handleDownload}
            disabled={downloading}
            className={`${episode.audio_preview_url ? 'flex-1' : 'w-full'} py-3.5 bg-accent hover:bg-accent-hover text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97] transition-transform`}
          >
            <Download className="w-5 h-5" />
            {downloading ? 'Downloading...' : 'Download Episode'}
          </button>
        </div>

        <div
          className="flex items-center gap-4 mt-8 text-xs text-light-muted dark:text-zinc-600"
        >
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

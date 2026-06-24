import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Headphones, Mic2, Clock, Calendar } from 'lucide-react'
import { ArtworkImage } from '../components/ArtworkImage'
import { fetchShow, type Show, type Episode } from '../lib/spotifyApi'

function msToMinutes(ms: number): string {
  const mins = Math.floor(ms / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function ShowDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [show, setShow] = useState<Show | null>(null)
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const doFetch = useCallback(async (showId: string) => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchShow(showId)
      setShow(data.show)
      setEpisodes(data.episodes)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load show')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!id) return
    doFetch(id)
  }, [id, doFetch])

  if (loading) {
    return (
      <div className="min-h-screen bg-light-bg dark:bg-dark-bg pb-32 flex flex-col items-center justify-center px-6">
        <div className="w-48 h-48 rounded-full bg-zinc-800 animate-pulse mb-8" />
        <div className="h-8 bg-zinc-800 rounded-lg animate-pulse w-48 mb-3" />
        <div className="h-4 bg-zinc-800 rounded-lg animate-pulse w-64 mb-2" />
      </div>
    )
  }

  if (error || !show) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-light-bg dark:bg-dark-bg px-4">
        <Headphones className="w-12 h-12 text-light-muted dark:text-dark-muted mb-4" />
        <p className="text-light-muted dark:text-dark-muted mb-6 text-center text-sm">{error || 'Show not found'}</p>
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
        <div className="w-48 h-48 rounded-full overflow-hidden shadow-2xl mb-6">
          <ArtworkImage src={show.image} alt={show.name} className="w-full h-full" iconSize={48} loading="eager" fetchPriority="high" />
        </div>

        <div className="text-center w-full max-w-sm">
          <h1 className="text-2xl font-bold text-light-text dark:text-white leading-tight mb-1">
            {show.name}
          </h1>
          <p className="text-sm text-light-muted dark:text-zinc-400">
            <Mic2 className="w-3 h-3 inline mr-1 -mt-0.5" />
            {show.publisher}
          </p>
          <div className="flex items-center justify-center gap-3 mt-2 text-xs text-light-muted dark:text-zinc-500">
            <span>{show.total_episodes} episodes</span>
            {show.explicit && (
              <span className="px-1.5 py-0.5 text-[11px] font-bold bg-zinc-200 dark:bg-zinc-700 rounded uppercase">E</span>
            )}
          </div>
          {show.description && (
            <p className="text-sm text-light-muted dark:text-zinc-400 mt-4 text-left leading-relaxed line-clamp-4">
              {show.description.replace(/<[^>]+>/g, '')}
            </p>
          )}
        </div>

        <div className="w-full mt-8">
          <h2 className="text-lg font-bold text-light-text dark:text-white mb-4">Episodes</h2>
          <div className="space-y-2">
            {episodes.map((ep, _i) => (
              <button
                key={ep.id}
                onClick={() => navigate(`/episode/${ep.id}`)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer text-left active:scale-[0.98] transition-transform"
              >
                <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-accent/20 to-blue-500/20 flex-shrink-0 overflow-hidden">
                  {ep.image ? <ArtworkImage src={ep.image} alt="" className="w-full h-full object-cover" /> : <Headphones className="w-5 h-5 text-accent/40 m-auto" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-light-text dark:text-dark-text truncate">{ep.title}</p>
                  <p className="text-xs text-light-muted dark:text-dark-muted truncate flex items-center gap-2">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{msToMinutes(ep.duration_ms)}</span>
                    {ep.release_date && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{ep.release_date}</span>}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

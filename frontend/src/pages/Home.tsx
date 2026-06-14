import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Music, LogIn, RefreshCw, Headphones, ChevronRight, Clock } from 'lucide-react'
import { isAuthenticated, login } from '../lib/spotifyAuth'
import { getPlaylistCategories, enrichCategoryWithImages, fetchUserPlaylists, fetchFeaturedPlaylists, fetchPlaylistSummary, fetchRecentlyPlayed, fetchRecommendations, type PlaylistCategory, type PlaylistSummary, type RecentTrack, type RecommendationItem } from '../lib/spotifyApi'

export function Home() {
  const navigate = useNavigate()
  const [authed, setAuthed] = useState(false)
  const [categories, setCategories] = useState<PlaylistCategory[]>([])
  const [recent, setRecent] = useState<RecentTrack[]>([])
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setAuthed(isAuthenticated())
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        if (isAuthenticated()) {
          const [userPlaylists, featured, recentData, recs] = await Promise.all([
            fetchUserPlaylists().catch(() => []),
            fetchFeaturedPlaylists().catch(() => []),
            fetchRecentlyPlayed(10).catch(() => []),
            fetchRecommendations(6).catch(() => []),
          ])

          const cats: PlaylistCategory[] = []
          if (recentData.length > 0) {
            cats.push({ name: 'Recently Played', playlists: recentData.slice(0, 5).map(t => ({
              id: t.id,
              name: t.name,
              description: t.artist,
              image: t.artwork_url,
              owner: '',
              trackCount: 0,
            })) })
          }
          if (userPlaylists.length > 0) cats.push({ name: 'Your Playlists', playlists: userPlaylists })
          if (featured.length > 0) cats.push({ name: 'Featured', playlists: featured })
          setCategories(cats)
          setRecent(recentData)
          setRecommendations(recs)
        } else {
          const base = getPlaylistCategories()
          const enriched = await Promise.all(
            base.map(c => enrichCategoryWithImages(c).catch(() => c))
          )
          setCategories(enriched)
        }
      } catch {
        if (!isAuthenticated()) setCategories(getPlaylistCategories())
      }
      setLoading(false)
    }
    load()
  }, [])

  function openPlaylist(id: string) {
    navigate(`/playlist/${id}`)
  }

  return (
    <div className="px-4 pt-6 pb-24">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-light-text dark:text-dark-text">
          {authed ? 'Your Library' : 'SpotDL'}
        </h1>
        <p className="text-sm text-light-muted dark:text-dark-muted mt-1">
          {authed ? 'Your playlists and recent tracks' : 'Browse by category'}
        </p>
      </div>

      {!authed && (
        <button
          onClick={login}
          className="w-full mb-6 p-4 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center gap-3 hover:bg-green-500/20 transition-colors cursor-pointer"
        >
          <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
            <LogIn className="w-5 h-5 text-green-500" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold text-green-600 dark:text-green-400">Connect Spotify</p>
            <p className="text-xs text-light-muted dark:text-dark-muted">Sync your playlists and library</p>
          </div>
        </button>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 text-accent animate-spin" />
        </div>
      )}

      {/* Recently played */}
      {!loading && authed && recent.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-accent" />
            <h2 className="text-lg font-bold text-light-text dark:text-dark-text">Recently Played</h2>
          </div>
          <div className="space-y-1">
            {recent.slice(0, 5).map(track => (
              <div
                key={track.id + track.played_at}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/50 dark:hover:bg-zinc-800/50 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-accent/20 to-blue-500/20 flex-shrink-0 overflow-hidden">
                  {track.artwork_url ? (
                    <img src={track.artwork_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Music className="w-5 h-5 text-accent/40 m-auto" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-light-text dark:text-dark-text truncate">{track.name}</p>
                  <p className="text-xs text-light-muted dark:text-dark-muted truncate">{track.artist}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {!loading && authed && recommendations.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-bold text-light-text dark:text-dark-text mb-3">Recommended Tracks</h2>
          <div className="grid grid-cols-3 gap-2">
            {recommendations.slice(0, 6).map(rec => (
              <div key={rec.id} className="flex flex-col rounded-xl overflow-hidden bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50">
                <div className="aspect-square bg-gradient-to-br from-accent/20 to-blue-500/20 flex items-center justify-center overflow-hidden">
                  {rec.image ? (
                    <img src={rec.image} alt={rec.name} className="w-full h-full object-cover" />
                  ) : (
                    <Music className="w-6 h-6 text-accent/40" />
                  )}
                </div>
                <div className="p-2">
                  <p className="text-xs font-semibold text-light-text dark:text-dark-text truncate leading-tight">{rec.name}</p>
                  {rec.artist && (
                    <p className="text-[10px] text-light-muted dark:text-dark-muted truncate">{rec.artist}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && categories.map(cat => (
        <CategorySection
          key={cat.name}
          category={cat}
          onPlaylistClick={cat.name === 'Recently Played' ? undefined : openPlaylist}
        />
      ))}

      {!loading && categories.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Headphones className="w-12 h-12 text-light-muted dark:text-dark-muted mb-4" />
          <p className="text-light-muted dark:text-dark-muted">No playlists found</p>
        </div>
      )}
    </div>
  )
}

function CategorySection({ category, onPlaylistClick }: { category: PlaylistCategory; onPlaylistClick?: (id: string) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null)

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-light-text dark:text-dark-text">
          {category.name}
        </h2>
        <ChevronRight className="w-5 h-5 text-light-muted dark:text-dark-muted" />
      </div>
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto scrollbar-hide mx-[-1rem] px-4 pb-2"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {category.playlists.map(p => (
          <PlaylistCard
            key={p.id}
            playlist={p}
            onClick={() => onPlaylistClick?.(p.id)}
          />
        ))}
      </div>
    </div>
  )
}

function PlaylistCard({ playlist, onClick }: { playlist: PlaylistSummary; onClick?: () => void }) {
  const [imgErr, setImgErr] = useState(false)
  const [imgSrc, setImgSrc] = useState(playlist.image)

  useEffect(() => {
    setImgSrc(playlist.image)
    setImgErr(false)
  }, [playlist.image])

  useEffect(() => {
    if (imgSrc) return
    let cancelled = false
    fetchPlaylistSummary(playlist.id).then(data => {
      if (!cancelled && data.image) setImgSrc(data.image)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [playlist.id, imgSrc])

  const handleClick = () => {
    if (onClick) onClick()
  }

  return (
    <button
      onClick={handleClick}
      className="flex-shrink-0 w-[160px] text-left rounded-xl overflow-hidden bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50 hover:shadow-md transition-shadow cursor-pointer group"
    >
      <div className="aspect-square bg-gradient-to-br from-accent/20 to-blue-500/20 flex items-center justify-center relative overflow-hidden">
        {imgSrc && !imgErr ? (
          <img
            src={imgSrc}
            alt={playlist.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={() => setImgErr(true)}
          />
        ) : (
          <Music className="w-10 h-10 text-accent/40" />
        )}
      </div>
      <div className="p-3">
        <p className="text-sm font-semibold text-light-text dark:text-dark-text truncate leading-tight">
          {playlist.name}
        </p>
        {playlist.trackCount > 0 && (
          <p className="text-xs text-light-muted dark:text-dark-muted mt-1">
            {playlist.trackCount} tracks
          </p>
        )}
        {playlist.description && (
          <p className="text-xs text-light-muted dark:text-dark-muted mt-0.5 truncate">
            {playlist.description}
          </p>
        )}
      </div>
    </button>
  )
}

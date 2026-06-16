import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Music, LogIn, Headphones, Search, Sparkles, Clock, Disc3 } from 'lucide-react'
import { ArtworkImage } from '../components/ArtworkImage'
import { isAuthenticated, getAccessToken } from '../lib/spotifyAuth'
import {
  getPlaylistCategories, enrichCategoryWithImages, fetchPlaylistSummary, searchSpotify,
  fetchNewReleases, fetchRecentlyPlayed, fetchRecommendations,
  type PlaylistCategory, type PlaylistSummary,
  type NewReleaseAlbum, type SearchTrack,
} from '../lib/spotifyApi'
import { SkeletonCard } from '../components/SkeletonCard'
import { PullToRefresh } from '../components/PullToRefresh'
import { useHistory } from '../hooks/useHistory'

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 350, damping: 30 } },
}

export function Home() {
  const navigate = useNavigate()
  const [authed, setAuthed] = useState(false)
  const [categories, setCategories] = useState<PlaylistCategory[]>([])
  const [loading, setLoading] = useState(true)

  // Search state moved to SearchPage

  const [newReleases, setNewReleases] = useState<NewReleaseAlbum[]>([])
  const [newReleasesLoading, setNewReleasesLoading] = useState(false)
  const [recentlyPlayed, setRecentlyPlayed] = useState<SearchTrack[]>([])
  const [recentlyPlayedLoading, setRecentlyPlayedLoading] = useState(false)
  const [recommendations, setRecommendations] = useState<SearchTrack[]>([])

  const { entries } = useHistory()

  const loadCategories = useCallback(async () => {
    setLoading(true)
    const base = getPlaylistCategories()
    const enriched = await Promise.all(base.map(c => enrichCategoryWithImages(c).catch(() => c)))
    setCategories(enriched)
    setLoading(false)
  }, [])

  const loadNewReleases = useCallback(async () => {
    setNewReleasesLoading(true)
    try {
      const albums = await fetchNewReleases(16)
      setNewReleases(albums)
    } catch { setNewReleases([]) }
    setNewReleasesLoading(false)
  }, [])

  const loadRecentlyPlayed = useCallback(async () => {
    const token = getAccessToken()
    if (!token) { setRecentlyPlayed([]); return }
    setRecentlyPlayedLoading(true)
    try {
      const tracks = await fetchRecentlyPlayed(10)
      setRecentlyPlayed(tracks)
    } catch { setRecentlyPlayed([]) }
    setRecentlyPlayedLoading(false)
  }, [])

  const loadRecommendations = useCallback(async () => {
    if (entries.length === 0) return
    const lastEntry = entries[0]
    try {
      const res = await searchSpotify(`${lastEntry.artist} ${lastEntry.title}`, 'track', 1)
      if (res.tracks?.[0]?.artist_id) {
        const tracks = await fetchRecommendations([res.tracks[0].artist_id], [], [], 10)
        setRecommendations(tracks)
      }
    } catch { setRecommendations([]) }
  }, [entries])

  useEffect(() => {
    const authed = isAuthenticated()
    setAuthed(authed)
    loadCategories()
    loadNewReleases()
    loadRecentlyPlayed()
  }, [loadCategories, loadNewReleases, loadRecentlyPlayed])

  useEffect(() => {
    if (entries.length > 0 && recommendations.length === 0) {
      loadRecommendations()
    }
  }, [entries, loadRecommendations, recommendations.length])

  // Search logic moved to SearchPage

  function openPlaylist(id: string) { navigate(`/playlist/${id}`) }

  return (
    <PullToRefresh onRefresh={async () => { await Promise.all([loadCategories(), loadNewReleases(), loadRecentlyPlayed()]) }}>
      <div className="px-4 pt-6 pb-24">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 350, damping: 30 }}
          className="mb-4"
        >
          <h1 className="text-2xl font-bold text-light-text dark:text-dark-text">
            SpotDL
          </h1>
          <p className="text-sm text-light-muted dark:text-dark-muted mt-1">
            Search or browse music
          </p>
        </motion.div>

        <div className="relative mb-5">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-light-muted dark:text-dark-muted pointer-events-none" />
          <div
            onClick={() => navigate('/search')}
            className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50 text-sm text-light-muted dark:text-dark-muted cursor-pointer hover:bg-light-bg dark:hover:bg-zinc-800 transition-colors"
          >
            Search tracks, artists, playlists...
          </div>
        </div>

        {!authed ? (
          <motion.button
            onClick={() => navigate('/settings')}
            whileTap={{ scale: 0.98 }}
            className="w-full mb-5 p-4 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center gap-3 hover:bg-green-500/20 transition-colors cursor-pointer"
          >
            <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
              <LogIn className="w-5 h-5 text-green-500" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-semibold text-green-600 dark:text-green-400">Connect Spotify</p>
              <p className="text-xs text-light-muted dark:text-dark-muted">View your playlists and library</p>
            </div>
          </motion.button>
        ) : null}

        {/* New Releases */}
        {newReleases.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-accent" />
              <h2 className="text-lg font-bold text-light-text dark:text-dark-text">New Releases</h2>
            </div>
            <div className="flex gap-3 overflow-x-auto scrollbar-hide mx-[-1rem] px-4 pb-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              {newReleases.map((album, i) => (
                <motion.button
                  key={album.id}
                  onClick={() => navigate(`/playlist/${album.id}`, { state: { type: 'album' } })}
                  whileTap={{ scale: 0.95 }}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03, type: 'spring', stiffness: 350, damping: 30 }}
                  className="flex-shrink-0 w-[160px] text-left rounded-xl overflow-hidden bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50 hover:shadow-md transition-shadow cursor-pointer group"
                >
                  <div className="aspect-square bg-gradient-to-br from-accent/20 to-blue-500/20 flex items-center justify-center relative overflow-hidden">
                    <ArtworkImage src={album.image} alt={album.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" iconSize={40} />
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-semibold text-light-text dark:text-dark-text truncate leading-tight">{album.name}</p>
                    <p className="text-xs text-light-muted dark:text-dark-muted truncate mt-0.5">{album.artist}</p>
                  </div>
                </motion.button>
              ))}
            </div>
          </div>
        )}

        {newReleasesLoading && (
          <div className="mb-6">
            <div className="flex gap-3 overflow-x-auto scrollbar-hide mx-[-1rem] px-4 pb-2">
              {Array.from({ length: 4 }).map((_, j) => <SkeletonCard key={j} />)}
            </div>
          </div>
        )}

        {(
          <>
            {/* Recently Played */}
            {recentlyPlayed.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-accent" />
                  <h2 className="text-lg font-bold text-light-text dark:text-dark-text">Recently Played</h2>
                </div>
                <div className="space-y-1">
                  {recentlyPlayed.slice(0, 5).map((t, i) => (
                    <motion.button
                      key={t.id + i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                      onClick={() => navigate(`/track/${t.id}`)}
                      whileTap={{ scale: 0.98 }}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer text-left"
                    >
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-accent/20 to-blue-500/20 flex-shrink-0 overflow-hidden">
                        {t.artwork_url ? <ArtworkImage src={t.artwork_url} alt="" className="w-full h-full object-cover" /> : <Music className="w-5 h-5 text-accent/40 m-auto" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-light-text dark:text-dark-text truncate">{t.title}</p>
                        <p className="text-xs text-light-muted dark:text-dark-muted truncate">{t.artist}</p>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            {recentlyPlayedLoading && (
              <div className="flex items-center justify-center py-4 mb-4">
                <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {/* Recommendations */}
            {recommendations.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <Disc3 className="w-4 h-4 text-accent" />
                  <h2 className="text-lg font-bold text-light-text dark:text-dark-text">You Might Like</h2>
                </div>
                <div className="space-y-1">
                  {recommendations.slice(0, 5).map((t, i) => (
                    <motion.button
                      key={t.id + i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                      onClick={() => navigate(`/track/${t.id}`)}
                      whileTap={{ scale: 0.98 }}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer text-left"
                    >
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-accent/20 to-blue-500/20 flex-shrink-0 overflow-hidden">
                        {t.artwork_url ? <ArtworkImage src={t.artwork_url} alt="" className="w-full h-full object-cover" /> : <Music className="w-5 h-5 text-accent/40 m-auto" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-light-text dark:text-dark-text truncate">{t.title}</p>
                        <p className="text-xs text-light-muted dark:text-dark-muted truncate">{t.artist} • {t.album}</p>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            {/* Categories */}
            {loading ? (
              <div className="space-y-6">
                {[1, 2].map(i => (
                  <div key={i}>
                    <div className="flex gap-3 overflow-x-auto scrollbar-hide mx-[-1rem] px-4 pb-2">
                      {Array.from({ length: 4 }).map((_, j) => <SkeletonCard key={j} />)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <motion.div initial="hidden" animate="visible" variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}>
                {categories.map(cat => (
                  <motion.div key={cat.name} variants={itemVariants} className="mb-6">
                    <h2 className="text-lg font-bold text-light-text dark:text-dark-text mb-3">{cat.name}</h2>
                    <div className="flex gap-3 overflow-x-auto scrollbar-hide mx-[-1rem] px-4 pb-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                      {cat.playlists.map((p, i) => (
                        <PlaylistCard key={p.id} playlist={p} onClick={() => openPlaylist(p.id)} index={i} />
                      ))}
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}

            {!loading && categories.length === 0 && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center py-20 text-center">
                <Headphones className="w-12 h-12 text-light-muted dark:text-dark-muted mb-4" />
                <p className="text-light-muted dark:text-dark-muted text-sm">No playlists available</p>
                <p className="text-xs text-light-muted/60 dark:text-dark-muted/60 mt-1">Try searching for music instead</p>
              </motion.div>
            )}
          </>
        )}
      </div>
    </PullToRefresh>
  )
}

function PlaylistCard({ playlist, onClick, index }: { playlist: PlaylistSummary; onClick?: () => void; index: number }) {
  const [imgSrc, setImgSrc] = useState(playlist.image)

  useEffect(() => { setImgSrc(playlist.image) }, [playlist.image])
  useEffect(() => {
    if (imgSrc) return
    let cancelled = false
    fetchPlaylistSummary(playlist.id).then(d => { if (!cancelled && d.image) setImgSrc(d.image) }).catch(() => {})
    return () => { cancelled = true }
  }, [playlist.id, imgSrc])

  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.95 }}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03, type: 'spring', stiffness: 350, damping: 30 }}
      className="flex-shrink-0 w-[160px] text-left rounded-xl overflow-hidden bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50 hover:shadow-md transition-shadow cursor-pointer group"
    >
      <div className="aspect-square bg-gradient-to-br from-accent/20 to-blue-500/20 flex items-center justify-center relative overflow-hidden">
        <ArtworkImage src={imgSrc} alt={playlist.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" iconSize={40} />
      </div>
      <div className="p-3">
        <p className="text-sm font-semibold text-light-text dark:text-dark-text truncate leading-tight">{playlist.name}</p>
      </div>
    </motion.button>
  )
}

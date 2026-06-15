import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Music, LogIn, Headphones, Search, X, Library, Key, Play, Mic2, User } from 'lucide-react'
import { ArtworkImage } from '../components/ArtworkImage'
import { isAuthenticated } from '../lib/spotifyAuth'
import { getWebPlayerToken } from '../lib/spotifyApi'
import {
  getPlaylistCategories, enrichCategoryWithImages,
  fetchPlaylistSummary, searchSpotify, fetchUserPlaylists, searchYouTubeTracks,
  type PlaylistCategory, type PlaylistSummary, type SearchResults, type UserPlaylist,
} from '../lib/spotifyApi'
import { SkeletonCard } from '../components/SkeletonCard'
import { PullToRefresh } from '../components/PullToRefresh'

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 350, damping: 30 } },
}

export function Home() {
  const navigate = useNavigate()
  const [authed, setAuthed] = useState(false)
  const [categories, setCategories] = useState<PlaylistCategory[]>([])
  const [loading, setLoading] = useState(true)

  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null)
  const [youtubeResults, setPlayResults] = useState<any[] | null>(null)
  const [searchingPlay, setSearchingPlay] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  const [userPlaylists, setUserPlaylists] = useState<UserPlaylist[]>([])
  const [userPlaylistsLoading, setUserPlaylistsLoading] = useState(false)

  const loadCategories = useCallback(async () => {
    setLoading(true)
    const base = getPlaylistCategories()
    const enriched = await Promise.all(base.map(c => enrichCategoryWithImages(c).catch(() => c)))
    setCategories(enriched)
    setLoading(false)
  }, [])

  const loadUserPlaylists = useCallback(async () => {
    const token = getWebPlayerToken()
    if (!token) { setUserPlaylists([]); return }
    setUserPlaylistsLoading(true)
    try {
      const playlists = await fetchUserPlaylists(token)
      setUserPlaylists(playlists)
    } catch { setUserPlaylists([]) }
    setUserPlaylistsLoading(false)
  }, [])

  useEffect(() => {
    const authed = isAuthenticated()
    setAuthed(authed)
    loadCategories()
    loadUserPlaylists()
  }, [loadCategories, loadUserPlaylists])

  const handleSearch = useCallback(async (query: string) => {
    const trimmed = query.trim()
    if (!trimmed) { setSearchResults(null); setPlayResults(null); return }
    setSearching(true)
    setSearchResults(null)
    setPlayResults(null)
    try {
      const results = await searchSpotify(trimmed, 'track,artist', 8)
      setSearchResults(results)

      const hasResults = (results.tracks?.length ?? 0) > 0 || (results.artists?.length ?? 0) > 0
      const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(trimmed)
      if (!hasResults || hasArabic) {
        setSearchingPlay(true)
        try {
          const ytResults = await searchYouTubeTracks(trimmed)
          setPlayResults(ytResults)
        } catch { setPlayResults(null) }
        setSearchingPlay(false)
      }
    } catch {
      setSearchResults(null)
      setSearchingPlay(true)
      try {
        const ytResults = await searchYouTubeTracks(trimmed)
        setPlayResults(ytResults)
      } catch { setPlayResults(null) }
      setSearchingPlay(false)
    }
    setSearching(false)
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!searchQuery.trim()) { setSearchResults(null); setPlayResults(null); return }
    debounceRef.current = setTimeout(() => handleSearch(searchQuery), 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [searchQuery])

  const clearSearch = useCallback(() => {
    setSearchQuery('')
    setSearchResults(null)
    setPlayResults(null)
    searchInputRef.current?.focus()
  }, [])

  function openPlaylist(id: string) { navigate(`/playlist/${id}`) }

  return (
    <PullToRefresh onRefresh={loadCategories}>
      <div className="px-4 pt-6 pb-24">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 350, damping: 30 }}
          className="mb-4"
        >
          <h1 className="text-2xl font-bold text-light-text dark:text-dark-text">
            {searchResults || youtubeResults ? 'Search Results' : 'SpotDL'}
          </h1>
          <p className="text-sm text-light-muted dark:text-dark-muted mt-1">
            {searchResults ? `Results for "${searchQuery}"` : 'Search or browse by category'}
          </p>
        </motion.div>

        <div className="relative mb-5">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-light-muted dark:text-dark-muted pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                if (debounceRef.current) clearTimeout(debounceRef.current)
                handleSearch(searchQuery)
              }
            }}
            placeholder="Search tracks or artists..."
            className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50 text-sm text-light-text dark:text-dark-text placeholder:text-light-muted dark:placeholder:text-dark-muted focus:outline-none focus:ring-2 focus:ring-accent/30 transition-shadow"
          />
          {searchQuery && (
            <button onClick={clearSearch} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-light-bg dark:hover:bg-zinc-700 transition-colors cursor-pointer">
              <X className="w-3.5 h-3.5 text-light-muted dark:text-dark-muted" />
            </button>
          )}
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
        ) : !getWebPlayerToken() ? (
          <motion.button
            onClick={() => navigate('/settings')}
            whileTap={{ scale: 0.98 }}
            className="w-full mb-5 p-4 rounded-xl bg-accent/10 border border-accent/20 flex items-center gap-3 hover:bg-accent/20 transition-colors cursor-pointer"
          >
            <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
              <Key className="w-5 h-5 text-accent" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-semibold text-accent">Add Web Player Token</p>
              <p className="text-xs text-light-muted dark:text-dark-muted">Access your playlists and saved tracks</p>
            </div>
          </motion.button>
        ) : userPlaylistsLoading ? (
          <div className="flex items-center justify-center py-4 mb-4">
            <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : userPlaylists.length > 0 ? (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Library className="w-4 h-4 text-accent" />
              <h2 className="text-lg font-bold text-light-text dark:text-dark-text">Your Library</h2>
            </div>
            <div className="flex gap-3 overflow-x-auto scrollbar-hide mx-[-1rem] px-4 pb-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              {userPlaylists.map((p, i) => (
                <PlaylistCard key={p.id} playlist={{
                  id: p.id, name: p.name, description: p.description,
                  image: p.image, owner: p.owner, trackCount: p.trackCount,
                }} onClick={() => openPlaylist(p.id)} index={i} />
              ))}
            </div>
          </div>
        ) : null}

        {/* Search Results */}
        {searchResults && (
          <div className="space-y-1 mb-6">
            {searchResults.artists.length > 0 && (
              <>
                <div className="flex items-center gap-2 mb-2 mt-2">
                  <Mic2 className="w-4 h-4 text-accent" />
                  <h2 className="text-sm font-semibold text-light-text dark:text-dark-text">Artists</h2>
                </div>
                {searchResults.artists.map((a, i) => (
                  <motion.button
                    key={a.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    onClick={() => navigate(`/artist/${a.id}`)}
                    whileTap={{ scale: 0.98 }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer text-left"
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent/20 to-blue-500/20 flex-shrink-0 overflow-hidden">
                      {a.image ? <ArtworkImage src={a.image} alt="" className="w-full h-full object-cover" /> : <User className="w-5 h-5 text-accent/40 m-auto" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-light-text dark:text-dark-text truncate">{a.name}</p>
                      <p className="text-xs text-light-muted dark:text-dark-muted truncate">{a.followers.toLocaleString()} followers {a.genres.length ? `• ${a.genres.slice(0, 2).join(', ')}` : ''}</p>
                    </div>
                  </motion.button>
                ))}
              </>
            )}

            {searchResults.tracks.length > 0 && (
              <>
                {searchResults.artists.length > 0 && (
                  <div className="flex items-center gap-2 mb-2 mt-4">
                    <Music className="w-4 h-4 text-accent" />
                    <h2 className="text-sm font-semibold text-light-text dark:text-dark-text">Tracks</h2>
                  </div>
                )}
                {searchResults.tracks.map((t, i) => (
                  <motion.button
                    key={t.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    onClick={() => navigate(`/track/${t.id}`)}
                    whileTap={{ scale: 0.98 }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer text-left"
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
              </>
            )}

            {searchResults.tracks.length === 0 && searchResults.artists.length === 0 && (
              <p className="text-center text-light-muted dark:text-dark-muted py-8 text-sm">No Spotify results found</p>
            )}
          </div>
        )}

        {youtubeResults && youtubeResults.length > 0 && (
          <div className="space-y-1 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Play className="w-4 h-4 text-red-500" />
              <h2 className="text-sm font-semibold text-light-text dark:text-dark-text">YouTube Results</h2>
            </div>
            {youtubeResults.map((r, i) => (
              <motion.div
                key={r.videoId}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/50 dark:hover:bg-zinc-800/50 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-red-500/10 flex-shrink-0 overflow-hidden">
                  {r.thumbnail ? <ArtworkImage src={r.thumbnail} alt="" className="w-full h-full object-cover" /> : <Play className="w-5 h-5 text-red-400/40 m-auto" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-light-text dark:text-dark-text truncate">{r.title}</p>
                  <p className="text-xs text-light-muted dark:text-dark-muted truncate">YouTube • Click Download to use</p>
                </div>
                <button
                  onClick={() => navigate('/download', { state: { url: r.url } })}
                  className="px-3 py-1.5 text-xs bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 transition-colors cursor-pointer shrink-0"
                >
                  Download
                </button>
              </motion.div>
            ))}
          </div>
        )}

        {searchingPlay && (
          <div className="flex items-center justify-center py-4 gap-2">
            <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-light-muted dark:text-dark-muted">Searching YouTube...</span>
          </div>
        )}

        {searching && (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!searchResults && !searching && !youtubeResults && !searchingPlay && (
          <>
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
                <p className="text-light-muted dark:text-dark-muted">No playlists found</p>
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

import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import { Music, Headphones, Search, Sparkles, Clock, Disc3, Settings } from 'lucide-react'
import { ArtworkImage } from '../components/ArtworkImage'
import { getAccessToken } from '../lib/spotifyAuth'
import {
  getPlaylistCategories, enrichCategoryWithImages, fetchPlaylistSummary, searchSpotify,
  fetchNewReleases, fetchRecentlyPlayed, fetchRecommendations,
  type PlaylistCategory, type PlaylistSummary,
  type NewReleaseAlbum, type SearchTrack,
} from '../lib/spotifyApi'
import { SkeletonCard } from '../components/SkeletonCard'
import { PullToRefresh } from '../components/PullToRefresh'
import { useHistory } from '../hooks/useHistory'


export function Home() {
  const navigate = useNavigate()
  const [categories, setCategories] = useState<PlaylistCategory[]>([])
  const [loading, setLoading] = useState(true)

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
    if (!lastEntry) return
    try {
      const res = await searchSpotify(`${lastEntry.artist} ${lastEntry.title}`, 'track', 1)
      const firstTrack = res.tracks?.[0]
      if (firstTrack?.artist_id) {
        const tracks = await fetchRecommendations([firstTrack.artist_id], [], [], 10)
        setRecommendations(tracks)
      }
    } catch { setRecommendations([]) }
  }, [entries])

  useEffect(() => {
    loadCategories()
    loadNewReleases()
    loadRecentlyPlayed()
  }, [loadCategories, loadNewReleases, loadRecentlyPlayed])

  useEffect(() => {
    if (entries.length > 0 && recommendations.length === 0) {
      loadRecommendations()
    }
  }, [entries, loadRecommendations, recommendations.length])

  function openPlaylist(id: string) { navigate(`/playlist/${id}`) }

  return (
    <PullToRefresh onRefresh={async () => { await Promise.all([loadCategories(), loadNewReleases(), loadRecentlyPlayed()]) }}>
      <div className="px-5 pt-6 pb-36 safe-area-top animate-pageEnter max-w-5xl mx-auto">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-light-text dark:text-dark-text">
              Sinc
            </h1>
            <p className="text-sm text-light-muted dark:text-dark-muted mt-1.5">
              Search or browse music
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate('/history')}
              className="p-2 rounded-full text-light-muted dark:text-dark-muted hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-light-text dark:hover:text-dark-text transition-colors cursor-pointer"
              aria-label="History"
            >
              <Clock className="w-5 h-5" />
            </button>
            <button
              onClick={() => navigate('/settings')}
              className="p-2 rounded-full text-light-muted dark:text-dark-muted hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-light-text dark:hover:text-dark-text transition-colors cursor-pointer"
              aria-label="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="relative mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-light-muted dark:text-dark-muted pointer-events-none" />
          <div
            onClick={() => navigate('/search')}
            className="w-full pl-11 pr-10 py-3 rounded-xl bg-white dark:bg-dark-surface border border-light-border/40 dark:border-dark-border/40 text-sm text-light-muted dark:text-dark-muted cursor-pointer hover:border-emerald/30 hover:shadow-sm transition-all active:scale-[0.99]"
            role="button"
            tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter') navigate('/search') }}
          >
            Search tracks, artists, playlists...
          </div>
        </div>

        {newReleases.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-emerald" />
              <h2 className="text-lg font-bold text-light-text dark:text-dark-text">New Releases</h2>
            </div>
            <div className="flex gap-4 overflow-x-auto scrollbar-hide mx-[-1.25rem] px-5 pb-3">
              {newReleases.map((album, i) => (
                <button
                  key={album.id}
                  onClick={() => navigate(`/album/${album.id}`)}
                  className="flex-shrink-0 w-[170px] text-left rounded-xl overflow-hidden bg-white dark:bg-dark-surface border border-light-border/40 dark:border-dark-border/40 hover:shadow-md hover:border-emerald/20 transition-all duration-200 cursor-pointer group active:scale-95 focus-visible:outline-2 focus-visible:outline-emerald"
                >
                  <div className="aspect-square bg-gradient-to-br from-emerald/20 to-emerald-strong/20 flex items-center justify-center relative overflow-hidden">
                    <ArtworkImage src={album.image} alt={album.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" iconSize={40} loading={i === 0 ? 'eager' : 'lazy'} fetchPriority={i === 0 ? 'high' : 'auto'} />
                  </div>
                  <div className="p-4">
                    <p className="text-sm font-semibold text-light-text dark:text-dark-text truncate leading-tight">{album.name}</p>
                    <p className="text-xs text-light-muted dark:text-dark-muted truncate mt-1">{album.artist}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {newReleasesLoading && (
          <div className="mb-8">
            <div className="flex gap-4 overflow-x-auto scrollbar-hide mx-[-1.25rem] px-5 pb-3">
              {Array.from({ length: 4 }).map((_, j) => <SkeletonCard key={j} />)}
            </div>
          </div>
        )}

        {(
          <>
            {recentlyPlayed.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="w-4 h-4 text-emerald" />
                  <h2 className="text-lg font-bold text-light-text dark:text-dark-text">Recently Played</h2>
                </div>
                <div className="space-y-1">
                  {recentlyPlayed.slice(0, 5).map((t, i) => (
                    <button
                      key={t.id + i}
                      onClick={() => navigate(`/track/${t.id}`)}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/50 dark:hover:bg-zinc-800/50 transition-all cursor-pointer text-left active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-emerald"
                    >
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald/20 to-emerald-strong/20 flex-shrink-0 overflow-hidden">
                        {t.artwork_url ? <ArtworkImage src={t.artwork_url} alt="" className="w-full h-full object-cover" /> : <Music className="w-5 h-5 text-emerald/40 m-auto" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-light-text dark:text-dark-text truncate">{t.title}</p>
                        <p className="text-xs text-light-muted dark:text-dark-muted truncate mt-0.5">{t.artist}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {recentlyPlayedLoading && (
              <div className="flex items-center justify-center py-6 mb-6">
                <div className="w-5 h-5 border-2 border-emerald border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {recommendations.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <Disc3 className="w-4 h-4 text-emerald" />
                  <h2 className="text-lg font-bold text-light-text dark:text-dark-text">You Might Like</h2>
                </div>
                <div className="space-y-1">
                  {recommendations.slice(0, 5).map((t, i) => (
                    <button
                      key={t.id + i}
                      onClick={() => navigate(`/track/${t.id}`)}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/50 dark:hover:bg-zinc-800/50 transition-all cursor-pointer text-left active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-emerald"
                    >
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald/20 to-emerald-strong/20 flex-shrink-0 overflow-hidden">
                        {t.artwork_url ? <ArtworkImage src={t.artwork_url} alt="" className="w-full h-full object-cover" /> : <Music className="w-5 h-5 text-emerald/40 m-auto" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-light-text dark:text-dark-text truncate">{t.title}</p>
                        <p className="text-xs text-light-muted dark:text-dark-muted truncate mt-0.5">{t.artist} • {t.album}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {loading ? (
              <div className="space-y-8">
                {[1, 2].map(i => (
                  <div key={i}>
                    <div className="flex gap-4 overflow-x-auto scrollbar-hide mx-[-1.25rem] px-5 pb-3">
                      {Array.from({ length: 4 }).map((_, j) => <SkeletonCard key={j} />)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div>
                {categories.map(cat => (
                  <div key={cat.name} className="mb-8">
                    <h2 className="text-lg font-bold text-light-text dark:text-dark-text mb-4">{cat.name}</h2>
                    <div className="flex gap-4 overflow-x-auto scrollbar-hide mx-[-1.25rem] px-5 pb-3">
                      {cat.playlists.map((p, i) => (
                        <PlaylistCard key={p.id} playlist={p} onClick={() => openPlaylist(p.id)} index={i} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!loading && categories.length === 0 && (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <Headphones className="w-12 h-12 text-light-muted dark:text-dark-muted mb-4" />
                <p className="text-light-muted dark:text-dark-muted text-sm">No playlists available</p>
                <p className="text-xs text-light-muted/60 dark:text-dark-muted/60 mt-1">Try searching for music instead</p>
              </div>
            )}
          </>
        )}
      </div>
    </PullToRefresh>
  )
}

function PlaylistCard({ playlist, onClick, index: _index }: { playlist: PlaylistSummary; onClick?: () => void; index: number }) {
  const [imgSrc, setImgSrc] = useState(playlist.image)

  useEffect(() => { setImgSrc(playlist.image) }, [playlist.image])
  useEffect(() => {
    if (imgSrc) return
    let cancelled = false
    fetchPlaylistSummary(playlist.id).then(d => { if (!cancelled && d.image) setImgSrc(d.image) }).catch(() => {})
    return () => { cancelled = true }
  }, [playlist.id, imgSrc])

  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 w-[170px] text-left rounded-xl overflow-hidden bg-white dark:bg-dark-surface border border-light-border/40 dark:border-dark-border/40 hover:shadow-md hover:border-emerald/20 transition-all duration-200 cursor-pointer group active:scale-95 focus-visible:outline-2 focus-visible:outline-emerald"
    >
      <div className="aspect-square bg-gradient-to-br from-emerald/20 to-emerald-strong/20 flex items-center justify-center relative overflow-hidden">
        <ArtworkImage src={imgSrc} alt={playlist.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" iconSize={40} />
      </div>
      <div className="p-4">
        <p className="text-sm font-semibold text-light-text dark:text-dark-text truncate leading-tight">{playlist.name}</p>
      </div>
    </button>
  )
}

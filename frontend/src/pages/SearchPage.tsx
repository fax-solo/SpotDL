import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Music, Search, X, Play, Mic2, Podcast, ListMusic, ArrowLeft } from 'lucide-react'
import { ArtworkImage } from '../components/ArtworkImage'
import { searchSpotify, searchYouTubeTracks, type SearchResults } from '../lib/spotifyApi'
import { Capacitor } from '@capacitor/core'

export function SearchPage() {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null)
  const [youtubeResults, setPlayResults] = useState<any[] | null>(null)
  const [searchingPlay, setSearchingPlay] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)
  const isNative = Capacitor.isNativePlatform()

  useEffect(() => {
    setTimeout(() => { searchInputRef.current?.focus() }, 100)
  }, [])

  const handleSearch = useCallback(async (query: string) => {
    const trimmed = query.trim()
    if (!trimmed) { setSearchResults(null); setPlayResults(null); return }

    setSearching(true)
    setSearchingPlay(true)
    setSearchResults(null)
    setPlayResults(null)

    const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(trimmed)

    // Always run both in parallel — if Spotify fails, YouTube results still show
    const [spotifyResult, youtubeResult] = await Promise.allSettled([
      hasArabic ? Promise.reject('arabic-skip') : searchSpotify(trimmed, 'track,artist,show,playlist', 8),
      searchYouTubeTracks(trimmed),
    ])

    setSearching(false)
    setSearchingPlay(false)

    if (spotifyResult.status === 'fulfilled') {
      const r = spotifyResult.value
      const hasAny = (r.tracks?.length ?? 0) > 0 || (r.artists?.length ?? 0) > 0 ||
                     (r.playlists?.length ?? 0) > 0 || (r.shows?.length ?? 0) > 0
      if (hasAny) setSearchResults(r)
    }

    if (youtubeResult.status === 'fulfilled' && youtubeResult.value.length > 0) {
      setPlayResults(youtubeResult.value)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!searchQuery.trim()) { setSearchResults(null); setPlayResults(null); return }
    // 500ms on native to reduce hammering on slow mobile keyboards
    debounceRef.current = setTimeout(() => handleSearch(searchQuery), isNative ? 500 : 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [searchQuery, handleSearch, isNative])

  const clearSearch = useCallback(() => {
    setSearchQuery('')
    setSearchResults(null)
    setPlayResults(null)
    searchInputRef.current?.focus()
  }, [])

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text pb-24 pt-4 px-4">
      <div className="flex items-center gap-3 mb-6 relative z-10">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer flex-shrink-0"
        >
          <ArrowLeft className="w-5 h-5 text-light-text dark:text-dark-text" />
        </button>
        <div className="relative flex-1">
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
            placeholder="Search tracks, artists, playlists..."
            className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50 text-sm text-light-text dark:text-dark-text placeholder:text-light-muted dark:placeholder:text-dark-muted focus:outline-none focus:ring-2 focus:ring-accent/30 transition-shadow"
          />
          {searchQuery && (
            <button onClick={clearSearch} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-light-bg dark:hover:bg-zinc-700 transition-colors cursor-pointer">
              <X className="w-3.5 h-3.5 text-light-muted dark:text-dark-muted" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {searchResults && (
          <div className="space-y-2 mb-6">
            {(['artists', 'tracks', 'playlists', 'shows'] as const).map(type => {
              const items = type === 'artists' ? searchResults.artists
                : type === 'tracks' ? searchResults.tracks
                : type === 'playlists' ? searchResults.playlists
                : searchResults.shows
              if (!items?.length) return null
              const icon = type === 'artists' ? Mic2 : type === 'tracks' ? Music : type === 'playlists' ? ListMusic : Podcast
              const Icon = icon
              return (
                <div key={type}>
                  <div className="flex items-center gap-2 mb-2 mt-2">
                    <Icon className="w-4 h-4 text-accent" />
                    <h2 className="text-sm font-semibold text-light-text dark:text-dark-text capitalize">{type}</h2>
                  </div>
                  {items.map((item: any, i: number) => (
                    <motion.button
                      key={item.id || i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                      onClick={() => navigate(
                        type === 'artists' ? `/artist/${item.id}`
                        : type === 'tracks' ? `/track/${item.id}`
                        : type === 'playlists' ? `/playlist/${item.id}`
                        : `/show/${item.id}`
                      )}
                      whileTap={{ scale: 0.98 }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer text-left"
                    >
                      <div className={`w-10 h-10 flex-shrink-0 overflow-hidden bg-gradient-to-br from-accent/20 to-blue-500/20 ${
                        type === 'artists' || type === 'shows' ? 'rounded-full' : 'rounded-lg'
                      }`}>
                        {item.image || item.artwork_url ? (
                          <ArtworkImage src={item.image || item.artwork_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Icon className="w-5 h-5 text-accent/40 m-auto" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-light-text dark:text-dark-text truncate">
                          {item.name || item.title}
                        </p>
                        <p className="text-xs text-light-muted dark:text-dark-muted truncate">
                          {type === 'artists' && `${item.followers?.toLocaleString() || 0} followers${item.genres?.length ? ` • ${item.genres.slice(0, 2).join(', ')}` : ''}`}
                          {type === 'tracks' && `${item.artist} • ${item.album}`}
                          {type === 'playlists' && `${item.trackCount || 0} tracks${item.owner ? ` • ${item.owner}` : ''}`}
                          {type === 'shows' && `${item.publisher} • ${item.total_episodes || 0} episodes`}
                        </p>
                      </div>
                    </motion.button>
                  ))}
                </div>
              )
            })}

            {!searchResults.artists?.length && !searchResults.tracks?.length && !searchResults.playlists?.length && !searchResults.shows?.length && (
              <p className="text-center text-light-muted dark:text-dark-muted py-8 text-sm">No results found</p>
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
              <motion.button
                key={r.videoId}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => navigate(`/yt-track/${r.videoId}`, { state: { title: r.title, thumbnail: r.thumbnail, url: r.url, author: r.author } })}
                whileTap={{ scale: 0.98 }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-red-500/10 flex-shrink-0 overflow-hidden">
                  {r.thumbnail ? <ArtworkImage src={r.thumbnail} alt="" className="w-full h-full object-cover" /> : <Play className="w-5 h-5 text-red-400/40 m-auto" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-light-text dark:text-dark-text truncate">{r.title}</p>
                  <p className="text-xs text-light-muted dark:text-dark-muted truncate">YouTube • {r.author || 'Tap for details'}</p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); navigate('/download', { state: { url: r.url } }) }}
                  className="px-3 py-1.5 text-xs bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 transition-colors cursor-pointer shrink-0"
                >
                  Download
                </button>
              </motion.button>
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

        {!searchQuery && !searching && !searchResults && !youtubeResults && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Search className="w-12 h-12 text-light-muted dark:text-dark-muted mb-4" />
            <p className="text-light-muted dark:text-dark-muted text-sm">Start typing to search</p>
          </div>
        )}

        {searchQuery && !searching && !searchingPlay && !searchResults && !youtubeResults && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Music className="w-12 h-12 text-light-muted dark:text-dark-muted mb-4" />
            <p className="text-light-muted dark:text-dark-muted text-sm font-medium">No results found</p>
            <p className="text-light-muted dark:text-dark-muted text-xs mt-1">Try a different search term</p>
          </div>
        )}
      </div>
    </div>
  )
}

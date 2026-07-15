import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Music, Search, X, Play, Mic2, Podcast, ListMusic, ArrowLeft, Loader2, AlertCircle, Disc3 } from 'lucide-react'
import { ArtworkImage } from '../components/ArtworkImage'
import { searchSpotify, searchYouTubeTracks, fetchPlaylist, fetchAlbum, type SearchResults, type SearchTrack, type PlaylistSummary, type SearchAlbum } from '../lib/spotifyApi'
import { usePlayer } from '../hooks/usePlayer'
import { useToast } from '../components/Toast'
import { findAudio } from '../lib/sources'
import type { HistoryEntry } from '../hooks/useHistory'
import { Capacitor } from '@capacitor/core'

function groupTracksByAlbum(tracks: SearchTrack[]): (SearchTrack & { _groupSize?: number })[] {
  const groups = new Map<string, SearchTrack[]>()
  const solo: SearchTrack[] = []
  for (const t of tracks) {
    const key = t.album_id || `${t.album}:${t.artist}`
    const found = groups.get(key)
    if (found) {
      found.push(t)
    } else {
      groups.set(key, [t])
    }
  }
  for (const [, group] of groups) {
    if (group.length === 1) {
      solo.push(group[0])
    }
  }
  const deduped: (SearchTrack & { _groupSize?: number })[] = [...solo]
  for (const [, group] of groups) {
    if (group.length > 1) {
      const first = { ...group[0], _groupSize: group.length }
      deduped.push(first)
    }
  }
  return deduped
}

export function SearchPage() {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null)
  const [youtubeResults, setPlayResults] = useState<any[] | null>(null)
  const [searchingPlay, setSearchingPlay] = useState(false)
  const [loadingPlayId, setLoadingPlayId] = useState<string | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)
  const searchReqId = useRef(0)
  const isNative = Capacitor.isNativePlatform()
  const { play } = usePlayer()
  const { toast } = useToast()

  const handlePlayTrack = useCallback(async (item: SearchTrack) => {
    if (loadingPlayId) return
    setLoadingPlayId(item.id)
    try {
      const query = `${item.artist} ${item.title}`
      const { info } = await findAudio(query, item.title, item.artist)
      const entry: HistoryEntry = {
        id: crypto.randomUUID(),
        title: item.title,
        artist: item.artist,
        album: item.album,
        artworkUrl: item.artwork_url,
        filePath: null,
        streamUrl: info.audioUrl || undefined,
        timestamp: Date.now(),
      }
      play(entry)
    } catch {
      toast('Could not find audio source for this track', 'error')
    } finally {
      setLoadingPlayId(null)
    }
  }, [loadingPlayId, play, toast])

  const handlePlayPlaylist = useCallback(async (item: PlaylistSummary) => {
    if (loadingPlayId) return
    setLoadingPlayId(item.id)
    try {
      const data = await fetchPlaylist(item.id)
      if (!data.tracks?.length) {
        toast('This playlist has no tracks', 'error')
        return
      }
      const entries: HistoryEntry[] = data.tracks.map(t => ({
        id: crypto.randomUUID(),
        title: t.title,
        artist: t.artist,
        album: t.album || item.name,
        artworkUrl: t.artwork_url || item.image,
        filePath: null,
        streamUrl: undefined,
        timestamp: Date.now(),
      }))
      const firstTrack = data.tracks[0]
      try {
        const query = `${firstTrack.artist} ${firstTrack.title}`
        const { info } = await findAudio(query, firstTrack.title, firstTrack.artist)
        entries[0].streamUrl = info.audioUrl || undefined
      } catch {}
      play(entries[0], entries)
    } catch {
      toast('Could not load playlist', 'error')
    } finally {
      setLoadingPlayId(null)
    }
  }, [loadingPlayId, play, toast])

  const handlePlayAlbum = useCallback(async (item: SearchAlbum) => {
    if (loadingPlayId) return
    setLoadingPlayId(item.id)
    try {
      const data = await fetchAlbum(item.id)
      if (!data.tracks?.length) {
        toast('This album has no tracks', 'error')
        return
      }
      const entries: HistoryEntry[] = data.tracks.map(t => ({
        id: crypto.randomUUID(),
        title: t.title,
        artist: t.artist,
        album: t.album || item.name,
        artworkUrl: t.artwork_url || item.image,
        filePath: null,
        streamUrl: undefined,
        timestamp: Date.now(),
      }))
      const firstTrack = data.tracks[0]
      try {
        const query = `${firstTrack.artist} ${firstTrack.title}`
        const { info } = await findAudio(query, firstTrack.title, firstTrack.artist)
        entries[0].streamUrl = info.audioUrl || undefined
      } catch {}
      play(entries[0], entries)
    } catch {
      toast('Could not load album', 'error')
    } finally {
      setLoadingPlayId(null)
    }
  }, [loadingPlayId, play, toast])

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
    setSearchError(null)

    const reqId = ++searchReqId.current

    const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(trimmed)

    // Always run both in parallel — if Spotify fails, YouTube results still show
    const spotifyPromise = hasArabic
      ? searchSpotify(trimmed, 'track,artist,album,show,playlist', 8)
        .catch((err: unknown) => {
          console.warn('[search] Spotify search for Arabic query failed:', err)
          return null as unknown as SearchResults
        })
      : searchSpotify(trimmed, 'track,artist,album,show,playlist', 8)

    const [spotifyResult, youtubeResult] = await Promise.allSettled([
      spotifyPromise,
      searchYouTubeTracks(trimmed),
    ])

    if (reqId !== searchReqId.current) return

    setSearching(false)
    setSearchingPlay(false)

    if (spotifyResult.status === 'fulfilled' && spotifyResult.value) {
      const r = spotifyResult.value
      const hasAny = (r.tracks?.length ?? 0) > 0 || (r.artists?.length ?? 0) > 0 ||
                     (r.albums?.length ?? 0) > 0 || (r.playlists?.length ?? 0) > 0 || (r.shows?.length ?? 0) > 0
      if (hasAny) {
        setSearchResults(r)
      } else {
        setSearchError('No Spotify results found')
      }
    } else if (spotifyResult.status === 'rejected') {
      setSearchError('Spotify search unavailable')
    } else if (hasArabic && spotifyResult.status === 'fulfilled' && !spotifyResult.value) {
      // Arabic search returned empty — the API likely doesn't support it
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
    <div className="flex-1 flex flex-col min-h-screen bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text pb-32 pt-6 px-4 safe-area-top">
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
            className="w-full pl-10 pr-14 py-2.5 rounded-xl bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50 text-sm text-light-text dark:text-dark-text placeholder:text-light-muted dark:placeholder:text-dark-muted focus:outline-none focus:ring-2 focus:ring-accent/30 transition-shadow"
          />
          {searchQuery && (
            <button onClick={clearSearch} className="absolute right-1.5 top-1/2 -translate-y-1/2 min-touch rounded-xl hover:bg-light-bg dark:hover:bg-zinc-700 transition-colors cursor-pointer flex items-center justify-center">
              <X className="w-4 h-4 text-light-muted dark:text-dark-muted" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {searchResults && (
          <div className="space-y-2 mb-6">
            {(['artists', 'tracks', 'albums', 'playlists', 'shows'] as const).map(type => {
              const items = type === 'artists' ? searchResults.artists
                : type === 'tracks' ? searchResults.tracks
                : type === 'albums' ? searchResults.albums
                : type === 'playlists' ? searchResults.playlists
                : searchResults.shows
              if (!items?.length) return null
              const icon = type === 'artists' ? Mic2 : type === 'tracks' ? Music : type === 'albums' ? ListMusic : type === 'playlists' ? ListMusic : Podcast
              const Icon = icon
              return (
                <div key={type}>
                  <div className="flex items-center gap-2 mb-2 mt-2">
                    <Icon className="w-4 h-4 text-accent" />
                    <h2 className="text-sm font-semibold text-light-text dark:text-dark-text capitalize">{type}</h2>
                  </div>
                    {(type === 'tracks' ? groupTracksByAlbum(items as SearchTrack[]) : items).map((item: any, i: number) => {
                    const isMultiTrack = item._groupSize > 1
                    return (
                    <button
                      key={item.id || i}
                      onClick={() => navigate(
                        type === 'artists' ? `/artist/${item.id}`
                        : type === 'tracks' && isMultiTrack ? `/album/${item.album_id}`
                        : type === 'tracks' ? `/track/${item.id}`
                        : type === 'albums' ? `/album/${item.id}`
                        : type === 'playlists' ? `/playlist/${item.id}`
                        : `/show/${item.id}`
                      )}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer text-left active:scale-[0.98] transition-transform"
                    >
                      <div className={`w-10 h-10 flex-shrink-0 overflow-hidden bg-gradient-to-br from-accent/20 to-blue-500/20 flex items-center justify-center ${
                        type === 'artists' || type === 'shows' ? 'rounded-full' : 'rounded-lg'
                      }`}>
                        {item.image || item.artwork_url ? (
                          <ArtworkImage src={item.image || item.artwork_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Icon className="w-5 h-5 text-accent/40" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-light-text dark:text-dark-text truncate">
                          {item.name || item.title}
                        </p>
                        <p className="text-xs text-light-muted dark:text-dark-muted truncate">
                          {type === 'artists' && `${item.followers?.toLocaleString() || 0} followers${item.genres?.length ? ` • ${item.genres.slice(0, 2).join(', ')}` : ''}`}
                          {type === 'tracks' && isMultiTrack && `${item.artist} • ${item.album}`}
                          {type === 'tracks' && !isMultiTrack && `${item.artist} • ${item.album}`}
                          {type === 'albums' && `${item.artist}${item.year ? ` • ${item.year}` : ''}`}
                          {type === 'playlists' && `${item.trackCount || 0} tracks${item.owner ? ` • ${item.owner}` : ''}`}
                          {type === 'shows' && `${item.publisher} • ${item.total_episodes || 0} episodes`}
                        </p>
                        {type === 'tracks' && isMultiTrack && (
                          <p className="text-[10px] text-accent mt-0.5 flex items-center gap-1">
                            <Disc3 className="w-3 h-3" />
                            {item._groupSize} tracks • tap to view album
                          </p>
                        )}
                      </div>
                      {(type === 'tracks' || type === 'playlists' || type === 'albums') && (
                        <button
                          onClick={e => { e.stopPropagation(); 
                            if (type === 'tracks') handlePlayTrack(item)
                            else if (type === 'playlists') handlePlayPlaylist(item)
                            else if (type === 'albums') handlePlayAlbum(item)
                          }}
                          className="w-11 h-11 rounded-full bg-accent flex items-center justify-center flex-shrink-0 hover:bg-accent-hover transition-colors cursor-pointer ml-2 active-scale"
                        >
                          {loadingPlayId === item.id ? (
                            <Loader2 className="w-4 h-4 text-white animate-spin" />
                          ) : (
                            <Play className="w-4 h-4 text-white ml-0.5" />
                          )}
                        </button>
                      )}
                    </button>
                  )})}
                </div>
              )
            })}

            {!searchResults.artists?.length && !searchResults.tracks?.length && !searchResults.albums?.length && !searchResults.playlists?.length && !searchResults.shows?.length && (
              <p className="text-center text-light-muted dark:text-dark-muted py-8 text-sm">No results found</p>
            )}
          </div>
        )}

        {youtubeResults && youtubeResults.length > 0 && (
          <div className="space-y-1 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Play className="w-4 h-4 text-red-500" />
              <h2 className="text-sm font-semibold text-light-text dark:text-dark-text">YouTube Results</h2>
              {/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(searchQuery.trim()) && !searchResults && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 ml-auto">
                  Spotify search unavailable for this language
                </span>
              )}
            </div>
            {youtubeResults.map((r, _i) => (
              <button
                key={r.videoId}
                onClick={() => navigate(`/yt-track/${r.videoId}`, { state: { title: r.title, thumbnail: r.thumbnail, url: r.url, author: r.author } })}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer text-left active:scale-[0.98] transition-transform"
              >
                <div className="w-10 h-10 rounded-lg bg-red-500/10 flex-shrink-0 overflow-hidden flex items-center justify-center">
                  {r.thumbnail ? <ArtworkImage src={r.thumbnail} alt="" className="w-full h-full object-cover" /> : <Play className="w-5 h-5 text-red-400/40" />}
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
              </button>
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

        {searchQuery && !searching && !searchingPlay && !youtubeResults && searchError && !searchResults && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
            <p className="text-light-text dark:text-dark-text text-sm font-medium">Search failed</p>
            <p className="text-light-muted dark:text-dark-muted text-xs mt-1 mb-4">{searchError}</p>
            <button
              onClick={() => handleSearch(searchQuery)}
              className="px-4 py-2 bg-accent text-white rounded-lg text-sm cursor-pointer hover:bg-accent-hover transition-colors"
            >
              Try again
            </button>
          </div>
        )}

        {searchQuery && !searching && !searchingPlay && !youtubeResults && !searchResults && !searchError && (
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

import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

import { ArrowLeft, Play, Download, DownloadCloud, Music, Mic2, Users, Verified, Disc3, Sparkles, Loader2 } from 'lucide-react'
import { ArtworkImage } from '../components/ArtworkImage'
import { fetchArtistDetails, type ArtistDetails, type SearchTrack, type TrackMeta } from '../lib/spotifyApi'
import { SkeletonRow } from '../components/SkeletonRow'
import { usePlayer } from '../hooks/usePlayer'
import { findAudio } from '../lib/sources'
import { useToast } from '../components/Toast'
import { useDownloads } from '../hooks/useDownloads'
import type { HistoryEntry } from '../hooks/useHistory'
import { uuid } from '../lib/uuid'

interface ArtistPageProps {
  onDownloadComplete: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void
}

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function msToMinutes(ms: number): string {
  const mins = Math.floor(ms / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}


export function ArtistPage(_props: ArtistPageProps) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  function goToTrack(trackId: string) {
    navigate(`/track/${trackId}`)
  }
  const [artist, setArtist] = useState<ArtistDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const { toast } = useToast()
  const { queue, addDownload, addMultipleDownloads } = useDownloads()
  const { play } = usePlayer()

  const doFetch = useCallback(async (artistId: string) => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchArtistDetails(artistId)
      if (!data) throw new Error('Artist not found')
      setArtist(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load artist')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!id) return
    doFetch(id)
  }, [id, doFetch])

  const tracks = artist?.top_tracks ?? []

  const toTrackMeta = (track: SearchTrack): TrackMeta => ({
    title: track.title,
    artist: track.artist,
    ...(track.artist_id !== undefined ? { artist_id: track.artist_id } : {}),
    album: track.album,
    ...(track.album_id !== undefined ? { album_id: track.album_id } : {}),
    artwork_url: track.artwork_url,
    url: track.url,
    type: 'track',
  })

  const isDownloading = tracks.some(t =>
    queue.some(q => !q.done && !q.failed && (q.track.url === t.url || (q.track.title === t.title && q.track.artist === t.artist)))
  )

  const getTrackProgress = (track: SearchTrack) => {
    return queue.find(q =>
      q.track.url === track.url || (q.track.title === track.title && q.track.artist === track.artist)
    )
  }

  const getVisualPct = (track: SearchTrack) => {
    const prog = getTrackProgress(track)
    if (!prog) return 0
    if (prog.done) return 100
    if (prog.failed) return 0
    if (prog.stage.includes('Searching')) return 5
    if (prog.stage.includes('Downloading')) return 10 + (prog.pct ?? 0) * 0.3
    if (prog.stage.includes('Converting')) return 40 + (prog.pct ?? 0) * 0.6
    return 0
  }

  const handleDownload = (track: SearchTrack) => {
    addDownload(toTrackMeta(track))
    toast(`Queued ${track.title}`, 'success')
  }

  const handleDownloadAll = () => {
    addMultipleDownloads(tracks.map(toTrackMeta))
    toast(`Queued ${tracks.length} tracks for download`, 'success')
  }

  const handlePlay = async (track: SearchTrack) => {
    if (playingId) return
    setPlayingId(track.id)
    try {
      const query = `${track.artist} ${track.title}`
      const { info } = await findAudio(query, track.title, track.artist)
      play({
        id: uuid(),
        title: track.title,
        artist: track.artist,
        album: track.album || 'Unknown',
        artworkUrl: track.artwork_url || null,
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
        <div className="relative w-full aspect-square max-h-[50vh] bg-gray-200 dark:bg-zinc-800 animate-pulse" />
        <div className="px-6 py-4">
          <div className="h-8 bg-gray-200 dark:bg-zinc-800 rounded-xl animate-pulse w-1/2 mb-2" />
          <div className="h-4 bg-gray-200 dark:bg-zinc-800 rounded-xl animate-pulse w-1/3" />
        </div>
        <div className="px-3 mt-6">
          <div className="h-6 bg-gray-200 dark:bg-zinc-800 rounded-xl animate-pulse w-1/4 mb-4 ml-3" />
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      </div>
    )
  }

  if (error || !artist) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-light-bg dark:bg-dark-bg px-4">
        <Mic2 className="w-12 h-12 text-light-muted dark:text-dark-muted mb-4" />
        <p className="text-light-muted dark:text-dark-muted mb-2 text-center text-sm max-w-xs">{error || 'Artist not found'}</p>
        <div className="flex gap-3 mt-2">
          <button
            onClick={() => id && doFetch(id)}
            className="px-6 py-2 bg-accent text-white rounded-lg text-sm font-medium cursor-pointer"
          >
            Retry
          </button>
          <button
            onClick={() => navigate(-1)}
            className="px-6 py-2 bg-zinc-200 dark:bg-zinc-800 text-light-text dark:text-zinc-300 rounded-lg text-sm font-medium cursor-pointer"
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text pb-32">
      <div className="relative">
        <div className="relative w-full aspect-[3/4] sm:aspect-square max-h-[55vh] overflow-hidden">
          <ArtworkImage
            src={artist.image}
            alt={artist.name}
            className="w-full h-full object-cover"
            iconSize={80}
            loading="eager"
            fetchPriority="high"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-light-bg/20 dark:via-black/20 to-light-bg dark:to-black" />
        </div>

        <button
          onClick={() => navigate(-1)}
          className="absolute left-4 w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center cursor-pointer z-10 text-white active:scale-90 transition-transform safe-top-1rem"
          aria-label="Go back"
        >
          <ArrowLeft className="w-5 h-5" aria-hidden="true" />
        </button>

        <div className="absolute bottom-0 left-0 right-0 p-6">
          <div className="flex items-center gap-2 mb-2">
            <Verified className="w-5 h-5 text-accent" />
            <span className="text-xs font-semibold text-accent uppercase tracking-widest">Artist</span>
          </div>
          <h1 className="text-3xl font-bold text-light-text dark:text-white leading-tight mb-1">
            {artist.name}
          </h1>
          <div className="flex items-center gap-3 text-sm text-light-muted dark:text-zinc-400">
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              {formatFollowers(artist.followers)} followers
            </span>
            {artist.genres && artist.genres.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {artist.genres.slice(0, 3).map(g => (
                  <span key={g} className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 dark:bg-white/10 text-light-muted dark:text-zinc-400 font-medium">
                    {g}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {tracks.length > 0 && (
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
            {isDownloading ? 'Downloading...' : `Download Top ${tracks.length}`}
          </button>
        </div>
      )}

      {artist.latest_release && (
        <div className="px-3 mt-4">
          <div className="flex items-center gap-2 mb-3 px-3">
            <Sparkles className="w-4 h-4 text-accent" />
            <h2 className="text-lg font-bold text-light-text dark:text-dark-text">Latest Release</h2>
          </div>
          <button
            onClick={() => navigate(`/album/${artist.latest_release!.id}`)}
            className="w-full flex items-center gap-4 px-4 py-3 rounded-xl bg-gradient-to-r from-accent/10 to-accent/5 border border-accent/20 hover:bg-accent/15 transition-colors cursor-pointer text-left active:scale-[0.97] transition-transform"
          >
            <div className="w-16 h-16 rounded-xl overflow-hidden bg-gradient-to-br from-accent/20 to-blue-500/20 flex-shrink-0 shadow-md">
              <ArtworkImage src={artist.latest_release.image} alt={artist.latest_release.name} className="w-full h-full object-cover" iconSize={28} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-light-text dark:text-white truncate">{artist.latest_release.name}</p>
              <p className="text-xs text-light-muted dark:text-zinc-400">
                {artist.latest_release.type ? artist.latest_release.type.charAt(0).toUpperCase() + artist.latest_release.type.slice(1) : 'Album'}
                {artist.latest_release.year ? ` • ${artist.latest_release.year}` : ''}
              </p>
            </div>
            <Disc3 className="w-5 h-5 text-accent flex-shrink-0" />
          </button>
        </div>
      )}

      {tracks.length > 0 && (
        <div className="px-3 mt-6">
          <div className="flex items-center gap-2 mb-3 px-3">
            <Mic2 className="w-4 h-4 text-accent" />
            <h2 className="text-lg font-bold text-light-text dark:text-dark-text">Popular</h2>
          </div>
            {tracks.map((track, i) => {
              const prog = getTrackProgress(track)
              const showProgress = prog && !prog.done && !prog.failed
              const pct = getVisualPct(track)

              return (
                <div
                  key={track.id || i}
                  className="flex flex-col"
                >
                  <div
                    onClick={() => goToTrack(track.id)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-light-surface/50 dark:hover:bg-white/5 transition-colors group cursor-pointer"
                  >
                    <span className="text-sm text-light-muted dark:text-zinc-500 w-6 text-right flex-shrink-0 tabular-nums">
                      {i + 1}
                    </span>
                    <ArtworkImage
                      src={track.artwork_url}
                      alt={track.album}
                      className="w-11 h-11 rounded object-cover flex-shrink-0"
                      iconSize={18}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-light-text dark:text-white truncate">
                        {track.title}
                      </p>
                      <p className="text-xs text-light-muted dark:text-zinc-400 truncate">
                        {track.album}
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
                    {track.duration_ms ? (
                      <span className="text-xs text-light-muted dark:text-zinc-500 tabular-nums flex-shrink-0 hidden sm:block">
                        {msToMinutes(track.duration_ms)}
                      </span>
                    ) : null}
                    <button
                      onClick={e => { e.stopPropagation(); handlePlay(track) }}
                      disabled={playingId === track.id}
                      className="p-2.5 rounded-lg bg-green-600/10 dark:bg-green-600/20 hover:bg-green-600 text-green-600 dark:text-green-400 hover:text-white transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0 active:scale-90 transition-transform"
                      aria-label={`Play ${track.title}`}
                    >
                      {playingId === track.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4 fill-current" />
                      )}
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); handleDownload(track) }}
                      disabled={!!(prog && !prog.done && !prog.failed)}
                      className="p-2.5 rounded-lg bg-accent/10 dark:bg-white/10 hover:bg-accent text-accent dark:text-white/70 hover:text-white transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0 md:opacity-0 md:group-hover:opacity-100 active:scale-90 transition-transform"
                      aria-label={`Download ${track.title}`}
                    >
                      {prog && !prog.done && !prog.failed ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  {showProgress && (
                    <div className="px-3 pb-2">
                      <div className="h-1 bg-zinc-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent rounded-full"
                          ref={el => { if (el) el.style.width = `${pct}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

        </div>
      )}

      {artist.featuring && artist.featuring.length > 0 && (
        <div className="px-3 mt-6">
          <div className="flex items-center gap-2 mb-3 px-3">
            <Music className="w-4 h-4 text-accent" />
            <h2 className="text-lg font-bold text-light-text dark:text-dark-text">Featuring</h2>
          </div>
          <div className="flex gap-3 overflow-x-auto scrollbar-hide px-3 pb-2">
            {artist.featuring.slice(0, 10).map((album, _i) => (
              <button
                key={album.id}
                onClick={() => navigate(`/album/${album.id}`)}
                className="flex-shrink-0 w-[150px] text-left group active:scale-95 transition-transform"
              >
                <div className="aspect-square rounded-xl overflow-hidden bg-gradient-to-br from-accent/20 to-blue-500/20 mb-2 shadow-md">
                  <ArtworkImage src={album.image} alt={album.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" iconSize={30} />
                </div>
                <p className="text-sm font-semibold text-light-text dark:text-dark-text truncate leading-tight">{album.name}</p>
                {album.year && (
                  <p className="text-xs text-light-muted dark:text-dark-muted">{album.year}</p>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {artist.related_artists && artist.related_artists.length > 0 && (
        <div className="px-3 mt-6">
          <div className="flex items-center gap-2 mb-3 px-3">
            <Users className="w-4 h-4 text-accent" />
            <h2 className="text-lg font-bold text-light-text dark:text-dark-text">Fans Also Like</h2>
          </div>
          <div className="flex gap-3 overflow-x-auto scrollbar-hide px-3 pb-4">
            {artist.related_artists.slice(0, 10).map((ra, _i) => (
              <button
                key={ra.id}
                onClick={() => { doFetch(ra.id); navigate(`/artist/${ra.id}`, { replace: true }) }}
                className="flex-shrink-0 w-[120px] text-center group active:scale-95 transition-transform"
              >
                <div className="w-[120px] h-[120px] rounded-full overflow-hidden bg-gradient-to-br from-accent/20 to-blue-500/20 mb-2 shadow-md mx-auto">
                  <ArtworkImage src={ra.image} alt={ra.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" iconSize={40} />
                </div>
                <p className="text-sm font-semibold text-light-text dark:text-dark-text truncate leading-tight">{ra.name}</p>
              </button>
            ))}
          </div>
        </div>
      )}


    </div>
  )
}
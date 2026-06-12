import { useState, useCallback, type FormEvent } from 'react'
import { Download, Music, DownloadCloud } from 'lucide-react'
import { fetchMetadata, downloadTrack, type TrackMeta } from '../lib/api'
import { downloadFile, isNative } from '../lib/capacitorBridge'
import { StatusBanner, type Status } from './StatusBanner'
import type { HistoryEntry } from '../hooks/useHistory'

interface DownloadCardProps {
  onDownloadComplete: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void
}

type ViewMode = 'idle' | 'single' | 'list'

export function DownloadCard({ onDownloadComplete }: DownloadCardProps) {
  const [url, setUrl] = useState('')
  const [mode, setMode] = useState<ViewMode>('idle')
  const [singleTrack, setSingleTrack] = useState<TrackMeta | null>(null)
  const [trackList, setTrackList] = useState<TrackMeta[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [downloadingAll, setDownloadingAll] = useState(false)
  const [completedCount, setCompletedCount] = useState(0)

  const handleMetadata = async () => {
    if (!url.trim()) return
    setMode('idle')
    setSingleTrack(null)
    setTrackList([])
    setStatus('loading')
    setMessage('Fetching metadata...')
    try {
      const res = await fetchMetadata(url.trim())
      if (Array.isArray(res.data)) {
        setTrackList(res.data)
        setMode('list')
      } else {
        setSingleTrack(res.data)
        setMode('single')
      }
      setStatus('idle')
      setMessage(null)
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Failed to fetch metadata')
    }
  }

  const handleDownload = async (track: TrackMeta) => {
    setStatus('loading')
    setMessage(`Downloading ${track.title}...`)
    try {
      const { blob, filename } = await downloadTrack(track)
      await downloadFile(blob, filename)
      setStatus('success')
      setMessage(`Downloaded ${track.title}!`)
      onDownloadComplete({
        title: track.title,
        artist: track.artist,
        album: track.album,
        artworkUrl: track.artwork_url,
      })
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Download failed')
    }
  }

  const handleDownloadAll = useCallback(async () => {
    setDownloadingAll(true)
    setCompletedCount(0)
    setStatus('loading')
    setMessage(`Downloading 0/${trackList.length} tracks...`)

    let failed = false
    let done = 0

    async function downloadOne(track: TrackMeta) {
      if (failed) return
      try {
        const { blob, filename } = await downloadTrack(track)
        await downloadFile(blob, filename)
        done++
        setCompletedCount(done)
        onDownloadComplete({
          title: track.title,
          artist: track.artist,
          album: track.album,
          artworkUrl: track.artwork_url,
        })
      } catch {
        setStatus('error')
        setMessage(`Failed: ${track.title}`)
        failed = true
        setDownloadingAll(false)
      }
    }

    const CONCURRENCY = 3
    for (let i = 0; i < trackList.length; i += CONCURRENCY) {
      if (failed) break
      const batch = trackList.slice(i, i + CONCURRENCY)
      setMessage(`Downloading ${Math.min(i + CONCURRENCY, trackList.length)}/${trackList.length} tracks...`)
      await Promise.all(batch.map(downloadOne))
    }

    if (!failed) {
      setDownloadingAll(false)
      setStatus('success')
      setMessage(`Downloaded all ${trackList.length} tracks!`)
    }
  }, [trackList, onDownloadComplete])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (mode === 'single' && singleTrack) {
      handleDownload(singleTrack)
    } else {
      handleMetadata()
    }
  }

  return (
    <div className="w-full max-w-xl mx-auto">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={e => {
            setUrl(e.target.value)
            setMode('idle')
            setSingleTrack(null)
            setTrackList([])
          }}
          placeholder="Paste a Spotify track, album, or playlist URL..."
          className="flex-1 px-4 py-3 rounded-lg border border-light-border dark:border-dark-border bg-white dark:bg-dark-bg text-light-text dark:text-dark-text placeholder-light-muted dark:placeholder-dark-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-colors text-sm"
        />
        <button
          type="submit"
          className="px-6 py-3 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!url.trim() || status === 'loading'}
        >
          <Download className="w-4 h-4" />
          {mode === 'single' ? 'Download' : 'Preview'}
        </button>
      </form>

      {mode === 'single' && singleTrack && (
        <div className="mt-4 p-4 rounded-lg border border-light-border dark:border-dark-border bg-white dark:bg-dark-bg flex items-center gap-4">
          {singleTrack.artwork_url && (
            <img
              src={singleTrack.artwork_url}
              alt={singleTrack.album}
              className="w-16 h-16 rounded-md object-cover"
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-light-text dark:text-dark-text truncate">
              {singleTrack.title}
            </p>
            <p className="text-xs text-light-muted dark:text-dark-muted truncate">
              {singleTrack.artist}
            </p>
            <p className="text-xs text-light-muted dark:text-dark-muted truncate">
              {singleTrack.album}
            </p>
          </div>
        </div>
      )}

      {mode === 'list' && trackList.length > 0 && (
        <div className="mt-4 rounded-lg border border-light-border dark:border-dark-border bg-white dark:bg-dark-bg divide-y divide-light-border dark:divide-dark-border">
          <div className="px-4 py-3 flex items-center justify-between text-light-text dark:text-dark-text">
            <div className="flex items-center gap-2">
              <Music className="w-4 h-4 text-accent" />
              <span className="text-sm font-semibold">{trackList.length} tracks found</span>
            </div>
            <button
              onClick={handleDownloadAll}
              disabled={status === 'loading'}
              className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <DownloadCloud className="w-3.5 h-3.5" />
              {downloadingAll ? `${completedCount}/${trackList.length}` : 'Download All'}
            </button>
          </div>
          {trackList.map((track, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
              {track.artwork_url ? (
                <img
                  src={track.artwork_url}
                  alt={track.album}
                  className="w-10 h-10 rounded object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-light-text dark:text-dark-text truncate">
                  {track.title}
                </p>
                <p className="text-xs text-light-muted dark:text-dark-muted truncate">
                  {track.artist}
                </p>
              </div>
              <button
                onClick={() => handleDownload(track)}
                disabled={status === 'loading'}
                className="p-2 rounded-lg bg-accent hover:bg-accent-hover text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                aria-label={`Download ${track.title}`}
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <StatusBanner status={status} message={message} />
      {isNative() && status === 'success' && (
        <p className="mt-2 text-xs text-light-muted dark:text-dark-muted text-center">
          File saved to Documents folder
        </p>
      )}
    </div>
  )
}

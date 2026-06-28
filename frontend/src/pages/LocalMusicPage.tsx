import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Music, RefreshCw, Play, FileQuestion, Loader2, Download, Library } from 'lucide-react'
import { scanDeviceMusic, type LocalTrack } from '../lib/localMusic'
import { usePlayer } from '../hooks/usePlayer'
import { useHistory } from '../hooks/useHistory'
import { useToast } from '../components/Toast'
import { fetchLyricsWithFallback } from '../lib/fetchLyricsWithFallback'
export function LocalMusicPage() {
  const [tracks, setTracks] = useState<LocalTrack[]>([])
  const [scanning, setScanning] = useState(false)
  const [scanned, setScanned] = useState(false)
  const [importing, setImporting] = useState(false)
  const [bulkLyrics, setBulkLyrics] = useState(false)
  const navigate = useNavigate()
  const { play } = usePlayer()
  const { addEntry, updateEntryLyrics } = useHistory()
  const { toast } = useToast()

  const scan = useCallback(async () => {
    setScanning(true)
    try {
      const found = await scanDeviceMusic()
      setTracks(found)
      setScanned(true)
      if (found.length === 0) {
        toast('No music files found in Music folder', 'info')
      } else {
        toast(`Found ${found.length} local tracks`, 'success')
      }
    } catch {
      toast('Failed to scan local music', 'error')
    }
    setScanning(false)
  }, [toast])

  useEffect(() => {
    scan()
  }, [scan])

  const handlePlay = useCallback((track: LocalTrack) => {
    const entry: import('../hooks/useHistory').HistoryEntry = {
      id: `local-${track.path}`,
      title: track.name,
      artist: 'Local file',
      album: '',
      artworkUrl: null,
      filePath: track.path,
      timestamp: Date.now(),
    }
    addEntry(entry)
    navigate('/player')
    play(entry)
  }, [navigate, play, addEntry])

  const handleImportAll = useCallback(async () => {
    if (importing || tracks.length === 0) return
    setImporting(true)
    let count = 0
    for (const track of tracks) {
      const entry: import('../hooks/useHistory').HistoryEntry = {
        id: `local-${track.path}`,
        title: track.name,
        artist: 'Local file',
        album: '',
        artworkUrl: null,
        filePath: track.path,
        timestamp: Date.now(),
      }
      addEntry(entry)
      count++
    }
    setImporting(false)
    toast(`Imported ${count} tracks to your library`, 'success')
  }, [importing, tracks, addEntry, toast])

  const handleDownloadAllLyrics = useCallback(async () => {
    if (bulkLyrics || tracks.length === 0) return
    setBulkLyrics(true)
    let success = 0
    let failed = 0
    for (const track of tracks) {
      try {
        const lyrics = await fetchLyricsWithFallback(track.name, 'Local file')
        if (lyrics.plainLyrics || lyrics.syncedLyrics) {
          updateEntryLyrics(track.name, 'Local file', lyrics.plainLyrics, lyrics.syncedLyrics)
          success++
        } else {
          failed++
        }
      } catch {
        failed++
      }
    }
    setBulkLyrics(false)
    toast(`Lyrics: ${success} downloaded, ${failed} not found`, success > 0 ? 'success' : 'info')
  }, [bulkLyrics, tracks, updateEntryLyrics, toast])

  return (
    <main className="min-h-screen bg-light-bg dark:bg-dark-bg px-4 pt-6 pb-32">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-light-text dark:text-dark-text">Local Music</h1>
            <p className="text-sm text-light-muted dark:text-dark-muted mt-1">
              {scanned ? `${tracks.length} audio files found` : 'Scan your device for music'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {tracks.length > 0 && (
              <>
                <button
                  onClick={handleDownloadAllLyrics}
                  disabled={bulkLyrics}
                  className="w-11 h-11 rounded-xl bg-white dark:bg-dark-surface border border-light-border/40 dark:border-dark-border/30 flex items-center justify-center text-accent hover:bg-accent/5 transition-colors cursor-pointer disabled:opacity-50"
                  aria-label="Download lyrics for all"
                  title="Download lyrics for all"
                >
                  {bulkLyrics ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                </button>
                <button
                  onClick={handleImportAll}
                  disabled={importing}
                  className="w-11 h-11 rounded-xl bg-white dark:bg-dark-surface border border-light-border/40 dark:border-dark-border/30 flex items-center justify-center text-accent hover:bg-accent/5 transition-colors cursor-pointer disabled:opacity-50"
                  aria-label="Import all to library"
                  title="Import all to library"
                >
                  {importing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Library className="w-5 h-5" />}
                </button>
              </>
            )}
            <button
              onClick={scan}
              disabled={scanning}
              className="w-11 h-11 rounded-xl bg-accent flex items-center justify-center text-white hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50"
              aria-label="Rescan"
            >
              {scanning ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {scanning && !scanned && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Loader2 className="w-8 h-8 text-accent animate-spin" />
          <p className="text-sm text-light-muted dark:text-dark-muted">Scanning for audio files...</p>
        </div>
      )}

      {scanned && tracks.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FileQuestion className="w-12 h-12 text-light-muted dark:text-dark-muted mb-3" />
          <p className="text-sm text-light-muted dark:text-dark-muted">No audio files found</p>
          <p className="text-xs text-light-muted dark:text-dark-muted mt-1">
            Add music files to the Music folder on your device
          </p>
        </div>
      )}

      {tracks.length > 0 && (
        <div className="divide-y divide-light-border/30 dark:divide-dark-border/30 bg-white dark:bg-dark-surface rounded-2xl border border-light-border/40 dark:border-dark-border/30 overflow-hidden">
          {tracks.map((track) => (
            <button
              key={track.path}
              onClick={() => handlePlay(track)}
              className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer active:scale-[0.99] transition-transform"
            >
              <div className="w-11 h-11 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                <Music className="w-5 h-5 text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-light-text dark:text-dark-text truncate">
                  {track.name}
                </p>
                <p className="text-xs text-light-muted dark:text-dark-muted truncate">
                  {(track.size / 1024 / 1024).toFixed(1)} MB
                </p>
              </div>
              <Play className="w-4 h-4 text-accent flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
    </main>
  )
}

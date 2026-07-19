import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Music, RefreshCw, Play, FileQuestion, Loader2, Download, Library, Headphones, Clock } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { scanDeviceMusic, type LocalTrack } from '../lib/localMusic'
import { usePlayer } from '../hooks/usePlayer'
import { useHistory } from '../hooks/useHistory'
import { useToast } from '../components/Toast'
import { fetchLyricsWithFallback } from '../lib/fetchLyricsWithFallback'
import { requestPermission, checkPermission } from '../lib/permissions'

type Tab = 'device' | 'downloaded'

export function LocalMusicPage() {
  const [tracks, setTracks] = useState<LocalTrack[]>([])
  const [scanning, setScanning] = useState(false)
  const [scanned, setScanned] = useState(false)
  const [importing, setImporting] = useState(false)
  const [bulkLyrics, setBulkLyrics] = useState(false)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [tab, setTab] = useState<Tab>('downloaded')
  const navigate = useNavigate()
  const { play } = usePlayer()
  const { entries, addEntry, updateEntryLyrics } = useHistory()
  const { toast } = useToast()

  const downloadedTracks = entries.filter(e => e.filePath)

  const scan = useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      const hasPermission = await checkPermission('media_audio')
      if (!hasPermission) {
        const granted = await requestPermission('media_audio')
        if (!granted) {
          setPermissionDenied(true)
          setScanning(false)
          toast('Music Library permission is required to scan local files', 'error')
          return
        }
      }
    }
    setPermissionDenied(false)
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
              {tab === 'downloaded'
                ? `${downloadedTracks.length} track${downloadedTracks.length !== 1 ? 's' : ''} available offline`
                : (scanned ? `${tracks.length} audio files found` : 'Scan your device for music')}
            </p>
          </div>
          {tab === 'device' && (
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
          )}
          {tab === 'downloaded' && downloadedTracks.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate('/download')}
                className="w-11 h-11 rounded-xl bg-accent flex items-center justify-center text-white hover:bg-accent-hover transition-colors cursor-pointer"
                aria-label="Download more"
                title="Download more"
              >
                <Download className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setTab('downloaded')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
            tab === 'downloaded'
              ? 'bg-accent text-white'
              : 'bg-white dark:bg-dark-surface border border-light-border/40 dark:border-dark-border/30 text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <Headphones className="w-4 h-4" />
            Downloaded ({downloadedTracks.length})
          </div>
        </button>
        <button
          onClick={() => setTab('device')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
            tab === 'device'
              ? 'bg-accent text-white'
              : 'bg-white dark:bg-dark-surface border border-light-border/40 dark:border-dark-border/30 text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <Music className="w-4 h-4" />
            Device {scanned ? `(${tracks.length})` : ''}
          </div>
        </button>
      </div>

      {/* Downloaded tab */}
      {tab === 'downloaded' && (
        <>
          {downloadedTracks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Headphones className="w-12 h-12 text-light-muted dark:text-dark-muted mb-3 opacity-40" />
              <p className="text-sm text-light-muted dark:text-dark-muted">No offline tracks</p>
              <p className="text-xs text-light-muted dark:text-dark-muted mt-1">
                Download tracks to make them available here
              </p>
              <button
                onClick={() => navigate('/download')}
                className="mt-4 px-4 py-2 bg-accent text-white text-sm font-medium rounded-xl cursor-pointer"
              >
                Go to Downloads
              </button>
            </div>
          ) : (
            <div className="divide-y divide-light-border/30 dark:divide-dark-border/30 bg-white dark:bg-dark-surface rounded-2xl border border-light-border/40 dark:border-dark-border/30 overflow-hidden">
              {downloadedTracks.map((entry) => (
                <button
                  key={entry.id || entry.filePath}
                  onClick={() => {
                    navigate('/player')
                    play(entry)
                  }}
                  className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer active:scale-[0.99] transition-transform"
                >
                  <div className="w-11 h-11 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {entry.artworkUrl ? (
                      <img src={entry.artworkUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Music className="w-5 h-5 text-accent" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-light-text dark:text-dark-text truncate">
                      {entry.title}
                    </p>
                    <p className="text-xs text-light-muted dark:text-dark-muted truncate">
                      {entry.artist || 'Unknown artist'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-light-muted dark:text-dark-muted mr-3">
                    <Clock className="w-3 h-3" />
                    {new Date(entry.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </div>
                  <Play className="w-4 h-4 text-accent flex-shrink-0" />
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Device tab */}
      {tab === 'device' && (
        <>
          {permissionDenied && (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <Music className="w-12 h-12 text-light-muted dark:text-dark-muted mb-3" />
              <p className="text-sm font-medium text-light-text dark:text-dark-text mb-1">Permission required</p>
              <p className="text-xs text-light-muted dark:text-dark-muted mb-4">
                Music Library access is needed to scan your device for audio files
              </p>
              <button
                onClick={async () => {
                  const granted = await requestPermission('media_audio')
                  if (granted) {
                    setPermissionDenied(false)
                    scan()
                  } else {
                    toast('Permission still denied. Check system settings.', 'error')
                  }
                }}
                className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-xl cursor-pointer"
              >
                Grant Permission
              </button>
            </div>
          )}

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
        </>
      )}
    </main>
  )
}

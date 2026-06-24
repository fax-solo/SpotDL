import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Music, RefreshCw, Play, FileQuestion, Loader2 } from 'lucide-react'
import { scanDeviceMusic, type LocalTrack } from '../lib/localMusic'
import { usePlayer } from '../hooks/usePlayer'
import { useToast } from '../components/Toast'
export function LocalMusicPage() {
  const [tracks, setTracks] = useState<LocalTrack[]>([])
  const [scanning, setScanning] = useState(false)
  const [scanned, setScanned] = useState(false)
  const navigate = useNavigate()
  const { play } = usePlayer()
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
    navigate('/player')
    play(entry)
  }, [navigate, play])

  return (
    <main className="min-h-screen bg-light-bg dark:bg-dark-bg px-4 pt-6 pb-32">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-light-text dark:text-dark-text">Local Music</h1>
          <p className="text-sm text-light-muted dark:text-dark-muted mt-1">
            {scanned ? `${tracks.length} audio files found` : 'Scan your device for music'}
          </p>
        </div>
        <button
          onClick={scan}
          disabled={scanning}
          className="w-11 h-11 rounded-xl bg-accent flex items-center justify-center text-white hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50"
          aria-label="Rescan"
        >
          {scanning ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
        </button>
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

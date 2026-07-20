import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { History } from '../components/History'
import { PullToRefresh } from '../components/PullToRefresh'
import { useHistory } from '../hooks/useHistory'
import { usePlayer } from '../hooks/usePlayer'
import { useToast } from '../components/Toast'
import { useHaptics } from '../hooks/useHaptics'
import { useDownloads } from '../hooks/useDownloads'
import { fileExists } from '../lib/capacitorBridge'
import type { TrackMeta } from '../lib/spotifyApi'

export function HistoryPage() {
  const navigate = useNavigate()
  const { entries, clearHistory, removeEntry, reload } = useHistory()
  const { play } = usePlayer()
  const { toast } = useToast()
  const { notify } = useHaptics()
  const { addDownload } = useDownloads()

  const handleRefresh = useCallback(async () => {
    reload()
  }, [reload])

  const handlePlay = useCallback((entry: import('../hooks/useHistory').HistoryEntry) => {
    if (!entry.filePath) {
      toast('No local file available. Re-download first.', 'error')
      return
    }
    navigate('/player')
    play(entry, entries)
    fileExists(entry.filePath).then(exists => {
      if (!exists) toast('File not found. Re-download it.', 'error')
    })
  }, [play, entries, navigate, toast])

  const handleRedownload = useCallback(async (entry: import('../hooks/useHistory').HistoryEntry) => {
    const track: TrackMeta = {
      title: entry.title,
      artist: entry.artist,
      album: entry.album,
      artwork_url: entry.artworkUrl,
      url: '', // We don't have the original URL, but api will fall back to search
      type: 'track',
    }
    
    addDownload(track)
    toast(`Queued re-download for ${entry.title}`, 'success')
  }, [addDownload, toast, notify])

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="px-4 pt-6 pb-32 animate-pageEnter">
        <div className="mb-6 animate-slideUp">
          <h1 className="text-2xl font-bold text-light-text dark:text-dark-text">History</h1>
          <p className="text-sm text-light-muted dark:text-dark-muted mt-1">Your downloaded tracks</p>
        </div>
        <div className="animate-slideUp" style={{ animationDelay: '50ms', animationFillMode: 'both' }}>
          <History
            entries={entries}
            onClear={clearHistory}
            onRemove={removeEntry}
            onRedownload={handleRedownload}
            onPlay={handlePlay}
          />
        </div>
      </div>
    </PullToRefresh>
  )
}

import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { History } from '../components/History'
import { PullToRefresh } from '../components/PullToRefresh'
import { useHistory } from '../hooks/useHistory'
import { usePlayer } from '../hooks/usePlayer'
import { useToast } from '../components/Toast'
import { useHaptics } from '../hooks/useHaptics'
import { downloadTrack } from '../lib/api'
import { downloadFile } from '../lib/capacitorBridge'
import { useDownloadProgress } from '../components/DownloadOverlay'
import type { TrackMeta } from '../lib/spotifyApi'

export function HistoryPage() {
  const navigate = useNavigate()
  const { entries, addEntry, clearHistory, removeEntry, reload } = useHistory()
  const { play } = usePlayer()
  const { toast } = useToast()
  const { notify } = useHaptics()
  const { trackDownload } = useDownloadProgress()

  const handleRefresh = useCallback(async () => {
    reload()
  }, [reload])

  const handlePlay = useCallback((entry: import('../hooks/useHistory').HistoryEntry) => {
    if (!entry.filePath) {
      toast('No local file available. Re-download first.', 'error')
      return
    }
    play(entry, entries)
    navigate('/player')
  }, [play, entries, navigate, toast])

  const handleRedownload = useCallback(async (entry: import('../hooks/useHistory').HistoryEntry) => {
    const track: TrackMeta = {
      title: entry.title,
      artist: entry.artist,
      album: entry.album,
      artwork_url: entry.artworkUrl,
      url: '',
      type: 'track',
    }
    const prog = trackDownload(entry.title)
    try {
      const { blob, filename } = await downloadTrack(track, (stage, pct) => {
        prog.update(stage, pct)
      })
      const filePath = await downloadFile(blob, filename)
      prog.done()
      addEntry({ title: entry.title, artist: entry.artist, album: entry.album, artworkUrl: entry.artworkUrl, filePath })
      toast(`Re-downloaded ${entry.title}`, 'success')
      notify('SUCCESS')
    } catch (err) {
      prog.fail()
      toast(err instanceof Error ? err.message : 'Re-download failed', 'error')
    }
  }, [addEntry, toast, notify, trackDownload])

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="px-4 pt-6 pb-24">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-light-text dark:text-dark-text">History</h1>
          <p className="text-sm text-light-muted dark:text-dark-muted mt-1">Your downloaded tracks</p>
        </div>
        <History
          entries={entries}
          onClear={clearHistory}
          onRemove={removeEntry}
          onRedownload={handleRedownload}
          onPlay={handlePlay}
        />
      </div>
    </PullToRefresh>
  )
}

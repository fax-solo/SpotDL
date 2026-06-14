import { useSearchParams } from 'react-router-dom'
import { DownloadCard } from '../components/DownloadCard'
import { History } from '../components/History'
import { useHistory } from '../hooks/useHistory'
import { useEffect, useState } from 'react'
import type { CollectionMeta } from '../lib/spotifyApi'

export function Downloader() {
  const { entries, addEntry, clearHistory, removeEntry } = useHistory()
  const [searchParams] = useSearchParams()
  const [presetCollection, setPresetCollection] = useState<CollectionMeta | null>(null)
  const [fetchingPlaylist, setFetchingPlaylist] = useState(false)

  const listId = searchParams.get('list')

  useEffect(() => {
    if (!listId) return
    setFetchingPlaylist(true)
    fetch(`/.netlify/functions/spotify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: `https://open.spotify.com/playlist/${listId}` }),
    })
      .then(r => r.json())
      .then(data => setPresetCollection(data))
      .catch(() => {})
      .finally(() => setFetchingPlaylist(false))
  }, [listId])

  return (
    <main className="px-4 pt-6 pb-24">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-light-text dark:text-dark-text">
          {presetCollection?.collection_name || 'Download Music'}
        </h1>
        <p className="text-sm text-light-muted dark:text-dark-muted mt-1">
          {presetCollection
            ? `${presetCollection.tracks.length} tracks`
            : 'Paste a Spotify or YouTube URL to download as MP3'}
        </p>
      </div>

      {fetchingPlaylist && (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      <div>
        <DownloadCard onDownloadComplete={addEntry} presetCollection={presetCollection} />
        {!presetCollection && (
          <History
            entries={entries}
            onClear={clearHistory}
            onRemove={removeEntry}
          />
        )}
      </div>
    </main>
  )
}

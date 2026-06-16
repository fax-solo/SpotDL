import { useSearchParams } from 'react-router-dom'
import { DownloadCard } from '../components/DownloadCard'
import { History } from '../components/History'
import { PullToRefresh } from '../components/PullToRefresh'
import { useHistory } from '../hooks/useHistory'
import { useEffect, useState, useCallback } from 'react'
import { apiUrl } from '../lib/apiConfig'
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
    fetch(apiUrl('/api/spotify'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: `https://open.spotify.com/playlist/${listId}` }),
    })
      .then(r => r.json())
      .then(data => setPresetCollection(data))
      .catch(() => {})
      .finally(() => setFetchingPlaylist(false))
  }, [listId])

  const handleRefresh = useCallback(async () => {
    if (listId) {
      setFetchingPlaylist(true)
      setPresetCollection(null)
      try {
        const res = await fetch(apiUrl('/api/spotify'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: `https://open.spotify.com/playlist/${listId}` }),
        })
        const data = await res.json()
        setPresetCollection(data)
      } catch {}
      setFetchingPlaylist(false)
    }
  }, [listId])

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <main className="min-h-screen bg-light-bg dark:bg-dark-bg px-4 pt-6 pb-28">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-light-text dark:text-dark-text">
            {presetCollection?.collection_name || 'Downloads'}
          </h1>
          <p className="text-sm text-light-muted dark:text-dark-muted mt-1">
            {presetCollection
              ? `${presetCollection.tracks.length} tracks`
              : 'Paste a Spotify or YouTube URL'}
          </p>
        </div>

        {fetchingPlaylist && (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!fetchingPlaylist && (
          <div className="space-y-5">
            <DownloadCard onDownloadComplete={addEntry} presetCollection={presetCollection} />
            {!presetCollection && (
              <History
                entries={entries}
                onClear={clearHistory}
                onRemove={removeEntry}
                onRedownload={addEntry}
              />
            )}
          </div>
        )}
      </main>
    </PullToRefresh>
  )
}

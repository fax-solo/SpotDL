import { useState, useEffect, useCallback } from 'react'
import { apiUrl } from '../lib/apiConfig'
import { useToast } from '../components/Toast'
import { RefreshCw, Plus, Trash2, CheckCircle2, AlertTriangle, Clock, Loader2, Music, ListMusic } from 'lucide-react'

interface Subscription {
  id: string
  playlist_id: string
  playlist_url: string
  playlist_name: string
  interval: string
  created_at: string
  last_synced_at: string | null
  synced_tracks: string[]
}

interface SyncResult {
  total: number
  new: number
  downloaded: number
  failed: number
  errors: string[]
  playlist_name?: string
  error?: string
}

export function SyncPage() {
  const [subs, setSubs] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)
  const [url, setUrl] = useState('')
  const [interval, setInterval] = useState('daily')
  const [adding, setAdding] = useState(false)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [syncingAll, setSyncingAll] = useState(false)
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)
  const { toast } = useToast()

  const fetchSubs = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/sync/subscriptions'))
      if (res.ok) {
        const data = await res.json()
        setSubs(data.subscriptions || [])
      }
    } catch {
      // server not available
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSubs() }, [fetchSubs])

  const handleAdd = async () => {
    if (!url.trim()) return
    setAdding(true)
    setSyncResult(null)
    try {
      const res = await fetch(apiUrl('/api/sync/subscribe'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), interval }),
      })
      if (res.ok) {
        toast('Playlist subscribed', 'success')
        setUrl('')
        await fetchSubs()
      } else {
        const err = await res.json()
        toast(err.detail || 'Failed to subscribe', 'error')
      }
    } catch {
      toast('Server unavailable for sync', 'error')
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (id: string) => {
    try {
      const res = await fetch(apiUrl(`/api/sync/subscribe/${id}`), { method: 'DELETE' })
      if (res.ok) {
        toast('Subscription removed', 'success')
        setSubs(prev => prev.filter(s => s.id !== id))
      }
    } catch {
      toast('Failed to remove subscription', 'error')
    }
  }

  const handleSync = async (id: string) => {
    setSyncingId(id)
    setSyncResult(null)
    try {
      const res = await fetch(apiUrl(`/api/sync/run/${id}`), { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        const result = data.result
        setSyncResult(result)
        if (result.downloaded > 0) {
          toast(`Downloaded ${result.downloaded} new track(s)`, 'success')
        } else if (result.new === 0) {
          toast('Playlist is up to date', 'success')
        }
        await fetchSubs()
      } else {
        const err = await res.json()
        toast(err.detail || 'Sync failed', 'error')
      }
    } catch {
      toast('Sync request failed', 'error')
    } finally {
      setSyncingId(null)
    }
  }

  const handleSyncAll = async () => {
    setSyncingAll(true)
    setSyncResult(null)
    try {
      const res = await fetch(apiUrl('/api/sync/run-all'), { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        const totalDl = data.results?.reduce((s: number, r: any) => s + (r.downloaded || 0), 0) || 0
        toast(`Synced all — ${totalDl} new track(s)`, 'success')
        await fetchSubs()
      }
    } catch {
      toast('Sync all failed', 'error')
    } finally {
      setSyncingAll(false)
    }
  }

  const intervalLabel = (i: string) => {
    switch (i) {
      case 'manual': return 'Manual'
      case 'hourly': return 'Hourly'
      case 'daily': return 'Daily'
      case 'weekly': return 'Weekly'
      default: return i
    }
  }

  const canSync = !url.trim() || url.includes('spotify.com/playlist/')

  return (
    <div className="px-4 pt-6 pb-24">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-light-text dark:text-dark-text">Playlist Sync</h1>
          {subs.length > 0 && (
            <button
              onClick={handleSyncAll}
              disabled={syncingAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 transition-colors text-xs font-medium cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncingAll ? 'animate-spin' : ''}`} />
              Sync All
            </button>
          )}
        </div>
        <p className="text-sm text-light-muted dark:text-dark-muted mt-1">
          Automatically download new tracks from your favorite playlists
        </p>
      </div>

      {/* Add subscription */}
      <div className="rounded-xl bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50 overflow-hidden mb-6">
        <div className="p-4">
          <h2 className="text-sm font-semibold text-light-text dark:text-dark-text mb-3">Add Playlist</h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="Paste Spotify playlist URL..."
              aria-label="Playlist URL"
              className="flex-1 px-3 py-2.5 rounded-xl bg-light-bg dark:bg-zinc-800 border border-light-border/50 dark:border-dark-border/50 text-sm text-light-text dark:text-dark-text placeholder:text-light-muted dark:placeholder:text-dark-muted focus:outline-none focus:ring-2 focus:ring-accent/30 transition-shadow"
            />
            <button
              onClick={handleAdd}
              disabled={adding || !canSync}
              className="px-4 py-2.5 rounded-xl bg-accent text-white hover:bg-accent-hover text-sm font-medium transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Subscribe
            </button>
          </div>
          <div className="flex gap-2 mt-3">
            {['manual', 'hourly', 'daily', 'weekly'].map(i => (
              <button
                key={i}
                onClick={() => setInterval(i)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer capitalize ${
                  interval === i
                    ? 'bg-accent text-white'
                    : 'bg-light-bg dark:bg-zinc-800 text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text'
                }`}
              >
                {i}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Sync result */}
      {syncResult && (
        <div className="rounded-xl bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50 overflow-hidden mb-6">
          <div className="p-4">
            <div className="flex items-center gap-2 mb-2">
              {syncResult.downloaded > 0 ? (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              ) : syncResult.failed > 0 ? (
                <AlertTriangle className="w-5 h-5 text-amber-500" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              )}
              <h3 className="text-sm font-semibold text-light-text dark:text-dark-text">
                {syncResult.playlist_name || 'Sync Complete'}
              </h3>
            </div>
            <div className="flex gap-4 text-xs text-light-muted dark:text-dark-muted">
              <span>Total: {syncResult.total}</span>
              <span>New: {syncResult.new}</span>
              <span className="text-green-500">Downloaded: {syncResult.downloaded}</span>
              {syncResult.failed > 0 && (
                <span className="text-red-500">Failed: {syncResult.failed}</span>
              )}
            </div>
            {syncResult.errors?.length > 0 && (
              <div className="mt-2 p-2 rounded-lg bg-red-500/10 text-xs text-red-500 max-h-20 overflow-y-auto">
                {syncResult.errors.slice(0, 3).map((e, i) => (
                  <p key={i} className="truncate">{e}</p>
                ))}
                {syncResult.errors.length > 3 && <p>...and {syncResult.errors.length - 3} more</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Subscriptions list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : subs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ListMusic className="w-12 h-12 text-light-muted dark:text-dark-muted mb-3 opacity-40" />
          <p className="text-sm text-light-muted dark:text-dark-muted">No subscriptions yet</p>
          <p className="text-xs text-light-muted dark:text-dark-muted mt-1">Add a Spotify playlist above to start auto-syncing</p>
        </div>
      ) : (
        <div className="space-y-3">
          {subs.map(sub => {
            const trackCount = sub.synced_tracks?.length || 0
            const lastSync = sub.last_synced_at
              ? new Date(sub.last_synced_at).toLocaleDateString(undefined, {
                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                })
              : 'Never'
            return (
              <div
                key={sub.id}
                className="rounded-xl bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50 overflow-hidden"
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-light-text dark:text-dark-text truncate">
                        {sub.playlist_name || sub.playlist_id}
                      </h3>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-light-muted dark:text-dark-muted">
                        <span className="flex items-center gap-1">
                          <Music className="w-3 h-3" />
                          {trackCount} synced
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {intervalLabel(sub.interval)}
                        </span>
                        <span>Last: {lastSync}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => handleSync(sub.id)}
                        disabled={syncingId === sub.id}
                        className="p-2 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition-colors cursor-pointer disabled:opacity-50"
                        title="Sync now"
                        aria-label="Sync now"
                      >
                        {syncingId === sub.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => handleRemove(sub.id)}
                        className="p-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors cursor-pointer"
                        title="Unsubscribe"
                        aria-label="Unsubscribe"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

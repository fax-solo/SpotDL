import { Clock, Trash2, Download, ChevronDown, ChevronUp, Play, ListMusic } from 'lucide-react'
import { useState, useRef, useCallback } from 'react'
import { Capacitor } from '@capacitor/core'
import type { HistoryEntry } from '../hooks/useHistory'
import { ArtworkImage } from './ArtworkImage'
import { AddToPlaylistModal } from './AddToPlaylistModal'
import type { PlaylistTrack } from '../hooks/usePlaylists'

interface HistoryProps {
  entries: HistoryEntry[]
  onClear: () => void
  onRemove: (id: string) => void
  onRedownload: (entry: HistoryEntry) => void
  onPlay?: (entry: HistoryEntry) => void
  minimal?: boolean
}



function formatDate(ts: number): string {
  const now = Date.now()
  const diff = now - ts
  if (diff < 60_000) return 'Just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function SwipeableRow({
  entry,
  index: _index,
  onRemove,
  onRedownload,
  onPlay,
  onAddToPlaylist,
}: {
  entry: HistoryEntry
  index: number
  onRemove: (id: string) => void
  onRedownload: (entry: HistoryEntry) => void
  onPlay?: (entry: HistoryEntry) => void
  onAddToPlaylist?: (entry: HistoryEntry) => void
}) {
  const startX = useRef(0)
  const [offsetX, setOffsetX] = useState(0)
  const [showDelete, setShowDelete] = useState(false)
  const threshold = 80

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    if (!touch) return
    startX.current = touch.clientX
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    if (!touch) return
    const diff = startX.current - touch.clientX
    if (diff > 0) setOffsetX(Math.min(diff, 120))
    else setOffsetX(Math.max(diff, -20))
  }, [])

  const handleTouchEnd = useCallback(() => {
    if (offsetX > threshold) {
      setShowDelete(true)
      setOffsetX(80)
      if (Capacitor.isNativePlatform()) {
        import('@capacitor/haptics').then(({ Haptics, ImpactStyle }) => {
          Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {})
        }).catch(() => {})
      }
    } else {
      setShowDelete(false)
      setOffsetX(0)
    }
  }, [offsetX])

  return (
    <div className="relative overflow-hidden">
      <div
        className={`absolute inset-y-0 right-0 flex items-center justify-end bg-red-500/10 dark:bg-red-500/15 transition-opacity duration-200 w-20 ${showDelete ? 'opacity-100' : 'opacity-0'}`}
      >
        <button
          onClick={() => {
            if (Capacitor.isNativePlatform()) {
              import('@capacitor/haptics').then(({ Haptics, NotificationType }) => {
                Haptics.notification({ type: NotificationType.Warning }).catch(() => {})
              }).catch(() => {})
            }
            onRemove(entry.id)
          }}
          className="px-4 py-2 text-red-500 focus-visible:ring-2 focus-visible:ring-red-400 cursor-pointer"
          aria-label="Delete entry"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>
      <div
        style={{ transform: `translateX(${offsetX}px)`, transition: 'transform 0.2s ease' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-dark-bg relative z-10 transition-colors select-none touch-pan-x"
      >
        <ArtworkImage
          src={entry.artworkUrl}
          alt={entry.album}
          className="w-11 h-11 rounded-lg object-cover flex-shrink-0 shadow-sm"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-light-text dark:text-dark-text truncate flex-1">
              {entry.title}
            </p>
            <span className="text-[11px] text-light-muted dark:text-dark-muted flex-shrink-0 tabular-nums">
              {formatDate(entry.timestamp)}
            </span>
          </div>
          <p className="text-xs text-light-muted dark:text-dark-muted truncate mt-0.5">
            {entry.artist}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {onPlay && (
            <button
              onClick={() => onPlay(entry)}
              className="p-3 rounded-xl text-green-500 hover:bg-green-500/10 focus-visible:ring-2 focus-visible:ring-green-400/40 transition-colors cursor-pointer"
              aria-label={`Play ${entry.title}`}
            >
              <Play className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => onRedownload(entry)}
            className="p-3 rounded-xl text-accent hover:bg-accent/10 focus-visible:ring-2 focus-visible:ring-accent/40 transition-colors cursor-pointer"
            aria-label={`Re-download ${entry.title}`}
          >
            <Download className="w-4 h-4" />
          </button>
          {onAddToPlaylist && (
            <button
              onClick={() => onAddToPlaylist(entry)}
              className="p-3 rounded-xl text-purple-500 hover:bg-purple-500/10 transition-colors cursor-pointer"
              aria-label={`Add ${entry.title} to playlist`}
            >
              <ListMusic className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => {
              if (Capacitor.isNativePlatform()) {
                import('@capacitor/haptics').then(({ Haptics, NotificationType }) => {
                  Haptics.notification({ type: NotificationType.Warning }).catch(() => {})
                }).catch(() => {})
              }
              onRemove(entry.id)
            }}
            className="p-3 rounded-xl text-light-muted dark:text-dark-muted hover:bg-gray-100 dark:hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-red-400 transition-colors cursor-pointer"
            aria-label="Remove entry"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export function History({ entries, onClear, onRemove, onRedownload, onPlay, minimal }: HistoryProps) {
  const [open, setOpen] = useState(minimal ? true : false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [addToPlaylistTrack, setAddToPlaylistTrack] = useState<PlaylistTrack | null>(null)

  if (entries.length === 0) return null

  const recentCount = entries.filter(e => Date.now() - e.timestamp < 86_400_000).length

  if (minimal) {
    return (
      <div className="w-full flex-1 flex flex-col h-full bg-white dark:bg-dark-surface">
        <div className="px-4 py-3 flex items-center justify-between border-b border-light-border/50 dark:border-dark-border/50">
          <span className="text-sm font-medium text-light-text dark:text-dark-text">Downloads Queue</span>
          <span className="text-xs text-light-muted dark:text-dark-muted">{entries.length} songs</span>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-light-border/50 dark:divide-dark-border/50 overscroll-contain">
          {entries.map((entry, i) => (
            <SwipeableRow key={entry.id} entry={entry} index={i} onRemove={onRemove} onRedownload={onRedownload} {...(onPlay ? { onPlay } : {})} onAddToPlaylist={e => setAddToPlaylistTrack({ id: e.id, title: e.title, artist: e.artist, artwork_url: e.artworkUrl })} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-xl mx-auto mt-8">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-4 py-3.5 rounded-xl border border-light-border dark:border-dark-border bg-white dark:bg-dark-surface text-light-text dark:text-dark-text cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800/50 focus-visible:ring-2 focus-visible:ring-accent/40 transition-colors active:scale-[0.98] transition-transform"
      >
        <div className="flex items-center gap-2.5">
          <Clock className="w-4 h-4 text-light-muted dark:text-dark-muted" />
          <span className="text-sm font-medium">History</span>
          <span className="text-xs text-light-muted dark:text-dark-muted bg-gray-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full tabular-nums">
            {entries.length}
          </span>
          {recentCount > 0 && (
            <span className="text-[11px] text-accent bg-accent/10 px-2 py-0.5 rounded-full">
              {recentCount} today
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-light-muted dark:text-dark-muted">
            {open ? 'Hide' : 'Show'}
          </span>
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {open && (
        <div className="mt-2 rounded-xl border border-light-border dark:border-dark-border bg-white dark:bg-dark-surface divide-y divide-light-border/50 dark:divide-dark-border/50 overflow-hidden animate-fadeIn"
        >
            <div className="px-4 py-2.5 flex items-center justify-between border-b border-light-border/50 dark:border-dark-border/50">
              <span className="text-xs text-light-muted dark:text-dark-muted">
                {entries.length} {entries.length === 1 ? 'download' : 'downloads'}
              </span>
              <div className="flex items-center gap-2">
                {confirmClear ? (
                  <>
                    <span className="text-xs text-red-500 font-medium">Clear all?</span>
      <button
        onClick={() => { onClear(); setConfirmClear(false) }}
        className="text-xs font-semibold text-red-500 hover:text-red-600 transition-colors cursor-pointer active:scale-90 transition-transform"
      >
        Confirm
      </button>
      <button
        onClick={() => setConfirmClear(false)}
        className="text-xs text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text transition-colors cursor-pointer active:scale-90 transition-transform"
      >
        Cancel
      </button>
                  </>
                ) : (
                  <button
                    onClick={() => setConfirmClear(true)}
                    className="text-xs font-medium text-red-500 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-red-400 rounded transition-colors cursor-pointer flex items-center gap-1 active:scale-90 transition-transform"
                  >
                    <Trash2 className="w-3 h-3" />
                    Clear All
                  </button>
                )}
              </div>
            </div>
            {entries.map((entry, i) => (
              <SwipeableRow
                key={entry.id}
                entry={entry}
                index={i}
                onRemove={onRemove}
                onRedownload={onRedownload}
                {...(onPlay ? { onPlay } : {})}
                onAddToPlaylist={e => setAddToPlaylistTrack({ id: e.id, title: e.title, artist: e.artist, artwork_url: e.artworkUrl })}
              />
            ))}
      </div>
    )}
    {addToPlaylistTrack && (
      <AddToPlaylistModal track={addToPlaylistTrack} onClose={() => setAddToPlaylistTrack(null)} />
    )}
    </div>
  )
}

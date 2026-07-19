import { useState } from 'react'
import { Plus, ListMusic, X } from 'lucide-react'
import { usePlaylists, type PlaylistTrack } from '../hooks/usePlaylists'
import { useToast } from './Toast'

interface AddToPlaylistModalProps {
  track: PlaylistTrack
  onClose: () => void
}

export function AddToPlaylistModal({ track, onClose }: AddToPlaylistModalProps) {
  const { playlists, createPlaylist, addTrackToPlaylist } = usePlaylists()
  const { toast } = useToast()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  const handleAdd = (playlistId: string, name: string) => {
    addTrackToPlaylist(playlistId, track)
    toast(`Added "${track.title}" to "${name}"`, 'success')
    onClose()
  }

  const handleCreateAndAdd = () => {
    const name = newName.trim()
    if (!name) return
    const p = createPlaylist(name)
    addTrackToPlaylist(p.id, track)
    toast(`Added "${track.title}" to "${name}"`, 'success')
    setNewName('')
    setCreating(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Add to playlist" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full sm:max-w-sm bg-white dark:bg-dark-surface rounded-t-2xl sm:rounded-2xl p-5 pb-8 max-h-[70vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-light-text dark:text-dark-text">Add to Playlist</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer">
            <X className="w-5 h-5 text-light-muted dark:text-dark-muted" />
          </button>
        </div>

        <p className="text-sm text-light-muted dark:text-dark-muted mb-4 truncate">
          "{track.title}" — {track.artist}
        </p>

        {playlists.length === 0 && !creating && (
          <p className="text-sm text-light-muted dark:text-dark-muted text-center py-6">No playlists yet. Create one below.</p>
        )}

        <div className="space-y-1 mb-4">
          {playlists.map(p => (
            <button
              key={p.id}
              onClick={() => {
                const existing = p.tracks.some(t => t.id === track.id || (t.title === track.title && t.artist === track.artist))
                if (existing) {
                  toast(`"${track.title}" is already in "${p.name}"`, 'info')
                  onClose()
                  return
                }
                handleAdd(p.id, p.name)
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left cursor-pointer"
            >
              <ListMusic className="w-5 h-5 text-accent flex-shrink-0" />
              <span className="text-sm font-medium text-light-text dark:text-dark-text truncate">{p.name}</span>
              <span className="text-xs text-light-muted dark:text-dark-muted flex-shrink-0 ml-auto">{p.tracks.length}</span>
            </button>
          ))}
        </div>

        {creating ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreateAndAdd() }}
              placeholder="New playlist name"
              autoFocus
              className="flex-1 px-3 py-2 rounded-lg bg-light-bg dark:bg-dark-bg border border-light-border/50 dark:border-dark-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
            <button
              onClick={handleCreateAndAdd}
              disabled={!newName.trim()}
              className="px-4 py-2 bg-accent text-white text-sm font-semibold rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-40 cursor-pointer"
            >
              Add
            </button>
            <button
              onClick={() => { setCreating(false); setNewName('') }}
              className="px-3 py-2 text-sm text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-dashed border-light-border/50 dark:border-dark-border/50 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
          >
            <Plus className="w-5 h-5 text-accent" />
            <span className="text-sm font-medium text-accent">New Playlist</span>
          </button>
        )}
      </div>
    </div>
  )
}

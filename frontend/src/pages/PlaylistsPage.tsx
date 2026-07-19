import { useState } from 'react'
import { ListMusic, Plus, Trash2, Pencil, ArrowLeft, Music, Play } from 'lucide-react'
import { ArtworkImage } from '../components/ArtworkImage'
import { usePlaylists, type Playlist } from '../hooks/usePlaylists'
import { usePlayer } from '../hooks/usePlayer'
import { findAudio } from '../lib/sources'
import type { HistoryEntry } from '../hooks/useHistory'
import { useToast } from '../components/Toast'
import { uuid } from '../lib/uuid'

export function PlaylistsPage() {
  const { play } = usePlayer()
  const { toast } = useToast()
  const { playlists, createPlaylist, deletePlaylist, renamePlaylist, removeTrackFromPlaylist } = usePlaylists()
  const [selected, setSelected] = useState<Playlist | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const handleCreate = () => {
    const name = newName.trim()
    if (!name) return
    createPlaylist(name)
    setNewName('')
    setCreating(false)
  }

  const handleRename = (id: string) => {
    const name = renameValue.trim()
    if (!name) return
    renamePlaylist(id, name)
    setRenamingId(null)
  }

  const handlePlayTrack = async (track: Playlist['tracks'][number]) => {
    try {
      const query = `${track.artist} ${track.title}`
      const { info } = await findAudio(query, track.title, track.artist)
      const entry: HistoryEntry = {
        id: uuid(),
        title: track.title,
        artist: track.artist,
        album: '',
        artworkUrl: track.artwork_url,
        filePath: null,
        ...(info.audioUrl ? { streamUrl: info.audioUrl } : {}),
        timestamp: Date.now(),
      }
      play(entry)
    } catch {
      toast('Could not find audio source for this track', 'error')
    }
  }

  if (selected) {
    const p = selected
    return (
      <div className="flex-1 flex flex-col min-h-screen bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text pb-32 pt-6 px-4 safe-area-top">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setSelected(null)}
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer flex-shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold truncate">{p.name}</h1>
            <p className="text-xs text-light-muted dark:text-dark-muted">{p.tracks.length} {p.tracks.length === 1 ? 'track' : 'tracks'}</p>
          </div>
        </div>

        {p.tracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Music className="w-12 h-12 text-light-muted dark:text-dark-muted mb-4" />
            <p className="text-light-muted dark:text-dark-muted text-sm">No tracks yet</p>
            <p className="text-light-muted dark:text-dark-muted text-xs mt-1">Add tracks from search results or downloads</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-1">
            {p.tracks.map((track, i) => (
              <div key={track.id + i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/50 dark:hover:bg-zinc-800/50 transition-colors">
                <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-accent/10">
                  {track.artwork_url ? (
                    <ArtworkImage src={track.artwork_url} alt={track.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Music className="w-5 h-5 text-accent/40" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{track.title}</p>
                  <p className="text-xs text-light-muted dark:text-dark-muted truncate">{track.artist}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handlePlayTrack(track)}
                    className="p-2 rounded-lg text-green-500 hover:bg-green-500/10 transition-colors cursor-pointer"
                  >
                    <Play className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => removeTrackFromPlaylist(p.id, track.id)}
                    className="p-2 rounded-lg text-light-muted dark:text-dark-muted hover:bg-red-500/10 hover:text-red-500 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text pb-32 pt-6 px-4 safe-area-top">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">My Playlists</h1>
        <button
          onClick={() => setCreating(true)}
          className="w-10 h-10 rounded-full bg-accent flex items-center justify-center hover:bg-accent-hover transition-colors cursor-pointer"
        >
          <Plus className="w-5 h-5 text-white" />
        </button>
      </div>

      {creating && (
        <div className="mb-4 p-4 rounded-xl bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
            placeholder="Playlist name"
            autoFocus
            className="w-full px-3 py-2 rounded-lg bg-light-bg dark:bg-dark-bg border border-light-border/50 dark:border-dark-border/50 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="flex-1 py-2 bg-accent text-white text-sm font-semibold rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-40 cursor-pointer"
            >
              Create
            </button>
            <button
              onClick={() => { setCreating(false); setNewName('') }}
              className="px-4 py-2 text-sm text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {playlists.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ListMusic className="w-12 h-12 text-light-muted dark:text-dark-muted mb-4" />
          <p className="text-light-muted dark:text-dark-muted text-sm">No playlists yet</p>
          <p className="text-light-muted dark:text-dark-muted text-xs mt-1">Create one to start organizing your music</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2">
          {playlists.map(p => (
            <div key={p.id} className="rounded-xl bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50 overflow-hidden">
              <button
                onClick={() => setSelected(p)}
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left cursor-pointer"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent/20 to-purple-500/20 flex items-center justify-center flex-shrink-0">
                  <ListMusic className="w-6 h-6 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  {renamingId === p.id ? (
                    <input
                      type="text"
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleRename(p.id); if (e.key === 'Escape') setRenamingId(null) }}
                      onBlur={() => handleRename(p.id)}
                      autoFocus
                      className="w-full px-2 py-1 rounded border border-accent/50 bg-light-bg dark:bg-dark-bg text-sm font-medium focus:outline-none"
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <p className="text-sm font-medium truncate">{p.name}</p>
                  )}
                  <p className="text-xs text-light-muted dark:text-dark-muted mt-0.5">
                    {p.tracks.length} {p.tracks.length === 1 ? 'track' : 'tracks'}
                  </p>
                </div>
              </button>
              <div className="flex border-t border-light-border/30 dark:border-dark-border/30">
                <button
                  onClick={() => { setRenamingId(p.id); setRenameValue(p.name) }}
                  className="flex-1 py-2.5 text-xs font-medium text-light-muted dark:text-dark-muted hover:text-accent hover:bg-accent/5 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Rename
                </button>
                <button
                  onClick={() => deletePlaylist(p.id)}
                  className="flex-1 py-2.5 text-xs font-medium text-light-muted dark:text-dark-muted hover:text-red-500 hover:bg-red-500/5 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

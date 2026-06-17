import { useState, useCallback } from 'react'

export interface Playlist {
  id: string
  name: string
  trackIds: string[]
  createdAt: number
  updatedAt: number
}

const STORAGE_KEY = 'playlists'

function load(): Playlist[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function save(playlists: Playlist[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(playlists))
  } catch {}
}

export function usePlaylists() {
  const [playlists, setPlaylists] = useState<Playlist[]>(load)

  const createPlaylist = useCallback((name: string) => {
    const playlist: Playlist = {
      id: crypto.randomUUID(),
      name,
      trackIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    setPlaylists(prev => {
      const next = [...prev, playlist]
      save(next)
      return next
    })
    return playlist
  }, [])

  const deletePlaylist = useCallback((id: string) => {
    setPlaylists(prev => {
      const next = prev.filter(p => p.id !== id)
      save(next)
      return next
    })
  }, [])

  const addTrackToPlaylist = useCallback((playlistId: string, trackId: string) => {
    setPlaylists(prev => {
      const next = prev.map(p => {
        if (p.id !== playlistId) return p
        if (p.trackIds.includes(trackId)) return p
        return { ...p, trackIds: [...p.trackIds, trackId], updatedAt: Date.now() }
      })
      save(next)
      return next
    })
  }, [])

  const removeTrackFromPlaylist = useCallback((playlistId: string, trackId: string) => {
    setPlaylists(prev => {
      const next = prev.map(p => {
        if (p.id !== playlistId) return p
        return { ...p, trackIds: p.trackIds.filter(id => id !== trackId), updatedAt: Date.now() }
      })
      save(next)
      return next
    })
  }, [])

  const renamePlaylist = useCallback((id: string, name: string) => {
    setPlaylists(prev => {
      const next = prev.map(p => p.id === id ? { ...p, name, updatedAt: Date.now() } : p)
      save(next)
      return next
    })
  }, [])

  const reload = useCallback(() => {
    setPlaylists(load())
  }, [])

  return { playlists, createPlaylist, deletePlaylist, addTrackToPlaylist, removeTrackFromPlaylist, renamePlaylist, reload }
}

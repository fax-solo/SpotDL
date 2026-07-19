import { useState, useCallback } from 'react'
import { uuid } from '../lib/uuid'

export interface PlaylistTrack {
  id: string
  title: string
  artist: string
  artwork_url: string | null
}

export interface Playlist {
  id: string
  name: string
  tracks: PlaylistTrack[]
  createdAt: number
  updatedAt: number
}

const STORAGE_KEY = 'playlists'

function load(): Playlist[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map((p: any) => {
      if (p.trackIds && Array.isArray(p.trackIds) && !p.tracks) {
        return { ...p, tracks: p.trackIds.map((id: string) => ({ id, title: id, artist: '', artwork_url: null })) }
      }
      return { tracks: [], ...p }
    })
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
      id: uuid(),
      name,
      tracks: [],
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

  const addTrackToPlaylist = useCallback((playlistId: string, track: PlaylistTrack) => {
    setPlaylists(prev => {
      const next = prev.map(p => {
        if (p.id !== playlistId) return p
        if (p.tracks.some(t => t.id === track.id || (t.title === track.title && t.artist === track.artist))) return p
        return { ...p, tracks: [...p.tracks, track], updatedAt: Date.now() }
      })
      save(next)
      return next
    })
  }, [])

  const removeTrackFromPlaylist = useCallback((playlistId: string, trackId: string) => {
    setPlaylists(prev => {
      const next = prev.map(p => {
        if (p.id !== playlistId) return p
        return { ...p, tracks: p.tracks.filter(t => t.id !== trackId), updatedAt: Date.now() }
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

  const reorderTracks = useCallback((playlistId: string, fromIndex: number, toIndex: number) => {
    setPlaylists(prev => {
      const next = prev.map(p => {
        if (p.id !== playlistId) return p
        const tracks = [...p.tracks]
        const [moved] = tracks.splice(fromIndex, 1)
        if (!moved) return p
        tracks.splice(toIndex, 0, moved)
        return { ...p, tracks, updatedAt: Date.now() }
      })
      save(next)
      return next
    })
  }, [])

  const reload = useCallback(() => {
    setPlaylists(load())
  }, [])

  return { playlists, createPlaylist, deletePlaylist, addTrackToPlaylist, removeTrackFromPlaylist, renamePlaylist, reorderTracks, reload }
}

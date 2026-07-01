import { useState, useCallback, useEffect, useRef } from 'react'
import * as historyDb from '../lib/historyDb'
import { useAuth } from './useAuth'

export interface HistoryEntry {
  id: string
  title: string
  artist: string
  album: string
  artworkUrl: string | null
  filePath: string | null
  streamUrl?: string | null
  plainLyrics?: string | null
  syncedLyrics?: string | null
  timestamp: number
}

const MAX_ENTRIES = 200

function storageKey(userId: string): string {
  return `downloadHistory_${userId}`
}

function loadFromLocal(userId: string): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveToLocal(entries: HistoryEntry[], userId: string) {
  try {
    const trimmed = entries.slice(0, MAX_ENTRIES)
    localStorage.setItem(storageKey(userId), JSON.stringify(trimmed))
  } catch {
    try {
      localStorage.removeItem(storageKey(userId))
      localStorage.setItem(storageKey(userId), JSON.stringify(entries.slice(0, 50)))
    } catch {}
  }
}

export function useHistory() {
  const user = useAuth(s => s.user)
  const userId = user?.id || 'anonymous'
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const loaded = useRef<Record<string, boolean>>({})

  useEffect(() => {
    loaded.current = {}
  }, [userId])

  useEffect(() => {
    if (loaded.current[userId]) return
    loaded.current[userId] = true

    historyDb.loadAll(userId).then(dbEntries => {
      if (dbEntries.length > 0) {
        setEntries(dbEntries)
        saveToLocal(dbEntries, userId)
      } else {
        const local = loadFromLocal(userId)
        if (local.length > 0) {
          setEntries(local)
          local.forEach(e => historyDb.addEntry(e, userId).catch(() => {}))
        }
      }
    }).catch(() => {
      const local = loadFromLocal(userId)
      setEntries(local)
    })
  }, [userId])

  const addEntry = useCallback((entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => {
    const uid = userId
    setEntries(prev => {
      const newEntry: HistoryEntry = {
        ...entry,
        id: crypto.randomUUID(),
        filePath: entry.filePath || null,
        timestamp: Date.now(),
      }
      const next = [newEntry, ...prev].slice(0, MAX_ENTRIES)
      saveToLocal(next, uid)
      historyDb.addEntry(newEntry, uid).catch(() => {})
      return next
    })
  }, [userId])

  const clearHistory = useCallback(() => {
    setEntries([])
    saveToLocal([], userId)
    historyDb.clearAll(userId).catch(() => {})
  }, [userId])

  const removeEntry = useCallback((id: string) => {
    setEntries(prev => {
      const next = prev.filter(e => e.id !== id)
      saveToLocal(next, userId)
      historyDb.removeEntry(id, userId).catch(() => {})
      return next
    })
  }, [userId])

  const reload = useCallback(() => {
    historyDb.loadAll(userId).then(dbEntries => {
      if (dbEntries.length > 0) {
        setEntries(dbEntries)
        saveToLocal(dbEntries, userId)
      } else {
        const local = loadFromLocal(userId)
        setEntries(local)
      }
    }).catch(() => {
      setEntries(loadFromLocal(userId))
    })
  }, [userId])

  const updateEntryLyrics = useCallback((title: string, artist: string, plainLyrics: string | null, syncedLyrics: string | null) => {
    setEntries(prev => {
      const idx = prev.findIndex(e => e.title === title && e.artist === artist)
      if (idx === -1) return prev
      const next = [...prev]
      next[idx] = { ...next[idx], plainLyrics, syncedLyrics }
      saveToLocal(next, userId)
      historyDb.updateEntry(next[idx].id, { plainLyrics, syncedLyrics }, userId).catch(() => {})
      return next
    })
  }, [userId])

  return { entries, addEntry, clearHistory, removeEntry, reload, updateEntryLyrics }
}

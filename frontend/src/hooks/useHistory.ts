import { useState, useCallback, useEffect, useRef } from 'react'
import * as historyDb from '../lib/historyDb'

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
const STORAGE_KEY = 'downloadHistory'

function loadFromLocal(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveToLocal(entries: HistoryEntry[]) {
  try {
    const trimmed = entries.slice(0, MAX_ENTRIES)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    try {
      localStorage.removeItem(STORAGE_KEY)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, 50)))
    } catch {}
  }
}

export function useHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const ready = useRef(false)
  const loaded = useRef(false)

  useEffect(() => {
    if (loaded.current) return
    loaded.current = true

    historyDb.loadAll().then(dbEntries => {
      if (dbEntries.length > 0) {
        setEntries(dbEntries)
        saveToLocal(dbEntries)
      } else {
        const local = loadFromLocal()
        if (local.length > 0) {
          setEntries(local)
          local.forEach(e => historyDb.addEntry(e).catch(() => {}))
        }
      }
      ready.current = true
    }).catch(() => {
      const local = loadFromLocal()
      setEntries(local)
      ready.current = true
    })
  }, [])

  const addEntry = useCallback((entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => {
    setEntries(prev => {
      const newEntry: HistoryEntry = {
        ...entry,
        id: crypto.randomUUID(),
        filePath: entry.filePath || null,
        timestamp: Date.now(),
      }
      const next = [newEntry, ...prev].slice(0, MAX_ENTRIES)
      saveToLocal(next)
      historyDb.addEntry(newEntry).catch(() => {})
      return next
    })
  }, [])

  const clearHistory = useCallback(() => {
    setEntries([])
    saveToLocal([])
    historyDb.clearAll().catch(() => {})
  }, [])

  const removeEntry = useCallback((id: string) => {
    setEntries(prev => {
      const next = prev.filter(e => e.id !== id)
      saveToLocal(next)
      historyDb.removeEntry(id).catch(() => {})
      return next
    })
  }, [])

  const reload = useCallback(() => {
    historyDb.loadAll().then(dbEntries => {
      if (dbEntries.length > 0) {
        setEntries(dbEntries)
        saveToLocal(dbEntries)
      } else {
        const local = loadFromLocal()
        setEntries(local)
      }
    }).catch(() => {
      setEntries(loadFromLocal())
    })
  }, [])

  const updateEntryLyrics = useCallback((title: string, artist: string, plainLyrics: string | null, syncedLyrics: string | null) => {
    setEntries(prev => {
      const idx = prev.findIndex(e => e.title === title && e.artist === artist)
      if (idx === -1) return prev
      const next = [...prev]
      next[idx] = { ...next[idx], plainLyrics, syncedLyrics }
      saveToLocal(next)
      historyDb.updateEntry(next[idx].id, { plainLyrics, syncedLyrics }).catch(() => {})
      return next
    })
  }, [])

  return { entries, addEntry, clearHistory, removeEntry, reload, updateEntryLyrics }
}

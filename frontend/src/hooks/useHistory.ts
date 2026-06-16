import { useState, useCallback } from 'react'

export interface HistoryEntry {
  id: string
  title: string
  artist: string
  album: string
  artworkUrl: string | null
  filePath: string | null
  timestamp: number
}

const MAX_ENTRIES = 200
const STORAGE_KEY = 'downloadHistory'

function load(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function save(entries: HistoryEntry[]) {
  try {
    const trimmed = entries.slice(0, MAX_ENTRIES)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    // localStorage full — clear oldest entries and retry
    try {
      localStorage.removeItem(STORAGE_KEY)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, 50)))
    } catch {}
  }
}

export function useHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>(load)

  const addEntry = useCallback((entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => {
    setEntries(prev => {
      const next = [
        { ...entry, id: crypto.randomUUID(), filePath: entry.filePath || null, timestamp: Date.now() },
        ...prev,
      ]
      save(next)
      return next.length > MAX_ENTRIES ? next.slice(0, MAX_ENTRIES) : next
    })
  }, [])

  const clearHistory = useCallback(() => {
    setEntries([])
    save([])
  }, [])

  const removeEntry = useCallback((id: string) => {
    setEntries(prev => {
      const next = prev.filter(e => e.id !== id)
      save(next)
      return next
    })
  }, [])

  const reload = useCallback(() => {
    setEntries(load())
  }, [])

  return { entries, addEntry, clearHistory, removeEntry, reload }
}

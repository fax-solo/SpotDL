import { useState, useCallback } from 'react'

export interface HistoryEntry {
  id: string
  title: string
  artist: string
  album: string
  artworkUrl: string | null
  timestamp: number
}

function load(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem('downloadHistory')
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function save(entries: HistoryEntry[]) {
  localStorage.setItem('downloadHistory', JSON.stringify(entries))
}

export function useHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>(load)

  const addEntry = useCallback((entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => {
    setEntries(prev => {
      const next = [
        { ...entry, id: crypto.randomUUID(), timestamp: Date.now() },
        ...prev,
      ]
      save(next)
      return next
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

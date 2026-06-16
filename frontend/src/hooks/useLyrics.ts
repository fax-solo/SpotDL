import { useState, useEffect, useRef } from 'react'
import { apiUrl } from '../lib/apiConfig'

interface SyncedLine {
  time: number
  text: string
}

interface LyricsState {
  plainLyrics: string | null
  syncedLines: SyncedLine[]
  synced: boolean
  currentLine: number
  loading: boolean
  error: string | null
}

const cache = new Map<string, { plainLyrics: string | null; syncedLyrics: string | null }>()

function parseLRC(lrc: string): SyncedLine[] {
  const lines = lrc.split('\n')
  const result: SyncedLine[] = []
  const timeRegex = /\[(\d{1,3}):(\d{2})\.(\d{2,3})\]/

  for (const line of lines) {
    const match = timeRegex.exec(line)
    if (!match) continue
    const minutes = parseInt(match[1])
    const seconds = parseInt(match[2])
    const centiseconds = parseInt(match[3])
    const time = minutes * 60 + seconds + (match[3].length === 3 ? centiseconds / 1000 : centiseconds / 100)
    const text = line.replace(timeRegex, '').trim()
    if (text) {
      result.push({ time, text })
    }
  }

  result.sort((a, b) => a.time - b.time)
  return result
}

export function useLyrics(trackName: string, artistName: string, albumName: string, duration: number, currentTime: number) {
  const [state, setState] = useState<LyricsState>({
    plainLyrics: null,
    syncedLines: [],
    synced: false,
    currentLine: -1,
    loading: false,
    error: null,
  })
  const fetchIdRef = useRef(0)

  useEffect(() => {
    if (!trackName || !artistName) {
      setState({ plainLyrics: null, syncedLines: [], synced: false, currentLine: -1, loading: false, error: null })
      return
    }

    const cacheKey = `${artistName}||${trackName}||${albumName}`
    const cached = cache.get(cacheKey)

    if (cached) {
      const syncedLines = cached.syncedLyrics ? parseLRC(cached.syncedLyrics) : []
      setState({
        plainLyrics: cached.plainLyrics,
        syncedLines,
        synced: syncedLines.length > 0,
        currentLine: -1,
        loading: false,
        error: null,
      })
      return
    }

    const id = ++fetchIdRef.current
    let cancelled = false

    setState(prev => ({ ...prev, loading: true, error: null }))

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)

    fetch(apiUrl('/api/lyrics'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackName, artistName, albumName: albumName || undefined, duration: duration || undefined }),
      signal: controller.signal,
    })
      .then(res => res.json())
      .then(data => {
        clearTimeout(timeoutId)
        if (cancelled || id !== fetchIdRef.current) return

        const entry = { plainLyrics: data.plainLyrics || null, syncedLyrics: data.syncedLyrics || null }
        cache.set(cacheKey, entry)

        const syncedLines = entry.syncedLyrics ? parseLRC(entry.syncedLyrics) : []
        setState({
          plainLyrics: entry.plainLyrics,
          syncedLines,
          synced: syncedLines.length > 0,
          currentLine: -1,
          loading: false,
          error: null,
        })
      })
      .catch(err => {
        clearTimeout(timeoutId)
        if (cancelled || id !== fetchIdRef.current) return
        if (err.name === 'AbortError') return
        setState(prev => ({ ...prev, loading: false, error: 'Failed to load lyrics' }))
      })

    return () => { cancelled = true; clearTimeout(timeoutId); controller.abort() }
  }, [trackName, artistName, albumName, duration])

  useEffect(() => {
    if (!state.synced || state.syncedLines.length === 0) return

    let idx = state.syncedLines.length - 1
    for (let i = 0; i < state.syncedLines.length; i++) {
      if (state.syncedLines[i].time > currentTime) {
        idx = i - 1
        break
      }
    }
    if (idx !== state.currentLine) {
      setState(prev => ({ ...prev, currentLine: idx }))
    }
  }, [currentTime, state.synced, state.syncedLines])

  return state
}

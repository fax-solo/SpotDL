import { useState, useEffect, useRef } from 'react'
import { apiUrl } from '../lib/apiConfig'
import { fetchLyricsFallback } from '../lib/lyricsFallback'

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
const CACHE_MAX = 100

function parseLRC(lrc: string): SyncedLine[] {
  const lines = lrc.split('\n')
  const result: SyncedLine[] = []
  const timeRegex = /\[(\d{1,3}):(\d{2})\.(\d{2,3})\]/

  for (const line of lines) {
    const match = timeRegex.exec(line)
    if (!match) continue
    const minutes = parseInt(match[1], 10)
    const seconds = parseInt(match[2], 10)
    const frac = parseInt(match[3], 10)
    const time = minutes * 60 + seconds + frac / (match[3].length === 3 ? 1000 : 100)
    const text = line.replace(timeRegex, '').trim()
    if (text) {
      result.push({ time, text })
    }
  }

  result.sort((a, b) => a.time - b.time)
  return result
}

function findCurrentLine(lines: SyncedLine[], currentTime: number): number {
  if (lines.length === 0) return -1
  if (currentTime < lines[0].time) return -1

  let lo = 0
  let hi = lines.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1
    if (lines[mid].time <= currentTime) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }
  return lo
}

export function useLyrics(
  trackName: string,
  artistName: string,
  albumName: string,
  duration: number,
  currentTime: number,
  storedLyrics?: { plainLyrics: string | null; syncedLyrics: string | null } | null,
) {
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

    // If storedLyrics was passed (from history), use it immediately without fetching
    if (storedLyrics) {
      const syncedLines = storedLyrics.syncedLyrics ? parseLRC(storedLyrics.syncedLyrics) : []
      setState({
        plainLyrics: storedLyrics.plainLyrics,
        syncedLines,
        synced: syncedLines.length > 0,
        currentLine: -1,
        loading: false,
        error: null,
      })
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
      .then(async res => {
        clearTimeout(timeoutId)
        if (cancelled || id !== fetchIdRef.current) return null
        if (!res.ok) return { plainLyrics: null, syncedLyrics: null }
        const data = await res.json()
        return { plainLyrics: data.plainLyrics || null, syncedLyrics: data.syncedLyrics || null }
      })
      .then(async entry => {
        if (cancelled || id !== fetchIdRef.current) return

        // If server returned nothing, try client-side fallback
        if (!entry || (!entry.plainLyrics && !entry.syncedLyrics)) {
          try {
            const fallback = await fetchLyricsFallback(artistName, trackName)
            if (fallback && (fallback.plainLyrics || fallback.syncedLyrics)) {
              entry = fallback
            }
          } catch {}
        }

        if (!entry || (!entry.plainLyrics && !entry.syncedLyrics)) {
          setState(prev => ({ ...prev, loading: false, error: null }))
          return
        }

        cache.set(cacheKey, entry)
        if (cache.size > CACHE_MAX) {
          const first = cache.keys().next().value
          if (first !== undefined) cache.delete(first)
        }

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
        // Try client-side fallback on network error
        fetchLyricsFallback(artistName, trackName).then(fallback => {
          if (cancelled || id !== fetchIdRef.current) return
          if (fallback && (fallback.plainLyrics || fallback.syncedLyrics)) {
            const syncedLines = fallback.syncedLyrics ? parseLRC(fallback.syncedLyrics) : []
            setState({
              plainLyrics: fallback.plainLyrics,
              syncedLines,
              synced: syncedLines.length > 0,
              currentLine: -1,
              loading: false,
              error: null,
            })
          } else {
            setState(prev => ({ ...prev, loading: false, error: null }))
          }
        }).catch(() => {
          setState(prev => ({ ...prev, loading: false, error: null }))
        })
      })

    return () => { cancelled = true; clearTimeout(timeoutId); controller.abort() }
  }, [trackName, artistName, albumName, duration, storedLyrics])

  useEffect(() => {
    if (!state.synced || state.syncedLines.length === 0) return

    const idx = findCurrentLine(state.syncedLines, currentTime)
    if (idx !== state.currentLine) {
      setState(prev => ({ ...prev, currentLine: idx }))
    }
  }, [currentTime, state.synced, state.syncedLines])

  return state
}

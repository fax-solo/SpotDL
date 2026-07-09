import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react'
import { Capacitor } from '@capacitor/core'
import { getAudioSrc } from '../lib/capacitorBridge'
import { findAudio } from '../lib/sources'
import { getCrossfadeDuration } from '../lib/crossfadeSettings'
import type { HistoryEntry } from './useHistory'
import { useBackgroundAudio } from './useBackgroundAudio'
import { sendBackgroundPlaybackNotification, cancelBackgroundPlaybackNotification, ensureNotificationPermission } from '../lib/notifications'
import { startMediaForeground, stopMediaForeground } from '../lib/nativePlugin'

type RepeatMode = 'none' | 'one' | 'all'
export type SleepTimerMode = 'off' | 'countdown' | 'endOfTrack' | 'endOfQueue'

const SHUFFLE_KEY = 'player_shuffle'
const REPEAT_KEY = 'player_repeat'

function loadShuffle(): boolean {
  try { return localStorage.getItem(SHUFFLE_KEY) === 'true' } catch { return false }
}

function loadRepeat(): RepeatMode {
  try {
    const v = localStorage.getItem(REPEAT_KEY)
    if (v === 'one' || v === 'all') return v
  } catch {}
  return 'none'
}

export interface PlayerState {
  currentTrack: HistoryEntry | null
  queue: HistoryEntry[]
  queueIndex: number
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  shuffle: boolean
  repeatMode: RepeatMode
  sleepTimer: { mode: SleepTimerMode; endTime: number; remaining: number }
}

interface PlayerContextValue extends PlayerState {
  play: (track: HistoryEntry, queue?: HistoryEntry[]) => Promise<void>
  pause: () => void
  resume: () => void
  next: () => void
  prev: () => void
  seek: (time: number) => void
  setVolume: (vol: number) => void
  toggleShuffle: () => void
  cycleRepeat: () => void
  addToQueue: (track: HistoryEntry) => void
  removeFromQueue: (index: number) => void
  playNext: (track: HistoryEntry) => void
  setSleepTimer: (mode: SleepTimerMode, minutes?: number) => void
}

const PlayerContext = createContext<PlayerContextValue | null>(null)

export function usePlayer() {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider')
  return ctx
}

function fadeVolume(audio: HTMLAudioElement, from: number, to: number, duration: number): Promise<void> {
  if (duration <= 0 || from === to) return Promise.resolve()
  return new Promise(resolve => {
    const steps = Math.max(1, Math.round(duration * 60))
    const stepDur = (duration * 1000) / steps
    const diff = to - from
    let step = 0
    const tick = () => {
      step++
      const progress = step / steps
      const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2
      if (audio && audio.volume !== undefined) {
        audio.volume = Math.max(0, Math.min(1, from + diff * eased))
      }
      if (step < steps) {
        setTimeout(tick, stepDur)
      } else {
        if (audio && audio.volume !== undefined) audio.volume = to
        resolve()
      }
    }
    setTimeout(tick, stepDur)
  })
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [currentTrack, setCurrentTrack] = useState<HistoryEntry | null>(null)
  const [queue, setQueue] = useState<HistoryEntry[]>([])
  const [queueIndex, setQueueIndex] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolumeState] = useState(() => {
    const saved = localStorage.getItem('player_volume')
    return saved ? parseFloat(saved) : 0.8
  })
  const [shuffle, setShuffle] = useState(loadShuffle)
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(loadRepeat)
  const [shuffleOrder, setShuffleOrder] = useState<number[]>([])
  const [sleepTimer, setSleepTimerState] = useState<{ mode: SleepTimerMode; endTime: number; remaining: number }>(() => {
    try {
      const saved = localStorage.getItem('sleep_timer')
      if (saved) return JSON.parse(saved)
    } catch {}
    return { mode: 'off' as SleepTimerMode, endTime: 0, remaining: 0 }
  })

  const queueRef = useRef<HistoryEntry[]>([])
  const queueIndexRef = useRef(-1)
  const currentTrackRef = useRef<HistoryEntry | null>(null)
  const shuffleRef = useRef(shuffle)
  const repeatRef = useRef(repeatMode)
  const shuffleOrderRef = useRef<number[]>([])
  const sleepTimerRef = useRef(sleepTimer)

  useEffect(() => { queueRef.current = queue }, [queue])
  useEffect(() => { queueIndexRef.current = queueIndex }, [queueIndex])
  useEffect(() => { currentTrackRef.current = currentTrack }, [currentTrack])
  useEffect(() => { shuffleRef.current = shuffle }, [shuffle])
  useEffect(() => { repeatRef.current = repeatMode }, [repeatMode])
  useEffect(() => { shuffleOrderRef.current = shuffleOrder }, [shuffleOrder])
  useEffect(() => { sleepTimerRef.current = sleepTimer }, [sleepTimer])

  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'auto'
    audioRef.current = audio

    const onLoadedMetadata = () => {
      setDuration(audio.duration || 0)
    }

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
    }

    const resetSleepTimer = () => {
      setSleepTimerState({ mode: 'off', endTime: 0, remaining: 0 })
      localStorage.setItem('sleep_timer', JSON.stringify({ mode: 'off', endTime: 0, remaining: 0 }))
    }

    const onEnded = () => {
      const st = sleepTimerRef.current
      const rpt = repeatRef.current
      const shf = shuffleRef.current
      const q = queueRef.current
      const idx = queueIndexRef.current
      const sOrder = shuffleOrderRef.current

      // endOfTrack: pause after this track ends
      if (st.mode === 'endOfTrack') {
        resetSleepTimer()
        setIsPlaying(false)
        setCurrentTime(0)
        stopMediaForeground()
        return
      }

      if (rpt === 'one') {
        playTrack(q[idx], q, idx)
        return
      }

      let nextIdx: number
      if (shf && sOrder.length > 1) {
        const currentPos = sOrder.indexOf(idx)
        const nextPos = currentPos + 1
        if (nextPos < sOrder.length) {
          nextIdx = sOrder[nextPos]
        } else if (rpt === 'all') {
          if (st.mode === 'endOfQueue') {
            resetSleepTimer()
            setIsPlaying(false)
            setCurrentTime(0)
            stopMediaForeground()
            return
          }
          nextIdx = sOrder[0]
        } else {
          if (st.mode === 'endOfQueue') resetSleepTimer()
          setIsPlaying(false)
          setCurrentTime(0)
          stopMediaForeground()
          return
        }
      } else {
        nextIdx = idx + 1
        if (nextIdx >= q.length) {
          if (rpt === 'all') {
            if (st.mode === 'endOfQueue') {
              resetSleepTimer()
              setIsPlaying(false)
              setCurrentTime(0)
              stopMediaForeground()
              return
            }
            nextIdx = 0
          } else {
            if (st.mode === 'endOfQueue') resetSleepTimer()
            setIsPlaying(false)
            setCurrentTime(0)
            stopMediaForeground()
            return
          }
        }
      }

      playTrack(q[nextIdx], q, nextIdx)
    }

    const onError = () => {
      const q = queueRef.current
      const idx = queueIndexRef.current
      if (idx < 0 || idx >= q.length) return
      const nextIdx = idx + 1
      if (nextIdx < q.length) {
        playTrack(q[nextIdx], q, nextIdx)
      } else {
        setIsPlaying(false)
        stopMediaForeground()
      }
    }

    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onError)

    return () => {
      audio.pause()
      audio.src = ''
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
      audioRef.current = null
    }
  }, [])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume
    }
    localStorage.setItem('player_volume', String(volume))
  }, [volume])

  useEffect(() => {
    localStorage.setItem(SHUFFLE_KEY, String(shuffle))
  }, [shuffle])

  useEffect(() => {
    localStorage.setItem(REPEAT_KEY, repeatMode)
  }, [repeatMode])

  const playTrack = useCallback(async (track: HistoryEntry, q: HistoryEntry[], idx: number) => {
    const prev = currentTrackRef.current
    const audio = audioRef.current
    if (!audio) return

    currentTrackRef.current = track
    queueRef.current = q
    queueIndexRef.current = idx
    setCurrentTrack(track)
    setQueue(q)
    setQueueIndex(idx)

    const sameTrack = prev && track.id === prev.id
    if (sameTrack && audio.src) {
      if (audio.paused) {
        try {
          await audio.play()
          setIsPlaying(true)
        } catch {
          setIsPlaying(false)
        }
      }
      return
    }

    const crossfadeMs = getCrossfadeDuration()

    if (crossfadeMs > 0 && prev && audio.src && !audio.paused) {
      await fadeVolume(audio, audio.volume, 0, crossfadeMs / 2)
    }

    audio.pause()
    audio.src = ''

    if (track.filePath) {
      const src = getAudioSrc(track.filePath)
      if (src) {
        audio.src = src
      }
    } else if (track.streamUrl) {
      audio.src = track.streamUrl
    }

    if (!audio.src && track.title) {
      try {
        const query = `${track.artist || ''} ${track.title}`.trim()
        if (query) {
          const { info } = await findAudio(query, track.title, track.artist)
          if (info?.audioUrl) {
            audio.src = info.audioUrl
            track.streamUrl = info.audioUrl
          }
        }
      } catch (err) {
        console.warn('[player] Failed to resolve audio source:', err)
      }
    }

    if (!audio.src) {
      setIsPlaying(false)
      return
    }

    try {
      if (crossfadeMs > 0) {
        audio.volume = 0
      }
      await audio.play()
      setIsPlaying(true)
      if (crossfadeMs > 0) {
        await fadeVolume(audio, 0, volume, crossfadeMs / 2)
      }
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.title,
          artist: track.artist,
          album: track.album,
          artwork: track.artworkUrl ? [{ src: track.artworkUrl, sizes: '512x512', type: 'image/jpeg' }] : []
        })
      }
      const { Capacitor } = await import('@capacitor/core')
      if (!Capacitor.isNativePlatform()) {
        sendBackgroundPlaybackNotification({ title: track.title, artist: track.artist, artworkUrl: track.artworkUrl })
      }
      await ensureNotificationPermission()
      startMediaForeground(track.title, track.artist, track.artworkUrl ?? undefined)
    } catch {
      audio.volume = volume
      setIsPlaying(false)
    }
  }, [])

  const buildShuffleOrder = useCallback((q: HistoryEntry[], currentIdx: number): number[] => {
    const indices = q.map((_, i) => i).filter(i => i !== currentIdx)
    const shuffled = shuffleArray(indices)
    return [currentIdx, ...shuffled]
  }, [])

  const play = useCallback((track: HistoryEntry, q?: HistoryEntry[]) => {
    const qFinal = q || [track]
    const idx = qFinal.findIndex(t => t.id === track.id)
    const queueIdx = idx >= 0 ? idx : 0

    if (shuffleRef.current && qFinal.length > 1) {
      const order = buildShuffleOrder(qFinal, queueIdx)
      setShuffleOrder(order)
    } else {
      setShuffleOrder([])
    }

    return playTrack(qFinal[queueIdx], qFinal, queueIdx)
  }, [playTrack, buildShuffleOrder])

  const pause = useCallback(() => {
    audioRef.current?.pause()
    setIsPlaying(false)
    cancelBackgroundPlaybackNotification()
    stopMediaForeground()
  }, [])

  const resume = useCallback(() => {
    audioRef.current?.play().then(() => setIsPlaying(true)).catch(() => {})
  }, [])

  const next = useCallback(() => {
    const shf = shuffleRef.current
    const q = queueRef.current
    const idx = queueIndexRef.current
    const sOrder = shuffleOrderRef.current

    let nextIdx: number
    if (shf && sOrder.length > 1) {
      const currentPos = sOrder.indexOf(idx)
      if (currentPos < sOrder.length - 1) {
        nextIdx = sOrder[currentPos + 1]
      } else {
        return // end of shuffle order
      }
    } else {
      nextIdx = idx + 1
      if (nextIdx >= q.length) return
    }

    playTrack(q[nextIdx], q, nextIdx)
  }, [playTrack])

  const prev = useCallback(() => {
    const audio = audioRef.current
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0
      return
    }

    const shf = shuffleRef.current
    const q = queueRef.current
    const idx = queueIndexRef.current
    const sOrder = shuffleOrderRef.current

    let prevIdx: number
    if (shf && sOrder.length > 1) {
      const currentPos = sOrder.indexOf(idx)
      if (currentPos > 0) {
        prevIdx = sOrder[currentPos - 1]
      } else {
        return
      }
    } else {
      prevIdx = idx - 1
      if (prevIdx < 0) return
    }

    playTrack(q[prevIdx], q, prevIdx)
  }, [playTrack])

  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time
      setCurrentTime(time)
    }
  }, [])

  const setVolumeFn = useCallback((vol: number) => {
    setVolumeState(Math.max(0, Math.min(1, vol)))
  }, [])

  const toggleShuffle = useCallback(() => {
    setShuffle(prev => {
      const next = !prev
      if (next && queueRef.current.length > 1) {
        const order = buildShuffleOrder(queueRef.current, queueIndexRef.current)
        setShuffleOrder(order)
      } else {
        setShuffleOrder([])
      }
      return next
    })
  }, [buildShuffleOrder])

  const cycleRepeat = useCallback(() => {
    setRepeatMode(prev => {
      if (prev === 'none') return 'all'
      if (prev === 'all') return 'one'
      return 'none'
    })
  }, [])

  const addToQueue = useCallback((track: HistoryEntry) => {
    setQueue(prev => {
      const exists = prev.some(t => t.id === track.id)
      if (exists) return prev
      const next = [...prev, track]
      if (shuffleRef.current) {
        const order = buildShuffleOrder(next, queueIndexRef.current)
        setShuffleOrder(order)
      }
      return next
    })
  }, [buildShuffleOrder])

  const removeFromQueue = useCallback((index: number) => {
    setQueue(prev => {
      if (index === queueIndexRef.current) return prev
      const next = prev.filter((_, i) => i !== index)
      const adjustedIdx = index < queueIndexRef.current ? queueIndexRef.current - 1 : queueIndexRef.current
      if (shuffleRef.current) {
        const order = buildShuffleOrder(next, adjustedIdx)
        setShuffleOrder(order)
      }
      queueIndexRef.current = adjustedIdx
      setQueueIndex(adjustedIdx)
      return next
    })
  }, [buildShuffleOrder])

  const playNext = useCallback((track: HistoryEntry) => {
    setQueue(prev => {
      const next = [...prev]
      const insertAt = queueIndexRef.current + 1
      next.splice(insertAt, 0, track)
      if (shuffleRef.current) {
        const order = buildShuffleOrder(next, queueIndexRef.current)
        setShuffleOrder(order)
      }
      return next
    })
  }, [buildShuffleOrder])

  const setSleepTimer = useCallback((mode: SleepTimerMode, minutes?: number) => {
    if (mode === 'off') {
      setSleepTimerState({ mode: 'off', endTime: 0, remaining: 0 })
      localStorage.setItem('sleep_timer', JSON.stringify({ mode: 'off', endTime: 0, remaining: 0 }))
    } else if (mode === 'countdown' && minutes && minutes > 0) {
      const endTime = Date.now() + minutes * 60 * 1000
      setSleepTimerState({ mode, endTime, remaining: minutes * 60 })
      localStorage.setItem('sleep_timer', JSON.stringify({ mode, endTime, remaining: minutes * 60 }))
    } else if (mode === 'endOfTrack' || mode === 'endOfQueue') {
      setSleepTimerState({ mode, endTime: 0, remaining: 0 })
      localStorage.setItem('sleep_timer', JSON.stringify({ mode, endTime: 0, remaining: 0 }))
    }
  }, [])

  // Sleep timer countdown
  useEffect(() => {
    if (sleepTimer.mode !== 'countdown') return
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((sleepTimerRef.current.endTime - Date.now()) / 1000))
      if (remaining <= 0) {
        clearInterval(interval)
        setSleepTimerState({ mode: 'off', endTime: 0, remaining: 0 })
        localStorage.setItem('sleep_timer', JSON.stringify({ mode: 'off', endTime: 0, remaining: 0 }))
        pause()
      } else {
        setSleepTimerState(prev => ({ ...prev, remaining }))
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [sleepTimer.mode, pause])

  useBackgroundAudio(currentTrack, isPlaying)

  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', resume)
      navigator.mediaSession.setActionHandler('pause', pause)
      navigator.mediaSession.setActionHandler('previoustrack', prev)
      navigator.mediaSession.setActionHandler('nexttrack', next)
    }
  }, [resume, pause, prev, next])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let cleanups: (() => void)[] = []
    const register = async () => {
      try {
        const mod = await import('@capacitor/core')
        const SpotDL = mod.registerPlugin<{ addListener: (event: string, cb: () => void) => Promise<{ remove: () => void }> }>('SpotDL')
        const h1 = (await SpotDL.addListener('mediaPlay', () => { resume() })).remove
        const h2 = (await SpotDL.addListener('mediaPause', () => { pause() })).remove
        const h3 = (await SpotDL.addListener('mediaNext', () => { next() })).remove
        const h4 = (await SpotDL.addListener('mediaPrevious', () => { prev() })).remove
        cleanups = [h1, h2, h3, h4]
      } catch {}
    }
    register()
    return () => { cleanups.forEach(h => h()) }
  }, [resume, pause, next, prev])

  return (
    <PlayerContext.Provider value={{
      currentTrack, queue, queueIndex, isPlaying, currentTime, duration, volume,
      shuffle, repeatMode, sleepTimer,
      play, pause, resume, next, prev, seek, setVolume: setVolumeFn,
      toggleShuffle, cycleRepeat, addToQueue, removeFromQueue, playNext, setSleepTimer,
    }}>
      {children}
    </PlayerContext.Provider>
  )
}

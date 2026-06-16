import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react'
import { readAudioFile } from '../lib/capacitorBridge'
import type { HistoryEntry } from './useHistory'

export interface PlayerState {
  currentTrack: HistoryEntry | null
  queue: HistoryEntry[]
  queueIndex: number
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
}

interface PlayerContextValue extends PlayerState {
  play: (track: HistoryEntry, queue?: HistoryEntry[]) => void
  pause: () => void
  resume: () => void
  next: () => void
  prev: () => void
  seek: (time: number) => void
  setVolume: (vol: number) => void
}

const PlayerContext = createContext<PlayerContextValue | null>(null)

export function usePlayer() {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider')
  return ctx
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

  const timeRef = useRef<ReturnType<typeof setInterval>>(null)

  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'auto'
    audioRef.current = audio

    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio.duration || 0)
    })

    audio.addEventListener('ended', () => {
      const idx = queueIndex + 1
      if (idx < queue.length) {
        playTrack(queue[idx], queue, idx)
      } else {
        setIsPlaying(false)
        setCurrentTime(0)
      }
    })

    return () => {
      audio.pause()
      audio.src = ''
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
    if (isPlaying) {
      timeRef.current = setInterval(() => {
        if (audioRef.current) {
          setCurrentTime(audioRef.current.currentTime)
        }
      }, 250)
    } else {
      if (timeRef.current) clearInterval(timeRef.current)
    }
    return () => { if (timeRef.current) clearInterval(timeRef.current) }
  }, [isPlaying])

  const playTrack = useCallback(async (track: HistoryEntry, q: HistoryEntry[], idx: number) => {
    setCurrentTrack(track)
    setQueue(q)
    setQueueIndex(idx)

    const audio = audioRef.current
    if (!audio) return

    audio.pause()
    audio.src = ''

    if (track.filePath) {
      const dataUri = await readAudioFile(track.filePath)
      if (dataUri) {
        audio.src = dataUri
      }
    }

    if (!audio.src) audio.src = ''
    if (audio.src) {
      try {
        await audio.play()
        setIsPlaying(true)
      } catch {
        setIsPlaying(false)
      }
    } else {
      setIsPlaying(false)
    }
  }, [])

  const play = useCallback((track: HistoryEntry, q?: HistoryEntry[]) => {
    const qFinal = q || [track]
    const idx = qFinal.findIndex(t => t.id === track.id)
    playTrack(track, qFinal, idx >= 0 ? idx : 0)
  }, [playTrack])

  const pause = useCallback(() => {
    audioRef.current?.pause()
    setIsPlaying(false)
  }, [])

  const resume = useCallback(() => {
    audioRef.current?.play().then(() => setIsPlaying(true)).catch(() => {})
  }, [])

  const next = useCallback(() => {
    const idx = queueIndex + 1
    if (idx < queue.length) {
      playTrack(queue[idx], queue, idx)
    }
  }, [queue, queueIndex, playTrack])

  const prev = useCallback(() => {
    const audio = audioRef.current
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0
      return
    }
    const idx = queueIndex - 1
    if (idx >= 0) {
      playTrack(queue[idx], queue, idx)
    }
  }, [queue, queueIndex, playTrack])

  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time
      setCurrentTime(time)
    }
  }, [])

  const setVolumeFn = useCallback((vol: number) => {
    setVolumeState(Math.max(0, Math.min(1, vol)))
  }, [])

  return (
    <PlayerContext.Provider value={{
      currentTrack, queue, queueIndex, isPlaying, currentTime, duration, volume,
      play, pause, resume, next, prev, seek, setVolume: setVolumeFn,
    }}>
      {children}
    </PlayerContext.Provider>
  )
}

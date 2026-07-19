import { useEffect, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import type { HistoryEntry } from './useHistory'
import { stopMediaForeground } from '../lib/nativePlugin'

export function useBackgroundAudio(currentTrack: HistoryEntry | null, isPlaying: boolean) {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const trackRef = useRef(currentTrack)
  const playingRef = useRef(isPlaying)

  useEffect(() => { trackRef.current = currentTrack }, [currentTrack])
  useEffect(() => { playingRef.current = isPlaying }, [isPlaying])

  const acquireWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        if (wakeLockRef.current) {
          if (wakeLockRef.current.released) {
            wakeLockRef.current = null
          } else {
            return
          }
        }
        wakeLockRef.current = await navigator.wakeLock.request('screen')
      }
    } catch {
      // WakeLock not supported or denied
    }
  }

  const releaseWakeLock = async () => {
    if (wakeLockRef.current) {
      try {
        if (!wakeLockRef.current.released) {
          await wakeLockRef.current.release()
        }
      } catch {}
      wakeLockRef.current = null
    }
  }

  useEffect(() => {
    if (isPlaying) {
      acquireWakeLock()
    } else {
      releaseWakeLock()
    }

    return () => {
      releaseWakeLock()
    }
  }, [isPlaying])

  useEffect(() => {
    if (!isPlaying) return

    const reacquireWakeLock = () => {
      acquireWakeLock()
    }

    document.addEventListener('visibilitychange', reacquireWakeLock)
    window.addEventListener('focus', reacquireWakeLock)

    return () => {
      document.removeEventListener('visibilitychange', reacquireWakeLock)
      window.removeEventListener('focus', reacquireWakeLock)
    }
  }, [isPlaying])

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !currentTrack || !isPlaying) return

    const handleBeforeUnload = () => {
      stopMediaForeground()
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [currentTrack, isPlaying])
}

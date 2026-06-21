import { useEffect, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import type { HistoryEntry } from './useHistory'
import { cancelBackgroundPlaybackNotification } from '../lib/notifications'

export function useBackgroundAudio(currentTrack: HistoryEntry | null, isPlaying: boolean) {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const trackRef = useRef(currentTrack)
  const playingRef = useRef(isPlaying)

  useEffect(() => { trackRef.current = currentTrack }, [currentTrack])
  useEffect(() => { playingRef.current = isPlaying }, [isPlaying])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    const acquireWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          if (wakeLockRef.current) wakeLockRef.current.release().catch(() => {})
          wakeLockRef.current = await navigator.wakeLock.request('screen')
        }
      } catch {
        // WakeLock not supported or denied
      }
    }

    const releaseWakeLock = async () => {
      if (wakeLockRef.current) {
        try {
          await wakeLockRef.current.release()
        } catch {}
        wakeLockRef.current = null
      }
    }

    if (isPlaying) {
      acquireWakeLock()
    } else {
      cancelBackgroundPlaybackNotification()
      releaseWakeLock()
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (playingRef.current) {
          acquireWakeLock()
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      releaseWakeLock()
      cancelBackgroundPlaybackNotification()
    }
  }, [isPlaying])

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !currentTrack || !isPlaying) return

    const handleBeforeUnload = () => {
      cancelBackgroundPlaybackNotification()
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [currentTrack, isPlaying])
}

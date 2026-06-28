import { useEffect } from 'react'
import { usePlayer } from './usePlayer'

const INPUT_SELECTOR = 'input:not([type="range"]), textarea, [contenteditable]'

function isInputFocused(): boolean {
  return document.activeElement ? document.activeElement.matches(INPUT_SELECTOR) : false
}

export function useKeyboardShortcuts() {
  const {
    isPlaying, currentTrack, currentTime, duration, volume,
    pause, resume, seek, next, prev, setVolume,
    toggleShuffle, cycleRepeat,
  } = usePlayer()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isInputFocused()) return
      if (e.repeat && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) return

      switch (e.key) {
        case ' ':
          e.preventDefault()
          if (currentTrack) {
            isPlaying ? pause() : resume()
          }
          break
        case 'ArrowLeft':
          e.preventDefault()
          if (e.shiftKey) {
            prev()
          } else if (currentTrack) {
            seek(Math.max(0, currentTime - 5))
          }
          break
        case 'ArrowRight':
          e.preventDefault()
          if (e.shiftKey) {
            next()
          } else if (currentTrack) {
            seek(Math.min(duration, currentTime + 5))
          }
          break
        case 'ArrowUp':
          e.preventDefault()
          setVolume(Math.min(1, volume + 0.05))
          break
        case 'ArrowDown':
          e.preventDefault()
          setVolume(Math.max(0, volume - 0.05))
          break
        case 'm':
        case 'M':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault()
            setVolume(volume > 0 ? 0 : 0.8)
          }
          break
        case 's':
        case 'S':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault()
            toggleShuffle()
          }
          break
        case 'r':
        case 'R':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault()
            cycleRepeat()
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isPlaying, currentTrack, currentTime, duration, volume, pause, resume, seek, next, prev, setVolume, toggleShuffle, cycleRepeat])
}

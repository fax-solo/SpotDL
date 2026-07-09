import { useCallback, useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'

interface SafeAreaInsets {
  top: number
  right: number
  bottom: number
  left: number
}

function setCSSCustomProperties(top: number, bottom: number) {
  const root = document.documentElement
  root.style.setProperty('--sat', `${top}px`)
  root.style.setProperty('--sab', `${bottom}px`)
  root.style.setProperty('--sal', '0px')
  root.style.setProperty('--sar', '0px')
}

function getInsets(): SafeAreaInsets {
  const style = getComputedStyle(document.documentElement)
  const parse = (val: string) => parseInt(val.replace('px', ''), 10) || 0
  return {
    top: parse(style.getPropertyValue('--sat')),
    right: parse(style.getPropertyValue('--sar')),
    bottom: parse(style.getPropertyValue('--sab')),
    left: parse(style.getPropertyValue('--sal')),
  }
}

export function useEdgeToEdge() {
  const [insets, setInsets] = useState<SafeAreaInsets>({ top: 0, right: 0, bottom: 0, left: 0 })
  const [statusBarHeight, setStatusBarHeight] = useState(0)
  const statusBarHeightRef = useRef(0)

  const updateInsets = useCallback(() => {
    const sbHeight = statusBarHeightRef.current
    if (sbHeight === 0) {
      setInsets(getInsets())
      return
    }
    // Compute bottom inset from visualViewport vs window height difference
    // (accounts for gesture navigation bar or 3-button nav bar)
    let bottomInset = 0
    if (window.visualViewport) {
      const diff = window.innerHeight - window.visualViewport.height
      // When keyboard is open diff includes keyboard, so only use when diff is small
      if (diff > 0 && diff < 200) {
        bottomInset = diff - sbHeight
      }
    }
    // Fallback: gesture nav bar ~24px, 3-button nav ~48px
    if (bottomInset <= 0) bottomInset = 24
    setCSSCustomProperties(sbHeight, bottomInset)
    setInsets({ top: sbHeight, right: 0, bottom: bottomInset, left: 0 })
  }, [])

  useEffect(() => {
    updateInsets()
    window.addEventListener('resize', updateInsets)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateInsets)
    }
    return () => {
      window.removeEventListener('resize', updateInsets)
      window.visualViewport?.removeEventListener('resize', updateInsets)
    }
  }, [updateInsets])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let cancelled = false
    const run = async () => {
      try {
        const { StatusBar } = await import('@capacitor/status-bar')
        const info = await StatusBar.getInfo()
        if (!cancelled) {
          const h = info.height ?? 0
          setStatusBarHeight(h)
          statusBarHeightRef.current = h
          updateInsets()
        }
      } catch {
        // StatusBar plugin not available
      }
    }
    run()
    return () => { cancelled = true }
  }, [updateInsets])

  return { insets, statusBarHeight }
}

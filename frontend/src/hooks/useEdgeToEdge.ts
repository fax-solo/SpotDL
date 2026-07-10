import { useCallback, useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { getNavigationBarHeight, getStatusBarHeight, getDisplayCutoutInsets } from '../lib/nativePlugin'

interface SafeAreaInsets {
  top: number
  right: number
  bottom: number
  left: number
}

function setCSSCustomProperties(top: number, bottom: number, left: number, right: number) {
  const root = document.documentElement
  root.style.setProperty('--sat', `${top}px`)
  root.style.setProperty('--sab', `${bottom}px`)
  root.style.setProperty('--sal', `${left}px`)
  root.style.setProperty('--sar', `${right}px`)
}

export function useEdgeToEdge() {
  const [insets, setInsets] = useState<SafeAreaInsets>({ top: 0, right: 0, bottom: 0, left: 0 })
  const [statusBarHeight, setStatusBarHeight] = useState(0)
  const statusBarHeightRef = useRef(0)

  const updateInsets = useCallback(() => {
    const sbHeight = statusBarHeightRef.current
    let bottomInset = 0
    let leftInset = 0
    let rightInset = 0

    if (window.visualViewport) {
      const diff = window.innerHeight - window.visualViewport.height
      if (diff > 0 && diff < 200) {
        bottomInset = diff - sbHeight
      }
    }

    if (Capacitor.isNativePlatform()) {
      if (bottomInset <= 0) bottomInset = 24
    }

    if (Capacitor.isNativePlatform()) {
      const innerW = window.innerWidth
      const screenW = window.screen.width
      if (innerW < screenW) {
        const diff = screenW - innerW
        const isLandscape = window.innerWidth > window.innerHeight
        if (isLandscape) {
          leftInset = Math.round(diff / 2)
          rightInset = Math.round(diff / 2)
        }
      }
    }

    setCSSCustomProperties(sbHeight, bottomInset, leftInset, rightInset)
    setInsets({ top: sbHeight, right: rightInset, bottom: bottomInset, left: leftInset })
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
        const [sbInfo, navHeight, cutout] = await Promise.all([
          getStatusBarHeight(),
          getNavigationBarHeight(),
          getDisplayCutoutInsets(),
        ])
        if (!cancelled) {
          setStatusBarHeight(sbInfo)
          statusBarHeightRef.current = sbInfo

          if (cutout.left > 0 || cutout.right > 0 || cutout.top > 0) {
            setCSSCustomProperties(
              Math.max(sbInfo, cutout.top),
              24,
              cutout.left,
              cutout.right,
            )
          }

          if (navHeight > 0 && navHeight !== 24) {
            const style = getComputedStyle(document.documentElement)
            const currentBottom = parseInt(style.getPropertyValue('--sab').replace('px', ''), 10) || 0
            if (currentBottom > 0) {
              setCSSCustomProperties(
                statusBarHeightRef.current,
                Math.max(navHeight, currentBottom),
                cutout.left,
                cutout.right,
              )
            }
          }

          updateInsets()
        }
      } catch {
        // native plugins not available
      }
    }
    run()
    return () => { cancelled = true }
  }, [updateInsets])

  return { insets, statusBarHeight }
}

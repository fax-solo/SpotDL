import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'

interface SafeAreaInsets {
  top: number
  right: number
  bottom: number
  left: number
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

  useEffect(() => {
    const update = () => setInsets(getInsets())
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let cancelled = false
    const run = async () => {
      try {
        const { StatusBar } = await import('@capacitor/status-bar')
        const info = await StatusBar.getInfo()
        if (!cancelled) {
          setStatusBarHeight(info.height ?? 0)
        }
      } catch {
        // StatusBar plugin not available
      }
    }
    run()
    return () => { cancelled = true }
  }, [])

  return { insets, statusBarHeight }
}

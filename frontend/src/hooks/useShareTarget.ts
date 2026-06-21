import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'

export function useShareTarget() {
  const navigate = useNavigate()

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let unlisten: (() => void) | null = null

    const handleShare = (data: { url?: string; text?: string }) => {
      const url = data.url || data.text || ''
      const match = url.match(/https?:\/\/[^\s]+/)
      if (match) {
        navigate(`/download?url=${encodeURIComponent(match[0])}`, {
          state: { fromShare: true },
        })
      }
    }

    CapacitorApp.addListener('appUrlOpen', (data) => {
      if (data.url) {
        handleShare({ url: data.url })
      }
    }).then(h => { unlisten = h.remove })

    return () => { unlisten?.() }
  }, [navigate])
}

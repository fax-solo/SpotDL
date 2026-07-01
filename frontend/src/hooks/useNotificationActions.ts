import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { useNavigate } from 'react-router-dom'
import { useDownloads } from './useDownloads'

type LocalNotificationsModule = {
  registerActionTypes: (options: {
    types: Array<{
      id: string
      actions: Array<{
        id: string
        title: string
        destructive?: boolean
        foreground?: boolean
        authenticationRequired?: boolean
      }>
    }>
  }) => Promise<void>
}

let _ln: LocalNotificationsModule | null = null

async function getLN(): Promise<LocalNotificationsModule | null> {
  if (_ln) return _ln
  try {
    const mod = await import('@capacitor/local-notifications')
    _ln = mod.LocalNotifications as unknown as LocalNotificationsModule
    return _ln
  } catch {
    return null
  }
}

export function useNotificationActions() {
  const navigate = useNavigate()
  const { retryTrack } = useDownloads()

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let unlisten: (() => void) | null = null

    ;(async () => {
      const ln = await getLN()
      if (!ln) return

      await ln.registerActionTypes({
        types: [
          {
            id: 'DOWNLOAD_ACTIONS',
            actions: [
              { id: 'retry', title: 'Retry', destructive: false, foreground: true },
              { id: 'dismiss', title: 'Dismiss', destructive: true, foreground: false },
            ],
          },
          {
            id: 'MEDIA_ACTIONS',
            actions: [
              { id: 'play', title: 'Play', foreground: true },
              { id: 'next', title: 'Next', destructive: false, foreground: true },
            ],
          },
        ],
      })

      try {
        const ln = await getLN()
        if (!ln) return
        const handler = await (ln as any).addListener('localNotificationActionPerformed', (data: any) => {
          const { actionId, notification } = data
          const extra = notification?.extra || {}

          if (actionId === 'retry' && extra.downloadId) {
            navigate('/download')
            retryTrack(extra.downloadId)
          }

          if (actionId === 'play' && extra.filePath) {
            navigate('/player')
          }

          if (actionId === 'next') {
            navigate('/player')
          }
        })
        unlisten = handler.remove
      } catch {
        // listener registration failed — older Capacitor version
      }
    })()

    return () => {
      unlisten?.()
    }
  }, [navigate, retryTrack])
}

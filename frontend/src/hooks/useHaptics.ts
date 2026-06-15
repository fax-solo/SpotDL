import { useCallback } from 'react'
import { Capacitor } from '@capacitor/core'

type ImpactStyle = 'LIGHT' | 'MEDIUM' | 'HEAVY'
type NotificationType = 'SUCCESS' | 'WARNING' | 'ERROR'

export function useHaptics() {
  const impact = useCallback(async (style: ImpactStyle = 'MEDIUM') => {
    if (!Capacitor.isNativePlatform()) return
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics')
    await Haptics.impact({ style: ImpactStyle[style as keyof typeof ImpactStyle] })
  }, [])

  const notify = useCallback(async (type: NotificationType = 'SUCCESS') => {
    if (!Capacitor.isNativePlatform()) return
    const { Haptics, NotificationType } = await import('@capacitor/haptics')
    await Haptics.notification({ type: NotificationType[type as keyof typeof NotificationType] })
  }, [])

  const vibrate = useCallback(async (duration = 300) => {
    if (!Capacitor.isNativePlatform()) return
    const { Haptics } = await import('@capacitor/haptics')
    await Haptics.vibrate({ duration })
  }, [])

  return { impact, notify, vibrate }
}

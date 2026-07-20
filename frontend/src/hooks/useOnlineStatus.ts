import { useState, useEffect, useRef } from 'react'

const CHECK_URL = '/api/ping'
const CHECK_INTERVAL = 30000

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true)
  const checkRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  useEffect(() => {
    const check = async () => {
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 5000)
        const res = await fetch(CHECK_URL, { method: 'GET', signal: controller.signal })
        clearTimeout(timer)
        setIsOnline(res.ok)
      } catch {
        setIsOnline(false)
      }
    }

    const update = () => {
      setIsOnline(navigator.onLine)
      if (navigator.onLine) check()
    }

    const onVisible = () => {
      clearInterval(checkRef.current)
      if (document.visibilityState === 'visible') {
        check()
        checkRef.current = setInterval(check, CHECK_INTERVAL)
      } else {
        checkRef.current = undefined
      }
    }

    check()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    document.addEventListener('visibilitychange', onVisible)
    checkRef.current = setInterval(check, CHECK_INTERVAL)

    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(checkRef.current)
    }
  }, [])

  return isOnline
}

import { useState, useEffect, useRef } from 'react'

const CHECK_URL = '/api/ping'
const CHECK_INTERVAL = 30000

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true)
  const checkRef = useRef<ReturnType<typeof setInterval>>()

  useEffect(() => {
    const check = async () => {
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 5000)
        const res = await fetch(CHECK_URL, { method: 'HEAD', signal: controller.signal })
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

    check()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    checkRef.current = setInterval(check, CHECK_INTERVAL)

    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
      clearInterval(checkRef.current)
    }
  }, [])

  return isOnline
}

import { useCallback, useSyncExternalStore } from 'react'

function getSnapshot(): boolean {
  return document.documentElement.classList.contains('dark')
}

function subscribe(callback: () => void): () => void {
  const observer = new MutationObserver(callback)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}

export function useTheme() {
  const isDark = useSyncExternalStore(subscribe, getSnapshot)

  const toggle = useCallback(() => {
    const next = !isDark
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
  }, [isDark])

  const setTheme = useCallback((dark: boolean) => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [])

  return { isDark, toggle, setTheme }
}

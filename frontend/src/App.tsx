import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Navbar } from './components/Navbar'
import { LandingPage } from './pages/LandingPage'
import { Downloader } from './pages/Downloader'
import { useTheme } from './hooks/useTheme'

const BASE_URL = import.meta.env.VITE_API_URL || ''

function App() {
  const { setTheme } = useTheme()
  const [oauthMessage, setOauthMessage] = useState<string | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem('theme')
    if (stored) {
      setTheme(stored === 'dark')
    } else {
      setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches)
    }
  }, [setTheme])

  useEffect(() => {
    let cleanup: (() => void) | undefined

    async function setupDeepLink() {
      const { Capacitor } = await import('@capacitor/core')
      if (!Capacitor.isNativePlatform()) return

      const { App } = await import('@capacitor/app')
      const listener = await App.addListener('appUrlOpen', async (event) => {
        const url = new URL(event.url)
        if (url.protocol === 'spotdl:') {
          const code = url.searchParams.get('code')
          if (code) {
            try {
              const res = await fetch(`${BASE_URL}/api/auth/spotify/exchange?code=${encodeURIComponent(code)}&redirect_uri=spotdl://callback`)
              const data = await res.json()
              if (data.ok) {
                setOauthMessage('Connected to Spotify!')
                setTimeout(() => window.location.reload(), 1500)
              } else {
                setOauthMessage('Authentication failed')
              }
            } catch {
              setOauthMessage('Authentication failed: could not reach server')
            }
          }
        }
      })
      cleanup = () => { listener.remove() }
    }

    setupDeepLink()
    return () => { cleanup?.() }
  }, [])

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text transition-colors flex flex-col">
        <Navbar />
        {oauthMessage && (
          <div className="fixed top-4 right-4 z-50 px-4 py-2 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-sm font-medium shadow-lg">
            {oauthMessage}
          </div>
        )}
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/download" element={<Downloader />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App

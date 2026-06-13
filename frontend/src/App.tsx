import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Navbar } from './components/Navbar'
import { LandingPage } from './pages/LandingPage'
import { Downloader } from './pages/Downloader'
import { useTheme } from './hooks/useTheme'
import { handleOauthCallback } from './lib/api'

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
    handleOauthCallback().then((ok) => {
      if (ok) {
        setOauthMessage('Connected to Spotify!')
        setTimeout(() => setOauthMessage(null), 3000)
      }
    })
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

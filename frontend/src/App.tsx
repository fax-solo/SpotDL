import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, useLocation, Link } from 'react-router-dom'
import { FileQuestion } from 'lucide-react'
import { Navbar } from './components/Navbar'
import { BottomBar } from './components/BottomBar'
import { useTheme } from './hooks/useTheme'
import { handleOauthCallback } from './lib/api'
import { useHistory } from './hooks/useHistory'
import { Capacitor } from '@capacitor/core'


const LandingPage = lazy(() => import('./pages/LandingPage').then(m => ({ default: m.LandingPage })))
const Home = lazy(() => import('./pages/Home').then(m => ({ default: m.Home })))
const Downloader = lazy(() => import('./pages/Downloader').then(m => ({ default: m.Downloader })))
const HistoryPage = lazy(() => import('./pages/HistoryPage').then(m => ({ default: m.HistoryPage })))
const PlaylistDetail = lazy(() => import('./pages/PlaylistDetail').then(m => ({ default: m.PlaylistDetail })))
const SettingsPage = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })))

function isMobile() {
  return Capacitor.isNativePlatform()
    || /Mobi|Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    || window.innerWidth < 768
}

function NotFound() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-20 text-center">
      <FileQuestion className="w-16 h-16 text-light-muted dark:text-dark-muted mb-4" />
      <h1 className="text-2xl font-bold text-light-text dark:text-dark-text mb-2">Page not found</h1>
      <p className="text-sm text-light-muted dark:text-dark-muted mb-6">The page you're looking for doesn't exist.</p>
      <Link
        to="/"
        className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-colors text-sm"
      >
        Go Home
      </Link>
    </div>
  )
}

function AppContent() {
  const location = useLocation()
  const { addEntry } = useHistory()
  const [oauthMessage, setOauthMessage] = useState<string | null>(null)
  const [mobile, setMobile] = useState(isMobile)
  const [keyboardOpen, setKeyboardOpen] = useState(false)

  useEffect(() => {
    handleOauthCallback().then((ok) => {
      if (ok) {
        setOauthMessage('Connected to Spotify!')
        setTimeout(() => setOauthMessage(null), 3000)
      }
    })
  }, [])

  useEffect(() => {
    const onResize = () => setMobile(isMobile())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!mobile) return
    const onVisualViewport = () => {
      if (window.visualViewport) {
        const isKeyboard = window.visualViewport.height < window.innerHeight * 0.75
        setKeyboardOpen(isKeyboard)
      }
    }
    window.visualViewport?.addEventListener('resize', onVisualViewport)
    return () => window.visualViewport?.removeEventListener('resize', onVisualViewport)
  }, [mobile])

  const isDetailPage = location.pathname.startsWith('/playlist/')

  return (
    <div className="min-h-screen bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text transition-colors flex flex-col">
      {!mobile && <Navbar />}
      {oauthMessage && (
        <div
          className="fixed z-50 px-4 py-2 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-sm font-medium shadow-lg left-4 right-4 md:left-auto md:right-4 text-center md:text-left"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}
        >
          {oauthMessage}
        </div>
      )}
      <Suspense fallback={<div className="flex-1 flex items-center justify-center py-20"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>}>
        <Routes>
          {mobile ? (
            <>
              <Route path="/" element={<Home />} />
              <Route path="/download" element={<Downloader />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/playlist/:id" element={<PlaylistDetail onDownloadComplete={addEntry} />} />
              <Route path="*" element={<NotFound />} />
            </>
          ) : (
            <>
              <Route path="/" element={<LandingPage />} />
              <Route path="/download" element={<Downloader />} />
              <Route path="*" element={<NotFound />} />
            </>
          )}
        </Routes>
      </Suspense>
      {mobile && !isDetailPage && !keyboardOpen && <BottomBar />}
    </div>
  )
}

function App() {
  const { setTheme } = useTheme()

  useEffect(() => {
    const stored = localStorage.getItem('theme')
    if (stored) {
      setTheme(stored === 'dark')
    } else {
      setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches)
    }
  }, [setTheme])

  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  )
}

export default App

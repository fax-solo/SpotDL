import { lazy, Suspense, useEffect, useState, useRef } from 'react'
import { BrowserRouter, Routes, Route, useLocation, Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { FileQuestion } from 'lucide-react'
import { Navbar } from './components/Navbar'
import { BottomBar } from './components/BottomBar'
import { ToastProvider } from './components/Toast'
import { SwipeNavigator } from './components/SwipeNavigator'
import { useTheme } from './hooks/useTheme'
import { useHistory } from './hooks/useHistory'
import { Capacitor } from '@capacitor/core'

const LandingPage = lazy(() => import('./pages/LandingPage').then(m => ({ default: m.LandingPage })))
const Home = lazy(() => import('./pages/Home').then(m => ({ default: m.Home })))
const Downloader = lazy(() => import('./pages/Downloader').then(m => ({ default: m.Downloader })))
const HistoryPage = lazy(() => import('./pages/HistoryPage').then(m => ({ default: m.HistoryPage })))
const PlaylistDetail = lazy(() => import('./pages/PlaylistDetail').then(m => ({ default: m.PlaylistDetail })))
const SettingsPage = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })))
const CallbackPage = lazy(() => import('./pages/CallbackPage').then(m => ({ default: m.CallbackPage })))

const PAGE_ORDER = ['/', '/download', '/history', '/settings']

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
        className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-colors text-sm cursor-pointer"
      >
        Go Home
      </Link>
    </div>
  )
}

const pageVariants = {
  initial: (dir: number) => ({
    x: dir > 0 ? 80 : -80,
    opacity: 0,
  }),
    animate: {
    x: 0,
    opacity: 1,
    transition: { type: 'spring' as const, stiffness: 350, damping: 30, mass: 0.8 },
  },
  exit: (dir: number) => ({
    x: dir > 0 ? -80 : 80,
    opacity: 0,
    transition: { duration: 0.15 } as const,
  }),
}

function AppContent() {
  const location = useLocation()
  const { addEntry } = useHistory()
  const [mobile, setMobile] = useState(isMobile)
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const lastPath = useRef(location.pathname)
  const [direction, setDirection] = useState(0)

  useEffect(() => {
    const prev = lastPath.current
    lastPath.current = location.pathname
    const prevIdx = PAGE_ORDER.indexOf(prev)
    const currIdx = PAGE_ORDER.indexOf(location.pathname)
    if (prevIdx !== -1 && currIdx !== -1) {
      setDirection(currIdx - prevIdx)
    } else {
      setDirection(0)
    }
  }, [location.pathname])

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
      <Suspense fallback={<div className="flex-1 flex items-center justify-center py-20"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>}>
        <AnimatePresence mode="popLayout" custom={direction}>
          <SwipeNavigator
            paths={PAGE_ORDER}
            currentPath={location.pathname}
            enabled={mobile && PAGE_ORDER.includes(location.pathname)}
          >
            <motion.div
              key={location.pathname}
              custom={direction}
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              layout
              className="flex-1 flex flex-col"
            >
              <Routes location={location}>
                {mobile ? (
                  <>
                    <Route path="/" element={<Home />} />
                    <Route path="/download" element={<Downloader />} />
                    <Route path="/history" element={<HistoryPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="/callback" element={<CallbackPage />} />
                    <Route path="/playlist/:id" element={<PlaylistDetail onDownloadComplete={addEntry} />} />
                    <Route path="*" element={<NotFound />} />
                  </>
                ) : (
                  <>
                    <Route path="/" element={<LandingPage />} />
                    <Route path="/download" element={<Downloader />} />
                    <Route path="/callback" element={<CallbackPage />} />
                    <Route path="*" element={<NotFound />} />
                  </>
                )}
              </Routes>
            </motion.div>
          </SwipeNavigator>
        </AnimatePresence>
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
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </BrowserRouter>
  )
}

export default App

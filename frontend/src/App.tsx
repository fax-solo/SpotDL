import { lazy, Suspense, useEffect, useState, useRef } from 'react'
import { BrowserRouter, Routes, Route, useLocation, useNavigate, Link } from 'react-router-dom'
import { FileQuestion, WifiOff } from 'lucide-react'
import { Navbar } from './components/Navbar'
import { BottomBar } from './components/BottomBar'
import { MiniPlayerBar } from './components/MiniPlayerBar'
import { ToastProvider, useToast } from './components/Toast'
import { DownloadOverlayProvider, DownloadOverlay } from './components/DownloadOverlay'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useTheme } from './hooks/useTheme'
import { useMaterialYou } from './hooks/useMaterialYou'
import { useHistory } from './hooks/useHistory'
import { useOnlineStatus } from './hooks/useOnlineStatus'
import { useShareTarget } from './hooks/useShareTarget'
import { useBottomBar } from './hooks/useBottomBar'
import { PlayerProvider, usePlayer } from './hooks/usePlayer'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useAuth } from './hooks/useAuth'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { fetchLyricsWithFallback } from './lib/fetchLyricsWithFallback'

const LandingPage = lazy(() => import('./pages/LandingPage').then(m => ({ default: m.LandingPage })))
const Home = lazy(() => import('./pages/Home').then(m => ({ default: m.Home })))
const Downloader = lazy(() => import('./pages/Downloader').then(m => ({ default: m.Downloader })))
const HistoryPage = lazy(() => import('./pages/HistoryPage').then(m => ({ default: m.HistoryPage })))
const PlaylistDetail = lazy(() => import('./pages/PlaylistDetail').then(m => ({ default: m.PlaylistDetail })))
const AlbumDetail = lazy(() => import('./pages/AlbumDetail').then(m => ({ default: m.AlbumDetail })))
const ArtistPage = lazy(() => import('./pages/ArtistPage').then(m => ({ default: m.ArtistPage })))
const TrackDetail = lazy(() => import('./pages/TrackDetail').then(m => ({ default: m.TrackDetail })))
const EpisodeDetail = lazy(() => import('./pages/EpisodeDetail').then(m => ({ default: m.EpisodeDetail })))
const ShowDetail = lazy(() => import('./pages/ShowDetail').then(m => ({ default: m.ShowDetail })))
const PlayerScreen = lazy(() => import('./pages/PlayerScreen').then(m => ({ default: m.PlayerScreen })))
const SettingsPage = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })))
const CallbackPage = lazy(() => import('./pages/CallbackPage').then(m => ({ default: m.CallbackPage })))
const YtTrackDetail = lazy(() => import('./pages/YtTrackDetail').then(m => ({ default: m.YtTrackDetail })))
const SearchPage = lazy(() => import('./pages/SearchPage').then(m => ({ default: m.SearchPage })))
const SyncPage = lazy(() => import('./pages/SyncPage').then(m => ({ default: m.SyncPage })))
const LocalMusicPage = lazy(() => import('./pages/LocalMusicPage').then(m => ({ default: m.LocalMusicPage })))
const LoginPage = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })))
const SignUpPage = lazy(() => import('./pages/SignUpPage').then(m => ({ default: m.SignUpPage })))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard').then(m => ({ default: m.AdminDashboard })))

const PAGE_ORDER = ['/', '/download', '/history', '/settings', '/player']

function isNativeApp() {
  return Capacitor.isNativePlatform()
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

function AppContent() {
  const location = useLocation()
  const navigate = useNavigate()
  const { addEntry, updateEntryLyrics } = useHistory()
  const isOnline = useOnlineStatus()
  const { toast } = useToast()
  const [isNative, setIsNative] = useState(isNativeApp)
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const locationRef = useRef(location)
  locationRef.current = location
  const auth = useAuth()

  useMaterialYou()
  useShareTarget()

  useEffect(() => {
    auth.initialize()
  }, [])

    useEffect(() => {
      const timer = setTimeout(() => {
        import('./pages/SearchPage')
        import('./pages/Downloader')
        import('./pages/HistoryPage')
        import('./pages/PlayerScreen')
        import('./pages/LocalMusicPage')
      }, 1000)
      return () => clearTimeout(timer)
    }, [])


  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'auto' })
  }, [location.pathname])

  useEffect(() => {
    const onResize = () => setIsNative(isNativeApp())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!isNative) return
    const onVisualViewport = () => {
      if (window.visualViewport) {
        const isKeyboard = window.visualViewport.height < window.innerHeight * 0.75
        setKeyboardOpen(isKeyboard)
      }
    }
    window.visualViewport?.addEventListener('resize', onVisualViewport)
    return () => window.visualViewport?.removeEventListener('resize', onVisualViewport)
  }, [isNative])

  useEffect(() => {
    const handleDownload = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (!detail) return

      addEntry(detail)

      if (!detail.plainLyrics && !detail.syncedLyrics) {
        fetchLyricsWithFallback(detail.title, detail.artist, detail.album, detail.duration)
          .then(lyrics => {
            if (lyrics.plainLyrics || lyrics.syncedLyrics) {
              updateEntryLyrics(detail.title, detail.artist, lyrics.plainLyrics, lyrics.syncedLyrics)
            }
          })
          .catch(() => {})
      }
    }
    window.addEventListener('trackDownloaded', handleDownload)
    return () => window.removeEventListener('trackDownloaded', handleDownload)
  }, [addEntry, updateEntryLyrics])

  useEffect(() => {
    const handleComplete = (e: Event) => {
      const { done, failed } = (e as CustomEvent).detail || {}
      if (done == null) return
      if (failed > 0) {
        toast(`Done: ${done} downloaded, ${failed} failed`, 'error')
      } else {
        toast(`${done} tracks downloaded successfully`, 'success')
      }
    }
    window.addEventListener('downloadsComplete', handleComplete)
    return () => window.removeEventListener('downloadsComplete', handleComplete)
  }, [toast])

  useEffect(() => {
    if (!isNative) return
    let cancelled = false
    let unlisten: (() => void) | null = null
    CapacitorApp.addListener('backButton', () => {
      const path = locationRef.current.pathname
      const detail = isDetailPageRoute(path) || path === '/callback'
      if (detail || (PAGE_ORDER.includes(path) && path !== '/')) {
        if (window.history.length > 1) {
          navigate(-1)
        } else {
          navigate('/')
        }
      } else if (path === '/') {
        CapacitorApp.exitApp()
      } else {
        navigate('/')
      }
    }).then(h => {
      if (cancelled) {
        h.remove()
      } else {
        unlisten = h.remove
      }
    })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [isNative, navigate])

  function isDetailPageRoute(path: string) {
    return path === '/search' || path.startsWith('/playlist/') || path.startsWith('/album/') || path.startsWith('/artist/') || path.startsWith('/track/') || path.startsWith('/yt-track/') || path.startsWith('/episode/') || path.startsWith('/show/') || path === '/player'
  }

  usePlayer()
  useKeyboardShortcuts()
  const isPlayerPage = location.pathname === '/player'
  const bottomBarHidden = useBottomBar(s => s.hidden)
  const showBottomBar = isNative && !keyboardOpen && !bottomBarHidden

  return (
    <div className="bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text transition-colors flex flex-col safe-area-y" style={{ height: '100dvh', WebkitTapHighlightColor: 'transparent' }}>
      {!isOnline && (
        <div className="sticky top-0 z-[60] bg-red-500/90 dark:bg-red-600/90 backdrop-blur-sm text-white text-xs font-medium text-center py-2 px-4 flex items-center justify-center gap-2" role="alert" aria-live="assertive">
          <WifiOff className="w-3.5 h-3.5 flex-shrink-0" />
          <span>You are offline. Some features may be unavailable.</span>
        </div>
      )}
      {!isNative && !['/login', '/signup'].includes(location.pathname) && <Navbar />}
      <ErrorBoundary>
        <Suspense fallback={
          <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
            <p className="text-sm text-light-muted dark:text-dark-muted">Loading…</p>
          </div>
        }>
          <div
            ref={contentRef}
            className="flex-1 flex flex-col overflow-y-auto scroll-native"
          >
            <div key={location.pathname}>
              <Routes location={location}>
                    {isNative ? (
                      <>
                        <Route path="/" element={!auth.initialized ? (
                          <div className="flex-1 flex items-center justify-center">
                            <div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                          </div>
                        ) : auth.user ? <Home /> : <LoginPage />} />
                        <Route path="/search" element={<SearchPage />} />
                        <Route path="/download" element={<Downloader />} />
                        <Route path="/history" element={<HistoryPage />} />
                        <Route path="/sync" element={<SyncPage />} />
                        <Route path="/local-music" element={<LocalMusicPage />} />
                        <Route path="/settings" element={<SettingsPage />} />
                        <Route path="/callback" element={<CallbackPage />} />
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/signup" element={<SignUpPage />} />
                        <Route path="/admin" element={<AdminDashboard />} />
                        <Route path="/playlist/:id" element={<PlaylistDetail onDownloadComplete={addEntry} />} />
                        <Route path="/album/:id" element={<AlbumDetail onDownloadComplete={addEntry} />} />
                        <Route path="/artist/:id" element={<ArtistPage onDownloadComplete={addEntry} />} />
                        <Route path="/track/:id" element={<TrackDetail onDownloadComplete={addEntry} />} />
                        <Route path="/yt-track/:videoId" element={<YtTrackDetail />} />
                        <Route path="/episode/:id" element={<EpisodeDetail onDownloadComplete={addEntry} />} />
                        <Route path="/show/:id" element={<ShowDetail />} />
                        <Route path="/player" element={<PlayerScreen />} />
                        <Route path="*" element={<NotFound />} />
                      </>
                    ) : (
                      <>
                        <Route path="/" element={<LandingPage />} />
                        <Route path="/search" element={<SearchPage />} />
                        <Route path="/download" element={<Downloader />} />
                        <Route path="/history" element={<HistoryPage />} />
                        <Route path="/sync" element={<SyncPage />} />
                        <Route path="/local-music" element={<LocalMusicPage />} />
                        <Route path="/settings" element={<SettingsPage />} />
                        <Route path="/player" element={<PlayerScreen />} />
                        <Route path="/callback" element={<CallbackPage />} />
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/signup" element={<SignUpPage />} />
                        <Route path="/admin" element={<AdminDashboard />} />
                        <Route path="/playlist/:id" element={<PlaylistDetail onDownloadComplete={addEntry} />} />
                        <Route path="/album/:id" element={<AlbumDetail onDownloadComplete={addEntry} />} />
                        <Route path="/artist/:id" element={<ArtistPage onDownloadComplete={addEntry} />} />
                        <Route path="/track/:id" element={<TrackDetail onDownloadComplete={addEntry} />} />
                        <Route path="/yt-track/:videoId" element={<YtTrackDetail />} />
                        <Route path="/episode/:id" element={<EpisodeDetail onDownloadComplete={addEntry} />} />
                        <Route path="/show/:id" element={<ShowDetail />} />
                        <Route path="*" element={<NotFound />} />
                      </>
                    )}
              </Routes>
            </div>
          </div>
        </Suspense>
      </ErrorBoundary>
      {showBottomBar && <BottomBar />}
      {!isPlayerPage && <MiniPlayerBar />}
      <DownloadOverlay />
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
        <DownloadOverlayProvider>
          <PlayerProvider>
            <AppContent />
          </PlayerProvider>
        </DownloadOverlayProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}

export default App

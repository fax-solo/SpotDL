import { lazy, Suspense, useEffect, useState, useRef, useCallback } from 'react'
import { BrowserRouter, Routes, Route, useLocation, useNavigate, Link, Navigate } from 'react-router-dom'
import { FileQuestion, WifiOff, X } from 'lucide-react'
import { Navbar } from './components/Navbar'
import { BottomBar } from './components/BottomBar'

import { ToastProvider, useToast } from './components/Toast'
import { DownloadOverlayProvider, DownloadOverlay } from './components/DownloadOverlay'
import { ErrorBoundary } from './components/ErrorBoundary'
import { BottomSheet } from './components/BottomSheet'
import { PermissionRationaleSheet } from './components/PermissionRationaleSheet'
import { useTheme } from './hooks/useTheme'
import { useMaterialYou } from './hooks/useMaterialYou'
import { useHistory } from './hooks/useHistory'
import { useOnlineStatus } from './hooks/useOnlineStatus'
import { useShareTarget } from './hooks/useShareTarget'
import { useNotificationActions } from './hooks/useNotificationActions'
import { useBottomBar } from './hooks/useBottomBar'
import { PlayerProvider } from './hooks/usePlayer'
import { useAuth } from './hooks/useAuth'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { fetchLyricsWithFallback } from './lib/fetchLyricsWithFallback'
import { uuid } from './lib/uuid'
import { initSentry } from './lib/sentry'
import { checkForUpdate, promptUpdate } from './lib/autoUpdate'
import { registerForPushNotifications, sendPushTokenToServer } from './lib/pushNotifications'
import { createNotificationChannels, sendAppUpdateNotification } from './lib/notifications'
import { RUNTIME_PERMISSIONS, checkPermission, requestPermission, shouldShowRationale } from './lib/permissions'

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
const SettingsPage = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })))
const CallbackPage = lazy(() => import('./pages/CallbackPage').then(m => ({ default: m.CallbackPage })))
const YtTrackDetail = lazy(() => import('./pages/YtTrackDetail').then(m => ({ default: m.YtTrackDetail })))
const SearchPage = lazy(() => import('./pages/SearchPage').then(m => ({ default: m.SearchPage })))
const SyncPage = lazy(() => import('./pages/SyncPage').then(m => ({ default: m.SyncPage })))
const LocalMusicPage = lazy(() => import('./pages/LocalMusicPage').then(m => ({ default: m.LocalMusicPage })))
const LoginPage = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })))
const SignUpPage = lazy(() => import('./pages/SignUpPage').then(m => ({ default: m.SignUpPage })))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard').then(m => ({ default: m.AdminDashboard })))
const PlayerPage = lazy(() => import('./pages/PlayerPage').then(m => ({ default: m.PlayerPage })))
const PlaylistsPage = lazy(() => import('./pages/PlaylistsPage').then(m => ({ default: m.PlaylistsPage })))

const PAGE_ORDER = ['/', '/download', '/history', '/my-playlists', '/settings']

const PUBLIC_ROUTES = ['/', '/login', '/signup', '/callback']

function isNativeApp() {
  return Capacitor.isNativePlatform()
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, initialized } = useAuth()
  const location = useLocation()

  if (!initialized) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!user && !PUBLIC_ROUTES.includes(location.pathname)) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  return <>{children}</>
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
  const [offlineDismissed, setOfflineDismissed] = useState(false)

  useEffect(() => {
    if (isOnline) setOfflineDismissed(false)
  }, [isOnline])
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const locationRef = useRef(location)
  locationRef.current = location
  const auth = useAuth()

  useMaterialYou()
  useShareTarget()
  useNotificationActions()

  useEffect(() => {
    auth.initialize()
  }, [])

    useEffect(() => {
      const timer = setTimeout(() => {
        import('./pages/SearchPage')
        import('./pages/Downloader')
        import('./pages/HistoryPage')
        import('./pages/LocalMusicPage')
      }, 1000)
      return () => clearTimeout(timer)
    }, [])


  const [permSheetOpen, setPermSheetOpen] = useState(false)
  const [permPermanentlyDenied, setPermPermanentlyDenied] = useState(false)
  const [permDismissed, setPermDismissed] = useState(false)
  const notifPermission = RUNTIME_PERMISSIONS.find(p => p.key === 'notifications')

  useEffect(() => {
    if (!isNative || permDismissed) return
    const checkNotif = async () => {
      const granted = await checkPermission('notifications')
      if (granted) return
      const educated = localStorage.getItem('permission_rationale_shown') === '1'
      if (educated) return
      setPermSheetOpen(true)
    }
    checkNotif()
  }, [isNative, permDismissed])

  const handlePermRationaleClose = useCallback(async () => {
    setPermSheetOpen(false)
    localStorage.setItem('permission_rationale_shown', '1')
    setPermDismissed(true)
    const granted = await requestPermission('notifications')
    if (!granted) {
      const showRationale = await shouldShowRationale('notifications')
      if (!showRationale) {
        setPermPermanentlyDenied(true)
        setPermSheetOpen(true)
      }
    }
  }, [])

  useEffect(() => {
    if (isNative || location.pathname !== '/') {
      contentRef.current?.scrollTo({ top: 0, behavior: 'auto' })
    }
  }, [location.pathname, isNative])

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
      const detail = (e as CustomEvent).detail as (Record<string, unknown> & { id?: string }) | undefined
      if (!detail) return

      const entryId = detail.id ?? uuid()
      addEntry({ ...detail, id: entryId } as never)

      if (Capacitor.isNativePlatform()) {
        import('@capacitor/haptics').then(({ Haptics, NotificationType }) => {
          Haptics.notification({ type: NotificationType.Success }).catch(() => {})
        }).catch(() => {})
      }

      if (!detail.plainLyrics && !detail.syncedLyrics) {
        fetchLyricsWithFallback(detail.title as string, detail.artist as string, detail.album as string, detail.duration as number | undefined)
          .then(lyrics => {
            if (lyrics.plainLyrics || lyrics.syncedLyrics) {
              updateEntryLyrics(entryId, lyrics.plainLyrics, lyrics.syncedLyrics)
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
        if (Capacitor.isNativePlatform()) {
          import('@capacitor/haptics').then(({ Haptics, NotificationType }) => {
            Haptics.notification({ type: NotificationType.Error }).catch(() => {})
          }).catch(() => {})
        }
      } else {
        toast(`${done} tracks downloaded successfully`, 'success')
        if (Capacitor.isNativePlatform()) {
          import('@capacitor/haptics').then(({ Haptics, NotificationType }) => {
            Haptics.notification({ type: NotificationType.Success }).catch(() => {})
          }).catch(() => {})
        }
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
    return path === '/search' || path === '/my-playlists' || path.startsWith('/playlist/') || path.startsWith('/album/') || path.startsWith('/artist/') || path.startsWith('/track/') || path.startsWith('/yt-track/') || path.startsWith('/episode/') || path.startsWith('/show/')
  }

  const bottomBarHidden = useBottomBar(s => s.hidden)
  const showBottomBar = isNative && !keyboardOpen && !bottomBarHidden

  return (
    <div className={`bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text transition-colors flex flex-col safe-area-y ${!isNative && location.pathname === '/' ? '' : 'h-dvh'}`}>
      {!isOnline && !offlineDismissed && (
        <div className="sticky top-0 z-[60] bg-red-500/90 dark:bg-red-600/90 backdrop-blur-sm text-white text-xs font-medium py-2 px-4 flex items-center gap-2" role="alert" aria-live="assertive">
          <WifiOff className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="flex-1 text-center">You are offline. Some features may be unavailable.</span>
          <button
            onClick={() => setOfflineDismissed(true)}
            className="p-0.5 rounded hover:bg-white/20 transition-colors cursor-pointer flex-shrink-0"
            aria-label="Dismiss offline notice"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {!isNative && location.pathname !== '/' && <Navbar />}
      <ErrorBoundary>
        <Suspense fallback={
          <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
            <p className="text-sm text-light-muted dark:text-dark-muted">Loading…</p>
          </div>
        }>
          <div
            ref={contentRef}
            className={`flex-1 flex flex-col ${!isNative && location.pathname === '/' ? '' : 'overflow-y-auto scroll-native'} ${!isNative && location.pathname !== '/' ? 'pb-16 sm:pb-0' : ''}`}
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
                        <Route path="/search" element={<RequireAuth><SearchPage /></RequireAuth>} />
                        <Route path="/download" element={<RequireAuth><Downloader /></RequireAuth>} />
                        <Route path="/history" element={<RequireAuth><HistoryPage /></RequireAuth>} />
                        <Route path="/sync" element={<RequireAuth><SyncPage /></RequireAuth>} />
                        <Route path="/local-music" element={<RequireAuth><LocalMusicPage /></RequireAuth>} />
                        <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
                        <Route path="/callback" element={<CallbackPage />} />
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/signup" element={<SignUpPage />} />
                        <Route path="/admin" element={<RequireAuth><AdminDashboard /></RequireAuth>} />
                        <Route path="/player" element={<RequireAuth><PlayerPage /></RequireAuth>} />
                        <Route path="/my-playlists" element={<RequireAuth><PlaylistsPage /></RequireAuth>} />
                        <Route path="/playlist/:id" element={<RequireAuth><PlaylistDetail onDownloadComplete={addEntry} /></RequireAuth>} />
                        <Route path="/album/:id" element={<RequireAuth><AlbumDetail onDownloadComplete={addEntry} /></RequireAuth>} />
                        <Route path="/artist/:id" element={<RequireAuth><ArtistPage onDownloadComplete={addEntry} /></RequireAuth>} />
                        <Route path="/track/:id" element={<RequireAuth><TrackDetail onDownloadComplete={addEntry} /></RequireAuth>} />
                        <Route path="/yt-track/:videoId" element={<RequireAuth><YtTrackDetail /></RequireAuth>} />
                        <Route path="/episode/:id" element={<RequireAuth><EpisodeDetail onDownloadComplete={addEntry} /></RequireAuth>} />
                        <Route path="/show/:id" element={<RequireAuth><ShowDetail /></RequireAuth>} />
                        <Route path="*" element={<NotFound />} />
                      </>
                    ) : (
                      <>
                        <Route path="/" element={<LandingPage />} />
                        <Route path="/search" element={<RequireAuth><SearchPage /></RequireAuth>} />
                        <Route path="/download" element={<RequireAuth><Downloader /></RequireAuth>} />
                        <Route path="/history" element={<RequireAuth><HistoryPage /></RequireAuth>} />
                        <Route path="/sync" element={<RequireAuth><SyncPage /></RequireAuth>} />
                        <Route path="/local-music" element={<RequireAuth><LocalMusicPage /></RequireAuth>} />
                        <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
                        <Route path="/callback" element={<CallbackPage />} />
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/signup" element={<SignUpPage />} />
                        <Route path="/admin" element={<RequireAuth><AdminDashboard /></RequireAuth>} />
                        <Route path="/player" element={<RequireAuth><PlayerPage /></RequireAuth>} />
                        <Route path="/my-playlists" element={<RequireAuth><PlaylistsPage /></RequireAuth>} />
                        <Route path="/playlist/:id" element={<RequireAuth><PlaylistDetail onDownloadComplete={addEntry} /></RequireAuth>} />
                        <Route path="/album/:id" element={<RequireAuth><AlbumDetail onDownloadComplete={addEntry} /></RequireAuth>} />
                        <Route path="/artist/:id" element={<RequireAuth><ArtistPage onDownloadComplete={addEntry} /></RequireAuth>} />
                        <Route path="/track/:id" element={<RequireAuth><TrackDetail onDownloadComplete={addEntry} /></RequireAuth>} />
                        <Route path="/yt-track/:videoId" element={<RequireAuth><YtTrackDetail /></RequireAuth>} />
                        <Route path="/episode/:id" element={<RequireAuth><EpisodeDetail onDownloadComplete={addEntry} /></RequireAuth>} />
                        <Route path="/show/:id" element={<RequireAuth><ShowDetail /></RequireAuth>} />
                        <Route path="*" element={<NotFound />} />
                      </>
                    )}
              </Routes>
            </div>
          </div>
        </Suspense>
      </ErrorBoundary>
      {showBottomBar && <BottomBar />}
      <DownloadOverlay />
      <PermissionRationaleSheet
        open={permSheetOpen}
        onClose={handlePermRationaleClose}
        permission={notifPermission ?? null}
        permanentlyDenied={permPermanentlyDenied}
      />
    </div>
  )
}

function App() {
  const { setTheme, isDark } = useTheme()
  const [updateInfo, setUpdateInfo] = useState<{ tag_name: string; body: string | null } | null>(null)

  initSentry()

  useEffect(() => {
    const stored = localStorage.getItem('theme')
    if (stored) {
      setTheme(stored === 'dark')
    } else {
      setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches)
    }
  }, [setTheme])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
      StatusBar.setStyle({ style: isDark ? Style.Light : Style.Dark })
    }).catch(() => {})
  }, [isDark])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    const init = async () => {
      await createNotificationChannels()

      const token = await registerForPushNotifications()
      if (token) {
        await sendPushTokenToServer(token)
      }

      try {
        const release = await checkForUpdate()
        if (release) {
          setUpdateInfo({ tag_name: release.tag_name, body: release.body })
          const latestVersion = release.tag_name.replace(/^v/i, '')
          const lastNotified = localStorage.getItem('lastNotifiedUpdateVersion')
          if (lastNotified !== latestVersion) {
            localStorage.setItem('lastNotifiedUpdateVersion', latestVersion)
            if (Capacitor.isNativePlatform()) {
              const apkAsset = release.assets.find((a: any) => a.name.endsWith('.apk'))
              const downloadUrl = apkAsset?.browser_download_url || release.html_url
              sendAppUpdateNotification({ version: latestVersion, downloadUrl }).catch(() => {})
            }
          }
        }
      } catch {
        // auto-update check is best-effort
      }
    }

    const timer = setTimeout(init, 5000)
    return () => clearTimeout(timer)
  }, [])

  const handleUpdate = useCallback(async () => {
    if (!updateInfo) return
    try {
      const release = await checkForUpdate()
      if (release) {
        await promptUpdate(release)
      }
    } catch {
      // best-effort
    }
    setUpdateInfo(null)
  }, [updateInfo])

  return (
    <BrowserRouter>
      <ToastProvider>
        <DownloadOverlayProvider>
          <PlayerProvider>
            <AppContent />
          </PlayerProvider>
        </DownloadOverlayProvider>
      </ToastProvider>
      <BottomSheet
        open={!!updateInfo}
        onClose={() => setUpdateInfo(null)}
        title="Update Available"
      >
        {updateInfo && (
          <div className="space-y-4">
            <p className="text-sm text-light-muted dark:text-dark-muted">
              {updateInfo.body?.slice(0, 500) || `Version ${updateInfo.tag_name} is available.`}
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleUpdate}
                className="flex-1 px-4 py-2.5 bg-accent text-white rounded-xl font-medium text-sm cursor-pointer hover:bg-accent-hover transition-colors"
              >
                Update
              </button>
              <button
                onClick={() => setUpdateInfo(null)}
                className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-zinc-800 text-light-text dark:text-dark-text rounded-xl font-medium text-sm cursor-pointer hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
              >
                Later
              </button>
            </div>
          </div>
        )}
      </BottomSheet>
    </BrowserRouter>
  )
}

export default App

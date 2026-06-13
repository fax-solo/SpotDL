import { useState, useEffect, useCallback } from 'react'
import { DownloadCard } from '../components/DownloadCard'
import { History } from '../components/History'
import { useHistory } from '../hooks/useHistory'
import { checkAuthStatus } from '../lib/api'
import { LogIn, CheckCircle } from 'lucide-react'

const BASE_URL = import.meta.env.VITE_API_URL || ''

async function openAuthUrl() {
  if (!BASE_URL) return
  const { Capacitor } = await import('@capacitor/core')
  if (!Capacitor.isNativePlatform()) {
    window.location.href = `${BASE_URL}/api/auth/spotify/login`
    return
  }
  const { Browser } = await import('@capacitor/browser')
  const url = `${BASE_URL}/api/auth/spotify/login?redirect_uri=spotdl://callback`
  await Browser.open({ url })
}

export function Downloader() {
  const { entries, addEntry, clearHistory, removeEntry } = useHistory()
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    checkAuthStatus().then(setAuthed)
  }, [])

  const handleLogin = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    openAuthUrl()
  }, [])

  return (
    <main className="px-4 py-12 min-h-[calc(100vh-73px)]">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-light-text dark:text-dark-text">
          Download Music
        </h1>
        <p className="mt-2 text-light-muted dark:text-dark-muted text-sm">
          Paste a Spotify, YouTube, or SoundCloud URL to download as MP3
        </p>
        <p className="mt-1 text-light-muted dark:text-dark-muted text-xs opacity-70">
          Spotify playlists are limited to 100 songs · Log in with Spotify to get all tracks
        </p>
      </div>

      <div className="flex justify-center mb-4">
        {authed ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
            <CheckCircle className="w-3.5 h-3.5" />
            Connected to Spotify
          </span>
        ) : (
          <a
            href={`${BASE_URL}/api/auth/spotify/login`}
            onClick={handleLogin}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-accent/10 hover:bg-accent/20 text-accent transition-colors"
          >
            <LogIn className="w-3.5 h-3.5" />
            Login with Spotify for unlimited tracks
          </a>
        )}
      </div>

      <div>
        <DownloadCard onDownloadComplete={addEntry} />
        <History
          entries={entries}
          onClear={clearHistory}
          onRemove={removeEntry}
        />
      </div>
    </main>
  )
}

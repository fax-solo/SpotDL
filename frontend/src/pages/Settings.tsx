import { useState, useEffect } from 'react'
import { LogIn, LogOut, User, Music, ExternalLink } from 'lucide-react'
import { isAuthenticated, login, logout, getCachedProfile, fetchUserProfile, type SpotifyUserProfile } from '../lib/spotifyAuth'

export function Settings() {
  const [authed, setAuthed] = useState(false)
  const [profile, setProfile] = useState<SpotifyUserProfile | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isAuthenticated()) {
      setAuthed(true)
      const cached = getCachedProfile()
      if (cached) {
        setProfile(cached)
      } else {
        setLoading(true)
        fetchUserProfile().then(setProfile).catch(() => {}).finally(() => setLoading(false))
      }
    }
  }, [])

  const handleLogin = async () => {
    login()
  }

  const handleLogout = () => {
    logout()
    setAuthed(false)
    setProfile(null)
  }

  const avatarUrl = profile?.images?.[0]?.url

  return (
    <div className="px-4 pt-6 pb-24">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-light-text dark:text-dark-text">Settings</h1>
        <p className="text-sm text-light-muted dark:text-dark-muted mt-1">Manage your Spotify connection</p>
      </div>

      {/* Spotify Account Section */}
      <div className="rounded-xl bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50 overflow-hidden">
        <div className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <Music className="w-5 h-5 text-green-500" />
            <h2 className="text-lg font-semibold text-light-text dark:text-dark-text">Spotify</h2>
            {authed && (
              <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20">
                Connected
              </span>
            )}
          </div>

          {authed && profile ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 rounded-xl bg-light-bg dark:bg-zinc-800/50">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={profile.display_name}
                    className="w-14 h-14 rounded-full object-cover border-2 border-green-500/30"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-accent/20 flex items-center justify-center border-2 border-green-500/30">
                    <User className="w-7 h-7 text-accent" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold text-light-text dark:text-dark-text truncate">
                    {profile.display_name}
                  </p>
                  {profile.email && (
                    <p className="text-sm text-light-muted dark:text-dark-muted truncate">{profile.email}</p>
                  )}
                  <p className="text-xs text-light-muted dark:text-dark-muted mt-0.5 capitalize">
                    {profile.product === 'premium' ? 'Premium' : 'Free'}
                  </p>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="w-full py-3 px-4 rounded-xl border border-red-500/20 text-red-500 hover:bg-red-500/10 transition-colors flex items-center justify-center gap-2 text-sm font-medium cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                Disconnect Spotify
              </button>

              <a
                href="https://www.spotify.com/account/apps/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                Manage connected apps on Spotify
              </a>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-light-muted dark:text-dark-muted">
                Connect your Spotify account to see your playlists, recently played tracks, and get recommendations.
              </p>
              <button
                onClick={handleLogin}
                className="w-full py-3 px-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 hover:bg-green-500/20 transition-colors flex items-center justify-center gap-2 text-sm font-medium cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                Connect Spotify
              </button>
            </div>
          )}
        </div>
      </div>

      {/* App Info */}
      <div className="mt-6 rounded-xl bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50 overflow-hidden">
        <div className="p-5">
          <h2 className="text-lg font-semibold text-light-text dark:text-dark-text mb-2">About</h2>
          <p className="text-sm text-light-muted dark:text-dark-muted">SpotDL v1.0</p>
          <p className="text-xs text-light-muted dark:text-dark-muted mt-1">
            Download music from Spotify, YouTube, SoundCloud, and Bandcamp.
          </p>
        </div>
      </div>
    </div>
  )
}

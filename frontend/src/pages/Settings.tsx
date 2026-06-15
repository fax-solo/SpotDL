import { useState, useEffect } from 'react'
import { LogIn, LogOut, Music, ExternalLink, CheckCircle, AlertTriangle, Key, HelpCircle } from 'lucide-react'
import { ArtworkImage } from '../components/ArtworkImage'
import { isAuthenticated, login, logout, getCachedProfile, fetchUserProfile, type SpotifyUserProfile } from '../lib/spotifyAuth'
import { getWebPlayerToken, setWebPlayerToken, clearWebPlayerToken, testWebPlayerToken } from '../lib/spotifyApi'

export function Settings() {
  const [authed, setAuthed] = useState(false)
  const [profile, setProfile] = useState<SpotifyUserProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)

  // Web Player Token
  const [wpToken, setWpToken] = useState(getWebPlayerToken() || '')
  const [wpTokenTesting, setWpTokenTesting] = useState(false)
  const [wpTokenStatus, setWpTokenStatus] = useState<'idle' | 'valid' | 'invalid'>(getWebPlayerToken() ? 'idle' : 'idle')
  const [wpTokenError, setWpTokenError] = useState<string | null>(null)
  const [wpTokenSaved, setWpTokenSaved] = useState(!!getWebPlayerToken())

  useEffect(() => {
    if (isAuthenticated()) {
      const cached = getCachedProfile()
      if (cached) {
        setAuthed(true)
        setProfile(cached)
      } else {
        setLoading(true)
        fetchUserProfile()
          .then(p => { setAuthed(true); setProfile(p) })
          .catch(e => setApiError(e.message || 'API unavailable'))
          .finally(() => setLoading(false))
      }
    }
  }, [])

  const handleLogout = () => {
    logout()
    setAuthed(false)
    setProfile(null)
  }

  const handleTestToken = async () => {
    if (!wpToken.trim()) return
    setWpTokenTesting(true)
    setWpTokenError(null)
    setWpTokenStatus('idle')
    const result = await testWebPlayerToken(wpToken.trim())
    setWpTokenTesting(false)
    if (result.ok) {
      setWpTokenStatus('valid')
      setWebPlayerToken(wpToken.trim())
      setWpTokenSaved(true)
    } else {
      setWpTokenStatus('invalid')
      setWpTokenError(result.error || 'Token validation failed')
      setWpTokenSaved(false)
    }
  }

  const handleClearToken = () => {
    clearWebPlayerToken()
    setWpToken('')
    setWpTokenStatus('idle')
    setWpTokenError(null)
    setWpTokenSaved(false)
  }

  const avatarUrl: string | null = profile?.images?.[0]?.url ?? null

  return (
    <div className="px-4 pt-6 pb-24">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-light-text dark:text-dark-text">Settings</h1>
        <p className="text-sm text-light-muted dark:text-dark-muted mt-1">Manage your Spotify connection</p>
      </div>

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
                <ArtworkImage
                  src={avatarUrl}
                  alt={profile.display_name}
                  className="w-14 h-14 rounded-full object-cover border-2 border-green-500/30"
                  iconSize={28}
                  loading="lazy"
                />
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
          ) : apiError ? (
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">Connected but API unavailable</p>
                  <p className="text-xs text-light-muted dark:text-dark-muted mt-1">
                    The Spotify app owner needs a Premium subscription for API access.
                  </p>
                </div>
              </div>
              <button
                onClick={logout}
                className="w-full py-3 px-4 rounded-xl border border-red-500/20 text-red-500 hover:bg-red-500/10 transition-colors flex items-center justify-center gap-2 text-sm font-medium cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                Disconnect Spotify
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-light-muted dark:text-dark-muted">
                Connect your Spotify account to see your playlists, recently played tracks, and get recommendations.
              </p>
              <button
                onClick={login}
                className="w-full py-3 px-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 hover:bg-green-500/20 transition-colors flex items-center justify-center gap-2 text-sm font-medium cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                Connect Spotify
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-xl bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50 overflow-hidden">
        <div className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <Key className="w-5 h-5 text-accent" />
            <h2 className="text-lg font-semibold text-light-text dark:text-dark-text">Web Player Token</h2>
            {wpTokenSaved && wpTokenStatus === 'valid' && (
              <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20">
                Active
              </span>
            )}
          </div>

          <p className="text-sm text-light-muted dark:text-dark-muted mb-3">
            Paste your Spotify web player token to access your library and saved tracks.
          </p>

          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={wpToken}
                onChange={e => { setWpToken(e.target.value); setWpTokenStatus('idle'); setWpTokenError(null) }}
                placeholder="Paste your web player token (BQ...)"
                aria-label="Web Player Token"
                autoComplete="off"
                spellCheck={false}
                className="flex-1 px-3 py-2.5 rounded-xl bg-light-bg dark:bg-zinc-800 border border-light-border/50 dark:border-dark-border/50 text-sm text-light-text dark:text-dark-text placeholder:text-light-muted dark:placeholder:text-dark-muted focus:outline-none focus:ring-2 focus:ring-accent/30 transition-shadow"
              />
            </div>

            <div className="flex gap-2">
              {wpTokenSaved && wpToken.trim() === getWebPlayerToken() ? (
                <button
                  onClick={handleClearToken}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-red-500/20 text-red-500 hover:bg-red-500/10 transition-colors text-sm font-medium cursor-pointer"
                >
                  Clear Token
                </button>
              ) : (
                <button
                  onClick={handleTestToken}
                  disabled={!wpToken.trim() || wpTokenTesting}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {wpTokenTesting ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                      Testing...
                    </span>
                  ) : 'Test & Save'}
                </button>
              )}
            </div>

            {wpTokenStatus === 'valid' && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                <p className="text-xs text-green-600 dark:text-green-400">
                  Token valid — library access is active
                </p>
              </div>
            )}

            {wpTokenStatus === 'invalid' && (
              <div className="flex items-start gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-500">Token invalid</p>
                  {wpTokenError && (
                    <p className="text-xs text-light-muted dark:text-dark-muted mt-1">{wpTokenError}</p>
                  )}
                </div>
              </div>
            )}

            <details className="group">
              <summary className="flex items-center gap-2 text-xs text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text cursor-pointer">
                <HelpCircle className="w-3 h-3" />
                How to get your token
              </summary>
              <div className="mt-2 p-3 rounded-xl bg-light-bg dark:bg-zinc-800/50 text-xs text-light-muted dark:text-dark-muted space-y-2">
                <p>1. Open <a href="https://open.spotify.com" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">open.spotify.com</a> and log in</p>
                <p>2. Open Developer Tools (F12) → Console</p>
                <p>3. Paste and run:</p>
                <code className="block p-2 rounded-lg bg-black/10 dark:bg-white/10 text-xs break-all mt-1">
{`fetch('https://open.spotify.com/get_access_token?reason=transport&productType=web_player').then(r=>r.json()).then(d=>{navigator.clipboard.writeText(d.accessToken); console.log('Token copied!')})`}
                </code>
                <p className="mt-1">4. The token is now in your clipboard — paste it above</p>
                <p className="text-amber-500">Note: The token expires after a few hours. Come back here to refresh it.</p>
              </div>
            </details>
          </div>
        </div>
      </div>

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

import { useState, useEffect } from 'react'
import { Music, CheckCircle, AlertTriangle, Key, HelpCircle, ShieldCheck } from 'lucide-react'
import { getWebPlayerToken, setWebPlayerToken, clearWebPlayerToken, testWebPlayerToken } from '../lib/spotifyApi'
import { getDownloadLyrics, setDownloadLyrics } from '../lib/lyricsSettings'
import { ALL_PERMISSIONS, requestPermission, checkPermission, isNative } from '../lib/permissions'

export function Settings() {
  // Web Player Token
  const [wpToken, setWpToken] = useState(getWebPlayerToken() || '')
  const [wpTokenTesting, setWpTokenTesting] = useState(false)
  const [wpTokenStatus, setWpTokenStatus] = useState<'idle' | 'valid' | 'invalid'>(getWebPlayerToken() ? 'idle' : 'idle')
  const [wpTokenError, setWpTokenError] = useState<string | null>(null)
  const [wpTokenSaved, setWpTokenSaved] = useState(!!getWebPlayerToken())
  const [downloadLyrics, setDownloadLyricsState] = useState(getDownloadLyrics())
  const [permStatus, setPermStatus] = useState<Record<string, boolean>>({})
  const [requestingPerm, setRequestingPerm] = useState<string | null>(null)

  useEffect(() => {
    if (!isNative()) return
    for (const p of ALL_PERMISSIONS) {
      checkPermission(p.key).then(granted => {
        setPermStatus(prev => ({ ...prev, [p.key]: granted }))
      })
    }
  }, [])

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

  return (
    <div className="px-4 pt-6 pb-24">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-light-text dark:text-dark-text">Settings</h1>
      </div>

      <div className="rounded-xl bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50 overflow-hidden">
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
          <div className="flex items-center gap-3 mb-4">
            <Music className="w-5 h-5 text-accent" />
            <h2 className="text-lg font-semibold text-light-text dark:text-dark-text">Downloads</h2>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-light-text dark:text-dark-text">Download lyrics</p>
              <p className="text-xs text-light-muted dark:text-dark-muted mt-0.5">
                Fetch synced lyrics for each track during download
              </p>
            </div>
            <button
              onClick={() => {
                const next = !downloadLyrics
                setDownloadLyricsState(next)
                setDownloadLyrics(next)
              }}
              className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
                downloadLyrics ? 'bg-accent' : 'bg-zinc-300 dark:bg-zinc-600'
              }`}
              role="switch"
              aria-checked={downloadLyrics}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${
                  downloadLyrics ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {isNative() && (
        <div className="mt-6 rounded-xl bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50 overflow-hidden">
          <div className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <ShieldCheck className="w-5 h-5 text-accent" />
              <h2 className="text-lg font-semibold text-light-text dark:text-dark-text">Permissions</h2>
            </div>
            <div className="space-y-1">
              {ALL_PERMISSIONS.map(p => {
                const granted = permStatus[p.key]
                const loading = requestingPerm === p.key
                return (
                  <div key={p.key} className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-light-bg dark:hover:bg-zinc-800/50 transition-colors">
                    <div className="flex-1 min-w-0 mr-3">
                      <p className="text-sm font-medium text-light-text dark:text-dark-text">{p.label}</p>
                      <p className="text-xs text-light-muted dark:text-dark-muted mt-0.5 truncate">{p.description}</p>
                    </div>
                    <button
                      onClick={async () => {
                        if (granted) return
                        setRequestingPerm(p.key)
                        try {
                          const result = await Promise.race([
                            requestPermission(p.key),
                            new Promise<boolean>(resolve => setTimeout(() => resolve(false), 5000)),
                          ])
                          setPermStatus(prev => ({ ...prev, [p.key]: result }))
                        } finally {
                          setRequestingPerm(null)
                        }
                      }}
                      disabled={loading || granted}
                      className={`flex-shrink-0 relative w-11 h-6 rounded-full transition-colors cursor-pointer disabled:cursor-not-allowed ${
                        granted ? 'bg-accent' : 'bg-zinc-300 dark:bg-zinc-600'
                      }`}
                      role="switch"
                      aria-checked={granted}
                    >
                      {loading ? (
                        <span className="absolute inset-0 flex items-center justify-center">
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        </span>
                      ) : (
                        <span
                          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${
                            granted ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 rounded-xl bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50 overflow-hidden">
        <div className="p-5">
          <h2 className="text-lg font-semibold text-light-text dark:text-dark-text mb-2">About</h2>
          <p className="text-sm text-light-muted dark:text-dark-muted">SpotDL v1.0</p>
          <p className="text-xs text-light-muted dark:text-dark-muted mt-1">
            Download music from Spotify, YouTube, SoundCloud, and Bandcamp.
          </p>
          <a
            href="https://github.com/fax-solo/SpotDL"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center mt-4 text-accent hover:text-accent-hover transition-colors"
            title="GitHub"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
          </a>
        </div>
      </div>
    </div>
  )
}

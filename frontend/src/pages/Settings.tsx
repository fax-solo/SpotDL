import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Music, CheckCircle, AlertTriangle, Key, HelpCircle, ShieldCheck, RefreshCw, ExternalLink, Radio, RefreshCw as SyncIcon, User, LogOut, Camera, Shield, Mail, Pencil, Trash2, Globe, Cookie, Database } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { getWebPlayerToken, setWebPlayerToken, clearWebPlayerToken, testWebPlayerToken } from '../lib/spotifyApi'
import { getDownloadLyrics, setDownloadLyrics } from '../lib/lyricsSettings'
import { RUNTIME_PERMISSIONS, MANIFEST_PERMISSIONS, requestPermission, checkPermission, shouldShowRationale, openAppSettings, isNative, requestPermissionWithRationale } from '../lib/permissions'
import { APP_VERSION, GITHUB_REPO } from '../lib/version'
import { checkForUpdates, type UpdateCheckResult } from '../lib/checkUpdate'
import { getDeezerArl, setDeezerArl, clearDeezerArl, getDeezerQuality, setDeezerQuality, type DeezerQuality } from '../lib/deezer'
import { getQualitySettings, setQualitySettings, type Bitrate, type OutputFormat, type AudioVariant, VARIANT_LABELS } from '../lib/qualitySettings'
import { getCrossfadeDuration, setCrossfadeDuration } from '../lib/crossfadeSettings'
import { getYoutubeCookies, setYoutubeCookies } from '../lib/auth'
import { clearExpired, getCacheSize } from '../lib/dbCache'
import { clearBlobCache } from '../lib/blobCache'

export function Settings() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { user, isGuest, logout, updateProfile, uploadAvatar, deleteAccount } = useAuth()

  const [profileName, setProfileName] = useState(user?.display_name || '')
  const [profileNameEditing, setProfileNameEditing] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)

  // Deezer ARL
  const [dzArl, setDzArl] = useState(getDeezerArl() || '')
  const [dzArlSaved, setDzArlSaved] = useState(!!getDeezerArl())
  const [dzQuality, setDzQuality] = useState<DeezerQuality>(getDeezerQuality())

  // Web Player Token
  const [wpToken, setWpToken] = useState(getWebPlayerToken() || '')
  const [wpTokenTesting, setWpTokenTesting] = useState(false)
  const [wpTokenStatus, setWpTokenStatus] = useState<'idle' | 'valid' | 'invalid'>(getWebPlayerToken() ? 'idle' : 'idle')
  const [wpTokenError, setWpTokenError] = useState<string | null>(null)
  const [wpTokenSaved, setWpTokenSaved] = useState(!!getWebPlayerToken())
  const [downloadLyrics, setDownloadLyricsState] = useState(getDownloadLyrics())
  const [dlQuality, setDlQuality] = useState(getQualitySettings())
  const [crossfade, setCrossfadeState] = useState(getCrossfadeDuration())
  const [permStatus, setPermStatus] = useState<Record<string, boolean>>({})
  const [requestingPerm, setRequestingPerm] = useState<string | null>(null)
  const [updateState, setUpdateState] = useState<UpdateCheckResult>({
    checking: false, available: false, latestVersion: null, downloadUrl: null, error: null, currentVersion: APP_VERSION,
  })

  // YouTube Cookies
  const [ytCookies, setYtCookies] = useState('')
  const [ytCookiesLoaded, setYtCookiesLoaded] = useState(false)
  const [ytCookiesSaving, setYtCookiesSaving] = useState(false)
  const [ytCookiesSaved, setYtCookiesSaved] = useState(false)

  // Cache
  const [cacheSize, setCacheSize] = useState(0)
  const [cacheClearing, setCacheClearing] = useState(false)

  // Account deletion
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleCheckUpdate = useCallback(async () => {
    setUpdateState(prev => ({ ...prev, checking: true, error: null }))
    const result = await checkForUpdates()
    setUpdateState(result)
  }, [])

  useEffect(() => {
    if (!isNative()) return
    const checkAll = async () => {
      const status: Record<string, boolean> = {}
      for (const p of RUNTIME_PERMISSIONS) {
        status[p.key] = await checkPermission(p.key)
      }
      setPermStatus(status)
    }
    checkAll()
  }, [])

  useEffect(() => {
    getYoutubeCookies().then(c => { setYtCookies(c); setYtCookiesLoaded(true) })
  }, [])

  useEffect(() => {
    getCacheSize('blobs').then(s => setCacheSize(s))
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
    <div className="px-4 pt-6 pb-32">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-light-text dark:text-dark-text">Settings</h1>
      </div>

      {/* Profile Section */}
      <div className="rounded-xl bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50 overflow-hidden mb-6">
        <div className="p-5">
          <div className="flex items-center gap-3 mb-5">
            <User className="w-5 h-5 text-accent" />
            <h2 className="text-lg font-semibold text-light-text dark:text-dark-text">Profile</h2>
            {user?.role === 'admin' && !isGuest && (
              <button
                onClick={() => navigate('/admin')}
                className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center gap-1 hover:bg-amber-500/20 transition-colors cursor-pointer"
              >
                <Shield className="w-3 h-3" />
                Admin
              </button>
            )}
          </div>

          <div className="flex items-center gap-4 mb-5">
            <div className="relative flex-shrink-0">
              <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center overflow-hidden ring-2 ring-accent/20">
                {user?.avatar_url ? (
                  <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-7 h-7 text-accent" />
                )}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarUploading}
                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-accent text-white flex items-center justify-center hover:bg-accent-hover transition-colors disabled:opacity-50 cursor-pointer"
              >
                {avatarUploading ? (
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Camera className="w-3 h-3" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async e => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  setAvatarUploading(true)
                  try {
                    await uploadAvatar(file)
                  } catch (err) {
                    console.error('Avatar upload failed', err)
                  } finally {
                    setAvatarUploading(false)
                  }
                }}
              />
            </div>
            <div className="flex-1 min-w-0">
              {profileNameEditing ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={profileName}
                    onChange={e => setProfileName(e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-light-bg dark:bg-zinc-800 border border-light-border/50 dark:border-dark-border/50 text-sm text-light-text dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-accent/30"
                    autoFocus
                    onKeyDown={async e => {
                      if (e.key === 'Enter') {
                        setProfileSaving(true)
                        try {
                          await updateProfile(profileName)
                          setProfileNameEditing(false)
                        } finally {
                          setProfileSaving(false)
                        }
                      }
                      if (e.key === 'Escape') {
                        setProfileName(user?.display_name || '')
                        setProfileNameEditing(false)
                      }
                    }}
                  />
                  <button
                    onClick={async () => {
                      setProfileSaving(true)
                      try {
                        await updateProfile(profileName)
                        setProfileNameEditing(false)
                      } finally {
                        setProfileSaving(false)
                      }
                    }}
                    disabled={profileSaving}
                    className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {profileSaving ? (
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : 'Save'}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-base font-semibold text-light-text dark:text-dark-text truncate">
                    {user?.display_name || 'User'}
                  </p>
                  <button
                    onClick={() => {
                      setProfileName(user?.display_name || '')
                      setProfileNameEditing(true)
                    }}
                    className="text-light-muted dark:text-dark-muted hover:text-accent transition-colors cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              {user?.email && (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Mail className="w-3 h-3 text-light-muted dark:text-dark-muted" />
                  <p className="text-xs text-light-muted dark:text-dark-muted truncate">{user.email}</p>
                </div>
              )}
              {isGuest && (
                <p className="text-xs text-amber-500 mt-0.5">Signed in as guest</p>
              )}
            </div>
          </div>

          {!isGuest && user?.role === 'admin' && (
            <button
              onClick={() => navigate('/admin')}
              className="w-full py-2.5 px-4 rounded-xl bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 transition-colors text-sm font-medium flex items-center justify-center gap-2 cursor-pointer"
            >
              <Shield className="w-4 h-4" />
              Admin Dashboard
            </button>
          )}

        </div>
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
            <Radio className="w-5 h-5 text-accent" />
            <h2 className="text-lg font-semibold text-light-text dark:text-dark-text">Deezer</h2>
            {dzArlSaved && (
              <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20">
                Connected
              </span>
            )}
          </div>

          <p className="text-sm text-light-muted dark:text-dark-muted mb-3">
            Add your Deezer ARL token to download FLAC quality audio. A free Deezer account is required.
          </p>

          <div className="space-y-3">
            <input
              type="text"
              value={dzArl}
              onChange={e => { setDzArl(e.target.value); setDzArlSaved(false) }}
              placeholder="Paste your Deezer ARL token..."
              aria-label="Deezer ARL Token"
              autoComplete="off"
              spellCheck={false}
              className="w-full px-3 py-2.5 rounded-xl bg-light-bg dark:bg-zinc-800 border border-light-border/50 dark:border-dark-border/50 text-sm text-light-text dark:text-dark-text placeholder:text-light-muted dark:placeholder:text-dark-muted focus:outline-none focus:ring-2 focus:ring-accent/30 transition-shadow"
            />

            <div className="flex gap-2">
              {dzArlSaved ? (
                <button
                  onClick={() => { clearDeezerArl(); setDzArl(''); setDzArlSaved(false) }}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-red-500/20 text-red-500 hover:bg-red-500/10 transition-colors text-sm font-medium cursor-pointer"
                >
                  Disconnect
                </button>
              ) : (
                <button
                  onClick={() => { setDeezerArl(dzArl.trim()); setDzArlSaved(true) }}
                  disabled={!dzArl.trim()}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Save Token
                </button>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex-1">
                <p className="text-sm font-medium text-light-text dark:text-dark-text">Download quality</p>
                <p className="text-xs text-light-muted dark:text-dark-muted mt-0.5">
                  {dzQuality === 'FLAC' ? 'Lossless FLAC (requires Deezer HiFi)' : '320kbps MP3'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setDzQuality('MP3'); setDeezerQuality('MP3') }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    dzQuality === 'MP3'
                      ? 'bg-accent text-white'
                      : 'bg-light-bg dark:bg-zinc-800 text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text'
                  }`}
                >
                  MP3
                </button>
                <button
                  onClick={() => { setDzQuality('FLAC'); setDeezerQuality('FLAC') }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    dzQuality === 'FLAC'
                      ? 'bg-accent text-white'
                      : 'bg-light-bg dark:bg-zinc-800 text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text'
                  }`}
                >
                  FLAC
                </button>
              </div>
            </div>

            <details className="group">
              <summary className="flex items-center gap-2 text-xs text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text cursor-pointer">
                <HelpCircle className="w-3 h-3" />
                How to get your Deezer ARL
              </summary>
              <div className="mt-2 p-3 rounded-xl bg-light-bg dark:bg-zinc-800/50 text-xs text-light-muted dark:text-dark-muted space-y-2">
                <p>1. Open <a href="https://www.deezer.com" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">deezer.com</a> and log in with your free account</p>
                <p>2. Open Developer Tools (F12) → Application → Cookies → deezer.com</p>
                <p>3. Find the cookie named <code className="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10">arl</code></p>
                <p>4. Copy its value and paste it above</p>
                <p className="text-amber-500">Note: The ARL token is permanent. FLAC requires a Deezer HiFi subscription.</p>
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

          <hr className="my-4 border-light-border/50 dark:border-dark-border/50" />

          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-light-text dark:text-dark-text mb-2">Bitrate</p>
              <div className="flex gap-2">
                {(['128', '192', '256', '320'] as Bitrate[]).map(b => (
                  <button
                    key={b}
                    onClick={() => {
                      const next = { ...dlQuality, bitrate: b }
                      setDlQuality(next)
                      setQualitySettings(next)
                    }}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      dlQuality.bitrate === b
                        ? 'bg-accent text-white'
                        : 'bg-light-bg dark:bg-zinc-800 text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text'
                    }`}
                  >
                    {b}kbps
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-light-text dark:text-dark-text mb-2">Format</p>
              <div className="flex gap-2">
                {([['mp3', 'MP3'], ['m4a', 'M4A (AAC)']] as [OutputFormat, string][]).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => {
                      const next = { ...dlQuality, format: val }
                      setDlQuality(next)
                      setQualitySettings(next)
                    }}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      dlQuality.format === val
                        ? 'bg-accent text-white'
                        : 'bg-light-bg dark:bg-zinc-800 text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-light-text dark:text-dark-text mb-2">Variant</p>
              <div className="flex gap-2">
                {(['normal', 'sped_up', 'slowed_reverb'] as AudioVariant[]).map(v => (
                  <button
                    key={v}
                    onClick={() => {
                      const next = { ...dlQuality, variant: v }
                      setDlQuality(next)
                      setQualitySettings(next)
                    }}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      (dlQuality.variant || 'normal') === v
                        ? 'bg-accent text-white'
                        : 'bg-light-bg dark:bg-zinc-800 text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text'
                    }`}
                  >
                    {VARIANT_LABELS[v]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-xl bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50 overflow-hidden">
        <div className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <Music className="w-5 h-5 text-accent" />
            <h2 className="text-lg font-semibold text-light-text dark:text-dark-text">Crossfade</h2>
            {crossfade > 0 && (
              <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-accent/10 text-accent border border-accent/20">
                {crossfade}s
              </span>
            )}
          </div>
          <p className="text-xs text-light-muted dark:text-dark-muted mb-3">
            Smoothly fade between tracks when skipping or at the end of a track.
          </p>
          <div className="flex gap-2 flex-wrap">
            {[
              [0, 'Off'],
              [1, '1s'],
              [2, '2s'],
              [3, '3s'],
              [5, '5s'],
              [8, '8s'],
              [12, '12s'],
            ].map(([val, label]) => (
              <button
                key={val as number}
                onClick={() => {
                  setCrossfadeState(val as number)
                  setCrossfadeDuration(val as number)
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  crossfade === val
                    ? 'bg-accent text-white'
                    : 'bg-light-bg dark:bg-zinc-800 text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text'
                }`}
              >
                {label as string}
              </button>
            ))}
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
            <p className="text-xs text-light-muted dark:text-dark-muted mb-4">
              Runtime permissions that can be toggled. If permanently denied, use the button to open system settings.
            </p>
            <div className="space-y-1">
              {RUNTIME_PERMISSIONS.map(p => {
                const granted = permStatus[p.key]
                const loading = requestingPerm === p.key
                return (
                  <div key={p.key} className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-light-bg dark:hover:bg-zinc-800/50 transition-colors">
                    <div className="flex-1 min-w-0 mr-3">
                      <p className="text-sm font-medium text-light-text dark:text-dark-text">{p.label}</p>
                      <p className="text-xs text-light-muted dark:text-dark-muted mt-0.5 truncate">{p.description}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {!granted && (
                        <button
                          onClick={async () => {
                            setRequestingPerm(p.key)
                            try {
                              const result = await requestPermissionWithRationale(p.key)
                              if (result === 'permanently_denied') {
                                await openAppSettings()
                              }
                              setPermStatus(prev => ({ ...prev, [p.key]: result === 'granted' }))
                            } finally {
                              setRequestingPerm(null)
                            }
                          }}
                          className="text-xs text-accent hover:text-accent-hover font-medium cursor-pointer px-2 py-1 rounded-lg hover:bg-accent/10 transition-colors"
                        >
                          Settings
                        </button>
                      )}
                      <button
                        onClick={async () => {
                          if (granted) return
                          setRequestingPerm(p.key)
                          try {
                            const result = await Promise.race([
                              requestPermission(p.key),
                              new Promise<boolean>(resolve => setTimeout(() => resolve(false), 5000)),
                            ])
                            if (!result) {
                              const rationale = await shouldShowRationale(p.key)
                              if (!rationale) {
                                await openAppSettings()
                              }
                            }
                            setPermStatus(prev => ({ ...prev, [p.key]: result }))
                          } finally {
                            setRequestingPerm(null)
                          }
                        }}
                        disabled={loading || granted}
                        className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer disabled:cursor-not-allowed ${
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
                  </div>
                )
              })}
            </div>

            <hr className="my-4 border-light-border/50 dark:border-dark-border/50" />

            <p className="text-xs text-light-muted dark:text-dark-muted mb-3">
              Manifest permissions — always granted at install time, cannot be revoked:
            </p>
            <div className="space-y-1">
              {MANIFEST_PERMISSIONS.map(p => (
                <div key={p.key} className="flex items-center justify-between py-2 px-3 rounded-xl">
                  <div className="flex-1 min-w-0 mr-3">
                    <p className="text-sm font-medium text-light-text dark:text-dark-text">{p.label}</p>
                    <p className="text-xs text-light-muted dark:text-dark-muted mt-0.5 truncate">{p.description}</p>
                  </div>
                  <div className="flex-shrink-0">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

        <div className="mt-6 rounded-xl bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50 overflow-hidden">
          <button
            onClick={() => navigate('/sync')}
            className="w-full p-5 flex items-center gap-3 hover:bg-light-bg dark:hover:bg-zinc-800/50 transition-colors cursor-pointer text-left"
          >
            <SyncIcon className="w-5 h-5 text-accent" />
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-light-text dark:text-dark-text">Playlist Sync</h2>
              <p className="text-xs text-light-muted dark:text-dark-muted mt-0.5">
                Auto-download new tracks from followed playlists
              </p>
            </div>
            <svg className="w-5 h-5 text-light-muted dark:text-dark-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>

      {/* YouTube Cookies */}
      {ytCookiesLoaded && (
        <div className="mt-6 rounded-xl bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50 overflow-hidden">
          <div className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <Cookie className="w-5 h-5 text-accent" />
              <h2 className="text-lg font-semibold text-light-text dark:text-dark-text">YouTube Cookies</h2>
              {ytCookiesSaved && (
                <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20">Saved</span>
              )}
            </div>
            <p className="text-sm text-light-muted dark:text-dark-muted mb-3">
              Paste your YouTube cookies (Netscape format) to bypass geo-restrictions and age verification when downloading from YouTube.
            </p>
            <textarea
              value={ytCookies}
              onChange={e => { setYtCookies(e.target.value); setYtCookiesSaved(false) }}
              placeholder="# Netscape HTTP Cookie File&#10;.youtube.com\tTRUE\t/\tTRUE\t1735689600\tSOCS\tCAI..."
              rows={5}
              aria-label="YouTube cookies"
              spellCheck={false}
              className="w-full px-3 py-2.5 rounded-xl bg-light-bg dark:bg-zinc-800 border border-light-border/50 dark:border-dark-border/50 text-sm text-light-text dark:text-dark-text placeholder:text-light-muted dark:placeholder:text-dark-muted focus:outline-none focus:ring-2 focus:ring-accent/30 transition-shadow font-mono text-xs resize-y"
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={async () => {
                  setYtCookiesSaving(true)
                  try {
                    await setYoutubeCookies(ytCookies.trim())
                    setYtCookiesSaved(true)
                    toast('YouTube cookies saved', 'success')
                  } catch (e: any) {
                    toast(e.message || 'Failed to save', 'error')
                  } finally {
                    setYtCookiesSaving(false)
                  }
                }}
                disabled={ytCookiesSaving}
                className="flex-1 py-2.5 px-4 rounded-xl bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 transition-colors text-sm font-medium disabled:opacity-50 cursor-pointer"
              >
                {ytCookiesSaving ? 'Saving...' : 'Save Cookies'}
              </button>
              {ytCookies.trim() && (
                <button
                  onClick={() => { setYtCookies(''); setYoutubeCookies(''); setYtCookiesSaved(false) }}
                  className="py-2.5 px-4 rounded-xl border border-red-500/20 text-red-500 hover:bg-red-500/10 transition-colors text-sm font-medium cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cache */}
      <div className="mt-6 rounded-xl bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50 overflow-hidden">
        <div className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <Database className="w-5 h-5 text-accent" />
            <h2 className="text-lg font-semibold text-light-text dark:text-dark-text">Cache</h2>
            {cacheSize > 0 && (
              <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-accent/10 text-accent border border-accent/20">{cacheSize} blobs</span>
            )}
          </div>
          <p className="text-sm text-light-muted dark:text-dark-muted mb-3">
            Clear cached metadata, artwork, and downloaded blobs to free up storage.
          </p>
          <button
            onClick={async () => {
              setCacheClearing(true)
              try {
                await clearExpired('metadata', 0)
                await clearExpired('artwork', 0)
                await clearExpired('blobs', 0)
                await clearBlobCache()
                setCacheSize(0)
                toast('Cache cleared', 'success')
              } catch {
                toast('Failed to clear cache', 'error')
              } finally {
                setCacheClearing(false)
              }
            }}
            disabled={cacheClearing}
            className="w-full py-2.5 px-4 rounded-xl bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 transition-colors text-sm font-medium disabled:opacity-50 cursor-pointer"
          >
            {cacheClearing ? 'Clearing...' : 'Clear All Cache'}
          </button>
        </div>
      </div>

      {/* Account Deletion */}
      {!isGuest && (
        <div className="mt-6 rounded-xl bg-white dark:bg-dark-surface border border-red-500/20 overflow-hidden">
          <div className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <Trash2 className="w-5 h-5 text-red-500" />
              <h2 className="text-lg font-semibold text-red-500">Delete Account</h2>
            </div>
            <p className="text-sm text-light-muted dark:text-dark-muted mb-3">
              Permanently delete your account and all associated data (history, downloads, settings). This cannot be undone.
            </p>
            {confirmDelete ? (
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                  <p className="text-xs text-red-500 font-medium">
                    Are you sure? This will permanently delete your account, listening history, download logs, and push notification tokens.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      setDeleting(true)
                      try {
                        await deleteAccount()
                        toast('Account permanently deleted', 'success')
                        navigate('/')
                      } catch (e: any) {
                        toast(e.message || 'Account deletion failed', 'error')
                      } finally {
                        setDeleting(false)
                        setConfirmDelete(false)
                      }
                    }}
                    disabled={deleting}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-red-500 text-white hover:bg-red-600 transition-colors text-sm font-medium disabled:opacity-50 cursor-pointer"
                  >
                    {deleting ? 'Deleting...' : 'Yes, Delete My Account'}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    disabled={deleting}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-light-text dark:text-dark-text hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors text-sm font-medium cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-full py-2.5 px-4 rounded-xl border border-red-500/30 text-red-500 hover:bg-red-500/10 transition-colors text-sm font-medium cursor-pointer"
              >
                Delete My Account
              </button>
            )}
          </div>
        </div>
      )}

        <div className="mt-6 rounded-xl bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50 overflow-hidden">
          <div className="p-5">
            <h2 className="text-lg font-semibold text-light-text dark:text-dark-text mb-2">About</h2>
          <p className="text-sm text-light-text dark:text-dark-text">
            Sinc <span className="text-light-muted dark:text-dark-muted">v{APP_VERSION}</span>
          </p>
          <p className="text-xs text-light-muted dark:text-dark-muted mt-1">
            Download music from Spotify, YouTube, SoundCloud, and Bandcamp.
          </p>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleCheckUpdate}
              disabled={updateState.checking}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 transition-colors text-sm font-medium disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${updateState.checking ? 'animate-spin' : ''}`} />
              {updateState.checking ? 'Checking...' : 'Check for Updates'}
            </button>

            {updateState.available && (
              <a
                href={updateState.downloadUrl || `https://github.com/${GITHUB_REPO}/releases/latest`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent text-white hover:bg-accent-hover transition-colors text-sm font-medium"
              >
                <ExternalLink className="w-4 h-4" />
                Download v{updateState.latestVersion}
              </a>
            )}
          </div>

          {updateState.available && (
            <div className="mt-3 flex items-center gap-2 p-3 rounded-xl bg-accent/10 border border-accent/20">
              <CheckCircle className="w-4 h-4 text-accent flex-shrink-0" />
              <p className="text-xs text-accent font-medium">
                v{updateState.latestVersion} available
              </p>
            </div>
          )}

          {!updateState.checking && !updateState.available && !updateState.error && updateState.latestVersion !== null && (
            <div className="mt-3 flex items-center gap-2 p-3 rounded-xl bg-green-500/10 border border-green-500/20">
              <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
              <p className="text-xs text-green-600 dark:text-green-400">
                Up to date — v{APP_VERSION}
              </p>
            </div>
          )}

          {updateState.error && (
            <div className="mt-3 flex items-start gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-light-muted dark:text-dark-muted">{updateState.error}</p>
            </div>
          )}

          <a
            href={`https://github.com/${GITHUB_REPO}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center mt-4 text-accent hover:text-accent-hover transition-colors"
            title="GitHub"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
          </a>
        </div>
      </div>

      <div className="mt-6 rounded-xl bg-white dark:bg-dark-surface border border-light-border/50 dark:border-dark-border/50 overflow-hidden">
        <button
          onClick={() => { logout(); navigate('/login') }}
          className="w-full p-5 flex items-center gap-3 hover:bg-red-500/5 transition-colors cursor-pointer text-left"
        >
          <LogOut className="w-5 h-5 text-red-500" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-red-500">Sign Out</h2>
            <p className="text-xs text-light-muted dark:text-dark-muted mt-0.5">
              Sign out of your account
            </p>
          </div>
          <svg className="w-5 h-5 text-light-muted dark:text-dark-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>
    </div>
  )
}

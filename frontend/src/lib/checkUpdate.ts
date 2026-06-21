import { APP_VERSION, GITHUB_REPO, isNewerVersion } from './version'

export interface UpdateCheckResult {
  checking: boolean
  available: boolean
  latestVersion: string | null
  downloadUrl: string | null
  error: string | null
  currentVersion: string
}

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      { headers: { Accept: 'application/vnd.github.v3+json' }, signal: AbortSignal.timeout(10000) },
    )
    if (!res.ok) {
      return {
        checking: false,
        available: false,
        latestVersion: null,
        downloadUrl: null,
        error: res.status === 403 ? 'Rate limited. Try again later.' : 'Could not check for updates',
        currentVersion: APP_VERSION,
      }
    }

    const data = await res.json()
    const latestTag: string = data.tag_name || ''
    const latestVer = latestTag.replace(/^v/i, '')
    const downloadUrl = data.html_url || null

    return {
      checking: false,
      available: isNewerVersion(latestVer, APP_VERSION),
      latestVersion: latestVer,
      downloadUrl,
      error: null,
      currentVersion: APP_VERSION,
    }
  } catch (err) {
    return {
      checking: false,
      available: false,
      latestVersion: null,
      downloadUrl: null,
      error: err instanceof DOMException && err.name === 'TimeoutError' ? 'Request timed out' : 'Could not check for updates',
      currentVersion: APP_VERSION,
    }
  }
}

import { Capacitor } from '@capacitor/core'
import { APP_VERSION, GITHUB_REPO, isNewerVersion } from './version'

const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`

interface GitHubRelease {
  tag_name: string
  html_url: string
  body: string
  assets: Array<{
    name: string
    browser_download_url: string
  }>
}

export async function checkForUpdate(): Promise<GitHubRelease | null> {
  try {
    const res = await fetch(GITHUB_API, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    })
    if (!res.ok) return null

    const release: GitHubRelease = await res.json()
    const latestVersion = release.tag_name.replace(/^v/i, '')

    if (isNewerVersion(latestVersion, APP_VERSION)) {
      return release
    }
    return null
  } catch {
    return null
  }
}

export function getApkDownloadUrl(release: GitHubRelease): string | null {
  const apk = release.assets.find(a => a.name.endsWith('.apk'))
  return apk?.browser_download_url || null
}

export async function promptUpdate(release: GitHubRelease): Promise<boolean> {
  const apkUrl = getApkDownloadUrl(release)
  if (!apkUrl) return false

  if (Capacitor.isNativePlatform()) {
    try {
      const { Browser } = await import('@capacitor/browser')
      await Browser.open({ url: apkUrl })
      return true
    } catch {
      window.open(apkUrl, '_blank')
      return true
    }
  }

  window.open(apkUrl, '_blank')
  return true
}

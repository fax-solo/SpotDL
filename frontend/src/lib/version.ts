export const APP_VERSION: string = '1.17.0'
export const GITHUB_REPO = 'fax-solo/SpotDL'

export function parseVersion(v: string): { major: number; minor: number; patch: number } | null {
  const cleaned = v.replace(/^v/i, '')
  const parts = cleaned.split('.')
  if (parts.length !== 3) return null
  const major = Number(parts[0])
  const minor = Number(parts[1])
  const patch = Number(parts[2])
  if (isNaN(major) || isNaN(minor) || isNaN(patch)) return null
  return { major, minor, patch }
}

export function isNewerVersion(latest: string, current: string): boolean {
  const l = parseVersion(latest)
  const c = parseVersion(current)
  if (!l || !c) return false
  if (l.major !== c.major) return l.major > c.major
  if (l.minor !== c.minor) return l.minor > c.minor
  return l.patch > c.patch
}

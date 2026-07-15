export const APP_VERSION: string = '1.12.0'
export const GITHUB_REPO = 'fax-solo/SpotDL'

export function parseVersion(v: string): { major: number; minor: number; patch: number } | null {
  const parts = v.replace(/^v/i, '').split('.').map(Number)
  if (parts.length !== 3 || parts.some(isNaN)) return null
  return { major: parts[0], minor: parts[1], patch: parts[2] }
}

export function isNewerVersion(latest: string, current: string): boolean {
  const l = parseVersion(latest)
  const c = parseVersion(current)
  if (!l || !c) return false
  if (l.major !== c.major) return l.major > c.major
  if (l.minor !== c.minor) return l.minor > c.minor
  return l.patch > c.patch
}

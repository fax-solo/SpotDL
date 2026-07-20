export const APP_VERSION: string = '1.21.2'
export const GITHUB_REPO = 'fax-solo/SpotDL'

export function parseVersion(v: string): { major: number; minor: number; patch: number } | null {
  const match = v.replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!match) return null
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
}

export function isNewerVersion(latest: string, current: string): boolean {
  const l = parseVersion(latest)
  const c = parseVersion(current)
  if (!l || !c) return false
  if (l.major !== c.major) return l.major > c.major
  if (l.minor !== c.minor) return l.minor > c.minor
  return l.patch > c.patch
}

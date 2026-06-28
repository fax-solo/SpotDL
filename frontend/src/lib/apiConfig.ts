export function getApiBase(): string {
  const envUrl = import.meta.env.VITE_API_URL
  if (envUrl) return envUrl

  return ''
}

export function apiUrl(path: string): string {
  const base = getApiBase()
  return `${base}${path}`
}

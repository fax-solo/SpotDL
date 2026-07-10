const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function extractOrigin(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

export function csrfCheck(request: Request, allowedOrigins?: string): void {
  if (SAFE_METHODS.has(request.method)) return

  const origin = request.headers.get('Origin')
  if (!origin) return

  const requestOrigin = extractOrigin(origin)
  if (!requestOrigin) {
    throw new Error('CSRF: Invalid origin header')
  }

  const allowed: string[] = allowedOrigins
    ? allowedOrigins.split(',').map(s => s.trim()).filter(Boolean)
    : []

  if (allowed.length === 0) {
    const url = new URL(request.url)
    allowed.push(url.origin)
  }

  if (!allowed.some(o => requestOrigin === o)) {
    throw new Error('CSRF: Invalid origin')
  }
}

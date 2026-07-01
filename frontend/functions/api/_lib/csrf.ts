const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export function csrfCheck(request: Request, allowedOrigins?: string): void {
  if (SAFE_METHODS.has(request.method)) return

  const origin = request.headers.get('Origin')
  if (!origin) return

  let allowed: string[] = []
  if (allowedOrigins) {
    allowed = allowedOrigins.split(',').map(s => s.trim())
  } else {
    const url = new URL(request.url)
    allowed.push(`${url.protocol}//${url.host}`)
  }

  if (!allowed.some(o => origin.startsWith(o))) {
    throw new Error('CSRF: Invalid origin')
  }
}

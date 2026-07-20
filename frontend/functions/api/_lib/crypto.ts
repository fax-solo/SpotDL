function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function sha256(input: string): Promise<string> {
  const enc = new TextEncoder()
  const hash = await crypto.subtle.digest('SHA-256', enc.encode(input))
  return hex(hash)
}

export async function hmacSha256(input: string, secret: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(input))
  return hex(sig)
}

export function b64url(input: string): string {
  return btoa(input).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

export function b64urlDecode(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=')
  return atob(padded)
}

export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder()
  const bufA = enc.encode(a)
  const bufB = enc.encode(b)
  if (bufA.byteLength !== bufB.byteLength) return false
  try {
    return crypto.subtle.timingSafeEqual(bufA, bufB)
  } catch {
    return a === b
  }
}

export function uuid(): string {
  return crypto.randomUUID()
}

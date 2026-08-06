import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Capacitor } from '@capacitor/core'
import { getApiBase, apiUrl, checkApiReachability, networkErrorText } from './apiConfig'

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn(() => false) },
}))

const mockIsNative = Capacitor.isNativePlatform as ReturnType<typeof vi.fn>

describe('getApiBase', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_URL', '')
    mockIsNative.mockReturnValue(false)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('uses the production API on native without an env override', () => {
    mockIsNative.mockReturnValue(true)
    expect(getApiBase()).toBe('https://spotify-downloader-5v5.pages.dev')
  })

  it('uses the production API on web without an env override', () => {
    mockIsNative.mockReturnValue(false)
    expect(getApiBase()).toBe('https://spotify-downloader-5v5.pages.dev')
  })

  it('prefers VITE_API_URL over the native default', () => {
    mockIsNative.mockReturnValue(true)
    vi.stubEnv('VITE_API_URL', 'http://localhost:8000')
    expect(getApiBase()).toBe('http://localhost:8000')
  })

  it('prefers VITE_API_URL over the web default', () => {
    mockIsNative.mockReturnValue(false)
    vi.stubEnv('VITE_API_URL', 'http://localhost:8000')
    expect(getApiBase()).toBe('http://localhost:8000')
  })
})

describe('apiUrl', () => {
  it('joins the resolved base with the path', () => {
    mockIsNative.mockReturnValue(true)
    expect(apiUrl('/api/ping')).toBe('https://spotify-downloader-5v5.pages.dev/api/ping')
  })
})

describe('checkApiReachability', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_URL', '')
    mockIsNative.mockReturnValue(true)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('returns true when the ping succeeds', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
    expect(await checkApiReachability()).toBe(true)
  })

  it('returns false when the ping fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    expect(await checkApiReachability()).toBe(false)
  })

  it('returns false on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    expect(await checkApiReachability()).toBe(false)
  })

  it('returns true when the base URL is set and ping succeeds on web', async () => {
    mockIsNative.mockReturnValue(false)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
    expect(await checkApiReachability()).toBe(true)
  })
})

describe('networkErrorText', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_URL', '')
    mockIsNative.mockReturnValue(true)
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('blames the internet when the device is offline', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    const msg = networkErrorText()
    expect(msg.toLowerCase()).toContain('offline')
    expect(msg).not.toContain('https://')
  })

  it('blames the backend and includes the resolved URL when online', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const msg = networkErrorText()
    expect(msg).toContain('https://spotify-downloader-5v5.pages.dev')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

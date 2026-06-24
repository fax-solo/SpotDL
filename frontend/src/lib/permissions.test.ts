import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRequestPermissions = vi.fn()
const mockCheckPermissions = vi.fn()

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
  },
}))

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    requestPermissions: (...args: unknown[]) => mockRequestPermissions(...args),
    checkPermissions: (...args: unknown[]) => mockCheckPermissions(...args),
  },
}))

import { Capacitor } from '@capacitor/core'
import {
  ALL_PERMISSIONS,
  requestPermission,
  checkPermission,
  isNative,
  requiresRuntimePermission,
  ensureNotificationPermission,
} from './permissions'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ALL_PERMISSIONS', () => {
  it('defines all required permissions', () => {
    const keys = ALL_PERMISSIONS.map(p => p.key)
    expect(keys).toContain('notifications')
    expect(keys).toContain('internet')
    expect(keys).toContain('storage')
    expect(keys).toContain('foreground_service')
    expect(keys).toContain('media_playback')
    expect(keys).toContain('wake_lock')
    expect(keys).toContain('vibrate')
    expect(keys).toContain('exact_alarm')
    expect(keys).toContain('boot_completed')
  })

  it('marks runtime permissions as dangerous', () => {
    const dangerous = ALL_PERMISSIONS.filter(p => p.dangerous)
    expect(dangerous.length).toBeGreaterThanOrEqual(2)
    expect(dangerous.map(p => p.key)).toContain('notifications')
    expect(dangerous.map(p => p.key)).toContain('media_audio')
  })

  it('all permissions have valid androidName', () => {
    for (const p of ALL_PERMISSIONS) {
      expect(p.androidName).toMatch(/^android\.permission\./)
    }
  })
})

describe('isNative', () => {
  it('returns false when not native', () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false)
    expect(isNative()).toBe(false)
  })

  it('returns true when native', () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
    expect(isNative()).toBe(true)
  })
})

describe('requiresRuntimePermission', () => {
  it('returns true for notifications', () => {
    expect(requiresRuntimePermission('notifications')).toBe(true)
  })

  it('returns false for auto-granted permissions', () => {
    expect(requiresRuntimePermission('internet')).toBe(false)
    expect(requiresRuntimePermission('storage')).toBe(false)
    expect(requiresRuntimePermission('vibrate')).toBe(false)
  })

  it('returns false for unknown keys', () => {
    expect(requiresRuntimePermission('unknown')).toBe(false)
  })
})

describe('requestPermission', () => {
  it('returns false when not native', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false)
    expect(await requestPermission('notifications')).toBe(false)
  })

  describe('notifications permission', () => {
    beforeEach(() => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
    })

    it('returns true when granted', async () => {
      mockRequestPermissions.mockResolvedValue({ display: 'granted' })
      expect(await requestPermission('notifications')).toBe(true)
    })

    it('returns false when denied', async () => {
      mockRequestPermissions.mockResolvedValue({ display: 'denied' })
      expect(await requestPermission('notifications')).toBe(false)
    })

    it('returns false when prompt dismissed', async () => {
      mockRequestPermissions.mockResolvedValue({ display: 'prompt' })
      expect(await requestPermission('notifications')).toBe(false)
    })

    it('returns false on error', async () => {
      mockRequestPermissions.mockRejectedValue(new Error('Native error'))
      expect(await requestPermission('notifications')).toBe(false)
    })
  })

  describe('auto-granted permissions', () => {
    beforeEach(() => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
    })

    it('returns true for internet', async () => {
      expect(await requestPermission('internet')).toBe(true)
    })

    it('returns true for storage', async () => {
      expect(await requestPermission('storage')).toBe(true)
    })

    it('returns true for foreground_service', async () => {
      expect(await requestPermission('foreground_service')).toBe(true)
    })

    it('returns true for media_playback', async () => {
      expect(await requestPermission('media_playback')).toBe(true)
    })
  })

  it('returns false for unknown permission key', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
    expect(await requestPermission('unknown_perm')).toBe(false)
  })
})

describe('checkPermission', () => {
  it('returns false when not native', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false)
    expect(await checkPermission('notifications')).toBe(false)
    expect(await checkPermission('internet')).toBe(false)
  })

  describe('notifications permission', () => {
    beforeEach(() => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
    })

    it('returns true when granted', async () => {
      mockCheckPermissions.mockResolvedValue({ display: 'granted' })
      expect(await checkPermission('notifications')).toBe(true)
    })

    it('returns false when denied', async () => {
      mockCheckPermissions.mockResolvedValue({ display: 'denied' })
      expect(await checkPermission('notifications')).toBe(false)
    })

    it('returns false when prompt', async () => {
      mockCheckPermissions.mockResolvedValue({ display: 'prompt' })
      expect(await checkPermission('notifications')).toBe(false)
    })

    it('returns false on error', async () => {
      mockCheckPermissions.mockRejectedValue(new Error('Native error'))
      expect(await checkPermission('notifications')).toBe(false)
    })
  })

  describe('auto-granted permissions', () => {
    beforeEach(() => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
    })

    it('returns true for internet', async () => {
      expect(await checkPermission('internet')).toBe(true)
    })

    it('returns true for storage', async () => {
      expect(await checkPermission('storage')).toBe(true)
    })
  })
})

describe('ensureNotificationPermission', () => {
  beforeEach(() => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
  })

  it('returns true if already granted', async () => {
    mockCheckPermissions.mockResolvedValue({ display: 'granted' })
    expect(await ensureNotificationPermission()).toBe(true)
    expect(mockRequestPermissions).not.toHaveBeenCalled()
  })

  it('requests permission if not granted', async () => {
    mockCheckPermissions.mockResolvedValue({ display: 'denied' })
    mockRequestPermissions.mockResolvedValue({ display: 'granted' })
    expect(await ensureNotificationPermission()).toBe(true)
    expect(mockRequestPermissions).toHaveBeenCalledOnce()
  })

  it('returns false if request is denied', async () => {
    mockCheckPermissions.mockResolvedValue({ display: 'denied' })
    mockRequestPermissions.mockResolvedValue({ display: 'denied' })
    expect(await ensureNotificationPermission()).toBe(false)
  })

  it('returns false when not native', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false)
    expect(await ensureNotificationPermission()).toBe(false)
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSchedule = vi.fn()
const mockCancel = vi.fn()
const mockRequestPermissions = vi.fn()
const mockCheckPermissions = vi.fn()

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
  },
  registerPlugin: vi.fn(() => ({})),
}))

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    schedule: (...args: unknown[]) => mockSchedule(...args),
    cancel: (...args: unknown[]) => mockCancel(...args),
    requestPermissions: (...args: unknown[]) => mockRequestPermissions(...args),
    checkPermissions: (...args: unknown[]) => mockCheckPermissions(...args),
  },
}))

import { Capacitor } from '@capacitor/core'
import {
  ensureNotificationPermission,
  sendDownloadCompleteNotification,
  sendDownloadErrorNotification,
  sendDownloadProgressNotification,
  cancelDownloadProgressNotification,
  sendAppUpdateNotification,
  sendBatchCompleteNotification,

  cancelBackgroundPlaybackNotification,
} from './notifications'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ensureNotificationPermission', () => {
  it('returns false when not native', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false)
    expect(await ensureNotificationPermission()).toBe(false)
  })

  it('returns true when native and permissions granted', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
    mockCheckPermissions.mockResolvedValue({ display: 'granted' })
    expect(await ensureNotificationPermission()).toBe(true)
  })

  it('requests permission if needed and returns result', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
    mockCheckPermissions.mockResolvedValue({ display: 'denied' })
    mockRequestPermissions.mockResolvedValue({ display: 'granted' })
    expect(await ensureNotificationPermission()).toBe(true)
  })
})

describe('sendDownloadCompleteNotification', () => {
  beforeEach(() => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
    mockCheckPermissions.mockResolvedValue({ display: 'granted' })
  })

  it('sends a notification with correct fields', async () => {
    mockSchedule.mockResolvedValue({ notifications: [{ id: 123 }] })
    await sendDownloadCompleteNotification({
      title: 'Test Song',
      artist: 'Test Artist',
      filePath: '/path/to/file.mp3',
    })
    expect(mockSchedule).toHaveBeenCalledOnce()
    const call = mockSchedule.mock.calls[0][0]
    expect(call.notifications[0].title).toBe('Test Song')
    expect(call.notifications[0].body).toContain('Test Artist')
    expect(call.notifications[0].body).toContain('Download complete')
    expect(call.notifications[0].extra?.filePath).toBe('/path/to/file.mp3')
  })

  it('does nothing when not native', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false)
    await sendDownloadCompleteNotification({ title: 'x', artist: 'y' })
    expect(mockSchedule).not.toHaveBeenCalled()
  })

  it('does nothing when permission is denied', async () => {
    mockCheckPermissions.mockResolvedValue({ display: 'denied' })
    mockRequestPermissions.mockResolvedValue({ display: 'denied' })
    await sendDownloadCompleteNotification({ title: 'x', artist: 'y' })
    expect(mockSchedule).not.toHaveBeenCalled()
  })

  it('handles schedule errors gracefully', async () => {
    mockSchedule.mockRejectedValue(new Error('Schedule failed'))
    await expect(
      sendDownloadCompleteNotification({ title: 'x', artist: 'y' })
    ).resolves.toBeUndefined()
  })
})

describe('sendDownloadErrorNotification', () => {
  beforeEach(() => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
    mockCheckPermissions.mockResolvedValue({ display: 'granted' })
  })

  it('sends error notification with error message', async () => {
    mockSchedule.mockResolvedValue({ notifications: [{ id: 456 }] })
    await sendDownloadErrorNotification({
      title: 'Bad Song',
      artist: 'Bad Artist',
      error: 'Network error',
    })
    expect(mockSchedule).toHaveBeenCalledOnce()
    const notification = mockSchedule.mock.calls[0][0].notifications[0]
    expect(notification.title).toContain('Download failed')
    expect(notification.title).toContain('Bad Song')
    expect(notification.body).toContain('Network error')
  })

  it('sends generic message when no error provided', async () => {
    mockSchedule.mockResolvedValue({ notifications: [{ id: 789 }] })
    await sendDownloadErrorNotification({
      title: 'Bad Song',
      artist: 'Bad Artist',
    })
    const notification = mockSchedule.mock.calls[0][0].notifications[0]
    expect(notification.body).toContain('Something went wrong')
  })
})

describe('sendBatchCompleteNotification', () => {
  beforeEach(() => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
    mockCheckPermissions.mockResolvedValue({ display: 'granted' })
  })

  it('sends success message when no failures', async () => {
    mockSchedule.mockResolvedValue({ notifications: [{ id: 1 }] })
    await sendBatchCompleteNotification({ count: 5 })
    const notification = mockSchedule.mock.calls[0][0].notifications[0]
    expect(notification.title).toBe('Downloads complete')
    expect(notification.body).toContain('5 tracks downloaded')
  })

  it('includes failure count when some downloads failed', async () => {
    mockSchedule.mockResolvedValue({ notifications: [{ id: 2 }] })
    await sendBatchCompleteNotification({ count: 8, failed: 2 })
    const notification = mockSchedule.mock.calls[0][0].notifications[0]
    expect(notification.body).toContain('8 downloaded')
    expect(notification.body).toContain('2 failed')
  })
})

describe('cancelBackgroundPlaybackNotification', () => {
  beforeEach(() => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
  })

  it('cancels the playback notification with id 9999', async () => {
    mockCancel.mockResolvedValue(undefined)
    await cancelBackgroundPlaybackNotification()
    expect(mockCancel).toHaveBeenCalledOnce()
    expect(mockCancel.mock.calls[0][0].notifications[0].id).toBe(9999)
  })

  it('does nothing when not native', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false)
    await cancelBackgroundPlaybackNotification()
    expect(mockCancel).not.toHaveBeenCalled()
  })

  it('handles errors silently', async () => {
    mockCancel.mockRejectedValue(new Error('fail'))
    await expect(cancelBackgroundPlaybackNotification()).resolves.toBeUndefined()
  })
})

describe('sendDownloadProgressNotification', () => {
  beforeEach(() => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
    mockCheckPermissions.mockResolvedValue({ display: 'granted' })
  })

  it('sends progress notification with consistent id based on downloadId', async () => {
    mockSchedule.mockResolvedValue({ notifications: [{ id: 12345 }] })
    await sendDownloadProgressNotification({
      downloadId: 'dl-123',
      title: 'Test Song',
      artist: 'Test Artist',
      pct: 50,
    })
    expect(mockSchedule).toHaveBeenCalledOnce()
    const notification = mockSchedule.mock.calls[0][0].notifications[0]
    expect(notification.id).toBeGreaterThanOrEqual(10000)
    expect(notification.body).toContain('50%')
  })

  it('does nothing when not native', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false)
    await sendDownloadProgressNotification({ downloadId: 'x', title: 'x', artist: 'y', pct: 50 })
    expect(mockSchedule).not.toHaveBeenCalled()
  })
})

describe('cancelDownloadProgressNotification', () => {
  beforeEach(() => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
  })

  it('cancels the progress notification for a given downloadId', async () => {
    mockCancel.mockResolvedValue(undefined)
    await cancelDownloadProgressNotification('dl-123')
    expect(mockCancel).toHaveBeenCalledOnce()
    const call = mockCancel.mock.calls[0][0]
    expect(call.notifications[0].id).toBeGreaterThanOrEqual(10000)
  })

  it('does nothing when not native', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false)
    await cancelDownloadProgressNotification('dl-123')
    expect(mockCancel).not.toHaveBeenCalled()
  })

  it('handles errors silently', async () => {
    mockCancel.mockRejectedValue(new Error('fail'))
    await expect(cancelDownloadProgressNotification('dl-123')).resolves.toBeUndefined()
  })
})

describe('sendAppUpdateNotification', () => {
  beforeEach(() => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
    mockCheckPermissions.mockResolvedValue({ display: 'granted' })
  })

  it('sends update notification with version and channel', async () => {
    mockSchedule.mockResolvedValue({ notifications: [{ id: 5001 }] })
    await sendAppUpdateNotification({
      version: '2.0.0',
      downloadUrl: 'https://github.com/example/releases/v2.0.0',
    })
    expect(mockSchedule).toHaveBeenCalledOnce()
    const notification = mockSchedule.mock.calls[0][0].notifications[0]
    expect(notification.id).toBe(5001)
    expect(notification.title).toBe('Update available')
    expect(notification.body).toContain('2.0.0')
    expect(notification.channelId).toBe('spotdl_app_update')
    expect(notification.actionTypeId).toBe('UPDATE_ACTIONS')
  })

  it('does nothing when not native', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false)
    await sendAppUpdateNotification({ version: '2.0.0', downloadUrl: 'https://example.com' })
    expect(mockSchedule).not.toHaveBeenCalled()
  })

  it('does nothing when permission is denied', async () => {
    mockCheckPermissions.mockResolvedValue({ display: 'denied' })
    mockRequestPermissions.mockResolvedValue({ display: 'denied' })
    await sendAppUpdateNotification({ version: '2.0.0', downloadUrl: 'https://example.com' })
    expect(mockSchedule).not.toHaveBeenCalled()
  })

  it('handles errors gracefully', async () => {
    mockSchedule.mockRejectedValue(new Error('fail'))
    await expect(
      sendAppUpdateNotification({ version: '2.0.0', downloadUrl: 'https://example.com' })
    ).resolves.toBeUndefined()
  })
})

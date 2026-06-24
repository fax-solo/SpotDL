import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSchedule = vi.fn()
const mockCancel = vi.fn()
const mockRequestPermissions = vi.fn()
const mockCheckPermissions = vi.fn()

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
  },
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
  sendBatchCompleteNotification,
  sendBackgroundPlaybackNotification,
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

describe('sendBackgroundPlaybackNotification', () => {
  beforeEach(() => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
    mockCheckPermissions.mockResolvedValue({ display: 'granted' })
  })

  it('sends playback notification with fixed id 9999', async () => {
    mockSchedule.mockResolvedValue({ notifications: [{ id: 9999 }] })
    await sendBackgroundPlaybackNotification({
      title: 'Playing Now',
      artist: 'The Artist',
    })
    const notification = mockSchedule.mock.calls[0][0].notifications[0]
    expect(notification.id).toBe(9999)
    expect(notification.body).toContain('Playing')
  })

  it('handles errors silently', async () => {
    mockSchedule.mockRejectedValue(new Error('fail'))
    await expect(
      sendBackgroundPlaybackNotification({ title: 'x', artist: 'y' })
    ).resolves.toBeUndefined()
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

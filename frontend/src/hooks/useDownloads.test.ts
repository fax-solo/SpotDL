import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/api', () => ({
  downloadTrack: vi.fn(),
}))

vi.mock('../lib/capacitorBridge', () => ({
  downloadFile: vi.fn(),
}))

vi.mock('../lib/blobCache', () => ({
  storeBlob: vi.fn(),
}))

vi.mock('../lib/notifications', () => ({
  sendDownloadCompleteNotification: vi.fn().mockResolvedValue(undefined),
  sendDownloadErrorNotification: vi.fn().mockResolvedValue(undefined),
  sendDownloadProgressNotification: vi.fn().mockResolvedValue(undefined),
  cancelDownloadProgressNotification: vi.fn().mockResolvedValue(undefined),
  sendBatchCompleteNotification: vi.fn().mockResolvedValue(undefined),
  ensureNotificationPermission: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../lib/nativePlugin', () => ({
  startDownloadForeground: vi.fn(),
  updateDownloadForeground: vi.fn(),
  stopDownloadForeground: vi.fn(),
  nativeSendCompleteNotification: vi.fn(),
  nativeSendErrorNotification: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
  },
}))

vi.mock('../lib/fetchLyricsWithFallback', () => ({
  fetchLyricsWithFallback: vi.fn().mockResolvedValue({ plainLyrics: null, syncedLyrics: null }),
}))

vi.mock('../lib/lyricsSettings', () => ({
  getDownloadLyrics: vi.fn(() => false),
}))

import { useDownloads } from './useDownloads'
import { downloadTrack } from '../lib/api'
import { downloadFile } from '../lib/capacitorBridge'

const mockTrack = {
  url: 'https://open.spotify.com/track/abc123',
  title: 'Test Song',
  artist: 'Test Artist',
  album: 'Test Album',
  artwork_url: 'https://example.com/cover.jpg',
  duration: '180',
}

function resetStore() {
  useDownloads.setState({ queue: [], isProcessing: false, abortControllers: new Map() })
  vi.clearAllMocks()
}

describe('useDownloads', () => {
  beforeEach(() => {
    resetStore()
  })

  it('adds a download to the queue', () => {
    const { addDownload } = useDownloads.getState()
    addDownload(mockTrack)

    const state = useDownloads.getState()
    expect(state.queue).toHaveLength(1)
    expect(state.queue[0].track.title).toBe('Test Song')
    expect(state.queue[0].done).toBe(false)
    expect(state.queue[0].failed).toBe(false)
  })

  it('does not add duplicate downloads', () => {
    const { addDownload } = useDownloads.getState()
    addDownload(mockTrack)
    addDownload(mockTrack)

    const state = useDownloads.getState()
    expect(state.queue).toHaveLength(1)
  })

  it('adds multiple downloads', () => {
    const { addMultipleDownloads } = useDownloads.getState()
    addMultipleDownloads([
      mockTrack,
      { ...mockTrack, title: 'Second Song', url: 'https://example.com/track2' },
    ])

    const state = useDownloads.getState()
    expect(state.queue).toHaveLength(2)
  })

  it('removes a download by id', () => {
    const { addDownload, removeDownload } = useDownloads.getState()
    addDownload(mockTrack)

    const id = useDownloads.getState().queue[0].id
    removeDownload(id)

    expect(useDownloads.getState().queue).toHaveLength(0)
  })

  it('clears completed downloads', () => {
    const { addDownload } = useDownloads.getState()
    addDownload(mockTrack)

    const id = useDownloads.getState().queue[0].id
    useDownloads.setState(s => ({
      queue: s.queue.map(q => q.id === id ? { ...q, done: true, stage: 'Done', pct: 100 } : q),
    }))

    useDownloads.getState().clearCompleted()
    expect(useDownloads.getState().queue).toHaveLength(0)
  })

  it('cancels a specific download', () => {
    const { addDownload, cancelDownload } = useDownloads.getState()
    addDownload(mockTrack)

    const id = useDownloads.getState().queue[0].id
    cancelDownload(id)

    const cancelled = useDownloads.getState().queue[0]
    expect(cancelled.failed).toBe(true)
    expect(cancelled.error).toBe('Cancelled')
  })

  it('cancels all downloads', () => {
    const { addDownload, addMultipleDownloads, cancelAll } = useDownloads.getState()
    addDownload(mockTrack)
    addMultipleDownloads([
      { ...mockTrack, title: 'Second', url: 'https://example.com/2' },
    ])

    cancelAll()
    expect(useDownloads.getState().queue).toHaveLength(0)
  })

  it('updates progress for a download', () => {
    const { addDownload, _updateProgress } = useDownloads.getState()
    addDownload(mockTrack)

    const id = useDownloads.getState().queue[0].id
    _updateProgress(id, { stage: 'Downloading...', pct: 50 })

    expect(useDownloads.getState().queue[0].stage).toBe('Downloading...')
    expect(useDownloads.getState().queue[0].pct).toBe(50)
  })

  it('processes the queue when adding downloads', () => {
    const processSpy = vi.spyOn(useDownloads.getState(), '_processQueue')
    const { addDownload } = useDownloads.getState()
    addDownload(mockTrack)
    expect(processSpy).toHaveBeenCalled()
  })

  it('marks download as done on success', async () => {
    vi.mocked(downloadTrack).mockResolvedValue({
      blob: new Blob(['fake-mp3'], { type: 'audio/mpeg' }),
      filename: 'Test_Song.mp3',
      nativeFilePath: null,
    })
    vi.mocked(downloadFile).mockResolvedValue('/storage/Test_Song.mp3')

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    const { addDownload } = useDownloads.getState()
    addDownload(mockTrack)

    await vi.waitFor(() => {
      const done = useDownloads.getState().queue.find(q => q.done)
      expect(done).toBeDefined()
    }, { timeout: 5000 })

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'trackDownloaded' }),
    )
  })
})

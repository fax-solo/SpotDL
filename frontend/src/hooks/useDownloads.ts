import { create } from 'zustand'
import { downloadTrack } from '../lib/api'
import type { TrackMeta } from '../lib/api'
import { downloadFile } from '../lib/capacitorBridge'
import { storeBlob } from '../lib/blobCache'
import type { HistoryEntry } from './useHistory'
import { sendDownloadCompleteNotification, sendDownloadErrorNotification, sendDownloadProgressNotification, sendBatchCompleteNotification, ensureNotificationPermission } from '../lib/notifications'
import { startDownloadForeground, updateDownloadForeground, stopDownloadForeground } from '../lib/nativePlugin'
import { Capacitor } from '@capacitor/core'
import { fetchLyricsWithFallback } from '../lib/fetchLyricsWithFallback'
import { getDownloadLyrics } from '../lib/lyricsSettings'
import { logDownload } from '../lib/auth'

let processing = false

const CONCURRENT_DOWNLOADS = Math.min(Math.max(parseInt(import.meta.env.VITE_CONCURRENT_DOWNLOADS || '3', 10), 1), 10)

interface RateLimitState {
  consecutiveErrors: number
  backoffUntil: number
}

const rateLimit: RateLimitState = { consecutiveErrors: 0, backoffUntil: 0 }

function getBackoffDelay(): number {
  if (Date.now() < rateLimit.backoffUntil) {
    return rateLimit.backoffUntil - Date.now()
  }
  return 0
}

function recordError() {
  rateLimit.consecutiveErrors++
  const delay = Math.min(1000 * Math.pow(2, rateLimit.consecutiveErrors), 30000)
  rateLimit.backoffUntil = Date.now() + delay
}

function recordSuccess() {
  rateLimit.consecutiveErrors = Math.max(0, rateLimit.consecutiveErrors - 1)
}

export interface DownloadProgress {
  id: string
  track: TrackMeta
  stage: string
  pct: number | null
  done: boolean
  failed: boolean
  error?: string
}

interface DownloadsState {
  queue: DownloadProgress[]
  isProcessing: boolean
  abortControllers: Map<string, AbortController>
  addDownload: (track: TrackMeta) => void
  addMultipleDownloads: (tracks: TrackMeta[]) => void
  removeDownload: (id: string) => void
  retryTrack: (id: string) => void
  clearCompleted: () => void
  cancelAll: () => void
  cancelDownload: (id: string) => void
  _processQueue: () => void
  _updateProgress: (id: string, updates: Partial<DownloadProgress>) => void
}

const QUEUE_STORAGE_KEY = 'sinc-download-queue'

function loadQueue(): DownloadProgress[] {
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as DownloadProgress[]
    return parsed.map(q => ({
      ...q,
      stage: q.done ? 'Done' : (q.failed ? 'Restored — tap retry' : q.stage),
      error: q.done ? undefined : (q.failed ? 'Session restored, tap to retry' : q.error),
    }))
  } catch {
    return []
  }
}

function saveQueue(queue: DownloadProgress[]) {
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue))
  } catch { /* quota exceeded — silently ignore */ }
}

export const useDownloads = create<DownloadsState>((set, get) => ({
  queue: loadQueue(),
  isProcessing: false,
  abortControllers: new Map(),

  addDownload: (track: TrackMeta) => {
    // Deduplicate against ALL items (including restored/failed)
    const existing = get().queue.find(q =>
      !q.done && (q.track.url === track.url || (q.track.title === track.title && q.track.artist === track.artist))
    )
    if (existing) {
      if (existing.failed) {
        // Replace restored/failed entry with fresh download
        get().removeDownload(existing.id)
      } else {
        return
      }
    }

    const id = `dl-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    set((state: DownloadsState) => {
      const queue = [...state.queue, { id, track, stage: 'Waiting...', pct: null, done: false, failed: false }]
      saveQueue(queue)
      return { queue }
    })
    get()._processQueue()
  },

  addMultipleDownloads: (tracks: TrackMeta[]) => {
    const now = Date.now()
    const newItems: DownloadProgress[] = tracks.map((track, i) => ({
      id: `dl-${now}-${i}-${Math.random().toString(36).substring(2, 7)}`,
      track,
      stage: 'Waiting...',
      pct: null,
      done: false,
      failed: false,
    }))
    set((state: DownloadsState) => {
      const queue = [...state.queue, ...newItems]
      saveQueue(queue)
      return { queue }
    })
    get()._processQueue()
  },

  removeDownload: (id: string) => {
    set((state: DownloadsState) => {
      const queue = state.queue.filter((q) => q.id !== id)
      saveQueue(queue)
      return { queue }
    })
  },

  retryTrack: (id: string) => {
    const state = get()
    const item = state.queue.find(q => q.id === id)
    if (item && item.failed) {
      state.addDownload(item.track)
    }
  },

  clearCompleted: () => {
    set((state: DownloadsState) => {
      const queue = state.queue.filter((q) => !q.done && !q.failed)
      saveQueue(queue)
      return { queue }
    })
  },

  cancelAll: () => {
    const controllers = get().abortControllers
    controllers.forEach(c => c.abort())
    set({ queue: [], abortControllers: new Map(), isProcessing: false })
    saveQueue([])
    processing = false
    stopDownloadForeground()
  },

  cancelDownload: (id: string) => {
    const controllers = get().abortControllers
    controllers.get(id)?.abort()
    controllers.delete(id)
    set((state: DownloadsState) => ({
      queue: state.queue.map(q => q.id === id ? { ...q, stage: 'Cancelled', failed: true, error: 'Cancelled' } : q),
      abortControllers: new Map(controllers),
    }))
  },

  _updateProgress: (id: string, updates: Partial<DownloadProgress>) => {
    set((state: DownloadsState) => {
      const queue = state.queue.map((q) => (q.id === id ? { ...q, ...updates } : q))
      saveQueue(queue)
      return { queue }
    })
  },

  _processQueue: () => {
    if (processing) return
    processing = true

    const run = async () => {
      let taskId: string | undefined

      try {
        if (Capacitor.isNativePlatform()) {
          try {
            const { BackgroundTask } = await import('@capawesome/capacitor-background-task')
            taskId = await BackgroundTask.beforeExit(async () => {
              const state = get()
              const updated = state.queue.map(q =>
                !q.done && !q.failed
                  ? { ...q, failed: true, stage: 'Interrupted', error: 'App was closed' }
                  : q
              )
              saveQueue(updated)
            })
          } catch {}
          await ensureNotificationPermission()
          startDownloadForeground()
        }

        while (true) {
          const backoff = getBackoffDelay()
          if (backoff > 0) {
            await new Promise(r => setTimeout(r, backoff))
          }

          const state = get()
          const pending = state.queue.filter((q) => !q.done && !q.failed && q.stage === 'Waiting...')
          if (pending.length === 0) break

          const batch = pending.slice(0, CONCURRENT_DOWNLOADS)
          batch.forEach((item) => get()._updateProgress(item.id, { stage: 'Starting...' }))

          const controllers = get().abortControllers
          await Promise.all(
            batch.map(async (item) => {
              const controller = new AbortController()
              controllers.set(item.id, controller)
              set({ abortControllers: new Map(controllers) })

                try {
                  let lastNotifTime = 0
                  let lastNotifPct = -1
                  const result = await downloadTrack(item.track, (stage, pct) => {
                    if (get().queue.some(q => q.id === item.id)) {
                      const actualPct = pct !== undefined ? Math.round(pct * 100) / 100 : null
                      get()._updateProgress(item.id, { stage, pct: actualPct })
                      const now = Date.now()
                      const pctInt = actualPct !== null ? Math.round(actualPct) : -1
                      if (pctInt === 100 || (now - lastNotifTime >= 400 && pctInt !== lastNotifPct)) {
                        lastNotifTime = now
                        lastNotifPct = pctInt
                        updateDownloadForeground(
                          `${item.track.artist} - ${item.track.title}`,
                          get().queue.filter(q => !q.done && !q.failed).length,
                          actualPct ?? undefined,
                          stage,
                        )
                        if (actualPct !== null && actualPct > 0 && actualPct < 100) {
                          sendDownloadProgressNotification({
                            downloadId: item.id,
                            title: item.track.title,
                            artist: item.track.artist,
                            pct: actualPct,
                          })
                        }
                      }
                    }
                  }, controller.signal)

                recordSuccess()

                let filePath: string | null = result.nativeFilePath ?? null
                if (!filePath && result.blob.size > 0) {
                  filePath = await downloadFile(result.blob, result.filename)
                  if (!filePath) {
                    filePath = await storeBlob(result.filename, result.blob)
                  }
                }

                controllers.delete(item.id)
                set({ abortControllers: new Map(controllers) })
                get()._updateProgress(item.id, { stage: 'Done', pct: 100, done: true })

                logDownload(item.track.title, item.track.artist).catch(() => {})

                let plainLyrics: string | null = null
                let syncedLyrics: string | null = null
                if (getDownloadLyrics()) {
                  try {
                    const lyrics = await fetchLyricsWithFallback(
                      item.track.title,
                      item.track.artist,
                      item.track.album,
                      item.track.duration_ms ? item.track.duration_ms / 1000 : undefined,
                      AbortSignal.timeout(10000),
                    )
                    plainLyrics = lyrics.plainLyrics
                    syncedLyrics = lyrics.syncedLyrics
                  } catch {
                    // lyrics are best-effort
                  }
                }

                sendDownloadCompleteNotification({
                  title: item.track.title,
                  artist: item.track.artist,
                  filePath,
                }).catch(() => {})

                window.dispatchEvent(
                  new CustomEvent('trackDownloaded', {
                    detail: {
                      title: item.track.title,
                      artist: item.track.artist,
                      album: item.track.album,
                      artworkUrl: item.track.artwork_url,
                      filePath,
                      plainLyrics,
                      syncedLyrics,
                    } satisfies Omit<HistoryEntry, 'id' | 'timestamp'>,
                  }),
                )
              } catch (err) {
                recordError()
                console.error('[downloads] download failed:', err)
                controllers.delete(item.id)
                set({ abortControllers: new Map(controllers) })
                const message = err instanceof Error ? err.message : 'Unknown error'
                get()._updateProgress(item.id, {
                  stage: 'Failed',
                  failed: true,
                  error: message,
                })
                sendDownloadErrorNotification({
                  title: item.track.title,
                  artist: item.track.artist,
                  error: message,
                }).catch(() => {})
              }
            }),
          )
        }
      } finally {
        processing = false

        const finalState = get()
        const completed = finalState.queue.filter(q => q.done)
        const failed = finalState.queue.filter(q => q.failed)
        if (completed.length + failed.length >= finalState.queue.filter(q => q.done || q.failed).length) {
          const totalDone = completed.length
          const totalFailed = failed.length
          if (totalDone > 0) {
            sendBatchCompleteNotification({ count: totalDone, failed: totalFailed }).catch(() => {})
          }
          window.dispatchEvent(
            new CustomEvent('downloadsComplete', {
              detail: { done: totalDone, failed: totalFailed, total: totalDone + totalFailed },
            }),
          )
        }

        stopDownloadForeground()

        if (taskId) {
          try {
            const { BackgroundTask } = await import('@capawesome/capacitor-background-task')
            BackgroundTask.finish({ taskId })
          } catch {}
        }
      }
    }

    run().catch(() => { processing = false })
  },
}))

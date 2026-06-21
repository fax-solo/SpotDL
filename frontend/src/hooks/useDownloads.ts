import { create } from 'zustand'
import { downloadTrack } from '../lib/api'
import type { TrackMeta } from '../lib/api'
import { downloadFile } from '../lib/capacitorBridge'
import { storeBlob } from '../lib/blobCache'
import type { HistoryEntry } from './useHistory'
import { sendDownloadCompleteNotification, sendDownloadErrorNotification, sendBatchCompleteNotification } from '../lib/notifications'
import { Capacitor } from '@capacitor/core'

let processing = false

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
  clearCompleted: () => void
  cancelAll: () => void
  cancelDownload: (id: string) => void
  _processQueue: () => void
  _updateProgress: (id: string, updates: Partial<DownloadProgress>) => void
}

export const useDownloads = create<DownloadsState>((set, get) => ({
  queue: [],
  isProcessing: false,
  abortControllers: new Map(),

  addDownload: (track: TrackMeta) => {
    const exists = get().queue.some(q =>
      !q.done && !q.failed && (q.track.url === track.url || (q.track.title === track.title && q.track.artist === track.artist))
    )
    if (exists) return

    const id = `dl-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    set((state: DownloadsState) => ({
      queue: [...state.queue, { id, track, stage: 'Waiting...', pct: null, done: false, failed: false }],
    }))
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
    set((state: DownloadsState) => ({ queue: [...state.queue, ...newItems] }))
    get()._processQueue()
  },

  removeDownload: (id: string) => {
    set((state: DownloadsState) => ({ queue: state.queue.filter((q) => q.id !== id) }))
  },

  clearCompleted: () => {
    set((state: DownloadsState) => ({ queue: state.queue.filter((q) => !q.done && !q.failed) }))
  },

  cancelAll: () => {
    const controllers = get().abortControllers
    controllers.forEach(c => c.abort())
    set({ queue: [], abortControllers: new Map(), isProcessing: false })
    processing = false
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
    set((state: DownloadsState) => ({
      queue: state.queue.map((q) => (q.id === id ? { ...q, ...updates } : q)),
    }))
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
            taskId = await BackgroundTask.beforeExit(async () => {})
          } catch {}
        }

        while (true) {
          const state = get()
          const pending = state.queue.filter((q) => !q.done && !q.failed && q.stage === 'Waiting...')
          if (pending.length === 0) break

          const batch = pending.slice(0, 3)
          batch.forEach((item) => get()._updateProgress(item.id, { stage: 'Starting...' }))

              const controllers = get().abortControllers
              await Promise.all(
                batch.map(async (item) => {
                  const controller = new AbortController()
                  controllers.set(item.id, controller)
                  set({ abortControllers: new Map(controllers) })

                  try {
                    const result = await downloadTrack(item.track, (stage, pct) => {
                      if (get().queue.some(q => q.id === item.id)) {
                        get()._updateProgress(item.id, { stage, pct: pct ?? null })
                      }
                    }, controller.signal)

                    let filePath: string | null = result.nativeFilePath ?? null
                    if (!filePath && result.blob.size > 0) {
                      filePath = await downloadFile(result.blob, result.filename)
                      if (!filePath) {
                        filePath = storeBlob(result.filename, result.blob)
                      }
                    }

                    controllers.delete(item.id)
                    set({ abortControllers: new Map(controllers) })
                get()._updateProgress(item.id, { stage: 'Done', pct: 100, done: true })

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
                    } satisfies Omit<HistoryEntry, 'id' | 'timestamp'>,
                  }),
                )
              } catch (err) {
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
        }

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

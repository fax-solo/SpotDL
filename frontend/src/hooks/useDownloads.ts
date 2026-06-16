import { create } from 'zustand'
import { downloadTrack } from '../lib/api'
import type { TrackMeta } from '../lib/api'
import { downloadFile } from '../lib/capacitorBridge'
import type { HistoryEntry } from './useHistory'
import { Capacitor } from '@capacitor/core'

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
  addDownload: (track: TrackMeta) => void
  addMultipleDownloads: (tracks: TrackMeta[]) => void
  removeDownload: (id: string) => void
  clearCompleted: () => void
  _processQueue: () => void
  _updateProgress: (id: string, updates: Partial<DownloadProgress>) => void
}

export const useDownloads = create<DownloadsState>((set, get) => ({
  queue: [],
  isProcessing: false,

  addDownload: (track: TrackMeta) => {
    const id = `dl-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    set((state: DownloadsState) => ({
      queue: [...state.queue, { id, track, stage: 'Waiting...', pct: null, done: false, failed: false }],
    }))
    // Fire-and-forget — intentionally not awaited
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

  _updateProgress: (id: string, updates: Partial<DownloadProgress>) => {
    set((state: DownloadsState) => ({
      queue: state.queue.map((q) => (q.id === id ? { ...q, ...updates } : q)),
    }))
  },

  _processQueue: () => {
    // Run the async work in a plain async function so we never block the Zustand setter
    const run = async () => {
      const state = get()
      if (state.isProcessing) return
      set({ isProcessing: true })

      // Tell Android to keep the app awake during the download
      let taskId: string | undefined
      if (Capacitor.isNativePlatform()) {
        try {
          const { BackgroundTask } = await import('@capawesome/capacitor-background-task')
          // beforeExit returns a taskId string directly (not an object)
          taskId = await BackgroundTask.beforeExit(async () => {/* keep alive */})
        } catch {
          // BackgroundTask not available in this environment — ignore
        }
      }

      try {
        while (true) {
          const pending = get().queue.filter((q) => !q.done && !q.failed && q.stage === 'Waiting...')
          if (pending.length === 0) break

          // Process up to 3 at a time
          const batch = pending.slice(0, 3)
          batch.forEach((item) => get()._updateProgress(item.id, { stage: 'Starting...' }))

          await Promise.all(
            batch.map(async (item) => {
              try {
                const result = await downloadTrack(item.track, (stage, pct) => {
                  get()._updateProgress(item.id, { stage, pct: pct ?? null })
                })

                let filePath: string | null = null
                if (result.blob.size > 0) {
                  filePath = await downloadFile(result.blob, result.filename)
                }

                get()._updateProgress(item.id, { stage: 'Done', pct: 100, done: true })

                // Notify the rest of the app that a track was downloaded
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
                get()._updateProgress(item.id, {
                  stage: 'Failed',
                  failed: true,
                  error: err instanceof Error ? err.message : 'Unknown error',
                })
              }
            }),
          )
        }
      } finally {
        set({ isProcessing: false })
        if (Capacitor.isNativePlatform() && taskId) {
          try {
            const { BackgroundTask } = await import('@capawesome/capacitor-background-task')
            BackgroundTask.finish({ taskId })
          } catch {/* ignore */}
        }
      }
    }

    // Run without returning the promise (fire and forget)
    run().catch(console.error)
  },
}))

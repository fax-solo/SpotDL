import { create } from 'zustand'
import { downloadTrack, fetchLyricsForTrack } from '../lib/api'
import type { TrackMeta } from '../lib/api'
import { downloadFile } from '../lib/capacitorBridge'
import type { HistoryEntry } from './useHistory'
import { Capacitor } from '@capacitor/core'
import { getDownloadLyrics } from '../lib/lyricsSettings'

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
    // Prevent adding the same track twice while it's still pending or active
    const exists = get().queue.some(q =>
      !q.done && !q.failed && (q.track.url === track.url || (q.track.title === track.title && q.track.artist === track.artist))
    )
    if (exists) return

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
    // Module-level mutex prevents parallel runs (atomic check-and-set)
    if (processing) return
    processing = true

    const run = async () => {
      let taskId: string | undefined

      try {
        // Tell Android to keep the app awake during the download
        if (Capacitor.isNativePlatform()) {
          try {
            const { BackgroundTask } = await import('@capawesome/capacitor-background-task')
            taskId = await BackgroundTask.beforeExit(async () => {/* keep alive */})
          } catch {
            // BackgroundTask not available in this environment — ignore
          }
        }

        while (true) {
          const state = get()
          const pending = state.queue.filter((q) => !q.done && !q.failed && q.stage === 'Waiting...')
          if (pending.length === 0) break

          // Process up to 3 at a time
          const batch = pending.slice(0, 3)
          batch.forEach((item) => get()._updateProgress(item.id, { stage: 'Starting...' }))

          await Promise.all(
            batch.map(async (item) => {
              try {
                const result = await downloadTrack(item.track, (stage, pct) => {
                  // Stale-closure guard: verify item still exists before updating
                  if (get().queue.some(q => q.id === item.id)) {
                    get()._updateProgress(item.id, { stage, pct: pct ?? null })
                  }
                })

                // Save file to disk — result.nativeFilePath is set when native
                // SpotDL plugin handled the download directly
                let filePath: string | null = result.nativeFilePath ?? null
                if (!filePath && result.blob.size > 0) {
                  filePath = await downloadFile(result.blob, result.filename)
                }

                // Dispatch "Done" immediately so the track is playable
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

                // Fetch lyrics in the background — never blocks "Done" or the event
                if (getDownloadLyrics()) {
                  fetchLyricsForTrack(
                    item.track.title,
                    item.track.artist,
                    item.track.album,
                    undefined,
                  ).then(lyrics => {
                    if (lyrics.plainLyrics || lyrics.syncedLyrics) {
                      window.dispatchEvent(
                        new CustomEvent('lyricsFetched', {
                          detail: {
                            title: item.track.title,
                            artist: item.track.artist,
                            album: item.track.album,
                            plainLyrics: lyrics.plainLyrics,
                            syncedLyrics: lyrics.syncedLyrics,
                          },
                        }),
                      )
                    }
                  }).catch(() => {
                    // Lyrics are best-effort — ignore failures
                  })
                }
              } catch (err) {
                console.error('[downloads] download failed:', err)
                const message = err instanceof Error ? err.message : 'Unknown error'
                get()._updateProgress(item.id, {
                  stage: 'Failed',
                  failed: true,
                  error: message,
                })
              }
            }),
          )
        }
      } finally {
        processing = false
        if (taskId) {
          try {
            const { BackgroundTask } = await import('@capawesome/capacitor-background-task')
            BackgroundTask.finish({ taskId })
          } catch {/* ignore */}
        }
      }
    }

    run().catch(() => { processing = false })
  },
}))

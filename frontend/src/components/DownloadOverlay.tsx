import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2 } from 'lucide-react'

interface DownloadItem {
  id: string
  title: string
  stage: string
  pct: number | null
  done: boolean
  failed: boolean
}

interface DownloadOverlayContextValue {
  activeDownloads: DownloadItem[]
  addDownload: (id: string, title: string) => void
  updateDownload: (id: string, updates: Partial<DownloadItem>) => void
  removeDownload: (id: string) => void
}

const DownloadOverlayContext = createContext<DownloadOverlayContextValue | null>(null)

export function useDownloadOverlay() {
  const ctx = useContext(DownloadOverlayContext)
  if (!ctx) throw new Error('useDownloadOverlay must be used within DownloadOverlayProvider')
  return ctx
}

let downloadIdCounter = 0

export function DownloadOverlayProvider({ children }: { children: ReactNode }) {
  const [downloads, setDownloads] = useState<DownloadItem[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const addDownload = useCallback((id: string, title: string) => {
    setDownloads(prev => {
      if (prev.some(d => d.id === id)) return prev
      return [...prev, { id, title, stage: 'Starting…', pct: null, done: false, failed: false }]
    })
  }, [])

  const updateDownload = useCallback((id: string, updates: Partial<DownloadItem>) => {
    setDownloads(prev =>
      prev.map(d => d.id === id ? { ...d, ...updates } : d)
    )
  }, [])

  const removeDownload = useCallback((id: string) => {
    const timer = timers.current.get(id)
    if (timer) clearTimeout(timer)
    timers.current.delete(id)
    setDownloads(prev => prev.filter(d => d.id !== id))
  }, [])

  const activeCount = downloads.filter(d => !d.done && !d.failed).length
  const totalCount = downloads.length
  const completedCount = downloads.filter(d => d.done).length
  const overallPct = totalCount > 0
    ? Math.round(downloads.reduce((sum, d) => {
        if (d.done) return sum + 100
        if (d.failed) return sum + 0
        if (d.stage.includes('Searching')) return sum + 5
        if (d.stage.includes('Downloading')) return sum + 10 + (d.pct ?? 0) * 0.3
        if (d.stage.includes('Converting')) return sum + 40 + (d.pct ?? 0) * 0.6
        return sum + 0
      }, 0) / totalCount)
    : 0

  const value: DownloadOverlayContextValue = { activeDownloads: downloads, addDownload, updateDownload, removeDownload }

  return (
    <DownloadOverlayContext.Provider value={value}>
      {children}

      <AnimatePresence>
        {activeCount > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 35 }}
            className="fixed bottom-20 left-3 right-3 z-[90] mx-auto max-w-xl"
          >
            <div className="rounded-xl bg-white/95 dark:bg-dark-surface/95 backdrop-blur-xl border border-light-border/60 dark:border-dark-border/60 shadow-lg overflow-hidden">
              <div className="px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Loader2 className="w-4 h-4 text-accent animate-spin flex-shrink-0" />
                    <span className="text-sm font-medium text-light-text dark:text-dark-text truncate">
                      {activeCount === 1
                        ? downloads.find(d => !d.done && !d.failed)?.title || 'Downloading…'
                        : `Downloading ${completedCount + 1}/${totalCount}…`}
                    </span>
                  </div>
                  <span className="text-xs text-light-muted dark:text-dark-muted tabular-nums flex-shrink-0 ml-2">
                    {overallPct}%
                  </span>
                </div>
                <div className="h-1.5 bg-gray-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-accent rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${overallPct}%` }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                  />
                </div>
                {activeCount > 1 && (
                  <div className="flex items-center gap-1 mt-1.5">
                    {downloads.slice(0, 5).map(d => (
                      <div
                        key={d.id}
                        className={`w-1.5 h-1.5 rounded-full ${
                          d.done ? 'bg-green-500'
                          : d.failed ? 'bg-red-500'
                          : 'bg-accent/50'
                        }`}
                      />
                    ))}
                    {downloads.length > 5 && (
                      <span className="text-[9px] text-light-muted dark:text-dark-muted ml-0.5">
                        +{downloads.length - 5}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </DownloadOverlayContext.Provider>
  )
}

export function useDownloadProgress() {
  const { addDownload, updateDownload, removeDownload } = useDownloadOverlay()

  const trackDownload = useCallback((title: string) => {
    const id = `dl-${++downloadIdCounter}`
    addDownload(id, title)

    const update = (stage: string, pct?: number) => {
      updateDownload(id, { stage, pct: pct ?? null })
    }

    const done = () => {
      updateDownload(id, { stage: 'Done', pct: null, done: true, failed: false })
      setTimeout(() => removeDownload(id), 2000)
    }

    const fail = () => {
      updateDownload(id, { stage: 'Failed', pct: null, done: false, failed: true })
      setTimeout(() => removeDownload(id), 3000)
    }

    return { id, update, done, fail }
  }, [addDownload, updateDownload, removeDownload])

  return { trackDownload }
}

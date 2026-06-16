import { type ReactNode, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { useDownloads } from '../hooks/useDownloads'

export function DownloadOverlayProvider({ children }: { children: ReactNode }) {
  const { queue, clearCompleted } = useDownloads()

  // Auto-clear completed items after 3 seconds
  useEffect(() => {
    const completed = queue.filter(d => d.done || d.failed)
    if (completed.length > 0) {
      const timer = setTimeout(() => {
        clearCompleted()
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [queue, clearCompleted])

  const activeCount = queue.filter(d => !d.done && !d.failed).length
  const totalCount = queue.length
  const completedCount = queue.filter(d => d.done).length

  const overallPct = totalCount > 0
    ? Math.round(queue.reduce((sum, d) => {
        if (d.done) return sum + 100
        if (d.failed) return sum + 0
        if (d.stage.includes('Searching')) return sum + 5
        if (d.stage.includes('Downloading')) return sum + 10 + (d.pct ?? 0) * 0.3
        if (d.stage.includes('Converting')) return sum + 40 + (d.pct ?? 0) * 0.6
        return sum + 0
      }, 0) / totalCount)
    : 0

  return (
    <>
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
                        ? queue.find(d => !d.done && !d.failed)?.track.title || 'Downloading…'
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
                    {queue.slice(0, 5).map(d => (
                      <div
                        key={d.id}
                        className={`w-1.5 h-1.5 rounded-full ${
                          d.done ? 'bg-green-500'
                          : d.failed ? 'bg-red-500'
                          : 'bg-accent/50'
                        }`}
                      />
                    ))}
                    {queue.length > 5 && (
                      <span className="text-[9px] text-light-muted dark:text-dark-muted ml-0.5">
                        +{queue.length - 5}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

// Keep a mock hook for backward compatibility if needed, though most places will now use useDownloads
export function useDownloadProgress() {
  const trackDownload = (title: string) => {
    // This is essentially a no-op dummy now for HistoryPage's re-download since HistoryPage should be refactored
    return {
      id: title,
      update: () => {},
      done: () => {},
      fail: () => {}
    }
  }

  return { trackDownload }
}

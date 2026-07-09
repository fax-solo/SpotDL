import { type ReactNode, useEffect } from 'react'

import { Loader2, X } from 'lucide-react'
import { useDownloads } from '../hooks/useDownloads'

/**
 * Thin provider that does NOT subscribe to download state,
 * preventing full-tree re-renders on every progress tick.
 */
export function DownloadOverlayProvider({ children }: { children: ReactNode }) {
  return <>{children}</>
}

/** 
 * Standalone overlay banner that subscribes to useDownloads independently.
 * Render this as a sibling (not wrapper) inside AppContent.
 */
export function DownloadOverlay() {
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

  const { cancelAll } = useDownloads()

  const overallPct = totalCount > 0
    ? Math.round(queue.reduce((sum, d) => {
        if (d.done) return sum + 100
        if (d.failed) return sum + 0
        if (d.stage.includes('Searching')) return sum + 5
        if (d.stage.includes('Downloading')) return sum + 5 + (d.pct ?? 0) * 0.35
        if (d.stage.includes('Converting')) return sum + 40 + (d.pct ?? 0) * 0.60
        return sum + 0
      }, 0) / totalCount)
    : 0

  const anyIndeterminate = queue.some(d => !d.done && !d.failed && d.pct === null)

  return (
    <>
      {activeCount > 0 && (
        <div className="fixed bottom-32 left-3 right-3 z-[90] mx-auto max-w-xl pb-[env(safe-area-inset-bottom,0px)]">
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
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  <button
                    onClick={cancelAll}
                    className="w-6 h-6 rounded-full bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center transition-colors cursor-pointer"
                    title="Cancel all downloads"
                  >
                    <X className="w-3.5 h-3.5 text-red-400" />
                  </button>
                  <span className="text-xs text-light-muted dark:text-dark-muted tabular-nums">
                    {overallPct}%
                  </span>
                </div>
              </div>
              <div className="h-1.5 bg-gray-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                <div
                  ref={el => { if (el) el.style.width = `${overallPct}%` }}
                  className={`h-full rounded-full transition-all duration-500 ${
                    anyIndeterminate
                      ? 'bg-accent animate-pulse'
                      : 'bg-accent'
                  }`}
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
        </div>
      )}
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

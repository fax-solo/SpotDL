import { CheckCircle2, XCircle, Trash2, X } from 'lucide-react'
import { useDownloads, type DownloadProgress } from '../hooks/useDownloads'
import { useToast } from './Toast'

function visualPct(progress: DownloadProgress): number {
  if (progress.done) return 100
  if (progress.failed) return 0
  if (progress.stage.includes('Searching')) return 8
  if (progress.stage.includes('Downloading')) return 15 + (progress.pct ?? 0) * 0.45
  if (progress.stage.includes('Converting')) return 60 + (progress.pct ?? 0) * 0.4
  return 5
}

export function DownloadQueue() {
  const { queue, removeDownload, clearCompleted, cancelDownload, cancelAll } = useDownloads()
  const { toast } = useToast()

  const active = queue.filter(q => !q.done && !q.failed)
  const done = queue.filter(q => q.done)
  const failed = queue.filter(q => q.failed)

  if (queue.length === 0) return null

  return (
    <div className="bg-white dark:bg-dark-surface rounded-2xl p-4 shadow-sm border border-light-border/40 dark:border-dark-border/30">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-light-muted dark:text-dark-muted uppercase tracking-wider">
          Downloads
          <span className="ml-1.5 text-accent font-bold">
            ({active.length} active, {failed.length} failed, {done.length} done)
          </span>
        </h2>
        <div className="flex items-center gap-2">
          {active.length > 0 && (
            <button
              onClick={cancelAll}
              className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 cursor-pointer"
            >
              Cancel all
            </button>
          )}
          {(done.length > 0 || failed.length > 0) && (
            <button
              onClick={() => { clearCompleted(); toast('Cleared completed downloads', 'success') }}
              className="text-xs text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              Clear completed
            </button>
          )}
        </div>
      </div>

      <div className="divide-y divide-light-border/30 dark:divide-dark-border/30 max-h-[400px] overflow-y-auto overscroll-contain">
        {queue.map(item => {
          const pct = visualPct(item)

          return (
            <div key={item.id} className="flex flex-col py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-light-text dark:text-dark-text truncate">
                    {item.track.title}
                  </p>
                  <p className="text-xs text-light-muted dark:text-dark-muted truncate">
                    {item.track.artist}
                  </p>
                </div>

                <div className="flex-shrink-0 flex items-center gap-1.5">
                  {item.failed ? (
                    <>
                      <button
                        onClick={() => {
                          removeDownload(item.id)
                          toast(`Removed ${item.track.title}`, 'success')
                        }}
                        className="w-7 h-7 rounded-lg bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center transition-colors cursor-pointer"
                        title="Remove"
                      >
                        <XCircle className="w-4 h-4 text-red-400" />
                      </button>
                    </>
                  ) : item.done ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  ) : (
                    <button
                      onClick={() => cancelDownload(item.id)}
                      className="w-7 h-7 rounded-lg bg-zinc-500/10 hover:bg-red-500/20 flex items-center justify-center transition-colors cursor-pointer"
                      title="Cancel download"
                    >
                      <X className="w-4 h-4 text-light-muted dark:text-dark-muted hover:text-red-400" />
                    </button>
                  )}
                </div>
              </div>

              {!item.done && !item.failed && item.stage && (
                <p className="text-[11px] text-accent mt-0.5 truncate">
                  {item.stage}{item.pct !== null ? ` ${item.pct}%` : ''}
                </p>
              )}

              {item.failed && item.error && (
                <p className="text-[11px] text-red-400 mt-0.5 truncate" title={item.error}>
                  {item.error}
                </p>
              )}

              {/* Progress bar */}
              {!item.done && !item.failed && (
                <div className="mt-1.5">
                  <div className="h-1 bg-light-border dark:bg-dark-border rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

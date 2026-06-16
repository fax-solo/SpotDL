import { Clock, Trash2, Download, ChevronDown, ChevronUp, Play } from 'lucide-react'
import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { HistoryEntry } from '../hooks/useHistory'
import { ArtworkImage } from './ArtworkImage'

interface HistoryProps {
  entries: HistoryEntry[]
  onClear: () => void
  onRemove: (id: string) => void
  onRedownload: (entry: HistoryEntry) => void
  onPlay?: (entry: HistoryEntry) => void
}

const itemVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.03, type: 'spring' as const, stiffness: 350, damping: 30 },
  }),
  exit: {
    opacity: 0,
    x: 20,
    transition: { duration: 0.15 } as const,
  },
}

function formatDate(ts: number): string {
  const now = Date.now()
  const diff = now - ts
  if (diff < 60_000) return 'Just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function SwipeableRow({
  entry,
  index,
  onRemove,
  onRedownload,
  onPlay,
}: {
  entry: HistoryEntry
  index: number
  onRemove: (id: string) => void
  onRedownload: (entry: HistoryEntry) => void
  onPlay?: (entry: HistoryEntry) => void
}) {
  const startX = useRef(0)
  const [offsetX, setOffsetX] = useState(0)
  const [showDelete, setShowDelete] = useState(false)
  const threshold = 80

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const diff = startX.current - e.touches[0].clientX
    if (diff > 0) setOffsetX(Math.min(diff, 120))
    else setOffsetX(Math.max(diff, -20))
  }, [])

  const handleTouchEnd = useCallback(() => {
    if (offsetX > threshold) {
      setShowDelete(true)
      setOffsetX(80)
    } else {
      setShowDelete(false)
      setOffsetX(0)
    }
  }, [offsetX])

  return (
    <div className="relative overflow-hidden">
      <motion.div
        className="absolute inset-y-0 right-0 flex items-center justify-end bg-red-500/10 dark:bg-red-500/15"
        style={{ width: 80 }}
        animate={{ opacity: showDelete ? 1 : 0 }}
      >
        <button
          onClick={() => onRemove(entry.id)}
          className="px-4 py-2 text-red-500 focus-visible:ring-2 focus-visible:ring-red-400 cursor-pointer"
          aria-label="Delete entry"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </motion.div>
      <motion.div
        layout
        custom={index}
        variants={itemVariants}
        initial="hidden"
        animate={{ x: offsetX }}
        exit="exit"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-dark-bg relative z-10 transition-colors select-none"
        style={{ touchAction: 'pan-x' }}
      >
        <ArtworkImage
          src={entry.artworkUrl}
          alt={entry.album}
          className="w-11 h-11 rounded-lg object-cover flex-shrink-0 shadow-sm"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-light-text dark:text-dark-text truncate flex-1">
              {entry.title}
            </p>
            <span className="text-[10px] text-light-muted dark:text-dark-muted flex-shrink-0 tabular-nums">
              {formatDate(entry.timestamp)}
            </span>
          </div>
          <p className="text-xs text-light-muted dark:text-dark-muted truncate mt-0.5">
            {entry.artist}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {onPlay && (
            <button
              onClick={() => onPlay(entry)}
              className="p-2 rounded-lg text-green-500 hover:bg-green-500/10 focus-visible:ring-2 focus-visible:ring-green-400/40 transition-colors cursor-pointer"
              aria-label={`Play ${entry.title}`}
            >
              <Play className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => onRedownload(entry)}
            className="p-2 rounded-lg text-accent hover:bg-accent/10 focus-visible:ring-2 focus-visible:ring-accent/40 transition-colors cursor-pointer"
            aria-label={`Re-download ${entry.title}`}
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={() => onRemove(entry.id)}
            className="p-2 rounded-lg text-light-muted dark:text-dark-muted hover:bg-gray-100 dark:hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-red-400 transition-colors cursor-pointer"
            aria-label="Remove entry"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </div>
  )
}

export function History({ entries, onClear, onRemove, onRedownload, onPlay }: HistoryProps) {
  const [open, setOpen] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  if (entries.length === 0) return null

  const recentCount = entries.filter(e => Date.now() - e.timestamp < 86_400_000).length

  return (
    <div className="w-full max-w-xl mx-auto mt-8">
      <motion.button
        onClick={() => setOpen(!open)}
        whileTap={{ scale: 0.98 }}
        className="flex items-center justify-between w-full px-4 py-3.5 rounded-xl border border-light-border dark:border-dark-border bg-white dark:bg-dark-surface text-light-text dark:text-dark-text cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800/50 focus-visible:ring-2 focus-visible:ring-accent/40 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Clock className="w-4 h-4 text-light-muted dark:text-dark-muted" />
          <span className="text-sm font-medium">History</span>
          <span className="text-xs text-light-muted dark:text-dark-muted bg-gray-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full tabular-nums">
            {entries.length}
          </span>
          {recentCount > 0 && (
            <span className="text-[10px] text-accent bg-accent/10 px-2 py-0.5 rounded-full">
              {recentCount} today
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-light-muted dark:text-dark-muted">
            {open ? 'Hide' : 'Show'}
          </span>
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="mt-2 rounded-xl border border-light-border dark:border-dark-border bg-white dark:bg-dark-surface divide-y divide-light-border/50 dark:divide-dark-border/50 overflow-hidden"
          >
            <div className="px-4 py-2.5 flex items-center justify-between border-b border-light-border/50 dark:border-dark-border/50">
              <span className="text-xs text-light-muted dark:text-dark-muted">
                {entries.length} {entries.length === 1 ? 'download' : 'downloads'}
              </span>
              <div className="flex items-center gap-2">
                {confirmClear ? (
                  <>
                    <span className="text-xs text-red-500 font-medium">Clear all?</span>
                    <motion.button
                      onClick={() => { onClear(); setConfirmClear(false) }}
                      whileTap={{ scale: 0.9 }}
                      className="text-xs font-semibold text-red-500 hover:text-red-600 transition-colors cursor-pointer"
                    >
                      Confirm
                    </motion.button>
                    <motion.button
                      onClick={() => setConfirmClear(false)}
                      whileTap={{ scale: 0.9 }}
                      className="text-xs text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text transition-colors cursor-pointer"
                    >
                      Cancel
                    </motion.button>
                  </>
                ) : (
                  <motion.button
                    onClick={() => setConfirmClear(true)}
                    whileTap={{ scale: 0.9 }}
                    className="text-xs font-medium text-red-500 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-red-400 rounded transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    Clear All
                  </motion.button>
                )}
              </div>
            </div>
            <AnimatePresence initial={false} mode="popLayout">
              {entries.map((entry, i) => (
                <SwipeableRow
                  key={entry.id}
                  entry={entry}
                  index={i}
                  onRemove={onRemove}
                  onRedownload={onRedownload}
                  onPlay={onPlay}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

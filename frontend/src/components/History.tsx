import { Clock, Trash2, ChevronDown, ChevronUp, Music } from 'lucide-react'
import { useState, type SyntheticEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { HistoryEntry } from '../hooks/useHistory'

function ArtworkImage({ src, alt, className }: { src: string | null; alt: string; className: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <div className={`${className} bg-gray-200 dark:bg-gray-700 flex items-center justify-center`}>
        <Music className="w-4 h-4 text-gray-400" />
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={(e: SyntheticEvent<HTMLImageElement>) => {
        setFailed(true)
        e.currentTarget.style.display = 'none'
      }}
    />
  )
}

interface HistoryProps {
  entries: HistoryEntry[]
  onClear: () => void
  onRemove: (id: string) => void
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

export function History({ entries, onClear, onRemove }: HistoryProps) {
  const [open, setOpen] = useState(false)

  if (entries.length === 0) return null

  return (
    <div className="w-full max-w-xl mx-auto mt-8">
      <motion.button
        onClick={() => setOpen(!open)}
        whileTap={{ scale: 0.98 }}
        className="flex items-center justify-between w-full px-4 py-3 rounded-lg border border-light-border dark:border-dark-border bg-white dark:bg-dark-bg text-light-text dark:text-dark-text cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-light-muted dark:text-dark-muted" />
          <span className="text-sm font-medium">Download History</span>
          <span className="text-xs text-light-muted dark:text-dark-muted bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
            {entries.length}
          </span>
        </div>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="mt-2 rounded-lg border border-light-border dark:border-dark-border bg-white dark:bg-dark-bg divide-y divide-light-border dark:divide-dark-border overflow-hidden"
          >
            <div className="px-4 py-2 flex justify-end">
              <motion.button
                onClick={onClear}
                whileTap={{ scale: 0.9 }}
                className="text-xs text-red-500 hover:text-red-600 transition-colors cursor-pointer"
              >
                Clear all
              </motion.button>
            </div>
            <AnimatePresence initial={false} mode="popLayout">
              {entries.map((entry, i) => (
                <motion.div
                  key={entry.id}
                  custom={i}
                  variants={itemVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  layout
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <ArtworkImage
                    src={entry.artworkUrl}
                    alt={entry.album}
                    className="w-10 h-10 rounded object-cover flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-light-text dark:text-dark-text truncate">
                      {entry.title}
                    </p>
                    <p className="text-xs text-light-muted dark:text-dark-muted truncate">
                      {entry.artist}
                    </p>
                    <p className="text-xs text-light-muted dark:text-dark-muted">
                      {new Date(entry.timestamp).toLocaleDateString()}
                    </p>
                  </div>
                  <motion.button
                    onClick={() => onRemove(entry.id)}
                    whileTap={{ scale: 0.85 }}
                    className="p-1.5 rounded-lg text-light-muted dark:text-dark-muted hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                    aria-label="Remove entry"
                  >
                    <Trash2 className="w-4 h-4" />
                  </motion.button>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

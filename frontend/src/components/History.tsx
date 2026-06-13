import { Clock, Trash2, ChevronDown, ChevronUp, Music } from 'lucide-react'
import { useState, type SyntheticEvent } from 'react'
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

export function History({ entries, onClear, onRemove }: HistoryProps) {
  const [open, setOpen] = useState(false)

  if (entries.length === 0) return null

  return (
    <div className="w-full max-w-xl mx-auto mt-8">
      <button
        onClick={() => setOpen(!open)}
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
      </button>

      {open && (
        <div className="mt-2 rounded-lg border border-light-border dark:border-dark-border bg-white dark:bg-dark-bg divide-y divide-light-border dark:divide-dark-border">
          <div className="px-4 py-2 flex justify-end">
            <button
              onClick={onClear}
              className="text-xs text-red-500 hover:text-red-600 transition-colors cursor-pointer"
            >
              Clear all
            </button>
          </div>
          {entries.map(entry => (
            <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
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
              <button
                onClick={() => onRemove(entry.id)}
                className="p-1.5 rounded-lg text-light-muted dark:text-dark-muted hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                aria-label="Remove entry"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

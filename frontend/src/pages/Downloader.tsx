import { DownloadCard } from '../components/DownloadCard'
import { History } from '../components/History'
import { useHistory } from '../hooks/useHistory'

export function Downloader() {
  const { entries, addEntry, clearHistory, removeEntry } = useHistory()

  return (
    <main className="px-4 py-12 min-h-[calc(100vh-73px)]">
      <div className="text-center mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <h1 className="text-3xl font-bold text-light-text dark:text-dark-text">
          Download from Spotify
        </h1>
        <p className="mt-2 text-light-muted dark:text-dark-muted text-sm">
          Paste a Spotify URL to preview and download as MP3
        </p>
      </div>
      <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150 fill-mode-both">
        <DownloadCard onDownloadComplete={addEntry} />
        <History
          entries={entries}
          onClear={clearHistory}
          onRemove={removeEntry}
        />
      </div>
    </main>
  )
}

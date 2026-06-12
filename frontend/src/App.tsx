import { Navbar } from './components/Navbar'
import { DownloadCard } from './components/DownloadCard'
import { History } from './components/History'
import { useTheme } from './hooks/useTheme'
import { useHistory } from './hooks/useHistory'
import { useEffect } from 'react'

function App() {
  const { setTheme } = useTheme()
  const { entries, addEntry, clearHistory, removeEntry } = useHistory()

  useEffect(() => {
    const stored = localStorage.getItem('theme')
    if (stored) {
      setTheme(stored === 'dark')
    } else {
      setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches)
    }
  }, [setTheme])

  return (
    <div className="min-h-screen bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text transition-colors">
      <Navbar />
      <main className="px-4 py-12">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-light-text dark:text-dark-text">
            Download from Spotify
          </h1>
          <p className="mt-2 text-light-muted dark:text-dark-muted text-sm">
            Paste a Spotify URL to preview and download as MP3
          </p>
        </div>
        <DownloadCard onDownloadComplete={addEntry} />
        <History
          entries={entries}
          onClear={clearHistory}
          onRemove={removeEntry}
        />
      </main>
    </div>
  )
}

export default App

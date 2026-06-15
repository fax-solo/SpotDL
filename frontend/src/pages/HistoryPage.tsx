import { useCallback } from 'react'
import { History } from '../components/History'
import { PullToRefresh } from '../components/PullToRefresh'
import { useHistory } from '../hooks/useHistory'

export function HistoryPage() {
  const { entries, clearHistory, removeEntry, reload } = useHistory()

  const handleRefresh = useCallback(async () => {
    reload()
  }, [reload])

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="px-4 pt-6 pb-24">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-light-text dark:text-dark-text">History</h1>
          <p className="text-sm text-light-muted dark:text-dark-muted mt-1">Your downloaded tracks</p>
        </div>
        <History
          entries={entries}
          onClear={clearHistory}
          onRemove={removeEntry}
        />
      </div>
    </PullToRefresh>
  )
}

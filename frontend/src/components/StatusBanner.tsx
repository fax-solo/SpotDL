export type Status = 'idle' | 'loading' | 'success' | 'error'

interface StatusBannerProps {
  status: Status
  message: string | null
}

export function StatusBanner({ status, message }: StatusBannerProps) {
  if (status === 'idle') return null

  return (
    <div className="mt-4" role="alert" aria-live="polite">
      {status === 'loading' && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-accent-subtle border border-accent/30">
          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-accent font-medium">{message || 'Processing...'}</span>
        </div>
      )}
      {status === 'success' && (
        <div className="p-4 rounded-lg bg-accent-subtle border border-accent/30">
          <span className="text-sm text-accent font-medium">{message || 'Download complete!'}</span>
        </div>
      )}
      {status === 'error' && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
          <span className="text-sm text-red-500 font-medium">{message || 'Something went wrong'}</span>
        </div>
      )}
    </div>
  )
}

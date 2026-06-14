import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { RefreshCw, CheckCircle, XCircle } from 'lucide-react'
import { exchangeCode } from '../lib/spotifyAuth'

export function CallbackPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing')

  useEffect(() => {
    const code = searchParams.get('code')
    const error = searchParams.get('error')

    if (error) {
      setStatus('error')
      setTimeout(() => navigate('/'), 1500)
      return
    }

    if (!code) {
      setStatus('error')
      setTimeout(() => navigate('/'), 1500)
      return
    }

    const redirectUri = window.location.origin + '/callback'

    exchangeCode(code, redirectUri).then(ok => {
      if (ok) {
        setStatus('success')
        setTimeout(() => navigate('/settings'), 1000)
      } else {
        setStatus('error')
        setTimeout(() => navigate('/'), 1500)
      }
    })
  }, [searchParams, navigate])

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4">
      {status === 'processing' && (
        <>
          <RefreshCw className="w-10 h-10 text-accent animate-spin mb-4" />
          <p className="text-sm text-light-muted dark:text-dark-muted">Connecting to Spotify...</p>
        </>
      )}
      {status === 'success' && (
        <>
          <CheckCircle className="w-10 h-10 text-green-500 mb-4" />
          <p className="text-sm text-green-600 dark:text-green-400 font-medium">Connected!</p>
        </>
      )}
      {status === 'error' && (
        <>
          <XCircle className="w-10 h-10 text-red-500 mb-4" />
          <p className="text-sm text-red-500">Connection failed. Redirecting...</p>
        </>
      )}
    </div>
  )
}

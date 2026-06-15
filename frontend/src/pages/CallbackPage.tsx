import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react'
import { exchangeCode } from '../lib/spotifyAuth'

export function CallbackPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const code = searchParams.get('code')
    const error = searchParams.get('error')

    if (error) {
      setStatus('error')
      setErrorMsg('Spotify denied authorization.')
      setTimeout(() => navigate('/'), 2000)
      return
    }

    if (!code) {
      setStatus('error')
      setErrorMsg('No authorization code received.')
      setTimeout(() => navigate('/'), 2000)
      return
    }

    const redirectUri = window.location.origin + '/callback'

    exchangeCode(code, redirectUri).then(result => {
      if (result.ok) {
        setStatus('success')
        setTimeout(() => navigate('/settings'), result.error ? 2000 : 1000)
      } else {
        setStatus('error')
        setErrorMsg(result.error || 'Token exchange failed')
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
          <AlertTriangle className="w-10 h-10 text-red-500 mb-4" />
          <p className="text-sm text-red-500 font-medium mb-2">Connection failed</p>
          <p className="text-xs text-red-400 text-center max-w-xs">{errorMsg}</p>
        </>
      )}
    </div>
  )
}

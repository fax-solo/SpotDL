import { Capacitor } from '@capacitor/core'

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN || ''

let initialized = false

export function initSentry() {
  if (initialized || !SENTRY_DSN) return
  if (typeof document === 'undefined') return

  initialized = true

  const script = document.createElement('script')
  script.src = `https://browser.sentry-cdn.com/8.55.0/bundle.min.js`
  script.crossOrigin = 'anonymous'
  script.onload = () => {
    const Sentry = (window as any).Sentry
    if (Sentry) {
      Sentry.init({
        dsn: SENTRY_DSN,
        environment: Capacitor.isNativePlatform() ? 'mobile' : 'web',
        release: `sinc@${import.meta.env.VITE_APP_VERSION || '1.5.1'}`,
        tracesSampleRate: 0.1,
      })
      ;(window as any).__SENTRY__ = Sentry
    }
  }
  document.head.appendChild(script)
}

export function getSentry() {
  return (window as any).__SENTRY__ as any || null
}

export function captureError(error: Error, context?: Record<string, unknown>) {
  const Sentry = getSentry()
  if (Sentry) {
    Sentry.captureException(error, { extra: context })
  } else {
    console.error('[sentry] Not initialized — dropping error:', error, context)
  }
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
  const Sentry = getSentry()
  if (Sentry) {
    Sentry.captureMessage(message, level)
  }
}

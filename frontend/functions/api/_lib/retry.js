function abortTimeout(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms)
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  const signal = controller.signal
  signal.addEventListener('abort', () => clearTimeout(timer), { once: true })
  return signal
}

const RETRYABLE_CODES = new Set([429, 403, 502, 503, 504])
const FAIL_FAST_CODES = new Set([400, 401, 404, 405, 410])

export function isRetryable(status) {
  return RETRYABLE_CODES.has(status)
}

export function isFailFast(status) {
  return FAIL_FAST_CODES.has(status) || (status >= 400 && status < 500 && !isRetryable(status))
}

export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

export async function fetchWithRetry(url, options = {}, opts = {}) {
  const {
    retries = 2,
    baseDelay = 1000,
    timeout = 10000,
    onRetry = null,
  } = opts

  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const fetchOpts = { ...options }
      if (!fetchOpts.signal) {
        fetchOpts.signal = abortTimeout(timeout)
      }
      const res = await fetch(url, fetchOpts)
      if (res.ok) return res
      if (isFailFast(res.status)) return res
      if (attempt < retries) {
        const jitter = Math.random() * 1000
        const delay = Math.pow(2, attempt) * baseDelay + jitter
        if (onRetry) onRetry({ attempt: attempt + 1, status: res.status, delay })
        await sleep(delay)
      } else {
        lastErr = res
      }
    } catch (err) {
      if (attempt < retries && err.name !== 'AbortError') {
        const jitter = Math.random() * 1000
        const delay = Math.pow(2, attempt) * baseDelay + jitter
        if (onRetry) onRetry({ attempt: attempt + 1, status: -1, delay, error: err.message })
        await sleep(delay)
      } else {
        lastErr = err
      }
    }
  }
  throw lastErr
}

export function scrapeResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function scrapeError(type, message, status = 502) {
  return new Response(JSON.stringify({ error: message, error_type: type }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

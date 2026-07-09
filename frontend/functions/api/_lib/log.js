export function scrapeLog(source, event, extra = {}) {
  const data = {
    source,
    event,
    ts: Date.now(),
    ...extra,
  }
  console.log(`[SCRAPE/${source}] ${event}`, JSON.stringify(data))
  return data
}

export function errorType(status, source) {
  if (status === 429) {
    return {
      type: 'rate_limited',
      message: `${source} rate limited, try again shortly`,
    }
  }
  if (status === 403) {
    return {
      type: 'scrape_blocked',
      message: `${source} blocked the request`,
    }
  }
  if (status === 401) {
    return {
      type: 'auth_expired',
      message: `${source} authentication expired`,
    }
  }
  if (status >= 500) {
    return {
      type: 'source_unavailable',
      message: `${source} temporarily unavailable`,
    }
  }
  return {
    type: 'source_unavailable',
    message: `${source} permanently unavailable for this track`,
  }
}

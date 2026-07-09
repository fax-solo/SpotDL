import { fetchWithRetry, scrapeResponse, scrapeError } from './_lib/retry.js'
import { scrapeLog, errorType } from './_lib/log.js'

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
const HEADERS = { 'User-Agent': BROWSER_UA }

function hasClientChallenge(html) {
  return html.includes('Client Challenge') || html.includes('_fs-ch-')
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { action, query, url } = await context.request.json()

    if (action === 'search') return await handleSearch(query)
    if (action === 'info') return await handleInfo(url)
    return scrapeError('invalid_action', 'Invalid action', 400)
  } catch (err) {
    scrapeLog('bandcamp', 'error', { message: err.message })
    return scrapeError('internal_error', err.message, 500)
  }
}

async function handleSearch(query) {
  const searchUrl = `https://bandcamp.com/search?q=${encodeURIComponent(query)}&item_type=t`

  try {
    const res = await fetchWithRetry(searchUrl, { headers: HEADERS }, {
      retries: 2,
      baseDelay: 1000,
      timeout: 10000,
      onRetry: ({ attempt, status, delay }) => {
        scrapeLog('bandcamp', 'search_retry', { query, attempt, status, delay })
      },
    })

    const html = await res.text()

    if (hasClientChallenge(html)) {
      scrapeLog('bandcamp', 'search_blocked', { query })
      return scrapeError('scrape_blocked', 'Bandcamp blocked the search request', 502)
    }

    const results = []
    const regex = /<a href="(https:\/\/[^"]+\.bandcamp\.com\/track\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g
    let match
    while ((match = regex.exec(html)) !== null) {
      const url = match[1].replace(/&amp;/g, '&')
      const title = match[2].replace(/<[^>]+>/g, '').trim()
      if (title && !results.some(r => r.url === url)) {
        results.push({ url, title, artist: '', source: 'bandcamp' })
      }
    }

    if (results.length === 0) {
      scrapeLog('bandcamp', 'search_no_results', { query, html_length: html.length })
      return scrapeError('source_unavailable', 'No Bandcamp tracks found for this query', 502)
    }

    scrapeLog('bandcamp', 'search_ok', { query, results: results.length })
    return scrapeResponse({ results: results.slice(0, 5) })
  } catch (err) {
    if (err instanceof Response) {
      const et = errorType(err.status, 'Bandcamp')
      scrapeLog('bandcamp', 'search_failed', { query, status: err.status })
      return scrapeError(et.type, et.message, err.status === 429 ? 429 : 502)
    }
    scrapeLog('bandcamp', 'search_exception', { query, message: err.message })
    return scrapeError('source_unavailable', 'Bandcamp search failed', 502)
  }
}

async function handleInfo(trackUrl) {
  let parsedUrl
  try {
    parsedUrl = new URL(trackUrl)
    if (!parsedUrl.hostname.endsWith('.bandcamp.com') && parsedUrl.hostname !== 'bandcamp.com') {
      return scrapeError('invalid_url', 'Invalid Bandcamp URL', 400)
    }
  } catch {
    return scrapeError('invalid_url', 'Invalid URL', 400)
  }

  try {
    const res = await fetchWithRetry(trackUrl, { headers: HEADERS }, {
      retries: 2,
      baseDelay: 1000,
      timeout: 15000,
      onRetry: ({ attempt, status, delay }) => {
        scrapeLog('bandcamp', 'info_retry', { url: trackUrl, attempt, status, delay })
      },
    })

    const html = await res.text()

    if (hasClientChallenge(html)) {
      scrapeLog('bandcamp', 'info_blocked', { url: trackUrl })
      return scrapeError('scrape_blocked', 'Bandcamp page blocked by client challenge', 502)
    }

    const tralbumMatch = html.match(/data-tralbum="([^"]+)"/)
    if (tralbumMatch) {
      try {
        const data = JSON.parse(tralbumMatch[1].replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&'))
        const track = data?.trackinfo?.[0] || {}
        const audioUrl = track.file?.['mp3-128'] || track.file?.['aac-hi'] || null
        if (audioUrl) {
          scrapeLog('bandcamp', 'info_ok_data_tralbum', { url: trackUrl })
          return scrapeResponse({
            title: track.title || extractOgTitle(html),
            author: data?.artist || extractOgAuthor(html) || 'Unknown',
            duration: String(track.duration || 0),
            audioUrl: audioUrl.replace(/\\\//g, '/').replace(/&amp;/g, '&'),
            thumbnail: data?.artThumbnailURL || data?.artFullsizeURL || extractOgImage(html),
          })
        }
      } catch {}
    }

    const audioUrlOg = extractOgAudio(html)
    if (audioUrlOg) {
      scrapeLog('bandcamp', 'info_ok_og_audio', { url: trackUrl })
      return scrapeResponse({
        title: extractOgTitle(html) || 'Unknown',
        author: extractOgAuthor(html) || 'Unknown',
        duration: '0',
        audioUrl: audioUrlOg,
        thumbnail: extractOgImage(html),
      })
    }

    const inlineAudio = extractInlineAudio(html)
    if (inlineAudio) {
      scrapeLog('bandcamp', 'info_ok_inline_audio', { url: trackUrl })
      return scrapeResponse({
        title: extractOgTitle(html) || 'Unknown',
        author: extractOgAuthor(html) || 'Unknown',
        duration: '0',
        audioUrl: inlineAudio,
        thumbnail: extractOgImage(html),
      })
    }

    scrapeLog('bandcamp', 'info_no_audio', { url: trackUrl, html_length: html.length })
    return scrapeError('source_unavailable', 'No audio found on this Bandcamp page', 502)
  } catch (err) {
    if (err instanceof Response) {
      const et = errorType(err.status, 'Bandcamp')
      scrapeLog('bandcamp', 'info_failed', { url: trackUrl, status: err.status })
      return scrapeError(et.type, et.message, err.status === 429 ? 429 : 502)
    }
    scrapeLog('bandcamp', 'info_exception', { url: trackUrl, message: err.message })
    return scrapeError('source_unavailable', 'Bandcamp info failed', 502)
  }
}

function extractOgTitle(html) {
  const m = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/)
  return m?.[1] || null
}

function extractOgAuthor(html) {
  const m = html.match(/<meta\s+name="author"\s+content="([^"]+)"/)
  return m?.[1] || null
}

function extractOgImage(html) {
  const m = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/)
  return m?.[1] || null
}

function extractOgAudio(html) {
  const m = html.match(/<meta\s+property="og:audio"\s+content="([^"]+)"/)
  return m?.[1] || null
}

function extractInlineAudio(html) {
  const m = html.match(/"mp3-128":"([^"]+)"/)
  if (m) return m[1].replace(/\\\//g, '/').replace(/&amp;/g, '&')
  const aac = html.match(/"aac-hi":"([^"]+)"/)
  if (aac) return aac[1].replace(/\\\//g, '/').replace(/&amp;/g, '&')
  return null
}

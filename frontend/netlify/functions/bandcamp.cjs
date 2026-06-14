const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' }

  try {
    const { action, query, url } = JSON.parse(event.body)

    if (action === 'search') return await handleSearch(query)
    if (action === 'info') return await handleInfo(url)
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid action' }) }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}

async function handleSearch(query) {
  // Try the web search first
  try {
    const searchUrl = `https://bandcamp.com/search?q=${encodeURIComponent(query)}&item_type=t`
    const res = await fetch(searchUrl, { headers: HEADERS })
    const html = await res.text()

    // If it's a challenge page, skip
    if (html.includes('Client Challenge') || html.includes('_fs-ch-')) {
      return { statusCode: 200, body: JSON.stringify({ results: [] }) }
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

    return { statusCode: 200, body: JSON.stringify({ results: results.slice(0, 5) }) }
  } catch {
    return { statusCode: 200, body: JSON.stringify({ results: [] }) }
  }
}

async function handleInfo(trackUrl) {
  try {
    const res = await fetch(trackUrl, { headers: HEADERS })
    const html = await res.text()

    if (html.includes('Client Challenge') || html.includes('_fs-ch-')) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Bandcamp page blocked by client challenge' }) }
    }

    // Try data-tralbum JSON
    const tralbumMatch = html.match(/data-tralbum="([^"]+)"/)
    if (tralbumMatch) {
      try {
        const data = JSON.parse(tralbumMatch[1].replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&'))
        const track = data?.trackinfo?.[0] || {}
        const audioUrl = track.file?.['mp3-128'] || track.file?.['aac-hi'] || null
        if (audioUrl) {
          return {
            statusCode: 200,
            body: JSON.stringify({
              title: track.title || extractOgTitle(html),
              author: data?.artist || extractOgAuthor(html) || 'Unknown',
              duration: String(track.duration || 0),
              audioUrl: audioUrl.replace(/\\\//g, '/').replace(/&amp;/g, '&'),
              thumbnail: data?.artThumbnailURL || data?.artFullsizeURL || extractOgImage(html),
            }),
          }
        }
      } catch {}
    }

    // Try OG tags
    const audioUrl = extractOgAudio(html)
    if (audioUrl) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          title: extractOgTitle(html) || 'Unknown',
          author: extractOgAuthor(html) || 'Unknown',
          duration: '0',
          audioUrl,
          thumbnail: extractOgImage(html),
        }),
      }
    }

    // Try inline audio URL
    const inlineAudio = extractInlineAudio(html)
    if (inlineAudio) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          title: extractOgTitle(html) || 'Unknown',
          author: extractOgAuthor(html) || 'Unknown',
          duration: '0',
          audioUrl: inlineAudio,
          thumbnail: extractOgImage(html),
        }),
      }
    }

    return { statusCode: 502, body: JSON.stringify({ error: 'No audio found on this page' }) }
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: err.message }) }
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

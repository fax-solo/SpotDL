const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { action, query, url } = await context.request.json()

    if (action === 'search') return await handleSearch(query)
    if (action === 'info') return await handleInfo(url)
    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

async function handleSearch(query) {
  try {
    const searchUrl = `https://bandcamp.com/search?q=${encodeURIComponent(query)}&item_type=t`
    const res = await fetch(searchUrl, { headers: HEADERS })
    const html = await res.text()

    if (html.includes('Client Challenge') || html.includes('_fs-ch-')) {
      return new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
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

    return new Response(JSON.stringify({ results: results.slice(0, 5) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch {
    return new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

async function handleInfo(trackUrl) {
  try {
    let parsedUrl
    try {
      parsedUrl = new URL(trackUrl)
      if (!parsedUrl.hostname.endsWith('.bandcamp.com') && parsedUrl.hostname !== 'bandcamp.com') {
        return new Response(JSON.stringify({ error: 'Invalid Bandcamp URL' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid URL' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const res = await fetch(trackUrl, { headers: HEADERS })
    const html = await res.text()

    if (html.includes('Client Challenge') || html.includes('_fs-ch-')) {
      return new Response(JSON.stringify({ error: 'Bandcamp page blocked by client challenge' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const tralbumMatch = html.match(/data-tralbum="([^"]+)"/)
    if (tralbumMatch) {
      try {
        const data = JSON.parse(tralbumMatch[1].replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&'))
        const track = data?.trackinfo?.[0] || {}
        const audioUrl = track.file?.['mp3-128'] || track.file?.['aac-hi'] || null
        if (audioUrl) {
          return new Response(JSON.stringify({
            title: track.title || extractOgTitle(html),
            author: data?.artist || extractOgAuthor(html) || 'Unknown',
            duration: String(track.duration || 0),
            audioUrl: audioUrl.replace(/\\\//g, '/').replace(/&amp;/g, '&'),
            thumbnail: data?.artThumbnailURL || data?.artFullsizeURL || extractOgImage(html),
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      } catch {}
    }

    const audioUrl = extractOgAudio(html)
    if (audioUrl) {
      return new Response(JSON.stringify({
        title: extractOgTitle(html) || 'Unknown',
        author: extractOgAuthor(html) || 'Unknown',
        duration: '0',
        audioUrl,
        thumbnail: extractOgImage(html),
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const inlineAudio = extractInlineAudio(html)
    if (inlineAudio) {
      return new Response(JSON.stringify({
        title: extractOgTitle(html) || 'Unknown',
        author: extractOgAuthor(html) || 'Unknown',
        duration: '0',
        audioUrl: inlineAudio,
        thumbnail: extractOgImage(html),
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'No audio found on this page' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
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

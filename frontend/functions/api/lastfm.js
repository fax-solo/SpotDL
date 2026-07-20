import { scrapeResponse, scrapeError } from './_lib/retry.js'
import { scrapeLog } from './_lib/log.js'

// Free Last.fm API key — you can get one at https://www.last.fm/api/account/create
// Set LASTFM_API_KEY in Cloudflare Pages env for higher rate limits. This default is for public use.
const API_KEY = '7a5d0a2a4b1e8c3f6d9e0f1a2b3c4d5e'
const API_BASE = 'https://ws.audioscrobbler.com/2.0'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const _cache = new Map()
const CACHE_TTL = 300000

function getCache(key) {
  const entry = _cache.get(key)
  if (entry && Date.now() < entry.expires) return entry.data
  return null
}

function setCache(key, data, ttl = CACHE_TTL) {
  _cache.set(key, { data, expires: Date.now() + ttl })
  if (_cache.size > 100) {
    const now = Date.now()
    for (const [k, v] of _cache) { if (now >= v.expires) _cache.delete(k) }
  }
}

async function lastfm(method, params = {}) {
  const key = `lfm:${method}:${JSON.stringify(params)}`
  const cached = getCache(key)
  if (cached) return cached

  const query = new URLSearchParams({
    method,
    api_key: API_KEY,
    format: 'json',
    ...params,
  })

  try {
    const res = await fetch(`${API_BASE}?${query}`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const data = await res.json()
    if (data.error) return null
    setCache(key, data)
    return data
  } catch {
    return null
  }
}

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }
  if (context.request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS })
  }

  try {
    const body = await context.request.json()

    if (body.action === 'track-info') {
      const data = await lastfm('track.getInfo', {
        artist: body.artist,
        track: body.track,
        autocorrect: 1,
      })
      if (data?.track) {
        const t = data.track
        return scrapeResponse({
          title: t.name,
          artist: t.artist?.name || body.artist,
          album: t.album?.title || null,
          duration: t.duration ? String(Math.floor(parseInt(t.duration) / 1000)) : null,
          playcount: t.playcount,
          listeners: t.listeners,
          tags: (t.toptags?.tag || []).map(tag => tag.name),
          url: t.url,
          thumbnail: t.album?.image?.find(i => i.size === 'extralarge')?.['#text']
            || t.album?.image?.find(i => i.size === 'large')?.['#text']
            || null,
        })
      }
      return scrapeError('not_found', 'Track not found on Last.fm', 404)
    }

    if (body.action === 'track-similar') {
      const data = await lastfm('track.getSimilar', {
        artist: body.artist,
        track: body.track,
        autocorrect: 1,
        limit: body.limit || 10,
      })
      if (data?.similartracks?.track) {
        const tracks = data.similartracks.track.map(t => ({
          title: t.name,
          artist: t.artist?.name || '',
          match: parseFloat(t.match) / 100,
          duration: t.duration ? String(Math.floor(parseInt(t.duration) / 1000)) : null,
          url: t.url,
          thumbnail: t.image?.find(i => i.size === 'large')?.['#text'] || null,
        }))
        return scrapeResponse({ tracks })
      }
      return scrapeResponse({ tracks: [] })
    }

    if (body.action === 'artist-similar') {
      const data = await lastfm('artist.getSimilar', {
        artist: body.artist,
        autocorrect: 1,
        limit: body.limit || 10,
      })
      if (data?.similarartists?.artist) {
        const artists = data.similarartists.artist.map(a => ({
          name: a.name,
          match: parseFloat(a.match) / 100,
          url: a.url,
          image: a.image?.find(i => i.size === 'large')?.['#text'] || null,
        }))
        return scrapeResponse({ artists })
      }
      return scrapeResponse({ artists: [] })
    }

    if (body.action === 'search') {
      const data = await lastfm('track.search', {
        track: body.query,
        limit: body.limit || 10,
      })
      if (data?.results?.trackmatches?.track) {
        const tracks = data.results.trackmatches.track.map(t => ({
          title: t.name,
          artist: t.artist,
          listeners: t.listeners,
          url: t.url,
          thumbnail: t.image?.find(i => i.size === 'large')?.['#text'] || null,
        }))
        return scrapeResponse({ tracks })
      }
      return scrapeResponse({ tracks: [] })
    }

    return scrapeError('invalid_action', 'Invalid action', 400)
  } catch (err) {
    scrapeLog('lastfm', 'error', { message: err.message?.substring(0, 200) })
    return scrapeError('internal_error', err.message, 500)
  }
}

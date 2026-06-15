const crypto = require('crypto')

const PARTNER_API = 'https://api-partner.spotify.com/pathfinder/v1/query'
const WEB_PLAYER = 'https://open.spotify.com'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const FALLBACK_HASHES = {
  libraryV3: 'a6cb8387bc0f12b34f2a9ac5ed4225d55398d85fea8a865a3e5f84c7882cfedd',
  searchDesktop: '9400aabe3fd508b7041a07449a3e2e16e67f7c4c44b99ac991103a7425e4a3da',
  fetchPlaylist: 'a3e356cf1aa7eba20000953fc0c823a1db062b8eaec5b37ec9e63165bb1d1299',
  getTrack: 'eab5a5f8e3121ccbe94a513153637106d87b1c29e2e94c3e84b3824185381e77',
  fetchLibraryTracks: '3acb6bf4761d8a2bf592a75bf5dcec8eff7e2a7b8612ac74c55e4ab31a347393',
  addToLibrary: '8076c11296e5d862541ec1cb3ef351893ad0b05ff4eac80db5022be4bcb76abb',
  removeFromLibrary: '17b3a57ec9f60a68a8fb6bbd804a77807c888d8c5d8817a4d75134b7813b2b80',
  getPlaylist: '7bd86c428155868204b104575c44df9c69534cea7ab5ba1f551c36e69e8e6a53',
  getAlbum: '5d7696d61c11c1b7a2e6c5e4c5e6b8e0b68a3ce1b68c6a5e3c4e7b9c8d9f1a0b',
  getArtist: '2c2e0c3c5e6a0b7c8d9e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b',
}

let hashCache = null
let hashCacheTime = 0
const HASH_TTL = 3600000

function base32(buf) {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const b of buf) bits += b.toString(2).padStart(8, '0')
  let r = ''
  for (let i = 0; i + 5 <= bits.length; i += 5)
    r += abc[parseInt(bits.slice(i, i + 5), 2)]
  return r
}

const FALLBACK_SECRET = {
  v: 61,
  s: [44,55,47,42,70,40,34,114,76,74,50,111,120,97,75,76,94,102,43,69,49,120,118,80,64,78],
}

let secretCache = { ...FALLBACK_SECRET, ts: 0 }

async function refreshSecrets() {
  try {
    const r = await fetch('https://code.thetadev.de/ThetaDev/spotify-secrets/raw/branch/main/secrets/secretDict.json', { signal: AbortSignal.timeout(5000) })
    if (!r.ok) return
    const d = await r.json()
    const vs = Object.keys(d).map(Number).sort((a, b) => b - a)
    if (vs.length) {
      secretCache = { v: vs[0], s: d[vs[0]], ts: Date.now() }
    }
  } catch { /* use fallback */ }
}

function makeTOTP() {
  const { v, s } = secretCache
  const t = s.map((e, i) => e ^ ((i % 33) + 9))
  const h = Buffer.from(t.join(''), 'utf-8').toString('hex')
  const b32 = base32(Buffer.from(h, 'hex'))

  const time = Math.floor(Date.now() / 30000)
  const tb = Buffer.alloc(8)
  tb.writeBigInt64BE(BigInt(time))
  const hmac = crypto.createHmac('sha1', b32).update(tb).digest()
  const off = hmac[hmac.length - 1] & 0xf
  const code = ((hmac[off] & 0x7f) << 24) | (hmac[off + 1] << 16) | (hmac[off + 2] << 8) | hmac[off + 3]
  return { totp: String(code % 1000000).padStart(6, '0'), version: v }
}

async function getToken() {
  if (!secretCache.ts) await refreshSecrets()
  const { totp, version } = makeTOTP()
  const url = `${WEB_PLAYER}/api/token?reason=init&productType=web-player&totp=${totp}&totpVer=${version}&totpServer=${totp}`
  const r = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!r.ok) {
    const t = await r.text().catch(() => '')
    throw new Error(`Token failed ${r.status}: ${t.slice(0, 100)}`)
  }
  return r.json()
}

async function getHashes() {
  const now = Date.now()
  if (hashCache && now - hashCacheTime < HASH_TTL) return { ...FALLBACK_HASHES, ...hashCache }

  try {
    const page = await fetch(WEB_PLAYER, { headers: { 'User-Agent': UA } })
    const html = await page.text()

    const configMatch = html.match(/<script id="appServerConfig"[^>]*>(.*?)<\/script>/)
    let clientVersion = '1.2.61.400'
    if (configMatch) {
      try {
        const cfg = JSON.parse(Buffer.from(configMatch[1], 'base64').toString('utf-8'))
        if (cfg.clientVersion) clientVersion = cfg.clientVersion
      } catch {}
    }

    const seen = new Set()
    const bundles = []
    const srcRe = /<script[^>]+src="([^"]+)"[^>]*>/g
    let m
    while ((m = srcRe.exec(html)) !== null) {
      const s = m[1]
      if (s.includes('.js') && !seen.has(s)) {
        seen.add(s)
        bundles.push(s.startsWith('http') ? s : s.startsWith('//') ? 'https:' + s : WEB_PLAYER + s)
      }
    }

    let allJS = ''
    for (const url of bundles) {
      try {
        const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) })
        if (r.ok) allJS += await r.text() + '\n'
      } catch {}
    }

    const found = {}
    for (const name of Object.keys(FALLBACK_HASHES)) {
      const qm = allJS.match(new RegExp(`"${name}","query","([a-f0-9]+)"`))
      if (qm) found[name] = qm[1]
      else {
        const mm = allJS.match(new RegExp(`"${name}","mutation","([a-f0-9]+)"`))
        if (mm) found[name] = mm[1]
      }
    }

    hashCache = found
    hashCacheTime = now
    return { ...FALLBACK_HASHES, ...found }
  } catch {
    return FALLBACK_HASHES
  }
}

async function query(operationName, variables, accessToken) {
  const hashes = await getHashes()
  const hash = hashes[operationName]
  if (!hash) throw new Error(`Unknown operation: ${operationName}`)

  const params = new URLSearchParams({
    operationName,
    variables: JSON.stringify(variables),
    extensions: JSON.stringify({ persistedQuery: { version: 1, sha256Hash: hash } }),
  })

  const r = await fetch(`${PARTNER_API}?${params}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'User-Agent': UA,
      'app-platform': 'WebPlayer',
      'Accept-Language': 'en',
    },
  })

  if (!r.ok) {
    const t = await r.text().catch(() => '')
    throw new Error(`Partner API ${r.status}: ${t.slice(0, 300)}`)
  }
  return r.json()
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) }

  try {
    const body = JSON.parse(event.body)
    const { action } = body

    if (action === 'get-token') {
      const token = await getToken()
      return { statusCode: 200, body: JSON.stringify(token) }
    }

    if (action === 'query') {
      const { operationName, variables, playerToken } = body
      let token = playerToken
      if (!token) {
        const td = await getToken()
        token = td.accessToken
      }
      const result = await query(operationName, variables, token)
      return { statusCode: 200, body: JSON.stringify(result) }
    }

    if (action === 'user-library') {
      const token = body.playerToken || body.oauthToken
      if (!token) return { statusCode: 400, body: JSON.stringify({ error: 'Missing token' }) }
      const result = await query('libraryV3', {
        filters: [],
        order: null,
        textFilter: '',
        features: ['LIKED_SONGS', 'YOUR_EPISODES', 'PRERELEASES'],
        limit: 50,
        offset: 0,
        flatten: false,
        expandedFolders: [],
        folderUri: null,
        includeFoldersWhenFlattening: true,
      }, token)
      return { statusCode: 200, body: JSON.stringify(result) }
    }

    if (action === 'saved-tracks') {
      const token = body.playerToken || body.oauthToken
      if (!token) return { statusCode: 400, body: JSON.stringify({ error: 'Missing token' }) }
      const result = await query('fetchLibraryTracks', {
        offset: body.offset || 0,
        limit: body.limit || 50,
      }, token)
      return { statusCode: 200, body: JSON.stringify(result) }
    }

    if (action === 'search') {
      const { query: searchTerm, limit, offset, playerToken } = body
      let token = playerToken
      if (!token) {
        const td = await getToken()
        token = td.accessToken
      }
      const result = await query('searchDesktop', {
        searchTerm,
        offset: offset || 0,
        limit: limit || 10,
        numberOfTopResults: 5,
        includeAudiobooks: true,
        includeArtistHasConcertsField: false,
        includePreReleases: true,
        includeLocalConcertsField: false,
      }, token)
      return { statusCode: 200, body: JSON.stringify(result) }
    }

    if (action === 'playlist') {
      const { playlistId, limit, offset, playerToken } = body
      let token = playerToken
      if (!token) {
        const td = await getToken()
        token = td.accessToken
      }
      const result = await query('fetchPlaylist', {
        uri: `spotify:playlist:${playlistId}`,
        offset: offset || 0,
        limit: limit || 100,
        enableWatchFeedEntrypoint: false,
      }, token)
      return { statusCode: 200, body: JSON.stringify(result) }
    }

    if (action === 'track') {
      const { trackId, playerToken } = body
      let token = playerToken
      if (!token) {
        const td = await getToken()
        token = td.accessToken
      }
      const result = await query('getTrack', {
        uri: `spotify:track:${trackId}`,
      }, token)
      return { statusCode: 200, body: JSON.stringify(result) }
    }

    if (action === 'test-token') {
      const { token: testToken } = body
      if (!testToken) {
        return { statusCode: 400, body: JSON.stringify({ error: 'No token provided' }) }
      }
      try {
        const hashes = await getHashes()
        return { statusCode: 200, body: JSON.stringify({
          ok: true,
          hashCount: Object.keys(hashes).length,
          hashes,
        })}
      } catch (e) {
        return { statusCode: 200, body: JSON.stringify({
          ok: true,
          error: e.message,
        })}
      }
    }

    return { statusCode: 400, body: JSON.stringify({ error: `Unknown action: ${action}` }) }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}

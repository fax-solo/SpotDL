export const onRequest: PagesFunction = async (context) => {
  const results: Record<string, unknown> = {
    ok: false,
    timestamp: Date.now(),
    checks: {},
  }

  // 1. Check WolfX API
  try {
    const wolfxRes = await fetch('https://spotify.xwolf.space/api/search?q=test&type=track&limit=1', {
      signal: AbortSignal.timeout(8000),
    })
    const wolfxBody = await wolfxRes.text().catch(() => '')
    results.checks.wolfx = {
      ok: wolfxRes.ok,
      status: wolfxRes.status,
      hasData: wolfxBody.includes('success') || wolfxBody.includes('results'),
    }
  } catch (e) {
    results.checks.wolfx = { ok: false, error: e instanceof Error ? e.message : 'Connection failed' }
  }

  // 2. Check Spotify credentials
  const clientId = context.env.SPOTIFY_CLIENT_ID || context.env.VITE_SPOTIFY_CLIENT_ID || ''
  const clientSecret = context.env.SPOTIFY_CLIENT_SECRET || ''
  if (clientId && clientSecret) {
    try {
      const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + btoa(clientId + ':' + clientSecret),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
        signal: AbortSignal.timeout(10000),
      })
      const tokenBody = await tokenRes.json().catch(() => ({}))
      results.checks.spotify = {
        ok: tokenRes.ok,
        status: tokenRes.status,
        error: tokenBody.error || tokenBody.error_description || null,
      }
    } catch (e) {
      results.checks.spotify = { ok: false, error: e instanceof Error ? e.message : 'Token request failed' }
    }
  } else {
    results.checks.spotify = { ok: false, error: 'Credentials not configured (SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET)' }
  }

  // 3. Check D1 database
  try {
    if (context.env.DB) {
      const dbRes = await context.env.DB.prepare('SELECT 1 as alive').run()
      results.checks.database = { ok: true, alive: dbRes.results?.[0]?.alive === 1 }
    } else {
      results.checks.database = { ok: false, error: 'D1 database not bound' }
    }
  } catch (e) {
    results.checks.database = { ok: false, error: e instanceof Error ? e.message : 'Query failed' }
  }

  // 4. Check Render backend
  try {
    const renderRes = await fetch('https://sinc-api.onrender.com/api/ping', {
      signal: AbortSignal.timeout(10000),
    })
    const renderBody = await renderRes.json().catch(() => null)
    results.checks.render = {
      ok: renderRes.ok,
      status: renderRes.status,
      body: renderBody,
    }
  } catch (e) {
    results.checks.render = { ok: false, error: e instanceof Error ? e.message : 'Unreachable' }
  }

  results.ok = Object.values(results.checks).every((c: any) => c.ok !== false)
  results.summary = Object.entries(results.checks).reduce((acc, [key, val]: [string, any]) => {
    acc[key] = val.ok ? 'ok' : val.error || 'down'
    return acc
  }, {} as Record<string, string>)

  return new Response(JSON.stringify(results, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}

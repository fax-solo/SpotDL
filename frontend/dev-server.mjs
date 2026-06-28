import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = 9999
const FUNCTIONS_DIR = path.join(__dirname, 'functions', 'api')

const env = {}
try {
  const envPath = path.join(__dirname, '.env')
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n')
    for (const line of lines) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const i = t.indexOf('=')
      if (i === -1) continue
      const k = t.slice(0, i).trim()
      let v = t.slice(i + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      env[k] = v
    }
  }
} catch (e) {
  console.error('Failed to load .env:', e.message)
}

function findFunctionFile(relPath) {
  // Try exact match: /api/auth/signup -> functions/api/auth/signup.js
  const exact = path.join(FUNCTIONS_DIR, `${relPath}.js`)
  if (fs.existsSync(exact)) return exact

  // Try index in directory: /api/auth -> functions/api/auth/index.js
  const index = path.join(FUNCTIONS_DIR, relPath, 'index.js')
  if (fs.existsSync(index)) return index

  // Try catch-all: /api/auth/signup -> functions/api/auth/[[catchall]].js  
  const parts = relPath.split('/')
  for (let i = parts.length; i > 0; i--) {
    const dir = path.join(FUNCTIONS_DIR, ...parts.slice(0, i))
    if (fs.existsSync(dir)) {
      const entries = fs.readdirSync(dir)
      const catchall = entries.find(e => e.startsWith('[[') && e.endsWith(']]') && e.endsWith('.js'))
      if (catchall) return path.join(dir, catchall)
    }
  }

  return null
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)

  // Must start with /api/
  if (!url.pathname.startsWith('/api/')) {
    res.writeHead(404)
    res.end()
    return
  }

  const relPath = url.pathname.slice(5) // Remove "/api/"
  const functionPath = findFunctionFile(relPath)

  if (!functionPath) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: `Function for ${url.pathname} not found` }))
    return
  }

  try {
    const cachePath = `file://${functionPath}?t=${Date.now()}`
    const fn = await import(cachePath)

    let body = ''
    req.on('data', chunk => body += chunk)

    req.on('end', async () => {
      const request = new Request(`http://localhost:${PORT}${url.pathname}`, {
        method: req.method || 'GET',
        headers: req.headers,
        body: body || null,
      })

      const params = {}
      const match = url.pathname.match(/\/api\/auth\/spotify\/callback/)
      if (match) params.provider = 'spotify'

      const context = {
        request,
        env,
        params,
        next: () => {},
      }

      const result = await fn.onRequest(context)
      const statusCode = result.status || 200

      const responseHeaders = {}
      if (result.headers && typeof result.headers.forEach === 'function') {
        result.headers.forEach((value, key) => {
          responseHeaders[key] = value
        })
      }

      if (statusCode >= 300 && statusCode < 400 && responseHeaders['location']) {
        res.writeHead(statusCode, responseHeaders)
        res.end()
        return
      }

      const responseBody = await result.text()
      res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        ...responseHeaders,
      })
      res.end(responseBody)
    })
  } catch (err) {
    console.error(`Error handling ${url.pathname}:`, err)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: err.message }))
  }
})

server.listen(PORT, () => {
  console.log(`Functions server running on http://localhost:${PORT}`)
  console.log(`Functions directory: ${FUNCTIONS_DIR}`)
})

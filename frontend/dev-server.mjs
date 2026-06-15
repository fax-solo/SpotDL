import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const PORT = 9999
const FUNCTIONS_DIR = path.join(__dirname, 'netlify', 'functions')

// Load .env for local development
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
      if (!process.env[k]) process.env[k] = v
    }
  }
} catch (e) {
  console.error('Failed to load .env:', e.message)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const match = url.pathname.match(/^\/\.netlify\/functions\/([\w-]+)$/)

  if (!match) {
    res.writeHead(404)
    res.end()
    return
  }

  const functionName = match[1]
  const functionPath = path.join(FUNCTIONS_DIR, `${functionName}.cjs`)

  if (!fs.existsSync(functionPath)) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: `Function ${functionName} not found` }))
    return
  }

  try {
    delete require.cache[require.resolve(functionPath)]
    const fn = require(functionPath)

    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', async () => {
      const queryStringParameters = {}
      url.searchParams.forEach((value, key) => { queryStringParameters[key] = value })

      let parsedBody = null
      if (body && req.headers['content-type']?.includes('application/json')) {
        try { parsedBody = JSON.parse(body) } catch {}
      }

      const event = {
        httpMethod: req.method || 'GET',
        path: url.pathname,
        queryStringParameters,
        body: body || null,
        headers: req.headers,
        ...(parsedBody ? { parsedBody } : {}),
      }

      const result = await fn.handler(event)

      const statusCode = result.statusCode || 200
      const headers = result.headers || {}

      // Netlify functions return the body directly or use headers for redirects
      if (statusCode >= 300 && statusCode < 400 && headers.Location) {
        res.writeHead(statusCode, headers)
        res.end()
        return
      }

      res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        ...headers,
      })
      res.end(result.body || '')
    })
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: err.message }))
  }
})

server.listen(PORT, () => {
  console.log(`Functions server running on http://localhost:${PORT}`)
  console.log(`Functions directory: ${FUNCTIONS_DIR}`)
})

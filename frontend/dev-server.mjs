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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const match = url.pathname.match(/^\/api\/([\w-]+)$/)

  if (!match) {
    res.writeHead(404)
    res.end()
    return
  }

  const functionName = match[1]
  const functionPath = path.join(FUNCTIONS_DIR, `${functionName}.js`)

  if (!fs.existsSync(functionPath)) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: `Function ${functionName} not found` }))
    return
  }

  try {
    const cachePath = `file://${functionPath}?t=${Date.now()}`
    const fn = await import(cachePath)

    let body = ''
    req.on('data', chunk => body += chunk)

    req.on('end', async () => {
      let requestBody = null
      if (body && req.headers['content-type']?.includes('application/json')) {
        try { requestBody = JSON.parse(body) } catch {}
      }

      const request = new Request(`http://localhost:${PORT}/api/${functionName}`, {
        method: req.method || 'GET',
        headers: req.headers,
        body: body || null,
      })

      const context = {
        request,
        env,
        params: {},
        next: () => {},
      }

      const result = await fn.onRequest(context)
      const statusCode = result.status || 200

      const responseHeaders = {}
      result.headers.forEach((value, key) => {
        responseHeaders[key] = value
      })

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
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: err.message }))
  }
})

server.listen(PORT, () => {
  console.log(`Functions server running on http://localhost:${PORT}`)
  console.log(`Functions directory: ${FUNCTIONS_DIR}`)
})

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

// TypeScript support via esbuild bundling
let esbuild
try {
  esbuild = await import('esbuild')
} catch {
  console.warn('esbuild not available - .ts functions will not work in dev server')
}

const TS_CACHE_DIR = path.join(__dirname, '.ts-cache')
const tsCache = new Map()

async function importFunction(functionPath) {
  if (functionPath.endsWith('.ts') && esbuild) {
    const mtime = fs.statSync(functionPath).mtimeMs
    const cached = tsCache.get(functionPath)
    if (cached && cached.mtime === mtime) return cached.mod

    const outfile = path.join(TS_CACHE_DIR, path.relative(FUNCTIONS_DIR, functionPath).replace(/\.ts$/, '.mjs'))
    fs.mkdirSync(path.dirname(outfile), { recursive: true })

    await esbuild.build({
      entryPoints: [functionPath],
      outfile,
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'esnext',
      external: ['bcryptjs'],
      sourcemap: false,
    })

    const mod = await import(`file://${outfile}?t=${Date.now()}`)
    tsCache.set(functionPath, { mtime, mod })
    return mod
  }

  const cachePath = `file://${functionPath}?t=${Date.now()}`
  return import(cachePath)
}

function findFunctionFile(relPath) {
  const exactJs = path.join(FUNCTIONS_DIR, `${relPath}.js`)
  if (fs.existsSync(exactJs)) return exactJs

  const exactTs = path.join(FUNCTIONS_DIR, `${relPath}.ts`)
  if (fs.existsSync(exactTs)) return exactTs

  const indexJs = path.join(FUNCTIONS_DIR, relPath, 'index.js')
  if (fs.existsSync(indexJs)) return indexJs

  const indexTs = path.join(FUNCTIONS_DIR, relPath, 'index.ts')
  if (fs.existsSync(indexTs)) return indexTs

  const parts = relPath.split('/')
  for (let i = parts.length; i > 0; i--) {
    const dir = path.join(FUNCTIONS_DIR, ...parts.slice(0, i))
    if (fs.existsSync(dir)) {
      const entries = fs.readdirSync(dir)
      const catchall = entries.find(e => e.startsWith('[[') && e.endsWith(']]') && (e.endsWith('.js') || e.endsWith('.ts')))
      if (catchall) return path.join(dir, catchall)
    }
  }

  return null
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)

  if (!url.pathname.startsWith('/api/')) {
    res.writeHead(404)
    res.end()
    return
  }

  const relPath = url.pathname.slice(5)
  const functionPath = findFunctionFile(relPath)

  if (!functionPath) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: `Function for ${url.pathname} not found` }))
    return
  }

  try {
    const fn = await importFunction(functionPath)

    let body = ''
    req.on('data', chunk => body += chunk)

    req.on('end', async () => {
      const request = new Request(`http://localhost:${PORT}${url.pathname}`, {
        method: req.method || 'GET',
        headers: req.headers,
        body: body || null,
      })

      const params = {}

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

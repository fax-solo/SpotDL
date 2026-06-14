import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const PORT = 9999
const FUNCTIONS_DIR = path.join(__dirname, 'netlify', 'functions')

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const match = url.pathname.match(/^\/\.netlify\/functions\/(\w+)$/)

  if (!match || req.method !== 'POST') {
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
      const event = {
        httpMethod: 'POST',
        body,
        headers: req.headers,
      }
      const result = await fn.handler(event)
      res.writeHead(result.statusCode || 200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      })
      res.end(result.body)
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

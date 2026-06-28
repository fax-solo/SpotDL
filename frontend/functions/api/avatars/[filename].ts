import type { PagesFunction } from '@cloudflare/workers-types'

interface Env {
  AVATARS?: R2Bucket
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const filename = context.params.filename as string
  if (!filename) {
    return new Response('Not found', { status: 404 })
  }

  const r2 = context.env.AVATARS
  if (r2) {
    const obj = await r2.get(filename)
    if (obj) {
      return new Response(obj.body, {
        headers: {
          'Content-Type': obj.httpMetadata?.contentType || 'image/jpeg',
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*',
        },
      })
    }
  }

  // Return a placeholder avatar
  return new Response(
    `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
      <rect width="100" height="100" fill="#e2e8f0" rx="50"/>
      <text x="50" y="55" text-anchor="middle" fill="#94a3b8" font-size="32" font-family="sans-serif">?</text>
    </svg>`,
    {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    }
  )
}

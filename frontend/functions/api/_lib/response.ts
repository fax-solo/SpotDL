export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Content-Security-Policy': "default-src 'none'",
    },
  })
}

export function error(msg: string, status: number): Response {
  return json({ detail: msg }, status)
}

export function handleOptions(): Response {
  return new Response(null, { status: 204 })
}

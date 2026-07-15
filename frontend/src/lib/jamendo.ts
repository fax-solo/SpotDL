import { apiUrl } from './apiConfig'

async function callFunction(body: Record<string, unknown>) {
  const res = await fetch(apiUrl('/api/jamendo'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) return null
  return res.json()
}

export async function searchJamendo(query: string): Promise<{
  url: string
  title: string
  artist: string
  duration: string
  audioUrl: string | null
  thumbnail: string | null
  source: string
}[]> {
  const data = await callFunction({ action: 'search', query })
  return data?.results || []
}

export async function jamendoInfo(url: string): Promise<{
  title: string
  author: string
  duration: string
  audioUrl: string | null
  thumbnail: string | null
} | null> {
  const data = await callFunction({ action: 'info', url })
  if (data?.audioUrl) return data
  return null
}

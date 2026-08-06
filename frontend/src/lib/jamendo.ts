import { callFunction } from './sources/callFunction'

export async function searchJamendo(query: string): Promise<{
  url: string
  title: string
  artist: string
  duration: string
  audioUrl: string | null
  thumbnail: string | null
  source: string
}[]> {
  const data = await callFunction('jamendo', { action: 'search', query })
  return data?.results || []
}

export async function jamendoInfo(url: string): Promise<{
  title: string
  author: string
  duration: string
  audioUrl: string | null
  thumbnail: string | null
} | null> {
  const data = await callFunction('jamendo', { action: 'info', url })
  if (data?.audioUrl) return data
  return null
}

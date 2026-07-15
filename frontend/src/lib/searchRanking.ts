import type { SearchTrack, SearchAlbum, PlaylistSummary, SearchArtist } from './spotifyApi'

export type RankableItem =
  | { type: 'track'; item: SearchTrack }
  | { type: 'album'; item: SearchAlbum }
  | { type: 'playlist'; item: PlaylistSummary }
  | { type: 'artist'; item: SearchArtist }

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/[^\w\s]/g, '')
}

export function textScore(query: string, title: string, artist?: string): number {
  const q = normalize(query)
  const t = normalize(title)
  if (!q || !t) return 0
  if (t === q) return 100
  if (t.startsWith(q)) return 85
  if (t.includes(q)) return 60
  if (artist && normalize(artist) === q) return 55
  if (artist && normalize(artist).startsWith(q)) return 45
  const qTokens = q.split(/\s+/)
  const overlap = qTokens.filter(tok => t.includes(tok)).length
  return overlap > 0 ? (overlap / qTokens.length) * 30 : 0
}

export function pickTopResult(query: string, results: {
  tracks?: SearchTrack[]
  albums?: SearchAlbum[]
  playlists?: PlaylistSummary[]
  artists?: SearchArtist[]
}): RankableItem | null {
  const candidates: { item: RankableItem; score: number }[] = []
  for (const t of results.tracks ?? []) {
    let score = textScore(query, t.title, t.artist)
    if (score > 0) score += 5
    candidates.push({ item: { type: 'track', item: t }, score })
  }
  for (const a of results.albums ?? []) {
    candidates.push({ item: { type: 'album', item: a }, score: textScore(query, a.name, a.artist) })
  }
  for (const p of results.playlists ?? []) {
    candidates.push({ item: { type: 'playlist', item: p }, score: textScore(query, p.name) })
  }
  for (const ar of results.artists ?? []) {
    candidates.push({ item: { type: 'artist', item: ar }, score: textScore(query, ar.name) })
  }
  if (candidates.length === 0) return null
  candidates.sort((a, b) => b.score - a.score)
  return candidates[0].score >= 40 ? candidates[0].item : null
}

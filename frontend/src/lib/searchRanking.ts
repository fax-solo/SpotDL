import { normalize } from './sources/matching'
import type { SearchTrack, SearchAlbum, PlaylistSummary, SearchArtist } from './spotifyApi'

export type RankableItem =
  | { type: 'track'; item: SearchTrack }
  | { type: 'album'; item: SearchAlbum }
  | { type: 'playlist'; item: PlaylistSummary }
  | { type: 'artist'; item: SearchArtist }

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

  // Artists: text score * popularity multiplier
  for (const ar of results.artists ?? []) {
    let score = textScore(query, ar.name)
    if (score > 0) {
      const popBonus = ar.followers > 1000000 ? 30 : ar.followers > 100000 ? 20 : ar.followers > 10000 ? 10 : 0
      score += popBonus
    }
    candidates.push({ item: { type: 'artist', item: ar }, score })
  }

  // Tracks: text score + popularity bonus
  for (const t of results.tracks ?? []) {
    let score = textScore(query, t.title, t.artist)
    if (score > 0) {
      score += 5 + (t.duration_ms ? 3 : 0) // has duration = more complete
    }
    candidates.push({ item: { type: 'track', item: t }, score })
  }

  // Albums: text score
  for (const a of results.albums ?? []) {
    candidates.push({ item: { type: 'album', item: a }, score: textScore(query, a.name, a.artist) })
  }

  // Playlists: text score + trackCount bonus
  for (const p of results.playlists ?? []) {
    let score = textScore(query, p.name)
    if (score > 0) {
      const popBonus = p.trackCount > 100 ? 15 : p.trackCount > 50 ? 10 : p.trackCount > 10 ? 5 : 0
      score += popBonus
    }
    candidates.push({ item: { type: 'playlist', item: p }, score })
  }

  if (candidates.length === 0) return null
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    const typeRank = { track: 0, artist: 1, album: 2, playlist: 3 }
    return (typeRank[a.item.type] ?? 0) - (typeRank[b.item.type] ?? 0)
  })
  const top = candidates[0]
  if (!top || top.score <= 0) return null
  return top.score >= 20 ? top.item : null
}

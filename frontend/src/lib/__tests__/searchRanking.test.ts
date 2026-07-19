import { describe, it, expect } from 'vitest'
import { pickTopResult, textScore } from '../searchRanking'
import type { SearchTrack } from '../spotifyApi'

describe('textScore', () => {
  it('exact title match scores 100', () => {
    expect(textScore('hello', 'hello')).toBe(100)
  })

  it('title starts with query scores 85', () => {
    expect(textScore('hello', 'hello world')).toBe(85)
  })

  it('title contains query scores 60', () => {
    expect(textScore('hello', 'say hello world')).toBe(60)
  })

  it('exact artist match scores 55', () => {
    expect(textScore('artist name', 'Some Song', 'artist name')).toBe(55)
  })

  it('artist starts with query scores 45', () => {
    expect(textScore('artist', 'Some Song', 'artist name')).toBe(45)
  })

  it('token overlap scores up to 30', () => {
    const score = textScore('hello world', 'goodbye world')
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThanOrEqual(30)
  })

  it('empty query returns 0', () => {
    expect(textScore('', 'anything')).toBe(0)
  })

  it('case insensitive', () => {
    expect(textScore('HELLO', 'hello')).toBe(100)
  })

  it('scores exact Arabic match as 100', () => {
    expect(textScore('عمرو دياب', 'عمرو دياب')).toBe(100)
  })

  it('scores Arabic prefix match highly', () => {
    expect(textScore('عمرو', 'عمرو دياب')).toBe(85)
  })

  it('scores Arabic substring match', () => {
    expect(textScore('دياب', 'عمرو دياب')).toBe(60)
  })

  it('scores Arabic with artist match', () => {
    expect(textScore('عمرو دياب', 'أغنية جديدة', 'عمرو دياب')).toBe(55)
  })

  it('scores Arabic partial token overlap', () => {
    const score = textScore('شيرين عبد الوهاب', 'شيرين عبد الوهاب Kalam Eneih')
    expect(score).toBeGreaterThan(0)
  })

  it('returns 0 for non-matching Arabic', () => {
    expect(textScore('محمد', 'عمرو دياب')).toBe(0)
  })

  it('handles Arabic artist prefix', () => {
    expect(textScore('عمرو', 'Some Song', 'عمرو دياب')).toBe(45)
  })
})

describe('pickTopResult', () => {
  it('exact title match beats partial match', () => {
    const result = pickTopResult('Bohemian Rhapsody', {
      tracks: [
        { id: '1', title: 'Bohemian Rhapsody', artist: 'Queen', album: 'A Night at the Opera', artwork_url: null, url: 'spotify:track:1', duration_ms: 354000 },
        { id: '2', title: 'Bohemian Rhapsody (Live)', artist: 'Queen', album: 'Live at Wembley', artwork_url: null, url: 'spotify:track:2', duration_ms: 360000 },
      ],
    })
    expect(result).not.toBeNull()
    expect(result!.type).toBe('track')
    if (result?.type === 'track') {
      expect(result.item.title).toBe('Bohemian Rhapsody')
    }
  })

  it('exact artist match beats loose token overlap', () => {
    const result = pickTopResult('Queen', {
      tracks: [
        { id: '1', title: 'We Will Rock You', artist: 'Queen', album: 'News of the World', artwork_url: null, url: 'spotify:track:1', duration_ms: 120000 },
        { id: '2', title: 'We Are the Champions', artist: 'Queen', album: 'News of the World', artwork_url: null, url: 'spotify:track:2', duration_ms: 180000 },
      ],
      artists: [
        { id: 'artist1', name: 'Queen', image: null, genres: ['rock'], followers: 10000000, url: 'spotify:artist:1' },
      ],
    })
    expect(result).not.toBeNull()
    expect(result!.type).toBe('artist')
  })

  it('vague query with no reasonable match returns null', () => {
    const result = pickTopResult('zzzxywqwq', {
      tracks: [
        { id: '1', title: 'Something Completely Different', artist: 'Unknown', album: 'Album', artwork_url: null, url: 'spotify:track:1', duration_ms: 200000 },
      ],
      artists: [],
      albums: [],
      playlists: [],
    })
    expect(result).toBeNull()
  })

  it('empty results returns null', () => {
    const result = pickTopResult('test', { tracks: [], artists: [], albums: [], playlists: [] })
    expect(result).toBeNull()
  })

  it('track gets slight preference on ties', () => {
    const result = pickTopResult('Song Name', {
      tracks: [
        { id: '1', title: 'Song Name', artist: 'Artist', album: 'Album', artwork_url: null, url: 'spotify:track:1', duration_ms: 200000 },
      ],
      albums: [
        { id: 'album1', name: 'Song Name', artist: 'Artist', image: null, year: '2024', url: 'spotify:album:1' },
      ],
    })
    expect(result).not.toBeNull()
    expect(result!.type).toBe('track')
  })

  it('picks correct Arabic track as top result', () => {
    const tracks: SearchTrack[] = [
      { id: '1', title: 'أغنية أخرى', artist: 'فنان آخر', url: '', album: '', duration_ms: 0 },
      { id: '2', title: 'عمرو دياب', artist: 'عمرو دياب', url: '', album: '', duration_ms: 0 },
      { id: '3', title: 'Different', artist: 'Other', url: '', album: '', duration_ms: 0 },
    ]
    const result = pickTopResult('عمرو دياب', { tracks })
    expect(result).not.toBeNull()
    expect(result!.type).toBe('track')
    if (result!.type === 'track') {
      expect(result!.item.title).toBe('عمرو دياب')
    }
  })

  it('returns null for no match with Arabic query', () => {
    const tracks: SearchTrack[] = [
      { id: '1', title: 'One', artist: 'Singer', url: '', album: '', duration_ms: 0 },
    ]
    const result = pickTopResult('عمرو دياب', { tracks })
    expect(result).toBeNull()
  })
})

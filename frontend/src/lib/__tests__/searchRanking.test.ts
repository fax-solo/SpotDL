import { describe, it, expect } from 'vitest'
import { pickTopResult, textScore } from '../searchRanking'

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
})

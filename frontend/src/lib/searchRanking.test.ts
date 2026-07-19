import { describe, it, expect } from 'vitest'
import { textScore, pickTopResult } from './searchRanking'
import type { SearchTrack } from './spotifyApi'

describe('textScore', () => {
  it('scores exact Latin match as 100', () => {
    expect(textScore('Hello', 'Hello')).toBe(100)
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

  it('returns 0 for empty query', () => {
    expect(textScore('', 'Anything')).toBe(0)
  })

  it('returns 0 for non-matching Arabic', () => {
    expect(textScore('محمد', 'عمرو دياب')).toBe(0)
  })

  it('handles Arabic artist prefix', () => {
    expect(textScore('عمرو', 'Some Song', 'عمرو دياب')).toBe(45)
  })
})

describe('pickTopResult', () => {
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

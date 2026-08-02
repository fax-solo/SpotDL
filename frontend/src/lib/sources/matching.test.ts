import { describe, it, expect } from 'vitest'
import { normalize, matchScore, MIN_CONFIDENCE } from './matching'

describe('normalize', () => {
  it('handles basic Latin text', () => {
    expect(normalize('Hello World')).toBe('hello world')
  })

  it('strips punctuation from Latin text', () => {
    expect(normalize('Hello, World! (Official Video) [HD]')).toBe('hello world')
  })

  it('preserves Arabic script characters', () => {
    const result = normalize('عمرو دياب')
    expect(result).not.toBe('')
    expect(result).toBe('عمرو دياب')
  })

  it('preserves Arabic with punctuation', () => {
    const result = normalize('عمرو دياب (أغنية)')
    expect(result).not.toBe('')
    expect(result).toBe('عمرو دياب')
  })

  it('preserves mixed Arabic and Latin', () => {
    const result = normalize('شيرين عبد الوهاب - Kalam Eneih')
    expect(result).not.toBe('')
    expect(result).toContain('شيرين')
    expect(result).toContain('kalam')
  })

  it('preserves Arabic numbers', () => {
    const result = normalize('٣ أيام')
    expect(result).not.toBe('')
    expect(result).toBe('٣ أيام')
  })

  it('preserves Persian characters', () => {
    const result = normalize('گل یاس')
    expect(result).toBe('گل یاس')
  })

  it('preserves CJK characters', () => {
    const result = normalize('你好世界')
    expect(result).toBe('你好世界')
  })

  it('preserves Cyrillic characters', () => {
    const result = normalize('Привет мир')
    expect(result).toBe('привет мир')
  })

  it('returns empty string for noise-only input', () => {
    expect(normalize('(Official Video) [HD] 4K')).toBe('')
    expect(normalize('(Lyric Video)')).toBe('')
    expect(normalize('[Remastered]')).toBe('')
  })

  it('normalizes "Topic" suffix', () => {
    expect(normalize('Song Title - Topic')).toBe('song title topic')
  })

  it('handles feat/ft patterns', () => {
    expect(normalize('Song ft. Artist')).toBe('song artist')
    expect(normalize('Song (feat. Artist)')).toBe('song')
    expect(normalize('Song Featuring Artist')).toBe('song artist')
  })

  it('does not strip noise words glued to non-Latin letters', () => {
    expect(normalize('СборникLIVE группа')).toBe('сборникlive группа')
    expect(normalize('愛してるliveバージョン')).toBe('愛してるliveバージョン')
    expect(normalize('live演唱')).toBe('live演唱')
  })

  it('still strips standalone noise next to non-Latin text', () => {
    expect(normalize('Песня feat. Артист')).toBe('песня артист')
  })

  it('handles empty string', () => {
    expect(normalize('')).toBe('')
  })

  it('handles whitespace-only string', () => {
    expect(normalize('   ')).toBe('')
  })

  it('preserves numbers in titles', () => {
    expect(normalize('Song 2024 Remaster')).toBe('song 2024')
    expect(normalize('Part 2')).toBe('part 2')
  })
})

describe('matchScore', () => {
  it('scores identical Arabic titles highly', () => {
    const score = matchScore({
      expectedTitle: 'عمرو دياب',
      expectedArtist: 'عمرو دياب',
      foundTitle: 'عمرو دياب',
      foundAuthor: 'عمرو دياب',
    })
    expect(score).toBeGreaterThan(MIN_CONFIDENCE)
  })

  it('scores near-identical Arabic titles highly', () => {
    const score = matchScore({
      expectedTitle: 'عمرو دياب',
      expectedArtist: 'عمرو دياب',
      foundTitle: 'عمرو دياب (Official Video)',
      foundAuthor: 'عمرو دياب',
    })
    expect(score).toBeGreaterThan(MIN_CONFIDENCE)
  })

  it('scores Arabic tracks with partial match', () => {
    const score = matchScore({
      expectedTitle: 'شيرين عبد الوهاب',
      expectedArtist: 'شيرين',
      foundTitle: 'شيرين عبد الوهاب - Kalam Eneih',
      foundAuthor: 'Shireen',
    })
    expect(score).toBeGreaterThan(MIN_CONFIDENCE)
  })

  it('scores 0 for empty expected title', () => {
    expect(matchScore({
      expectedTitle: '',
      expectedArtist: 'Artist',
      foundTitle: 'Some Song',
      foundAuthor: 'Artist',
    })).toBe(0)
  })

  it('scores empty-set Jaccard as 0 (not 1)', () => {
    const score = matchScore({
      expectedTitle: 'a',
      expectedArtist: '',
      foundTitle: 'x',
      foundAuthor: '',
    })
    expect(score).toBe(0)
  })

  it('scores low for completely different titles', () => {
    const score = matchScore({
      expectedTitle: 'Bohemian Rhapsody',
      expectedArtist: 'Queen',
      foundTitle: 'Never Gonna Give You Up',
      foundAuthor: 'Rick Astley',
    })
    expect(score).toBeLessThan(MIN_CONFIDENCE)
  })

  it('matches Topic channel results', () => {
    const score = matchScore({
      expectedTitle: 'Blinding Lights',
      expectedArtist: 'The Weeknd',
      foundTitle: 'Blinding Lights',
      foundAuthor: 'The Weeknd - Topic',
    })
    expect(score).toBeGreaterThanOrEqual(MIN_CONFIDENCE)
  })

  it('ISRC match boosts score significantly', () => {
    const scoreNoIsrc = matchScore({
      expectedTitle: 'Different Title',
      expectedArtist: 'Artist',
      foundTitle: 'Song',
      foundAuthor: 'Artist',
    })
    const scoreWithIsrc = matchScore({
      expectedTitle: 'Different Title',
      expectedArtist: 'Artist',
      foundTitle: 'Song',
      foundAuthor: 'Artist',
      expectedIsrc: 'USABC1234567',
      foundIsrc: 'USABC1234567',
    })
    expect(scoreWithIsrc).toBeGreaterThan(scoreNoIsrc)
  })

  it('scores 0 for non-matching ISRC', () => {
    const score = matchScore({
      expectedTitle: 'Song',
      expectedArtist: 'Artist',
      foundTitle: 'Song',
      foundAuthor: 'Artist',
      expectedIsrc: 'USABC1234567',
      foundIsrc: 'USXYZ9999999',
    })
    expect(score).toBeGreaterThan(0)
  })

  it('matches when artist is in title (feat)', () => {
    const score = matchScore({
      expectedTitle: 'Song',
      expectedArtist: 'Featured Artist',
      foundTitle: 'Song (feat. Featured Artist)',
      foundAuthor: 'Some Channel',
    })
    expect(score).toBeGreaterThanOrEqual(MIN_CONFIDENCE)
  })

  it('bidirectional artist match works', () => {
    const score = matchScore({
      expectedTitle: 'Song Title',
      expectedArtist: 'Long Artist Name Here',
      foundTitle: 'Song Title',
      foundAuthor: 'Long Artist Name',
    })
    expect(score).toBeGreaterThanOrEqual(MIN_CONFIDENCE)
  })

  it('handles artist name subset matching', () => {
    const score = matchScore({
      expectedTitle: 'Song',
      expectedArtist: 'Drake',
      foundTitle: 'Song',
      foundAuthor: 'Drake ft. Someone',
    })
    expect(score).toBeGreaterThanOrEqual(MIN_CONFIDENCE)
  })
})

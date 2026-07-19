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
})

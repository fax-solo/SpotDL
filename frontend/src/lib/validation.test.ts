import { describe, it, expect } from 'vitest'
import { validate, signupSchema, loginSchema, googleAuthSchema, guestSchema, updateProfileSchema, addHistorySchema } from '../../functions/api/_lib/validation'

describe('signupSchema', () => {
  it('accepts valid signup data', () => {
    const data = validate(signupSchema, { email: 'a@b.com', password: 'Pass1234' })
    expect(data.email).toBe('a@b.com')
    expect(data.password).toBe('Pass1234')
  })

  it('accepts signup with optional fields', () => {
    const data = validate(signupSchema, { email: 'a@b.com', password: 'Pass1234', display_name: 'Test', username: 'test' })
    expect(data.display_name).toBe('Test')
    expect(data.username).toBe('test')
  })

  it('rejects invalid email', () => {
    expect(() => validate(signupSchema, { email: 'bad', password: 'Pass1234' })).toThrow()
  })

  it('rejects short password', () => {
    expect(() => validate(signupSchema, { email: 'a@b.com', password: 'Pass12' })).toThrow()
  })

  it('rejects password without uppercase', () => {
    expect(() => validate(signupSchema, { email: 'a@b.com', password: 'pass1234' })).toThrow()
  })

  it('rejects password without lowercase', () => {
    expect(() => validate(signupSchema, { email: 'a@b.com', password: 'PASS1234' })).toThrow()
  })

  it('rejects password without number', () => {
    expect(() => validate(signupSchema, { email: 'a@b.com', password: 'Password' })).toThrow()
  })
})

describe('loginSchema', () => {
  it('accepts valid login data', () => {
    const data = validate(loginSchema, { login: 'test', password: 'pass' })
    expect(data.login).toBe('test')
    expect(data.password).toBe('pass')
  })

  it('rejects empty login', () => {
    expect(() => validate(loginSchema, { login: '', password: 'pass' })).toThrow()
  })
})

describe('googleAuthSchema', () => {
  it('accepts valid google auth data', () => {
    const data = validate(googleAuthSchema, { id_token: 'abc123' })
    expect(data.id_token).toBe('abc123')
  })

  it('rejects missing id_token', () => {
    expect(() => validate(googleAuthSchema, {})).toThrow()
  })
})

describe('guestSchema', () => {
  it('accepts valid guest data', () => {
    const data = validate(guestSchema, { device_id: 'device-123' })
    expect(data.device_id).toBe('device-123')
  })

  it('rejects empty device_id', () => {
    expect(() => validate(guestSchema, { device_id: '' })).toThrow()
  })
})

describe('updateProfileSchema', () => {
  it('accepts valid profile update', () => {
    const data = validate(updateProfileSchema, { display_name: 'New Name' })
    expect(data.display_name).toBe('New Name')
  })

  it('accepts empty body', () => {
    const data = validate(updateProfileSchema, {})
    expect(data.display_name).toBeUndefined()
  })
})

describe('addHistorySchema', () => {
  it('accepts valid history entry', () => {
    const data = validate(addHistorySchema, { title: 'Song', artist: 'Artist' })
    expect(data.title).toBe('Song')
    expect(data.artist).toBe('Artist')
    expect(data.album).toBe('Unknown Album')
  })

  it('accepts optional fields', () => {
    const data = validate(addHistorySchema, { title: 'Song', artist: 'Artist', album: 'Album', duration_ms: 200000, isrc: 'USABC123' })
    expect(data.album).toBe('Album')
    expect(data.duration_ms).toBe(200000)
    expect(data.isrc).toBe('USABC123')
  })
})

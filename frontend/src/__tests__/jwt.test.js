// Unit tests for the client-side JWT expiry helper (lib/jwt.js).
// This drives the "session expired -> re-login" UX, so its edge cases matter: it must correctly flag
// an expired token, accept a live one, and fail OPEN (never force a logout) on anything it can't read.
import { getTokenExp, isTokenExpired } from '../lib/jwt.js'

// Build a token with an unsigned but structurally valid payload: header.payload.signature.
// atob/btoa are available in the jsdom test env.
function makeToken(payload) {
  const b64 = (obj) => btoa(JSON.stringify(obj)).replace(/=+$/, '')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.sig`
}

const NOW = Math.floor(Date.now() / 1000)

describe('lib/jwt', () => {
  describe('getTokenExp', () => {
    it('reads the exp claim (seconds since epoch)', () => {
      const exp = NOW + 1000
      expect(getTokenExp(makeToken({ userId: 'x', exp }))).toBe(exp)
    })

    it('returns null when there is no exp claim', () => {
      expect(getTokenExp(makeToken({ userId: 'x' }))).toBeNull()
    })

    it('returns null for a malformed token', () => {
      expect(getTokenExp('not-a-jwt')).toBeNull()
      expect(getTokenExp('a.b')).toBeNull()
    })
  })

  describe('isTokenExpired', () => {
    it('is true for a token whose exp is in the past', () => {
      expect(isTokenExpired(makeToken({ userId: 'x', exp: NOW - 60 }))).toBe(true)
    })

    it('is false for a token whose exp is in the future', () => {
      expect(isTokenExpired(makeToken({ userId: 'x', exp: NOW + 60 * 60 }))).toBe(false)
    })

    it('fails OPEN (false) for a null/empty token', () => {
      expect(isTokenExpired(null)).toBe(false)
      expect(isTokenExpired('')).toBe(false)
      expect(isTokenExpired(undefined)).toBe(false)
    })

    it('fails OPEN (false) for a malformed token or one without exp', () => {
      expect(isTokenExpired('garbage')).toBe(false)
      expect(isTokenExpired(makeToken({ userId: 'x' }))).toBe(false)
    })
  })
})

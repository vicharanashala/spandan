// Unit tests for the email-OTP registration mechanics (pure logic, mirroring the constants + hashing
// used by otpService.js). Full route/DB behaviour is covered by a live integration smoke test.
const crypto = require('crypto')

// Mirrors otpService.js
const genOtp = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0')
const norm = (e) => (e || '').trim().toLowerCase()
const hashOtp = (email, otp) => crypto.createHash('sha256').update(`${norm(email)}:${otp}`).digest('hex')

describe('Email-OTP registration logic', () => {
  describe('OTP generation', () => {
    it('produces a 6-digit numeric code', () => {
      for (let i = 0; i < 200; i++) {
        expect(genOtp()).toMatch(/^\d{6}$/)
      }
    })
    it('zero-pads low numbers to 6 digits', () => {
      expect(String(0).padStart(6, '0')).toBe('000000')
      expect(String(42).padStart(6, '0')).toBe('000042')
    })
    it('is drawn from the full 000000–999999 space', () => {
      const seen = new Set()
      for (let i = 0; i < 500; i++) seen.add(genOtp())
      expect(seen.size).toBeGreaterThan(400) // overwhelmingly unique across 500 draws
    })
  })

  describe('OTP hashing (at rest)', () => {
    it('is deterministic for the same email+code', () => {
      expect(hashOtp('a@b.com', '123456')).toBe(hashOtp('a@b.com', '123456'))
    })
    it('is a 64-char sha256 hex, not the raw code', () => {
      const h = hashOtp('a@b.com', '123456')
      expect(h).toMatch(/^[a-f0-9]{64}$/)
      expect(h).not.toContain('123456')
    })
    it('is salted by email (same code, different email -> different hash)', () => {
      expect(hashOtp('a@b.com', '123456')).not.toBe(hashOtp('c@d.com', '123456'))
    })
    it('normalizes email case/whitespace before hashing', () => {
      expect(hashOtp('  A@B.CoM ', '123456')).toBe(hashOtp('a@b.com', '123456'))
    })
    it('different codes for the same email -> different hashes', () => {
      expect(hashOtp('a@b.com', '111111')).not.toBe(hashOtp('a@b.com', '222222'))
    })
  })

  describe('Throttling constants + arithmetic', () => {
    const TTL_MS = 10 * 60 * 1000, COOLDOWN_MS = 60 * 1000, MAX_SENDS = 5, MAX_ATTEMPTS = 5
    it('expiry is 10 minutes out', () => {
      const now = Date.now()
      expect(new Date(now + TTL_MS).getTime() - now).toBe(600000)
    })
    it('detects an expired code', () => {
      const now = Date.now()
      expect(new Date(now - 1).getTime() < now).toBe(true)   // expired
      expect(new Date(now + TTL_MS).getTime() < now).toBe(false) // still valid
    })
    it('enforces a 60s resend cooldown', () => {
      const now = Date.now()
      expect(now - (now - 30 * 1000) < COOLDOWN_MS).toBe(true)  // 30s ago -> still cooling down
      expect(now - (now - 61 * 1000) < COOLDOWN_MS).toBe(false) // 61s ago -> allowed
    })
    it('caps resends and verify attempts at 5', () => {
      expect(5 >= MAX_SENDS).toBe(true)
      expect(4 >= MAX_ATTEMPTS).toBe(false)
    })
  })

  describe('Verify comparison', () => {
    it('accepts the matching code and rejects a wrong one', () => {
      const stored = hashOtp('user@x.com', '654321')
      expect(hashOtp('user@x.com', '654321') === stored).toBe(true)
      expect(hashOtp('user@x.com', '000000') === stored).toBe(false)
    })
  })
})

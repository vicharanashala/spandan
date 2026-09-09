import { describe, it } from 'node:test'
import assert from 'node:assert'
import { checkFocusIntegrity } from '../routes/responses.js'

describe('Focus Mode Distraction Blocker & 2-Second Tab-Switch Guard', () => {
  describe('checkFocusIntegrity', () => {
    it('allows submission when student never lost focus', () => {
      const result = checkFocusIntegrity(false, false, 0)
      assert.strictEqual(result.isLocked, false)
      assert.strictEqual(result.timeAway, 0)
    })

    it('allows submission within the 2-second grace period (< 2.0s)', () => {
      const r1 = checkFocusIntegrity(false, true, 0.8)
      assert.strictEqual(r1.isLocked, false)
      assert.strictEqual(r1.timeAway, 0.8)

      const r2 = checkFocusIntegrity(false, true, 1.5)
      assert.strictEqual(r2.isLocked, false)
      assert.strictEqual(r2.timeAway, 1.5)

      const r3 = checkFocusIntegrity(false, true, 1.99)
      assert.strictEqual(r3.isLocked, false)
      assert.strictEqual(r3.timeAway, 1.99)
    })

    it('locks submission when student is away for 2.0s or more', () => {
      const r1 = checkFocusIntegrity(false, true, 2.0)
      assert.strictEqual(r1.isLocked, true)
      assert.strictEqual(r1.timeAway, 2.0)

      const r2 = checkFocusIntegrity(false, true, 4.5)
      assert.strictEqual(r2.isLocked, true)
      assert.strictEqual(r2.timeAway, 4.5)

      const r3 = checkFocusIntegrity(false, true, 15.0)
      assert.strictEqual(r3.isLocked, true)
      assert.strictEqual(r3.timeAway, 15.0)
    })

    it('locks submission if client explicitly flags focusLocked = true', () => {
      const r = checkFocusIntegrity(true, false, 0)
      assert.strictEqual(r.isLocked, true)
    })

    it('handles untrusted, negative, or malformed timeAway values safely', () => {
      const r1 = checkFocusIntegrity(false, true, -3)
      assert.strictEqual(r1.isLocked, false)
      assert.strictEqual(r1.timeAway, 0)

      const r2 = checkFocusIntegrity(false, true, NaN)
      assert.strictEqual(r2.isLocked, false)
      assert.strictEqual(r2.timeAway, 0)
    })
  })
})

import {
  ChallengeError,
  ChallengeErrorKind,
  safeChallengeCall,
} from '../challenge/errors.js'

describe('challenge/errors -- ChallengeErrorKind', () => {
  test('is a frozen object (cannot be mutated)', () => {
    expect(Object.isFrozen(ChallengeErrorKind)).toBe(true)
  })

  test('exposes the canonical nine kinds', () => {
    const expectedKinds = [
      'MALFORMED',
      'EXPIRED',
      'NOT_YET_VALID',
      'TAMPERED',
      'UNKNOWN_KID',
      'UNSUPPORTED_ALG',
      'MISSING_PREFIX',
      'CLOCK_SKEW',
      'NETWORK',
    ]
    for (const k of expectedKinds) {
      expect(ChallengeErrorKind[k]).toBe(k)
    }
  })

  test('values are distinct strings', () => {
    const values = Object.values(ChallengeErrorKind)
    expect(new Set(values).size).toBe(values.length)
  })
})

describe('challenge/errors -- ChallengeError', () => {
  test('is an Error subclass with the right name', () => {
    const err = new ChallengeError(ChallengeErrorKind.EXPIRED, 'test_reason')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(ChallengeError)
    expect(err.name).toBe('ChallengeError')
  })

  test('exposes .kind and .reason', () => {
    const err = new ChallengeError(ChallengeErrorKind.TAMPERED, 'sig_mismatch')
    expect(err.kind).toBe('TAMPERED')
    expect(err.reason).toBe('sig_mismatch')
  })

  test('message combines kind and reason', () => {
    const err = new ChallengeError(ChallengeErrorKind.EXPIRED, 'past')
    expect(err.message).toBe('[ChallengeError:EXPIRED] past')
  })

  test('preserves the cause when supplied', () => {
    const original = new Error('boom')
    const wrapped = new ChallengeError(
      ChallengeErrorKind.MALFORMED,
      'wrapped',
      { cause: original }
    )
    expect(wrapped.cause).toBe(original)
  })

  test('isChallengeError narrows correctly', () => {
    const ce = new ChallengeError(ChallengeErrorKind.EXPIRED, 'x')
    const gen = new Error('not challenge')
    expect(ChallengeError.isChallengeError(ce)).toBe(true)
    expect(ChallengeError.isChallengeError(gen)).toBe(false)
    expect(ChallengeError.isChallengeError('a string')).toBe(false)
    expect(ChallengeError.isChallengeError(null)).toBe(false)
    expect(ChallengeError.isChallengeError(undefined)).toBe(false)
  })
})

describe('challenge/errors -- safeChallengeCall', () => {
  test('returns the inner value on success', () => {
    const result = safeChallengeCall(() => 42)
    expect(result).toBe(42)
  })

  test('returns the value even if it is falsy (0, null)', () => {
    expect(safeChallengeCall(() => 0)).toBe(0)
    expect(safeChallengeCall(() => null)).toBe(null)
  })

  test('converts a plain Error to ChallengeError(MALFORMED)', () => {
    const result = safeChallengeCall(() => {
      throw new TypeError('oops')
    })
    expect(ChallengeError.isChallengeError(result)).toBe(true)
    expect(result.kind).toBe(ChallengeErrorKind.MALFORMED)
    expect(result.reason).toBe('unexpected_failure')
    expect(result.cause).toBeInstanceOf(TypeError)
  })

  test('passes a ChallengeError through unchanged', () => {
    const original = new ChallengeError(ChallengeErrorKind.TAMPERED, 'x')
    const result = safeChallengeCall(() => {
      throw original
    })
    expect(result).toBe(original)
    expect(result.kind).toBe(ChallengeErrorKind.TAMPERED)
    expect(result.reason).toBe('x')
  })

  test('handles non-Error throws (e.g. throwing a string)', () => {
    const result = safeChallengeCall(() => {
      // eslint-disable-next-line no-throw-literal
      throw 'just a string'
    })
    expect(ChallengeError.isChallengeError(result)).toBe(true)
    expect(result.kind).toBe(ChallengeErrorKind.MALFORMED)
  })

  test('never itself throws', () => {
    // Wrapping a function that throws in turn must not propagate.
    expect(() => {
      safeChallengeCall(() => {
        throw new Error('boom')
      })
    }).not.toThrow()
  })
})

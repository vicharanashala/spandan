// Phase 7 — Challenge Link Verification
// errors.js: typed errors + the canonical kind taxonomy.
//
// Every failure mode in the verification pipeline maps to exactly one
// ChallengeErrorKind. The challengeAlertStore reads `kind` to decide
// which i18n key to render. Adding a new failure mode means adding a
// new kind here FIRST, then surfacing it in the store.

/**
 * @typedef {'MALFORMED'
 *         | 'EXPIRED'
 *         | 'NOT_YET_VALID'
 *         | 'TAMPERED'
 *         | 'UNKNOWN_KID'
 *         | 'UNSUPPORTED_ALG'
 *         | 'MISSING_PREFIX'
 *         | 'CLOCK_SKEW'
 *         | 'NETWORK'} ChallengeErrorKind
 *
 * - MALFORMED:        URL/token structure is unparseable
 * - EXPIRED:          exp claim is in the past (beyond tolerance)
 * - NOT_YET_VALID:    nbf claim is in the future (beyond tolerance)
 * - TAMPERED:         signature verify returned false
 * - UNKNOWN_KID:      kid header is not in the trust set
 * - UNSUPPORTED_ALG:  alg header is not in the allow-list (EdDSA only)
 * - MISSING_PREFIX:   URL is missing the 'spandan:v1:c:' marker
 * - CLOCK_SKEW:       exp/nbf within tolerance but caller is concerned
 * - NETWORK:          JWKS fetch failed
 */

export const ChallengeErrorKind = Object.freeze({
  MALFORMED: 'MALFORMED',
  EXPIRED: 'EXPIRED',
  NOT_YET_VALID: 'NOT_YET_VALID',
  TAMPERED: 'TAMPERED',
  UNKNOWN_KID: 'UNKNOWN_KID',
  UNSUPPORTED_ALG: 'UNSUPPORTED_ALG',
  MISSING_PREFIX: 'MISSING_PREFIX',
  CLOCK_SKEW: 'CLOCK_SKEW',
  NETWORK: 'NETWORK',
})

/**
 * Pure error class. Carries the kind taxonomy, a human-readable
 * reason, and an optional cause (the underlying exception, if any).
 *
 * The class is intentionally minimal — the alert store reads `kind`
 * and `reason` only. No stack-trace manipulation, no error chaining
 * magic. We use the standard `cause` field on Error.
 */
export class ChallengeError extends Error {
  /**
   * @param {ChallengeErrorKind} kind
   * @param {string} reason — short, lowercase, machine-stable identifier
   *                          (NOT a user-facing string — alert store
   *                          maps kind → i18n key)
   * @param {{ cause?: unknown }} [opts]
   */
  constructor(kind, reason, opts = {}) {
    super(`[ChallengeError:${kind}] ${reason}`, { cause: opts.cause })
    this.name = 'ChallengeError'
    this.kind = kind
    this.reason = reason
  }

  /**
   * @param {unknown} err
   * @returns {err is ChallengeError}
   */
  static isChallengeError(err) {
    return err instanceof ChallengeError
  }
}

/**
 * Defensive wrapper: if a verifier call site throws something that
 * ISN'T a ChallengeError, convert it to MALFORMED. This is the
 * boundary the draft §6 promises: "every verifier call site wraps
 * in try/catch, on thrown error set active=true, kind='MALFORMED',
 * never throw upward."
 *
 * @template T
 * @param {() => T} fn
 * @returns {T | ChallengeError}
 *   - On success: the function's return value.
 *   - On any throw: a ChallengeError with kind='MALFORMED' (or the
 *     original ChallengeError if it was already one).
 */
export function safeChallengeCall(fn) {
  try {
    return fn()
  } catch (err) {
    if (ChallengeError.isChallengeError(err)) return err
    return new ChallengeError(
      ChallengeErrorKind.MALFORMED,
      'unexpected_failure',
      { cause: err }
    )
  }
}

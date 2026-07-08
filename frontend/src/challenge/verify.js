// Phase 7 — Challenge Link Verification
// verify.js: pure signature-verify of a challenge JWT.
//
// The function takes:
//   - a JWT (string, three dot-separated base64url segments)
//   - a key resolver: (kid) => Promise<CryptoKey> | CryptoKey
//   - optional clock + tolerance overrides (default Date.now(), 30s)
//
// It throws ChallengeError on any failure. It NEVER throws a non-
// ChallengeError — every internal error is mapped. The caller is
// expected to wrap in try/catch and forward to the alert store.
//
// Spec: Phase 7 Draft §3 + §5.

import { ChallengeError, ChallengeErrorKind } from './errors.js'
import { decodeJwt, EXPECTED_ALG, EXPECTED_TYP } from './envelope.js'

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_CLOCK_TOLERANCE_SEC = 30
export const DEFAULT_MAX_EXP_SEC = 24 * 60 * 60   // 24h hard cap
export const DEFAULT_DEFAULT_EXP_SEC = 60 * 60    // 1h default lifetime

// ---------------------------------------------------------------------------
// Header / claim validation
// ---------------------------------------------------------------------------

/**
 * Validate the JWT header. Pure check, no crypto.
 * @param {object} header
 * @throws {ChallengeError}
 */
export function checkHeader(header) {
  if (!header || typeof header !== 'object') {
    throw new ChallengeError(ChallengeErrorKind.MALFORMED, 'check_header_not_object')
  }
  if (header.alg !== EXPECTED_ALG) {
    throw new ChallengeError(
      ChallengeErrorKind.UNSUPPORTED_ALG,
      `check_header_alg:${String(header.alg)}`
    )
  }
  // typ is optional per RFC 7519, but if present MUST be 'JWT' (or 'at+jwt').
  // We accept both.
  if (header.typ !== undefined && header.typ !== EXPECTED_TYP && header.typ !== 'at+jwt') {
    throw new ChallengeError(
      ChallengeErrorKind.MALFORMED,
      `check_header_typ:${String(header.typ)}`
    )
  }
  if (typeof header.kid !== 'string' || header.kid.length === 0) {
    throw new ChallengeError(ChallengeErrorKind.UNKNOWN_KID, 'check_header_no_kid')
  }
}

/**
 * Validate the time claims (exp, nbf, iat) within tolerance.
 * @param {object} payload
 * @param {number} nowSec
 * @param {number} toleranceSec
 * @throws {ChallengeError}
 */
export function checkTimeClaims(payload, nowSec, toleranceSec) {
  if (!payload || typeof payload !== 'object') {
    throw new ChallengeError(ChallengeErrorKind.MALFORMED, 'check_time_not_object')
  }
  if (typeof payload.exp !== 'number') {
    throw new ChallengeError(ChallengeErrorKind.MALFORMED, 'check_time_no_exp')
  }
  if (typeof payload.nbf !== 'number' && payload.nbf !== undefined) {
    throw new ChallengeError(ChallengeErrorKind.MALFORMED, 'check_time_bad_nbf')
  }
  // exp must be in the future (nowSec + tolerance < exp)
  if (nowSec - toleranceSec >= payload.exp) {
    throw new ChallengeError(ChallengeErrorKind.EXPIRED, `check_time_exp:${payload.exp}`)
  }
  // nbf must be in the past (nowSec - tolerance >= nbf)
  if (typeof payload.nbf === 'number' && nowSec + toleranceSec < payload.nbf) {
    throw new ChallengeError(
      ChallengeErrorKind.NOT_YET_VALID,
      `check_time_nbf:${payload.nbf}`
    )
  }
}

// ---------------------------------------------------------------------------
// Key import (raw 32-byte Ed25519 public key, base64url-encoded)
// ---------------------------------------------------------------------------

/**
 * Import a base64url-encoded raw 32-byte Ed25519 public key into a
 * CryptoKey suitable for crypto.subtle.verify.
 *
 * @param {string} publicKeyB64u
 * @returns {Promise<CryptoKey>}
 * @throws {ChallengeError}
 */
export async function importEd25519PublicKey(publicKeyB64u) {
  if (typeof publicKeyB64u !== 'string' || publicKeyB64u.length === 0) {
    throw new ChallengeError(ChallengeErrorKind.MALFORMED, 'import_key_empty')
  }
  // Lazy import to avoid forcing b64uDecode to load in non-crypto code paths.
  const { b64uDecode } = await import('./envelope.js')
  let raw
  try {
    raw = b64uDecode(publicKeyB64u)
  } catch (err) {
    throw new ChallengeError(
      ChallengeErrorKind.MALFORMED,
      'import_key_bad_b64u',
      { cause: err }
    )
  }
  if (raw.byteLength !== 32) {
    throw new ChallengeError(
      ChallengeErrorKind.MALFORMED,
      `import_key_wrong_length:${raw.byteLength}`
    )
  }
  try {
    return await crypto.subtle.importKey(
      'raw',
      raw,
      { name: 'Ed25519' },
      true,
      ['verify']
    )
  } catch (err) {
    throw new ChallengeError(
      ChallengeErrorKind.MALFORMED,
      'import_key_subtle_failed',
      { cause: err }
    )
  }
}

// ---------------------------------------------------------------------------
// The public API
// ---------------------------------------------------------------------------

/**
 * Verify a challenge JWT.
 *
 * @param {string} jwt — the three-segment compact JWT (no marker)
 * @param {object} opts
 * @param {string} opts.publicKeyB64u — 32-byte Ed25519 public key,
 *   base64url-encoded. Caller is expected to have looked this up
 *   from the JWKS or env-baked fallback. The draft §4 keeps
 *   kid → key resolution OUTSIDE this function.
 * @param {number} [opts.nowSec=Math.floor(Date.now()/1000)]
 * @param {number} [opts.clockToleranceSec=30]
 * @returns {Promise<{ header: object, payload: object, valid: true }>}
 * @throws {ChallengeError} — always a ChallengeError, never a raw Error.
 */
export async function verifyChallengeJwt(jwt, opts) {
  const {
    publicKeyB64u,
    nowSec = Math.floor(Date.now() / 1000),
    clockToleranceSec = DEFAULT_CLOCK_TOLERANCE_SEC,
  } = opts || {}

  if (typeof publicKeyB64u !== 'string') {
    throw new ChallengeError(
      ChallengeErrorKind.MALFORMED,
      'verify_no_public_key'
    )
  }

  // 1. Structural decode
  let decoded
  try {
    decoded = decodeJwt(jwt)
  } catch (err) {
    if (ChallengeError.isChallengeError(err)) throw err
    throw new ChallengeError(
      ChallengeErrorKind.MALFORMED,
      'verify_decode_unexpected',
      { cause: err }
    )
  }
  const { header, payload, signatureBytes, signingInput } = decoded

  // 2. Header sanity (alg, typ, kid) — pure
  checkHeader(header)

  // 3. Time claims — pure
  checkTimeClaims(payload, nowSec, clockToleranceSec)

  // 4. Import the public key
  const publicKey = await importEd25519PublicKey(publicKeyB64u)

  // 5. Signature verify — the only step that actually uses crypto.subtle
  let signatureOk = false
  try {
    signatureOk = await crypto.subtle.verify(
      { name: 'Ed25519' },
      publicKey,
      signatureBytes,
      signingInput
    )
  } catch (err) {
    throw new ChallengeError(
      ChallengeErrorKind.MALFORMED,
      'verify_subtle_threw',
      { cause: err }
    )
  }
  if (!signatureOk) {
    throw new ChallengeError(
      ChallengeErrorKind.TAMPERED,
      'verify_signature_mismatch'
    )
  }

  return { header, payload, valid: true }
}

// Phase 7 — Challenge Link Verification
// envelope.js: parse a challenge URL into its structured pieces.
//
// URL grammar (per Phase 7 Draft §2.1, Option 2.1):
//
//   https://<host>/<any-path>?token=spandan:v1:c:<jwt>
//                            └──────── marker ─────────┘
//
// The 'spandan:v1:c:' marker is a *feature flag*, not parsed as a real
// URL scheme. The actual envelope is the JWT (three dot-separated
// base64url segments). The marker exists for forward compatibility:
// v2 / v3 envelopes can change shape without breaking parsers
// that check the prefix first.
//
// This module is pure: no I/O, no clock, no randomness. Tests can
// exercise every code path deterministically.

import { ChallengeError, ChallengeErrorKind } from './errors.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const CHALLENGE_MARKER = 'spandan:v1:c:'
export const EXPECTED_ALG = 'EdDSA'
export const EXPECTED_TYP = 'JWT'

// ---------------------------------------------------------------------------
// Base64url codec (RFC 7515 — unpadded, URL-safe)
// ---------------------------------------------------------------------------

/**
 * Decode a base64url string (no padding) to a Uint8Array.
 * Strict: throws ChallengeError(MALFORMED) on invalid input.
 *
 * @param {string} str
 * @returns {Uint8Array}
 */
export function b64uDecode(str) {
  if (typeof str !== 'string') {
    throw new ChallengeError(ChallengeErrorKind.MALFORMED, 'b64u_decode_not_string')
  }
  if (str.length === 0) {
    return new Uint8Array(0)
  }
  // URL-safe → standard
  const std = str.replace(/-/g, '+').replace(/_/g, '/')
  // Re-pad
  const pad = (4 - (std.length % 4)) % 4
  const padded = std + '='.repeat(pad)
  // Validate alphabet (after pad-strip, only [A-Za-z0-9+/=] should remain)
  if (!/^[A-Za-z0-9+/]+=*$/.test(padded)) {
    throw new ChallengeError(ChallengeErrorKind.MALFORMED, 'b64u_decode_bad_alphabet')
  }
  let binary
  try {
    binary = atob(padded)
  } catch (err) {
    throw new ChallengeError(ChallengeErrorKind.MALFORMED, 'b64u_decode_atob_failed', { cause: err })
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * Encode bytes to a base64url string (no padding).
 *
 * @param {Uint8Array | ArrayBuffer} input
 * @returns {string}
 */
export function b64uEncode(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  const std = btoa(binary)
  return std.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Decode a base64url string into a UTF-8 string.
 * @param {string} str
 * @returns {string}
 */
export function b64uDecodeString(str) {
  const bytes = b64uDecode(str)
  return new TextDecoder().decode(bytes)
}

// ---------------------------------------------------------------------------
// Token parsing (extract the JWT from a URL or a raw marker string)
// ---------------------------------------------------------------------------

/**
 * Strip the marker prefix from a raw token string.
 *
 * Accepts:
 *   - 'spandan:v1:c:<jwt>'  → returns '<jwt>'
 *   - 'spandan:v1:c:'       → throws (empty payload)
 *
 * Rejects:
 *   - missing prefix       → ChallengeError(MISSING_PREFIX)
 *   - empty input          → ChallengeError(MALFORMED)
 *
 * @param {string} raw
 * @returns {string} the bare JWT (three dot-separated base64url segments)
 */
export function stripMarker(raw) {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new ChallengeError(ChallengeErrorKind.MALFORMED, 'strip_marker_empty')
  }
  if (!raw.startsWith(CHALLENGE_MARKER)) {
    throw new ChallengeError(ChallengeErrorKind.MISSING_PREFIX, 'strip_marker_no_prefix')
  }
  const jwt = raw.slice(CHALLENGE_MARKER.length)
  if (jwt.length === 0) {
    throw new ChallengeError(ChallengeErrorKind.MALFORMED, 'strip_marker_empty_jwt')
  }
  return jwt
}

/**
 * Extract the JWT from an arbitrary URL string.
 *
 * Looks for a `token` query parameter. The token may be either:
 *   1. raw marker form: 'spandan:v1:c:<jwt>' (preferred — full marker)
 *   2. bare JWT: '<h>.<p>.<s>' (the URL host already prefixed for us)
 *
 * Per Phase 7 Draft §6 (Option 1), a URL with no token at all is a
 * hard failure: { ok: false, kind: 'MALFORMED', reason: 'NO_TOKEN' }.
 *
 * @param {string} href
 * @returns {{ ok: true, jwt: string, fromQueryParam: 'token' }
 *         | { ok: false, kind: import('./errors.js').ChallengeErrorKind,
 *             reason: string }}
 */
export function parseChallengeLink(href) {
  if (typeof href !== 'string' || href.length === 0) {
    return {
      ok: false,
      kind: ChallengeErrorKind.MALFORMED,
      reason: 'parse_challenge_link_empty',
    }
  }
  let parsed
  try {
    parsed = new URL(href)
  } catch (err) {
    return {
      ok: false,
      kind: ChallengeErrorKind.MALFORMED,
      reason: 'parse_challenge_link_bad_url',
    }
  }
  const token = parsed.searchParams.get('token')
  if (token === null || token.length === 0) {
    return {
      ok: false,
      kind: ChallengeErrorKind.MALFORMED,
      reason: 'parse_challenge_link_no_token',
    }
  }
  // If the marker is present, strip it. If absent, assume the URL host
  // already added it.
  const jwt = token.startsWith(CHALLENGE_MARKER)
    ? stripMarker(token)
    : token
  return { ok: true, jwt, fromQueryParam: 'token' }
}

// ---------------------------------------------------------------------------
// JWT unpacking (the three-segment split + base64url decode)
// ---------------------------------------------------------------------------

/**
 * Split a JWT into its three segments. Pure string operation — does
 * NOT decode.
 *
 * @param {string} jwt
 * @returns {{ header: string, payload: string, signature: string }}
 * @throws {ChallengeError} MALFORMED on wrong segment count.
 */
export function splitJwt(jwt) {
  if (typeof jwt !== 'string' || jwt.length === 0) {
    throw new ChallengeError(ChallengeErrorKind.MALFORMED, 'split_jwt_empty')
  }
  const parts = jwt.split('.')
  if (parts.length !== 3) {
    throw new ChallengeError(
      ChallengeErrorKind.MALFORMED,
      `split_jwt_wrong_segments:${parts.length}`
    )
  }
  const [header, payload, signature] = parts
  if (!header || !payload || !signature) {
    throw new ChallengeError(ChallengeErrorKind.MALFORMED, 'split_jwt_empty_segment')
  }
  return { header, payload, signature }
}

/**
 * Decode a JWT into its structured form. Returns the raw bytes of
 * each segment so verify.js can pass them to crypto.subtle.verify
 * without round-tripping through strings.
 *
 * Does NOT verify anything. Use verifyChallengeJwt for that.
 *
 * @param {string} jwt
 * @returns {{
 *   headerBytes: Uint8Array,
 *   payloadBytes: Uint8Array,
 *   signatureBytes: Uint8Array,
 *   headerText: string,
 *   payloadText: string,
 *   signingInput: Uint8Array,
 *   header: object,
 *   payload: object,
 * }}
 * @throws {ChallengeError} MALFORMED on any structural failure.
 */
export function decodeJwt(jwt) {
  const { header, payload, signature } = splitJwt(jwt)
  let headerBytes, payloadBytes, signatureBytes
  try {
    headerBytes = b64uDecode(header)
    payloadBytes = b64uDecode(payload)
    signatureBytes = b64uDecode(signature)
  } catch (err) {
    // Re-throw preserving kind. b64uDecode already throws ChallengeError.
    throw err
  }
  // The signing input per RFC 7515 §5.2 is the ASCII bytes of
  //   <header_b64u> + '.' + <payload_b64u>
  // i.e. the first two JWT segments joined by a dot.
  const signingInput = new TextEncoder().encode(`${header}.${payload}`)
  let headerJson, payloadJson
  try {
    headerJson = JSON.parse(new TextDecoder().decode(headerBytes))
    payloadJson = JSON.parse(new TextDecoder().decode(payloadBytes))
  } catch (err) {
    throw new ChallengeError(
      ChallengeErrorKind.MALFORMED,
      'decode_jwt_bad_json',
      { cause: err }
    )
  }
  return {
    headerBytes,
    payloadBytes,
    signatureBytes,
    headerText: header,
    payloadText: payload,
    signingInput,
    header: headerJson,
    payload: payloadJson,
  }
}
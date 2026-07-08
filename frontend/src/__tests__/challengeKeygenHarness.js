// Test-only helper for Phase 7 verification tests.
// Generates an Ed25519 keypair and signs arbitrary JWTs against it.
// NEVER include this in production bundles — `_test_` files in __tests__
// are excluded from coverage and the bundler would tree-shake them,
// but let's be explicit.

import { b64uEncode, CHALLENGE_MARKER } from '../challenge/envelope.js'

/**
 * Generate a fresh Ed25519 keypair. Returns CryptoKey instances plus
 * the raw 32-byte public key as base64url (suitable for
 * importEd25519PublicKey).
 *
 * @returns {Promise<{ publicKey: CryptoKey, privateKey: CryptoKey,
 *   publicKeyB64u: string, kid: string }>}
 */
export async function generateTestKeypair() {
  const kp = await crypto.subtle.generateKey(
    { name: 'Ed25519' },
    true,
    ['sign', 'verify']
  )
  const raw = await crypto.subtle.exportKey('raw', kp.publicKey)
  const publicKeyB64u = b64uEncode(new Uint8Array(raw))
  const kid = `test-key-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return { publicKey: kp.publicKey, privateKey: kp.privateKey, publicKeyB64u, kid }
}

/**
 * Sign a JWT for a given keypair and claims. Pure Ed25519 signature
 * over the standard signing input.
 *
 * @param {object} args
 * @param {CryptoKey} args.privateKey
 * @param {string} args.kid
 * @param {object} args.payload — claims (no exp/nbf/iat required;
 *   signJwtTest fills sensible defaults if absent)
 * @param {string} [args.alg='EdDSA']
 * @param {string} [args.typ='JWT']
 * @returns {Promise<{ jwt: string, markerJwt: string, header: object,
 *   payload: object, signatureB64u: string }>}
 */
export async function signJwtTest({ privateKey, kid, payload, alg = 'EdDSA', typ = 'JWT' }) {
  const now = Math.floor(Date.now() / 1000)
  const fullPayload = {
    iat: payload.iat !== undefined ? payload.iat : now,
    nbf: payload.nbf !== undefined ? payload.nbf : now,
    exp: payload.exp !== undefined ? payload.exp : now + 3600,
    ...payload,
  }
  const header = { alg, typ, kid }
  const headerB64u = b64uEncode(new TextEncoder().encode(JSON.stringify(header)))
  const payloadB64u = b64uEncode(new TextEncoder().encode(JSON.stringify(fullPayload)))
  const signingInput = new TextEncoder().encode(`${headerB64u}.${payloadB64u}`)
  const sigBytes = await crypto.subtle.sign({ name: 'Ed25519' }, privateKey, signingInput)
  const signatureB64u = b64uEncode(new Uint8Array(sigBytes))
  const jwt = `${headerB64u}.${payloadB64u}.${signatureB64u}`
  const markerJwt = `${CHALLENGE_MARKER}${jwt}`
  return { jwt, markerJwt, header, payload: fullPayload, signatureB64u }
}

/**
 * Convenience: build a keypair + sign a token in one call.
 * @param {object} payload
 * @param {object} [overrides]
 * @returns {Promise<{ jwt, markerJwt, publicKeyB64u, kid, privateKey, publicKey }>}
 */
export async function mintTestToken(payload, overrides = {}) {
  const kp = await generateTestKeypair()
  const signed = await signJwtTest({
    privateKey: kp.privateKey,
    kid: kp.kid,
    payload: { ...payload, ...overrides.payload },
    ...overrides,
  })
  return {
    jwt: signed.jwt,
    markerJwt: signed.markerJwt,
    publicKeyB64u: kp.publicKeyB64u,
    kid: kp.kid,
    privateKey: kp.privateKey,
    publicKey: kp.publicKey,
  }
}

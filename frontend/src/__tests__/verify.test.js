import {
  checkHeader,
  checkTimeClaims,
  importEd25519PublicKey,
  verifyChallengeJwt,
  DEFAULT_CLOCK_TOLERANCE_SEC,
  DEFAULT_DEFAULT_EXP_SEC,
  DEFAULT_MAX_EXP_SEC,
} from '../challenge/verify.js'
import { ChallengeError, ChallengeErrorKind } from '../challenge/errors.js'
import { mintTestToken, generateTestKeypair } from './challengeKeygenHarness.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('challenge/verify -- constants', () => {
  test('DEFAULT_CLOCK_TOLERANCE_SEC is 30', () => {
    expect(DEFAULT_CLOCK_TOLERANCE_SEC).toBe(30)
  })

  test('DEFAULT_DEFAULT_EXP_SEC is 3600 (1h)', () => {
    expect(DEFAULT_DEFAULT_EXP_SEC).toBe(3600)
  })

  test('DEFAULT_MAX_EXP_SEC is 86400 (24h)', () => {
    expect(DEFAULT_MAX_EXP_SEC).toBe(86400)
  })
})

// ---------------------------------------------------------------------------
// checkHeader (pure)
// ---------------------------------------------------------------------------

describe('challenge/verify -- checkHeader', () => {
  test('accepts a valid EdDSA + JWT + kid header', () => {
    expect(() => checkHeader({ alg: 'EdDSA', typ: 'JWT', kid: 'k1' })).not.toThrow()
  })

  test('accepts at+jwt typ variant', () => {
    expect(() => checkHeader({ alg: 'EdDSA', typ: 'at+jwt', kid: 'k1' })).not.toThrow()
  })

  test('rejects non-object header with MALFORMED', () => {
    expect(() => checkHeader(null)).toThrow(ChallengeError)
    expect(() => checkHeader('header')).toThrow(ChallengeError)
    expect(() => checkHeader(undefined)).toThrow(ChallengeError)
    try { checkHeader(null) } catch (e) {
      expect(e.kind).toBe(ChallengeErrorKind.MALFORMED)
      expect(e.reason).toBe('check_header_not_object')
    }
  })

  test('rejects HS256 (symmetric) with UNSUPPORTED_ALG', () => {
    expect(() => checkHeader({ alg: 'HS256', kid: 'k1' })).toThrow(ChallengeError)
    try { checkHeader({ alg: 'HS256', kid: 'k1' }) } catch (e) {
      expect(e.kind).toBe(ChallengeErrorKind.UNSUPPORTED_ALG)
      expect(e.reason).toMatch(/check_header_alg:HS256/)
    }
  })

  test('rejects RS256 with UNSUPPORTED_ALG', () => {
    expect(() => checkHeader({ alg: 'RS256', typ: 'JWT', kid: 'k1' })).toThrow(ChallengeError)
  })

  test('rejects unknown typ with MALFORMED', () => {
    expect(() => checkHeader({ alg: 'EdDSA', typ: 'JOSE', kid: 'k1' })).toThrow(ChallengeError)
    try { checkHeader({ alg: 'EdDSA', typ: 'JOSE', kid: 'k1' }) } catch (e) {
      expect(e.kind).toBe(ChallengeErrorKind.MALFORMED)
    }
  })

  test('rejects missing kid with UNKNOWN_KID', () => {
    expect(() => checkHeader({ alg: 'EdDSA', typ: 'JWT' })).toThrow(ChallengeError)
    try { checkHeader({ alg: 'EdDSA', typ: 'JWT' }) } catch (e) {
      expect(e.kind).toBe(ChallengeErrorKind.UNKNOWN_KID)
      expect(e.reason).toBe('check_header_no_kid')
    }
  })

  test('rejects empty-string kid with UNKNOWN_KID', () => {
    expect(() => checkHeader({ alg: 'EdDSA', typ: 'JWT', kid: '' })).toThrow(ChallengeError)
    try { checkHeader({ alg: 'EdDSA', typ: 'JWT', kid: '' }) } catch (e) {
      expect(e.kind).toBe(ChallengeErrorKind.UNKNOWN_KID)
    }
  })

  test('rejects non-string kid with UNKNOWN_KID', () => {
    expect(() => checkHeader({ alg: 'EdDSA', typ: 'JWT', kid: 42 })).toThrow(ChallengeError)
  })
})

// ---------------------------------------------------------------------------
// checkTimeClaims (pure)
// ---------------------------------------------------------------------------

describe('challenge/verify -- checkTimeClaims', () => {
  const now = 1_700_000_000

  test('accepts a token whose exp is in the future', () => {
    expect(() => checkTimeClaims({ exp: now + 60 }, now, 0)).not.toThrow()
  })

  test('rejects expired token (exp far in the past) with EXPIRED', () => {
    expect(() => checkTimeClaims({ exp: now - 60 }, now, 0)).toThrow(ChallengeError)
    try { checkTimeClaims({ exp: now - 60 }, now, 0) } catch (e) {
      expect(e.kind).toBe(ChallengeErrorKind.EXPIRED)
    }
  })

  test('tolerates a small clock skew at the boundary', () => {
    // exp is 5 seconds in the past, tolerance is 10 seconds → OK
    expect(() => checkTimeClaims({ exp: now - 5 }, now, 10)).not.toThrow()
    // exp is 5 seconds in the past, tolerance is 0 seconds → reject
    expect(() => checkTimeClaims({ exp: now - 5 }, now, 0)).toThrow(ChallengeError)
  })

  test('rejects not-yet-valid (nbf in the future) with NOT_YET_VALID', () => {
    expect(() => checkTimeClaims({ exp: now + 60, nbf: now + 60 }, now, 0)).toThrow(ChallengeError)
    try { checkTimeClaims({ exp: now + 60, nbf: now + 60 }, now, 0) } catch (e) {
      expect(e.kind).toBe(ChallengeErrorKind.NOT_YET_VALID)
    }
  })

  test('tolerates a small clock skew on nbf', () => {
    expect(() => checkTimeClaims({ exp: now + 60, nbf: now + 5 }, now, 10)).not.toThrow()
    expect(() => checkTimeClaims({ exp: now + 60, nbf: now + 5 }, now, 0)).toThrow(ChallengeError)
  })

  test('treats nbf as optional (omitted is fine)', () => {
    expect(() => checkTimeClaims({ exp: now + 60 }, now, 0)).not.toThrow()
  })

  test('rejects missing exp with MALFORMED', () => {
    expect(() => checkTimeClaims({}, now, 0)).toThrow(ChallengeError)
    try { checkTimeClaims({}, now, 0) } catch (e) {
      expect(e.kind).toBe(ChallengeErrorKind.MALFORMED)
      expect(e.reason).toBe('check_time_no_exp')
    }
  })

  test('rejects non-number exp with MALFORMED', () => {
    expect(() => checkTimeClaims({ exp: 'tomorrow' }, now, 0)).toThrow(ChallengeError)
  })

  test('rejects non-number nbf with MALFORMED', () => {
    expect(() => checkTimeClaims({ exp: now + 60, nbf: 'now' }, now, 0)).toThrow(ChallengeError)
  })
})

// ---------------------------------------------------------------------------
// importEd25519PublicKey
// ---------------------------------------------------------------------------

describe('challenge/verify -- importEd25519PublicKey', () => {
  test('imports a 32-byte base64url public key', async () => {
    const kp = await generateTestKeypair()
    const cryptoKey = await importEd25519PublicKey(kp.publicKeyB64u)
    // jsdom does not expose `CryptoKey` as a global; the result is a real
    // WebCrypto CryptoKey object (the WebCrypto spec exposes algorithm and
    // usages on every CryptoKey regardless of host environment).
    expect(cryptoKey).toBeDefined()
    expect(cryptoKey.algorithm.name).toBe('Ed25519')
    expect(cryptoKey.usages).toContain('verify')
  })

  test('rejects empty string with MALFORMED', async () => {
    await expect(importEd25519PublicKey('')).rejects.toThrow(ChallengeError)
    try { await importEd25519PublicKey('') } catch (e) {
      expect(e.kind).toBe(ChallengeErrorKind.MALFORMED)
      expect(e.reason).toBe('import_key_empty')
    }
  })

  test('rejects non-string with MALFORMED', async () => {
    await expect(importEd25519PublicKey(null)).rejects.toThrow(ChallengeError)
    await expect(importEd25519PublicKey(undefined)).rejects.toThrow(ChallengeError)
  })

  test('rejects wrong-length key with MALFORMED', async () => {
    // Use a valid 16-byte base64url string — wrong length for Ed25519 (32)
    const tooShort = Buffer.from(new Uint8Array(16)).toString('base64url')
    await expect(importEd25519PublicKey(tooShort)).rejects.toThrow(ChallengeError)
    try { await importEd25519PublicKey(tooShort) } catch (e) {
      expect(e.kind).toBe(ChallengeErrorKind.MALFORMED)
      expect(e.reason).toMatch(/import_key_wrong_length:16/)
    }
  })
})

// ---------------------------------------------------------------------------
// verifyChallengeJwt (the public API) — happy + sad paths
// ---------------------------------------------------------------------------

describe('challenge/verify -- verifyChallengeJwt (happy path)', () => {
  test('verifies a freshly minted token with the matching public key', async () => {
    const minted = await mintTestToken({
      iss: 'spandan.session-signer',
      aud: 'spandan.peer-review.v1',
      sub: 'user-1',
      qid: 'q-1',
      sid: 's-1',
      jti: 'jti-1',
      scope: 'join-peer-review',
    })
    const result = await verifyChallengeJwt(minted.jwt, {
      publicKeyB64u: minted.publicKeyB64u,
    })
    expect(result.valid).toBe(true)
    expect(result.payload.sub).toBe('user-1')
    expect(result.header.kid).toBe(minted.kid)
  })

  test('accepts a token with at+jwt typ', async () => {
    const kp = await generateTestKeypair()
    const { signJwtTest } = await import('./challengeKeygenHarness.js')
    const signed = await signJwtTest({
      privateKey: kp.privateKey,
      kid: kp.kid,
      payload: { sub: 'u', exp: Math.floor(Date.now() / 1000) + 3600 },
      typ: 'at+jwt',
    })
    const result = await verifyChallengeJwt(signed.jwt, {
      publicKeyB64u: kp.publicKeyB64u,
    })
    expect(result.valid).toBe(true)
  })
})

describe('challenge/verify -- verifyChallengeJwt (signature failures)', () => {
  test('rejects when the JWT is signed by a different key (TAMPERED)', async () => {
    const good = await mintTestToken({ sub: 'u', qid: 'q', sid: 's' })
    const evil = await generateTestKeypair()  // different keypair
    await expect(
      verifyChallengeJwt(good.jwt, { publicKeyB64u: evil.publicKeyB64u })
    ).rejects.toMatchObject({ kind: ChallengeErrorKind.TAMPERED })
  })

  test('rejects when the payload is tampered post-signing (TAMPERED)', async () => {
    const minted = await mintTestToken({ sub: 'user-original', qid: 'q-original' })
    // Decode, mutate payload, re-encode — but keep the original signature.
    // verify must see signature mismatch and throw TAMPERED.
    const { b64uDecode, b64uDecodeString, b64uEncode } = await import('../challenge/envelope.js')
    const parts = minted.jwt.split('.')
    const tamperedPayload = JSON.parse(b64uDecodeString(parts[1]))
    tamperedPayload.sub = 'user-evil'
    parts[1] = b64uEncode(new TextEncoder().encode(JSON.stringify(tamperedPayload)))
    const tamperedJwt = parts.join('.')
    await expect(
      verifyChallengeJwt(tamperedJwt, { publicKeyB64u: minted.publicKeyB64u })
    ).rejects.toMatchObject({ kind: ChallengeErrorKind.TAMPERED })
  })

  test('rejects a JWT with completely garbage signature (TAMPERED)', async () => {
    const minted = await mintTestToken({ sub: 'u' })
    const parts = minted.jwt.split('.')
    parts[2] = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    const badSig = parts.join('.')
    await expect(
      verifyChallengeJwt(badSig, { publicKeyB64u: minted.publicKeyB64u })
    ).rejects.toMatchObject({ kind: ChallengeErrorKind.TAMPERED })
  })
})

describe('challenge/verify -- verifyChallengeJwt (header failures)', () => {
  test('rejects HS256 token with UNSUPPORTED_ALG', async () => {
    // Hand-craft a JWT with alg=HS256. The signature won't matter because
    // the header check should fire first.
    const kp = await generateTestKeypair()
    const { b64uEncode } = await import('../challenge/envelope.js')
    const header = b64uEncode(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: kp.kid })))
    const payload = b64uEncode(new TextEncoder().encode(JSON.stringify({
      sub: 'u', exp: Math.floor(Date.now() / 1000) + 3600,
    })))
    const fakeSig = b64uEncode(new Uint8Array(32))  // any size, won't be checked
    const jwt = `${header}.${payload}.${fakeSig}`
    await expect(
      verifyChallengeJwt(jwt, { publicKeyB64u: kp.publicKeyB64u })
    ).rejects.toMatchObject({ kind: ChallengeErrorKind.UNSUPPORTED_ALG })
  })

  test('rejects header with missing kid (UNKNOWN_KID)', async () => {
    const kp = await generateTestKeypair()
    const { b64uEncode } = await import('../challenge/envelope.js')
    const header = b64uEncode(new TextEncoder().encode(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' })))
    const payload = b64uEncode(new TextEncoder().encode(JSON.stringify({
      sub: 'u', exp: Math.floor(Date.now() / 1000) + 3600,
    })))
    const sig = b64uEncode(new Uint8Array(64))
    const jwt = `${header}.${payload}.${sig}`
    await expect(
      verifyChallengeJwt(jwt, { publicKeyB64u: kp.publicKeyB64u })
    ).rejects.toMatchObject({ kind: ChallengeErrorKind.UNKNOWN_KID })
  })
})

describe('challenge/verify -- verifyChallengeJwt (time failures)', () => {
  test('rejects an expired token (EXPIRED)', async () => {
    const past = Math.floor(Date.now() / 1000) - 7200  // 2 hours ago
    const minted = await mintTestToken({
      sub: 'u',
      iat: past,
      nbf: past,
      exp: past + 60,  // expired 1h41m ago
    })
    await expect(
      verifyChallengeJwt(minted.jwt, { publicKeyB64u: minted.publicKeyB64u })
    ).rejects.toMatchObject({ kind: ChallengeErrorKind.EXPIRED })
  })

  test('rejects a not-yet-valid token (NOT_YET_VALID)', async () => {
    const future = Math.floor(Date.now() / 1000) + 7200  // 2 hours from now
    const minted = await mintTestToken({
      sub: 'u',
      nbf: future,
      exp: future + 60,
    })
    await expect(
      verifyChallengeJwt(minted.jwt, { publicKeyB64u: minted.publicKeyB64u })
    ).rejects.toMatchObject({ kind: ChallengeErrorKind.NOT_YET_VALID })
  })
})

describe('challenge/verify -- verifyChallengeJwt (input validation)', () => {
  test('rejects when publicKeyB64u is missing (MALFORMED)', async () => {
    const minted = await mintTestToken({ sub: 'u' })
    await expect(
      verifyChallengeJwt(minted.jwt, { /* no publicKeyB64u */ })
    ).rejects.toMatchObject({ kind: ChallengeErrorKind.MALFORMED })
  })

  test('rejects when publicKeyB64u is wrong type (MALFORMED)', async () => {
    const minted = await mintTestToken({ sub: 'u' })
    await expect(
      verifyChallengeJwt(minted.jwt, { publicKeyB64u: 123 })
    ).rejects.toMatchObject({ kind: ChallengeErrorKind.MALFORMED })
  })

  test('rejects a JWT with the wrong segment count (MALFORMED)', async () => {
    const kp = await generateTestKeypair()
    await expect(
      verifyChallengeJwt('aaa.bbb', { publicKeyB64u: kp.publicKeyB64u })
    ).rejects.toMatchObject({ kind: ChallengeErrorKind.MALFORMED })
  })

  test('rejects a JWT with garbage base64 (MALFORMED)', async () => {
    const kp = await generateTestKeypair()
    await expect(
      verifyChallengeJwt('!!!.@@@.###', { publicKeyB64u: kp.publicKeyB64u })
    ).rejects.toMatchObject({ kind: ChallengeErrorKind.MALFORMED })
  })
})

describe('challenge/verify -- clock injection', () => {
  test('an expired-at-now token is accepted when nowSec is shifted back', async () => {
    const realNow = Math.floor(Date.now() / 1000)
    const minted = await mintTestToken({
      sub: 'u',
      iat: realNow - 100,
      nbf: realNow - 100,
      exp: realNow + 60,  // expires 1 minute from now in real time
    })
    // Pretend we're 30 seconds in the past. Token is still valid then.
    await expect(
      verifyChallengeJwt(minted.jwt, {
        publicKeyB64u: minted.publicKeyB64u,
        nowSec: realNow - 30,
      })
    ).resolves.toMatchObject({ valid: true })
  })

  test('a future-valid token is rejected when nowSec has not yet reached nbf', async () => {
    const realNow = Math.floor(Date.now() / 1000)
    const minted = await mintTestToken({
      sub: 'u',
      nbf: realNow + 600,  // not valid for 10 minutes
      exp: realNow + 3600,
    })
    await expect(
      verifyChallengeJwt(minted.jwt, {
        publicKeyB64u: minted.publicKeyB64u,
        nowSec: realNow + 30,  // pretend only 30 seconds have passed
      })
    ).rejects.toMatchObject({ kind: ChallengeErrorKind.NOT_YET_VALID })
  })
})
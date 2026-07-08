import {
  CHALLENGE_MARKER,
  EXPECTED_ALG,
  EXPECTED_TYP,
  b64uDecode,
  b64uEncode,
  b64uDecodeString,
  stripMarker,
  parseChallengeLink,
  splitJwt,
  decodeJwt,
} from '../challenge/envelope.js'
import { ChallengeError, ChallengeErrorKind } from '../challenge/errors.js'
import { mintTestToken } from './challengeKeygenHarness.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('challenge/envelope -- constants', () => {
  test('CHALLENGE_MARKER is exactly spandan:v1:c:', () => {
    expect(CHALLENGE_MARKER).toBe('spandan:v1:c:')
  })

  test('EXPECTED_ALG is EdDSA', () => {
    expect(EXPECTED_ALG).toBe('EdDSA')
  })

  test('EXPECTED_TYP is JWT', () => {
    expect(EXPECTED_TYP).toBe('JWT')
  })
})

// ---------------------------------------------------------------------------
// base64url codec
// ---------------------------------------------------------------------------

describe('challenge/envelope -- b64uEncode / b64uDecode roundtrip', () => {
  test('empty buffer roundtrips', () => {
    const empty = new Uint8Array(0)
    expect(b64uEncode(empty)).toBe('')
    expect(b64uDecode('').length).toBe(0)
  })

  test('hello world roundtrips', () => {
    const bytes = new TextEncoder().encode('hello world')
    const encoded = b64uEncode(bytes)
    const decoded = b64uDecode(encoded)
    expect(new TextDecoder().decode(decoded)).toBe('hello world')
  })

  test('binary data roundtrips byte-for-byte', () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 254, 255, 128, 64, 32, 16])
    const encoded = b64uEncode(bytes)
    const decoded = b64uDecode(encoded)
    expect(Array.from(decoded)).toEqual(Array.from(bytes))
  })

  test('output is URL-safe (no +, no /, no =)', () => {
    // Construct a byte sequence that would naturally produce + and /
    // in standard base64. 0xff 0xff ... is a good trigger.
    const bytes = new Uint8Array(15).fill(0xff)
    const encoded = b64uEncode(bytes)
    expect(encoded).not.toMatch(/[+/=]/)
    // And it should still roundtrip
    expect(Array.from(b64uDecode(encoded))).toEqual(Array.from(bytes))
  })

  test('accepts ArrayBuffer as well as Uint8Array', () => {
    const bytes = new Uint8Array([65, 66, 67])
    expect(b64uEncode(bytes.buffer)).toBe(b64uEncode(bytes))
  })

  test('encoded form has no padding (= stripped)', () => {
    // 1 byte "A" → "QQ" in standard, "QQ" in url-safe (no padding)
    expect(b64uEncode(new Uint8Array([0x41]))).toBe('QQ')
    // 2 bytes "AB" → "QUI" (no padding)
    expect(b64uEncode(new Uint8Array([0x41, 0x42]))).toBe('QUI')
    // 3 bytes "ABC" → "QUJD"
    expect(b64uEncode(new Uint8Array([0x41, 0x42, 0x43]))).toBe('QUJD')
  })
})

describe('challenge/envelope -- b64uDecode error cases', () => {
  test('non-string input throws MALFORMED', () => {
    expect(() => b64uDecode(null)).toThrow(ChallengeError)
    expect(() => b64uDecode(undefined)).toThrow(ChallengeError)
    expect(() => b64uDecode(123)).toThrow(ChallengeError)
    try { b64uDecode(null) } catch (e) {
      expect(e.kind).toBe(ChallengeErrorKind.MALFORMED)
      expect(e.reason).toBe('b64u_decode_not_string')
    }
  })

  test('empty string returns an empty Uint8Array (not an error)', () => {
    const result = b64uDecode('')
    expect(result).toBeInstanceOf(Uint8Array)
    expect(result.byteLength).toBe(0)
  })

  test('illegal character throws MALFORMED', () => {
    expect(() => b64uDecode('$$$')).toThrow(ChallengeError)
    try { b64uDecode('$$$') } catch (e) {
      expect(e.kind).toBe(ChallengeErrorKind.MALFORMED)
      expect(e.reason).toBe('b64u_decode_bad_alphabet')
    }
  })
})

describe('challenge/envelope -- b64uDecodeString', () => {
  test('decodes UTF-8 strings correctly', () => {
    const original = 'naïve résumé ✨'
    const encoded = b64uEncode(new TextEncoder().encode(original))
    expect(b64uDecodeString(encoded)).toBe(original)
  })
})

// ---------------------------------------------------------------------------
// stripMarker
// ---------------------------------------------------------------------------

describe('challenge/envelope -- stripMarker', () => {
  test('strips the marker and returns the bare JWT', () => {
    const result = stripMarker('spandan:v1:c:abc.def.ghi')
    expect(result).toBe('abc.def.ghi')
  })

  test('rejects empty input with MALFORMED', () => {
    expect(() => stripMarker('')).toThrow(ChallengeError)
    try { stripMarker('') } catch (e) {
      expect(e.kind).toBe(ChallengeErrorKind.MALFORMED)
      expect(e.reason).toBe('strip_marker_empty')
    }
  })

  test('rejects non-string input with MALFORMED', () => {
    expect(() => stripMarker(null)).toThrow(ChallengeError)
    expect(() => stripMarker(undefined)).toThrow(ChallengeError)
    expect(() => stripMarker(42)).toThrow(ChallengeError)
  })

  test('rejects missing prefix with MISSING_PREFIX', () => {
    expect(() => stripMarker('abc.def.ghi')).toThrow(ChallengeError)
    try { stripMarker('abc.def.ghi') } catch (e) {
      expect(e.kind).toBe(ChallengeErrorKind.MISSING_PREFIX)
      expect(e.reason).toBe('strip_marker_no_prefix')
    }
  })

  test('rejects wrong-prefix with MISSING_PREFIX', () => {
    expect(() => stripMarker('spandan:v2:c:abc.def.ghi')).toThrow(ChallengeError)
    try { stripMarker('spandan:v2:c:abc.def.ghi') } catch (e) {
      expect(e.kind).toBe(ChallengeErrorKind.MISSING_PREFIX)
    }
  })

  test('rejects marker-only (empty JWT after strip) with MALFORMED', () => {
    expect(() => stripMarker('spandan:v1:c:')).toThrow(ChallengeError)
    try { stripMarker('spandan:v1:c:') } catch (e) {
      expect(e.kind).toBe(ChallengeErrorKind.MALFORMED)
      expect(e.reason).toBe('strip_marker_empty_jwt')
    }
  })
})

// ---------------------------------------------------------------------------
// parseChallengeLink
// ---------------------------------------------------------------------------

describe('challenge/envelope -- parseChallengeLink', () => {
  test('extracts a marker-prefixed JWT from the token query param', () => {
    const result = parseChallengeLink('https://app.spandan.example/join?token=spandan:v1:c:abc.def.ghi')
    expect(result.ok).toBe(true)
    expect(result.jwt).toBe('abc.def.ghi')
    expect(result.fromQueryParam).toBe('token')
  })

  test('accepts a bare JWT (host already added the marker)', () => {
    const result = parseChallengeLink('https://app.spandan.example/join?token=abc.def.ghi')
    expect(result.ok).toBe(true)
    expect(result.jwt).toBe('abc.def.ghi')
  })

  test('extracts the token even when other query params are present', () => {
    const result = parseChallengeLink(
      'https://app.spandan.example/join?utm_source=email&token=spandan:v1:c:abc.def.ghi&ref=abc'
    )
    expect(result.ok).toBe(true)
    expect(result.jwt).toBe('abc.def.ghi')
  })

  test('returns NO_TOKEN failure for URL without token (Option 1 strict)', () => {
    const result = parseChallengeLink('https://app.spandan.example/join')
    expect(result.ok).toBe(false)
    expect(result.kind).toBe(ChallengeErrorKind.MALFORMED)
    expect(result.reason).toBe('parse_challenge_link_no_token')
  })

  test('returns NO_TOKEN failure when token param is empty', () => {
    const result = parseChallengeLink('https://app.spandan.example/join?token=')
    expect(result.ok).toBe(false)
    expect(result.kind).toBe(ChallengeErrorKind.MALFORMED)
    expect(result.reason).toBe('parse_challenge_link_no_token')
  })

  test('returns failure for empty href', () => {
    const result = parseChallengeLink('')
    expect(result.ok).toBe(false)
    expect(result.kind).toBe(ChallengeErrorKind.MALFORMED)
  })

  test('returns failure for non-string href', () => {
    expect(parseChallengeLink(null).ok).toBe(false)
    expect(parseChallengeLink(undefined).ok).toBe(false)
    expect(parseChallengeLink(123).ok).toBe(false)
  })

  test('returns failure for unparseable URL', () => {
    const result = parseChallengeLink('not a url at all')
    expect(result.ok).toBe(false)
    expect(result.kind).toBe(ChallengeErrorKind.MALFORMED)
    expect(result.reason).toBe('parse_challenge_link_bad_url')
  })

  test('does NOT throw on any malformed input (returns failure result)', () => {
    const malformed = ['', null, undefined, 0, {}, 'not-a-url', 'https://x.com/?token=', 'https://x.com/']
    for (const m of malformed) {
      expect(() => parseChallengeLink(m)).not.toThrow()
      expect(parseChallengeLink(m).ok).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// splitJwt
// ---------------------------------------------------------------------------

describe('challenge/envelope -- splitJwt', () => {
  test('splits a three-segment JWT', () => {
    const result = splitJwt('aaa.bbb.ccc')
    expect(result.header).toBe('aaa')
    expect(result.payload).toBe('bbb')
    expect(result.signature).toBe('ccc')
  })

  test('rejects JWT with wrong segment count', () => {
    expect(() => splitJwt('aaa.bbb')).toThrow(ChallengeError)
    expect(() => splitJwt('aaa.bbb.ccc.ddd')).toThrow(ChallengeError)
    try { splitJwt('aaa.bbb') } catch (e) {
      expect(e.kind).toBe(ChallengeErrorKind.MALFORMED)
      expect(e.reason).toMatch(/split_jwt_wrong_segments/)
    }
  })

  test('rejects JWT with empty segment', () => {
    expect(() => splitJwt('aaa..ccc')).toThrow(ChallengeError)
    expect(() => splitJwt('.bbb.ccc')).toThrow(ChallengeError)
    expect(() => splitJwt('aaa.bbb.')).toThrow(ChallengeError)
    try { splitJwt('aaa..ccc') } catch (e) {
      expect(e.kind).toBe(ChallengeErrorKind.MALFORMED)
    }
  })

  test('rejects empty input', () => {
    expect(() => splitJwt('')).toThrow(ChallengeError)
  })
})

// ---------------------------------------------------------------------------
// decodeJwt
// ---------------------------------------------------------------------------

describe('challenge/envelope -- decodeJwt (with real Ed25519-signed tokens)', () => {
  let minted
  beforeAll(async () => {
    minted = await mintTestToken({
      iss: 'spandan.session-signer',
      aud: 'spandan.peer-review.v1',
      sub: 'user-42',
      qid: 'q-7',
      sid: 's-99',
      jti: 'jti-abc',
      scope: 'join-peer-review',
    })
  })

  test('decodes a valid signed JWT into header + payload objects', () => {
    const decoded = decodeJwt(minted.jwt)
    expect(decoded.header).toMatchObject({
      alg: 'EdDSA',
      typ: 'JWT',
      kid: minted.kid,
    })
    expect(decoded.payload).toMatchObject({
      iss: 'spandan.session-signer',
      aud: 'spandan.peer-review.v1',
      sub: 'user-42',
      qid: 'q-7',
      sid: 's-99',
      jti: 'jti-abc',
      scope: 'join-peer-review',
    })
  })

  test('returns raw bytes for header / payload / signature / signingInput', () => {
    const decoded = decodeJwt(minted.jwt)
    expect(decoded.headerBytes).toBeInstanceOf(Uint8Array)
    expect(decoded.payloadBytes).toBeInstanceOf(Uint8Array)
    expect(decoded.signatureBytes).toBeInstanceOf(Uint8Array)
    // signingInput is exposed as an ArrayBuffer (post-slicing into a fresh region)
    expect(decoded.signingInput.byteLength).toBeGreaterThan(0)
    // Ed25519 signatures are exactly 64 bytes
    expect(decoded.signatureBytes.byteLength).toBe(64)
  })

  test('signingInput is exactly header.payload (ASCII)', () => {
    const decoded = decodeJwt(minted.jwt)
    const expected = `${decoded.headerText}.${decoded.payloadText}`
    expect(new TextDecoder().decode(decoded.signingInput)).toBe(expected)
  })

  test('throws ChallengeError on malformed JWT body', () => {
    expect(() => decodeJwt('aaa.bbb.ccc')).toThrow(ChallengeError)
    try { decodeJwt('aaa.bbb.ccc') } catch (e) {
      expect(e.kind).toBe(ChallengeErrorKind.MALFORMED)
      // The header segment 'aaa' is not valid base64url in some configs
      expect(e.reason).toMatch(/b64u_decode|decode_jwt/)
    }
  })

  test('throws ChallengeError when JWT payload is not valid JSON', () => {
    // Construct a JWT with a payload segment that base64url-decodes to non-JSON
    const headerB64u = b64uEncode(new TextEncoder().encode(JSON.stringify({ alg: 'EdDSA', typ: 'JWT', kid: 'k' })))
    const badPayloadB64u = b64uEncode(new TextEncoder().encode('not-json{'))
    const sigB64u = b64uEncode(new Uint8Array(64))
    const badJwt = `${headerB64u}.${badPayloadB64u}.${sigB64u}`
    expect(() => decodeJwt(badJwt)).toThrow(ChallengeError)
    try { decodeJwt(badJwt) } catch (e) {
      expect(e.kind).toBe(ChallengeErrorKind.MALFORMED)
      expect(e.reason).toBe('decode_jwt_bad_json')
    }
  })
})
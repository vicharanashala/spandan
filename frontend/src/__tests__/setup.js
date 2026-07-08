// Global test setup for frontend
import '@testing-library/jest-dom'

// Polyfills: jsdom 30 does NOT expose crypto.subtle, TextEncoder, or
// TextDecoder as globals in all configurations. WebCrypto operations
// (Ed25519 sign/verify/digest, SHA-256) need both.
//
// Phase 7 (Challenge Link Verification) depends on these. Production
// code in the browser is unaffected because every browser we target
// (Chrome 113+, Firefox 130+, Safari 17+) ships these natively.
import { webcrypto } from 'node:crypto'
import { TextEncoder, TextDecoder } from 'node:util'

if (typeof globalThis.crypto === 'undefined' || typeof globalThis.crypto.subtle === 'undefined') {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto })
}
if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = TextEncoder
}
if (typeof globalThis.TextDecoder === 'undefined') {
  globalThis.TextDecoder = TextDecoder
}
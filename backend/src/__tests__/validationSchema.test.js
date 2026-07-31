import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { registerSchema, sendOtpSchema, loginSchema } from '../middleware/validation.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe('Zod Validation Middleware with Domain Regex', () => {
  const testDomainsFilePath = path.resolve(__dirname, 'schema_test_allowed_domains.txt')
  let origEnvFile

  before(() => {
    origEnvFile = process.env.ALLOWED_DOMAINS_FILE
    process.env.ALLOWED_DOMAINS_FILE = testDomainsFilePath
    const sampleContent = `
# Test Allowed Domains Configuration
example.com
allowed-domain.org
*.edu.in
`
    fs.writeFileSync(testDomainsFilePath, sampleContent, 'utf-8')
  })

  after(() => {
    if (fs.existsSync(testDomainsFilePath)) {
      fs.unlinkSync(testDomainsFilePath)
    }
    if (origEnvFile !== undefined) {
      process.env.ALLOWED_DOMAINS_FILE = origEnvFile
    } else {
      delete process.env.ALLOWED_DOMAINS_FILE
    }
  })

  describe('sendOtpSchema', () => {
    it('should accept emails matching allowed domain regexes', () => {
      const res1 = sendOtpSchema.safeParse({ email: 'user@example.com' })
      assert.equal(res1.success, true)

      const res2 = sendOtpSchema.safeParse({ email: 'user@allowed-domain.org' })
      assert.equal(res2.success, true)

      const res3 = sendOtpSchema.safeParse({ email: 'student@iitb.edu.in' })
      assert.equal(res3.success, true)
    })

    it('should reject unallowed email domains', () => {
      const res = sendOtpSchema.safeParse({ email: 'user@unallowed-domain.xyz' })
      assert.equal(res.success, false)
      assert.match(res.error.issues[0].message, /Email domain 'unallowed-domain.xyz' is not allowed/)
    })
  })

  describe('registerSchema', () => {
    it('should accept registration with allowed email domain', () => {
      const res = registerSchema.safeParse({
        name: 'Spandan User',
        email: 'user@example.com',
        password: 'Password1!',
        role: 'student'
      })
      assert.equal(res.success, true)
    })

    it('should reject registration with unallowed email domain', () => {
      const res = registerSchema.safeParse({
        name: 'Spandan User',
        email: 'user@disallowed-site.com',
        password: 'Password1!',
        role: 'student'
      })
      assert.equal(res.success, false)
      assert.match(res.error.issues[0].message, /Email domain 'disallowed-site.com' is not allowed/)
    })
  })

  describe('loginSchema', () => {
    it('should validate general email format for login', () => {
      const res = loginSchema.safeParse({
        email: 'user@example.com',
        password: 'password123'
      })
      assert.equal(res.success, true)
    })
  })
})

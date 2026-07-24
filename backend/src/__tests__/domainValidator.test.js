import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import {
  parseDomainLineToRegex,
  getAllowedDomainRegexes,
  isDomainAllowed
} from '../utils/domainValidator.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe('Domain Validator Utility', () => {
  const testDomainsFilePath = path.resolve(__dirname, 'test_allowed_domains.txt')

  before(() => {
    const sampleContent = `
# Test Allowed Domains
# Comments and empty lines should be ignored

example.com
mycompany.com
*.edu.in
*.ac.uk
/^[a-z0-9-]+\\.org$/i
^custom-domain\\.com$
`
    fs.writeFileSync(testDomainsFilePath, sampleContent, 'utf-8')
  })

  after(() => {
    if (fs.existsSync(testDomainsFilePath)) {
      fs.unlinkSync(testDomainsFilePath)
    }
  })

  describe('parseDomainLineToRegex', () => {
    it('should ignore empty lines and comments', () => {
      assert.equal(parseDomainLineToRegex(''), null)
      assert.equal(parseDomainLineToRegex('   '), null)
      assert.equal(parseDomainLineToRegex('# Comment'), null)
      assert.equal(parseDomainLineToRegex('// Comment'), null)
    })

    it('should parse plain domain names into regex matching subdomains', () => {
      const regex = parseDomainLineToRegex('example.com')
      assert.notEqual(regex, null)
      assert.equal(regex.test('example.com'), true)
      assert.equal(regex.test('mail.example.com'), true)
      assert.equal(regex.test('notexample.com'), false)
    })

    it('should parse wildcard domain patterns correctly', () => {
      const regex = parseDomainLineToRegex('*.edu.in')
      assert.notEqual(regex, null)
      assert.equal(regex.test('univ.edu.in'), true)
      assert.equal(regex.test('cs.univ.edu.in'), true)
      assert.equal(regex.test('edu.in'), true)
      assert.equal(regex.test('univ.edu.com'), false)
    })

    it('should parse explicit regex notation', () => {
      const regex = parseDomainLineToRegex('/^[a-z]+\\.org$/i')
      assert.notEqual(regex, null)
      assert.equal(regex.test('testsite.org'), true)
      assert.equal(regex.test('sub.testsite.org'), false)
    })

    it('should parse regex string with anchors', () => {
      const regex = parseDomainLineToRegex('^custom-domain\\.com$')
      assert.notEqual(regex, null)
      assert.equal(regex.test('custom-domain.com'), true)
      assert.equal(regex.test('sub.custom-domain.com'), false)
    })
  })

  describe('isDomainAllowed', () => {
    it('should return true for emails with allowed domains', () => {
      assert.equal(isDomainAllowed('user@example.com', testDomainsFilePath), true)
      assert.equal(isDomainAllowed('john.doe@mycompany.com', testDomainsFilePath), true)
      assert.equal(isDomainAllowed('student@univ.edu.in', testDomainsFilePath), true)
      assert.equal(isDomainAllowed('researcher@cam.ac.uk', testDomainsFilePath), true)
      assert.equal(isDomainAllowed('info@testsite.org', testDomainsFilePath), true)
      assert.equal(isDomainAllowed('contact@custom-domain.com', testDomainsFilePath), true)
    })

    it('should return false for emails with unallowed domains', () => {
      assert.equal(isDomainAllowed('user@spammer.xyz', testDomainsFilePath), false)
      assert.equal(isDomainAllowed('hacker@tempmail.com', testDomainsFilePath), false)
      assert.equal(isDomainAllowed('user@notexample.com', testDomainsFilePath), false)
    })

    it('should return false for invalid email inputs', () => {
      assert.equal(isDomainAllowed('', testDomainsFilePath), false)
      assert.equal(isDomainAllowed('not-an-email', testDomainsFilePath), false)
      assert.equal(isDomainAllowed(null, testDomainsFilePath), false)
    })
  })
})

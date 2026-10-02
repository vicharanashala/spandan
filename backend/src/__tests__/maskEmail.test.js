import { maskEmail } from '../utils/maskEmail.js'

describe('maskEmail', () => {
  it('keeps the first two and final local-part characters visible for a normal email', () => {
    expect(maskEmail('rahul.sharma@gmail.com')).toBe('ra***a@gmail.com')
  })

  it('fully masks short local parts', () => {
    expect(maskEmail('abc@example.com')).toBe('***@example.com')
  })

  it('handles dots and plus signs in the local part', () => {
    expect(maskEmail('riya.patel+class@example.org')).toBe('ri***s@example.org')
  })

  it.each([null, undefined, '', 'not-an-email'])('returns an empty string for invalid input: %p', (email) => {
    expect(maskEmail(email)).toBe('')
  })
})

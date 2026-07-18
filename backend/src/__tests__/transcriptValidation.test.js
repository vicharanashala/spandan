import { validateTranscriptText } from '../utils/transcriptValidation.js'

describe('Transcript validation', () => {
  it('accepts non-empty transcript text after trimming', () => {
    const result = validateTranscriptText('   Hello world   ')

    expect(result.valid).toBe(true)
    expect(result.normalizedText).toBe('Hello world')
  })

  it('rejects empty or whitespace-only transcript text', () => {
    const result = validateTranscriptText('   ')

    expect(result.valid).toBe(false)
    expect(result.error).toBe('Transcript text cannot be empty')
  })
})

export const validateTranscriptText = (value) => {
  if (typeof value !== 'string') {
    return { valid: false, error: 'Transcript text must be a string' }
  }

  const normalizedText = value.trim()
  if (!normalizedText) {
    return { valid: false, error: 'Transcript text cannot be empty' }
  }

  return { valid: true, normalizedText }
}

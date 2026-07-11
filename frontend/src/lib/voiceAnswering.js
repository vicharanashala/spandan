export const findMatchingOptionIndex = (transcript, options) => {
  if (!transcript || !Array.isArray(options) || options.length === 0) return -1

  const normalizedTranscript = transcript.toLowerCase().trim()
  const normalizedOptions = options.map((option) => {
    const text = typeof option === 'string' ? option : option?.text || ''
    return text.toLowerCase().trim()
  })

  const directMatch = normalizedOptions.findIndex((option) => option === normalizedTranscript)
  if (directMatch !== -1) return directMatch

  const optionPattern = /(?:option|choice)?\s*([a-z1-9])/i
  const optionMatch = normalizedTranscript.match(optionPattern)
  if (optionMatch) {
    const index = Number(optionMatch[1]) - 1
    if (Number.isInteger(index) && index >= 0 && index < normalizedOptions.length) return index

    const letterIndex = optionMatch[1].toLowerCase().charCodeAt(0) - 97
    if (letterIndex >= 0 && letterIndex < normalizedOptions.length) return letterIndex
  }

  const textMatch = normalizedOptions.findIndex((option) => normalizedTranscript.includes(option))
  if (textMatch !== -1) return textMatch

  return -1
}

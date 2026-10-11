export function cleanTranscript(raw) {
  if (typeof raw !== 'string') return ''

  let text = raw

  // 1. Strip WEBVTT headers and NOTE blocks
  text = text.replace(/^WEBVTT.*\n/g, '')
  text = text.replace(/^NOTE[\s\S]*?\n\n/gm, '')

  // 2. Strip SRT/VTT timestamps
  // Matches "00:00:01.000 --> 00:00:04.000" or comma variants (SRT)
  text = text.replace(/\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}.*/g, '')
  // Also match shorter forms like 00:00.000 --> 00:00.000
  text = text.replace(/\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}[.,]\d{3}.*/g, '')

  // 3. Strip standalone cue numbers (digits on a line by themselves)
  text = text.replace(/^\d+$/gm, '')

  // 4. Strip VTT tags like <v Speaker Name> or <c.color> or <i> etc
  text = text.replace(/<[^>]+>/g, '')

  // 5. Strip Speaker names like "[Speaker]:" or "Speaker:" at start of line
  // Example: "[John Doe]:" or "John Doe:"
  text = text.replace(/^\[.*?\]:\s*/gm, '')
  text = text.replace(/^[^:\n]+:\s*/gm, '')

  // 6. Collapse excess whitespace and empty lines
  text = text.replace(/\n\s*\n/g, '\n')
  text = text.replace(/[ \t]+/g, ' ')
  text = text.trim()

  return text
}

export function wordCount(text) {
  if (!text || typeof text !== 'string') return 0
  const words = text.trim().split(/\s+/)
  return words[0] === '' ? 0 : words.length
}

export const appendSpeakerUtterance = (transcript, speaker, text) => {
  const utterance = String(text || '').trim()
  if (!utterance) return transcript || ''
  const existing = transcript || ''
  return `${existing}${existing && !existing.endsWith('\n') ? '\n' : ''}${speaker}: ${utterance}\n`
}

export function mergeTranscriptEntries(existing = [], incoming = []) {
  const byId = new Map()
  for (const entry of [...existing, ...incoming]) {
    if (!entry?.id || !Number.isFinite(Number(entry.order))) continue
    const previous = byId.get(entry.id)
    byId.set(entry.id, previous ? { ...entry, ...previous } : { ...entry })
  }
  return [...byId.values()].sort((a, b) => Number(a.order) - Number(b.order)).slice(-500)
}

export function mergeTranscriptSession(current, session, entries = []) {
  const existing = current?.session === session ? current.entries : []
  return { session, entries: mergeTranscriptEntries(existing, entries) }
}

export function formatTranscriptEntries(entries = []) {
  return mergeTranscriptEntries([], entries).map(entry => {
    const speaker = entry.speakerRole === 'teacher' ? 'Teacher' : `Student (${entry.speakerName || 'Student'})`
    return `${speaker}: ${String(entry.text || '').trim()}`
  }).filter(line => !line.endsWith(': ')).join('\n')
}

export function joinTranscriptBlocks(base, discussion) {
  return [base, discussion].filter(Boolean).join(base && discussion ? '\n' : '')
}

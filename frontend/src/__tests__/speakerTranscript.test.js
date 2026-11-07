import { appendSpeakerUtterance, formatTranscriptEntries, joinTranscriptBlocks, mergeTranscriptEntries, mergeTranscriptSession } from '../lib/speakerTranscript'

test('formats teacher and student utterances as distinct speaker-labelled lines', () => {
  let transcript = ''
  transcript = appendSpeakerUtterance(transcript, 'Teacher', 'Today we are learning about photosynthesis.')
  transcript = appendSpeakerUtterance(transcript, 'Student (Harshitha)', 'What is the role of chlorophyll?')
  transcript = appendSpeakerUtterance(transcript, 'Teacher', 'Chlorophyll absorbs sunlight and helps plants prepare food.')

  expect(transcript.trim()).toBe([
    'Teacher: Today we are learning about photosynthesis.',
    'Student (Harshitha): What is the role of chlorophyll?',
    'Teacher: Chlorophyll absorbs sunlight and helps plants prepare food.'
  ].join('\n'))
})

test('does not add empty utterances', () => {
  expect(appendSpeakerUtterance('Teacher: Existing line\n', 'Student (A)', '  ')).toBe('Teacher: Existing line\n')
})

test('joins existing teacher text and discussion entries with an actual newline', () => {
  expect(joinTranscriptBlocks('Teacher: Earlier explanation', 'Student (Harshitha): Question'))
    .toBe('Teacher: Earlier explanation\nStudent (Harshitha): Question')
})

test('orders out-of-order socket entries by shared server order and deduplicates stable IDs', () => {
  const student = { id: 's2', session: 'd1', order: 2, speakerId: 'u2', speakerRole: 'student', speakerName: 'Harshitha', text: 'Question', timestamp: '2026-01-02T00:00:00Z' }
  const teacher = { id: 't1', session: 'd1', order: 1, speakerId: 'u1', speakerRole: 'teacher', speakerName: 'Teacher', text: 'Explanation', timestamp: '2026-01-01T00:00:00Z' }
  const merged = mergeTranscriptEntries([student], [teacher, { ...student, text: 'duplicate event' }])
  expect(merged).toHaveLength(2)
  expect(merged[0]).toMatchObject({ id: 't1', speakerId: 'u1', order: 1, timestamp: teacher.timestamp })
  expect(formatTranscriptEntries(merged)).toBe('Teacher: Explanation\nStudent (Harshitha): Question')
})

test('a new discussion session does not retain entries from the previous session', () => {
  const previous = { session: 'old', entries: [{ id: 'old-1', order: 1, speakerRole: 'student', speakerName: 'A', text: 'old' }] }
  const next = mergeTranscriptSession(previous, 'new', [{ id: 'new-1', order: 1, session: 'new', speakerRole: 'teacher', text: 'new' }])
  expect(next.entries.map(entry => entry.id)).toEqual(['new-1'])
})

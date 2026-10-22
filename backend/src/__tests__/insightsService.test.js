import { computeInsights, RT_BUCKETS } from '../services/insightsService.js'

const T0 = new Date('2026-10-14T14:30:00Z')
const min = (m) => new Date(T0.getTime() + m * 60000)
const room = { _id: 'room1', name: 'Smoke', code: 'ABC123', settings: { mode: 'normal' }, createdAt: T0, endedAt: min(50) }
// 3 questions: Q1 easy TF (everyone right), Q2 MCQ discriminating, Q3 hard MCQ with a dead distractor
const questions = [
  { _id: 'q1', type: 'TF', question: 'Q1', options: [{ text: 'True', isCorrect: true }, { text: 'False' }], segmentIndex: 1, points: 100, timeToAnswer: 20, createdAt: min(5), closeAt: min(5.5) },
  { _id: 'q2', type: 'MCQ', question: 'Q2', options: [{ text: 'A' }, { text: 'B', isCorrect: true }, { text: 'C' }, { text: 'D' }], segmentIndex: 2, points: 100, timeToAnswer: 30, explanation: 'B because', createdAt: min(20), closeAt: min(20.5) },
  { _id: 'q3', type: 'MCQ', question: 'Q3', options: [{ text: 'A', isCorrect: true }, { text: 'B' }, { text: 'C' }, { text: 'D' }], segmentIndex: 3, points: 100, timeToAnswer: 30, createdAt: min(40), closeAt: min(40.5) },
]
// 10 students; strong ones (s1-s5) get Q2 right, weak ones wrong. Q3: 2 right, 8 wrong, nobody picks D.
const students = Array.from({ length: 10 }, (_, i) => `s${i + 1}`)
const responses = []
students.forEach((s, i) => {
  responses.push({ questionId: 'q1', studentId: s, selectedOption: 0, isCorrect: true, responseTime: 3 + i, points: 90 - i })
  const strong = i < 5
  responses.push({ questionId: 'q2', studentId: s, selectedOption: strong ? 1 : (i % 2 ? 0 : 2), isCorrect: strong, responseTime: 12, points: strong ? 80 : 0 })
  if (i < 8) responses.push({ questionId: 'q3', studentId: s, selectedOption: i < 2 ? 0 : (i % 2 ? 1 : 2), isCorrect: i < 2, responseTime: 25, points: i < 2 ? 70 : 0 })
})
const members = [...students.map((s, i) => ({ studentId: s, joinedAt: min(i) })), { studentId: 's11', joinedAt: min(30) }] // s11 joined, never answered
const transcripts = [{ segmentIndex: 1, wordCount: 300, duration: 120 }, { segmentIndex: 2, wordCount: 500, duration: 120 }, { segmentIndex: 3, wordCount: 200, duration: 100 }]
const usersById = new Map(students.map((s, i) => [s, { name: `Student ${i + 1}`, email: `${s}@x.com` }]))

describe('computeInsights', () => {
  const T = computeInsights({ room, questions, responses, members, transcripts, usersById, forTeacher: true })
  const S = computeInsights({ room, questions, responses, members, transcripts, usersById, forTeacher: false })

  it('totals and funnel', () => {
    expect(T.totals.questions).toBe(3)
    expect(T.totals.responses).toBe(28)
    expect(T.totals.joined).toBe(11)
    expect(T.totals.responders).toBe(10)
    expect(T.totals.participationRate).toBe(91)
    expect(T.totals.answeredHalf).toBe(10)   // everyone answered >= 1.5 questions
    expect(T.totals.answeredAll).toBe(8)
    expect(T.totals.durationMin).toBe(50)
    expect(T.totals.maxPossible).toBe(300)
    expect(T.totals.overallCorrectRate).toBe(Math.round((10 + 5 + 2) / 28 * 100))
  })

  it('orders questions by launch time and builds the timeline + join curve', () => {
    expect(T.questions.map(q => q.id)).toEqual(['q1', 'q2', 'q3'])
    expect(T.timeline.map(t => t.minute)).toEqual([5.2, 20, 40])  // no response timestamps in this fixture → closeAt − timeToAnswer
    expect(T.timeline[1].responders).toBe(10)
    expect(T.joinCurve.at(-1)).toEqual({ minute: 30, cumulative: 11 })
  })

  it('item analysis: difficulty, discrimination, distractors, flags', () => {
    const [q1, q2, q3] = T.questions
    expect(q1.correctRate).toBe(100); expect(q1.difficulty).toBe(1); expect(q1.flags).toContain('too-easy')
    expect(q1.discrimination).toBeNull()                        // no variance (everyone right)
    expect(q2.difficulty).toBe(0.5); expect(q2.discrimination).toBeGreaterThan(0.5) // strong students got it
    expect(q2.flags).not.toContain('low-discrimination')
    expect(q2.options.map(o => o.count)).toEqual([3, 5, 2, 0])
    expect(q2.options[3].distractorShare).toBe(0)
    expect(q2.flags).toContain('dead-distractor')               // D never picked, n = 10
    expect(q3.correctRate).toBe(25); expect(q3.flags).toContain('hard')
    expect(q3.responses).toBe(8); expect(q3.noAnswer).toBe(3)    // 11 joined - 8 answered
    expect(q2.explanation).toBe('B because')
    expect(q1.medianResponseTime).toBe(7.5)
    expect(q1.rtBuckets.reduce((a, b) => a + b, 0)).toBe(10)
    expect(RT_BUCKETS).toHaveLength(6)
  })

  it('score distribution and segments', () => {
    expect(T.scores.buckets.reduce((a, b) => a + b.count, 0)).toBe(10)
    expect(T.scores.max).toBe(90 + 80 + 70)
    expect(T.segments.map(s => s.segmentIndex)).toEqual([1, 2, 3]) // live segments are numbered from 1, shown as-is
    expect(T.segments[1]).toMatchObject({ questions: 1, responses: 10, correctRate: 50, words: 500, durationSec: 120 })
  })

  it('teacher gets heatmap + names + wrong lists; student payload has none of them', () => {
    expect(T.heatmap.rows).toHaveLength(11)
    const top = T.heatmap.rows[0]
    expect(top.name).toBe('Student 1'); expect(top.points).toBe(240); expect(top.cells).toEqual(['c', 'c', 'c'])
    const never = T.heatmap.rows.find(r => r.studentId === 's11')
    expect(never.cells).toEqual(['-', '-', '-']); expect(never.points).toBe(0)
    expect(T.questions[1].wrongStudents.map(w => w.name)).toEqual(['Student 6', 'Student 7', 'Student 8', 'Student 9', 'Student 10'])
    expect(S.heatmap).toBeUndefined()
    expect(S.scores.students).toBeUndefined()
    expect(S.questions[1].wrongStudents).toBeUndefined()
    expect(S.questions[1].noAnswer).toBeUndefined()
    expect(S.totals).toEqual(T.totals)                          // aggregates identical
  })

  it('student payload carries `me`: own rank, points, per-question result vs class, streak, no names', () => {
    const M = computeInsights({ room, questions, responses, members, transcripts, usersById, forTeacher: false, studentId: 's7' })
    expect(M.me.of).toBe(10)
    expect(M.me.points).toBe(84)                 // Q1 84 (90-6), Q2 wrong 0, Q3 wrong 0
    expect(M.me.rank).toBe(7)
    expect(M.me).toMatchObject({ answered: 3, correct: 1, missed: 0, correctRate: 33, bestStreak: 1 })
    expect(M.me.perQuestion.map(q => q.isCorrect)).toEqual([true, false, false])
    expect(M.me.perQuestion[1]).toMatchObject({ selected: [2], classCorrectRate: 50, classMedianResponseTime: 12, maxPoints: 100 })
    expect(M.me.perQuestion.map(q => q.cumulativePoints)).toEqual([84, 84, 84])
    expect(M.me.classMedianScore).toBe(T.totals.medianScore)
    const S9 = computeInsights({ room, questions, responses, members, transcripts, usersById, forTeacher: false, studentId: 's9' })
    expect(S9.me.perQuestion[2]).toMatchObject({ answered: false, isCorrect: null, points: 0 })  // s9 skipped Q3
    expect(S9.me.missed).toBe(1)
    const never = computeInsights({ room, questions, responses, members, transcripts, usersById, forTeacher: false, studentId: 's11' })
    expect(never.me).toMatchObject({ rank: null, points: 0, answered: 0, missed: 3, correctRate: null })
    expect(JSON.stringify(M)).not.toMatch(/Student \d/)   // no names anywhere in a student payload
    expect(T.me).toBeUndefined()
  })

  it('timeline uses closeAt − TTA, else the FIRST RESPONSE, never the generation time when it was launched', () => {
    const qs = [
      { _id: 'a', type: 'TF', question: 'A', options: [{ text: 'T', isCorrect: true }, { text: 'F' }], createdAt: min(1), closeAt: null, timeToAnswer: 20 },
      { _id: 'b', type: 'TF', question: 'B', options: [{ text: 'T', isCorrect: true }, { text: 'F' }], createdAt: min(1), closeAt: null, timeToAnswer: 20 },
    ]
    const rs = [
      { questionId: 'a', studentId: 's1', selectedOption: 0, isCorrect: true, responseTime: 3, points: 90, createdAt: min(12.05) },
      { questionId: 'a', studentId: 's2', selectedOption: 0, isCorrect: true, responseTime: 2, points: 95, createdAt: min(12.02) },
    ]
    const X = computeInsights({ room, questions: qs, responses: rs, members: [], forTeacher: true })
    expect(X.timeline.find(t => t.id === 'a').minute).toBe(12)   // first response, not createdAt (1)
    expect(X.timeline.find(t => t.id === 'b').minute).toBe(1)    // never answered → createdAt fallback
    expect(X.questions[0].id).toBe('b')                          // ordering follows the resolved launch time
  })

  it('handles an empty room without throwing', () => {
    const E = computeInsights({ room, questions: [], responses: [], members: [], forTeacher: true })
    expect(E.totals).toMatchObject({ questions: 0, responses: 0, joined: 0, participationRate: null, medianResponseTime: null })
    expect(E.questions).toEqual([]); expect(E.heatmap.rows).toEqual([]); expect(E.segments).toEqual([])
  })
})

describe('anonymous leaderboard', () => {
  it('hides the student\'s own rank (rest of `me` unchanged)', () => {
    const open = computeInsights({ room, questions, responses, members, transcripts, studentId: 's3' })
    const anon = computeInsights({ room: { ...room, settings: { ...room.settings, anonymousLeaderboard: true } }, questions, responses, members, transcripts, studentId: 's3' })
    expect(open.me.rank).toBeGreaterThan(0)
    expect(open.me.rankHidden).toBe(false)
    expect(anon.me.rank).toBeNull()
    expect(anon.me.rankHidden).toBe(true)
    expect({ ...anon.me, rank: open.me.rank, rankHidden: false }).toEqual(open.me)
  })
})

describe('anonymous session, teacher view', () => {
  const anonRoom = (pct) => ({ ...room, settings: { ...room.settings, anonymousLeaderboard: true, anonymityPercent: pct } })
  const named = computeInsights({ room, questions, responses, members, transcripts, usersById, forTeacher: true })

  it('masks everyone except the lowest-scoring anonymityPercent% (same rule as the teacher leaderboard)', () => {
    const T = computeInsights({ room: anonRoom(20), questions, responses, members, transcripts, usersById, forTeacher: true })
    const rows = T.heatmap.rows
    expect(rows).toHaveLength(11)
    // 10 responders in rank order: ranks 1-8 masked, bottom 2 (20% of 10) keep their real identity
    rows.slice(0, 8).forEach((r, k) => expect(r).toMatchObject({ name: `Anonymous #${k + 1}`, studentId: `anon-${k + 1}`, email: '' }))
    const bottom = named.heatmap.rows.slice(8, 10).map((r) => r.name).sort()
    expect(rows.slice(8, 10).map((r) => r.name).sort()).toEqual(bottom)
    expect(rows[8].email).toMatch(/@x\.com$/)
    expect(rows[10]).toMatchObject({ name: 'Anonymous (no answers)', studentId: 'anon-n1', email: '' }) // s11 joined, never answered
    // cells and points are unchanged, only identities are masked
    expect(rows.map((r) => r.points)).toEqual([...named.heatmap.rows.map((r) => r.points)].sort((a, b) => b - a))
  })

  it('leaks no masked name, email or id anywhere in the teacher payload', () => {
    const T = computeInsights({ room: anonRoom(20), questions, responses, members, transcripts, usersById, forTeacher: true })
    const json = JSON.stringify(T)
    const revealed = new Set(T.heatmap.rows.filter((r) => !r.name.startsWith('Anonymous')).map((r) => r.studentId))
    for (const [st, u] of usersById) {
      if (revealed.has(st)) continue
      expect(json).not.toContain(`"${u.name}"`)
      expect(json).not.toContain(u.email)
      expect(json).not.toContain(`"${st}"`)
    }
    for (const q of T.questions) for (const w of q.wrongStudents) expect(revealed.has(w.id) || w.name.startsWith('Anonymous #')).toBe(true)
    expect(T.scores.students.every((s) => revealed.has(s.studentId) || s.email === '')).toBe(true)
  })

  it('anonymityPercent 0 masks every student', () => {
    const T = computeInsights({ room: anonRoom(0), questions, responses, members, transcripts, usersById, forTeacher: true })
    expect(T.heatmap.rows.every((r) => r.name.startsWith('Anonymous'))).toBe(true)
  })

  it('a named session is unchanged', () => {
    expect(named.heatmap.rows[0].name).toMatch(/^Student /)
    expect(named.heatmap.rows.some((r) => r.name.startsWith('Anonymous'))).toBe(false)
  })
})

describe('segments', () => {
  it('questions made outside a recording (0) and pasted text (-1) form one "manual / pasted" group, listed last', () => {
    const qs = [...questions, { _id: 'qm', type: 'TF', question: 'Manual', options: [{ text: 'T', isCorrect: true }, { text: 'F' }], segmentIndex: 0, points: 100, timeToAnswer: 20, createdAt: min(45) }]
    const tr = [...transcripts, { segmentIndex: -1, wordCount: 120, duration: 0 }]
    const T = computeInsights({ room, questions: qs, responses, members, transcripts: tr, usersById, forTeacher: true })
    expect(T.segments.map(s => s.segmentIndex)).toEqual([1, 2, 3, 0])
    expect(T.segments[3]).toMatchObject({ questions: 1, words: 120 })
  })
})

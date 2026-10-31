import { anonymizeBoard, buildStudentBoard } from '../services/anonymizeLeaderboard.js'

// Build a ranked board of N students: rank 1 (highest) .. N (lowest).
const makeBoard = (n) => Array.from({ length: n }, (_, i) => ({
  rank: i + 1,
  studentId: `id-${i + 1}`,
  studentName: `Real ${i + 1}`,
  totalPoints: (n - i) * 10,
  correctCount: n - i,
  totalAnswered: n
}))

describe('anonymizeBoard — server-side leaderboard anonymisation', () => {
  it('returns the board untouched when anonymous is off', () => {
    const board = makeBoard(5)
    const out = anonymizeBoard(board, { anonymous: false, pct: 50, total: 5, viewer: 'teacher' })
    expect(out).toBe(board) // same reference, no work done
  })

  it('teacher: reveals the BOTTOM k (lowest ranks), masks the rest', () => {
    // T=10, pct=20 -> k=2 -> ranks 9 and 10 (the two lowest scorers) stay real.
    const out = anonymizeBoard(makeBoard(10), { anonymous: true, pct: 20, total: 10, viewer: 'teacher' })
    expect(out.filter(e => e.rank <= 8).every(e => e.studentName === `Anonymous #${e.rank}`)).toBe(true)
    expect(out.find(e => e.rank === 9).studentName).toBe('Real 9')
    expect(out.find(e => e.rank === 10).studentName).toBe('Real 10')
    // Revealed rows keep their real id; masked rows keep id too (teacher is authorized).
    expect(out.find(e => e.rank === 9).studentId).toBe('id-9')
    expect(out.find(e => e.rank === 1).studentId).toBe('id-1')
  })

  it('student: masks EVERY row and strips the real id (no self-identification)', () => {
    const out = anonymizeBoard(makeBoard(10), { anonymous: true, pct: 20, total: 10, viewer: 'student' })
    expect(out.every(e => e.studentName === `Anonymous #${e.rank}`)).toBe(true)
    expect(out.every(e => e.studentId === `anon-${e.rank}`)).toBe(true)
    // A student can never match a row to their own real id.
    expect(out.some(e => e.studentId === 'id-3')).toBe(false)
  })

  it('rounds to nearest: 10% of 24 -> 2 revealed for the teacher', () => {
    const out = anonymizeBoard(makeBoard(24), { anonymous: true, pct: 10, total: 24, viewer: 'teacher' })
    const revealed = out.filter(e => e.studentName.startsWith('Real'))
    expect(revealed.map(e => e.rank).sort((a, b) => a - b)).toEqual([23, 24])
  })

  it('pct=0 masks everyone for the teacher; pct=100 reveals everyone', () => {
    const none = anonymizeBoard(makeBoard(5), { anonymous: true, pct: 0, total: 5, viewer: 'teacher' })
    expect(none.every(e => e.studentName.startsWith('Anonymous'))).toBe(true)
    const all = anonymizeBoard(makeBoard(5), { anonymous: true, pct: 100, total: 5, viewer: 'teacher' })
    expect(all.every(e => e.studentName.startsWith('Real'))).toBe(true)
  })

  it('does NOT mutate the input board (shared cache safety)', () => {
    const board = makeBoard(5)
    const snapshot = JSON.stringify(board)
    anonymizeBoard(board, { anonymous: true, pct: 40, total: 5, viewer: 'teacher' })
    anonymizeBoard(board, { anonymous: true, pct: 40, total: 5, viewer: 'student' })
    expect(JSON.stringify(board)).toBe(snapshot) // original arrays/objects unchanged
  })

  it('tiny class: 10% of 3 rounds to 0 revealed (teacher sees all anonymised)', () => {
    const out = anonymizeBoard(makeBoard(3), { anonymous: true, pct: 10, total: 3, viewer: 'teacher' })
    expect(out.every(e => e.studentName.startsWith('Anonymous'))).toBe(true)
  })
})

describe('buildStudentBoard — student-facing board (with optional bottom reveal)', () => {
  it('revealBottom off: masked top-N only (no bottom rows)', () => {
    const out = buildStudentBoard(makeBoard(30), { pct: 20, total: 30, topN: 10, revealBottom: false })
    expect(out).toHaveLength(10)
    expect(out.every(e => e.studentName === `Anonymous #${e.rank}` && e.studentId === `anon-${e.rank}`)).toBe(true)
    expect(out.map(e => e.rank)).toEqual([1,2,3,4,5,6,7,8,9,10])
  })

  it('revealBottom on: masked top-N PLUS real-name bottom-k', () => {
    // T=30, pct=20 -> k=6 -> bottom ranks 25..30 revealed with REAL names.
    const out = buildStudentBoard(makeBoard(30), { pct: 20, total: 30, topN: 10, revealBottom: true })
    expect(out.map(e => e.rank)).toEqual([1,2,3,4,5,6,7,8,9,10, 25,26,27,28,29,30])
    // top-N masked
    expect(out.filter(e => e.rank <= 10).every(e => e.studentName.startsWith('Anonymous'))).toBe(true)
    // bottom-k real names + real ids
    const bottom = out.filter(e => e.rank >= 25)
    expect(bottom.every(e => e.studentName === `Real ${e.rank}` && e.studentId === `id-${e.rank}`)).toBe(true)
  })

  it('tiny class (T <= topN) with revealBottom: whole board shown, bottom slice revealed', () => {
    // T=5, pct=40 -> k=2 -> ranks 4,5 revealed; ranks 1-3 masked; all 5 shown, no duplicates.
    const out = buildStudentBoard(makeBoard(5), { pct: 40, total: 5, topN: 10, revealBottom: true })
    expect(out.map(e => e.rank)).toEqual([1,2,3,4,5])
    expect(out.filter(e => e.rank <= 3).every(e => e.studentName.startsWith('Anonymous'))).toBe(true)
    expect(out.find(e => e.rank === 4).studentName).toBe('Real 4')
    expect(out.find(e => e.rank === 5).studentName).toBe('Real 5')
  })

  it('does NOT mutate the input board', () => {
    const board = makeBoard(30)
    const snap = JSON.stringify(board)
    buildStudentBoard(board, { pct: 20, total: 30, topN: 10, revealBottom: true })
    expect(JSON.stringify(board)).toBe(snap)
  })
})

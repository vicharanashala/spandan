// Session insights for the results page: everything derived from a room's questions, responses,
// memberships and transcripts in ONE pass, as a plain object the frontend renders. Pure function —
// no DB access — so it is unit-testable; the route (GET /responses/insights/:roomId) loads the docs.
//
// Teachers get the full payload. Students (forTeacher=false) get class-level aggregates only: no
// names, no per-student rows, no "who got it wrong".
//
// computeRoomInsights builds every view of a room in ONE pass — the shared class payload, the
// teacher additions and each student's own `me` — so an ended room is computed once and cached
// (services/insightsCache.js). computeInsights is the single-viewer wrapper over it.

import { anonymizeBoard } from './anonymizeLeaderboard.js'

const num = (v, d = 0) => (Number.isFinite(v) ? v : d)
const round = (v, p = 1) => Math.round(v * 10 ** p) / 10 ** p
const median = (arr) => {
  if (!arr.length) return null
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null)
const stdev = (arr) => {
  if (arr.length < 2) return 0
  const m = mean(arr)
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length)
}
const sid = (v) => String(v?._id ?? v)

// How the teacher sees each student: { studentId, name, email }. Named session → the real identity.
// Anonymous session → the SAME rule as the teacher's leaderboard (anonymizeBoard, the single home of
// that rule): only the lowest-scoring anonymityPercent% keep their real identity; everyone else is
// 'Anonymous #<rank>' with an 'anon-<rank>' id and no email. Students who joined but never answered
// are not on the board, so they are 'Anonymous (no answers)'.
function teacherIdentities({ ranked, members, usersById, anonymous, pct }) {
  const real = (st) => ({ studentId: st, name: usersById.get(st)?.name || 'Student', email: usersById.get(st)?.email || '' })
  if (!anonymous) return real
  const board = ranked.map(([st], k) => ({ rank: k + 1, studentId: st, studentName: real(st).name }))
  const shown = anonymizeBoard(board, { anonymous: true, pct: pct ?? 0, total: board.length, viewer: 'teacher' })
  const map = new Map()
  shown.forEach((e, k) => {
    const st = board[k].studentId
    map.set(st, e.studentName === board[k].studentName ? real(st) : { studentId: `anon-${e.rank}`, name: `Anonymous #${e.rank}`, email: '' })
  })
  let silent = 0
  for (const m of members) {
    const st = sid(m.studentId)
    if (!map.has(st)) map.set(st, { studentId: `anon-n${++silent}`, name: 'Anonymous (no answers)', email: '' })
  }
  return (st) => map.get(st) || { studentId: 'anon', name: 'Anonymous', email: '' }
}

// Response-time histogram buckets (seconds): 0-5, 5-10, 10-20, 20-30, 30-60, 60+
export const RT_BUCKETS = [[0, 5], [5, 10], [10, 20], [20, 30], [30, 60], [60, Infinity]]
const rtBucketIndex = (t) => RT_BUCKETS.findIndex(([lo, hi]) => t >= lo && t < hi)

// Launch time of a question. Neither stored timestamp is the launch:
//   - createdAt is the GENERATION time (a batch is generated together and launched later),
//   - closeAt is set when the poll is superseded, which for the last poll of a segment is the NEXT
//     segment's launch (~11 min later on real data, 2026-10-13 room B5WYZ4).
// So: 1. the first response's time (a launched poll is answered within seconds),
//     2. else closeAt − timeToAnswer, 3. else createdAt (never launched / never answered).
const makeLaunchTime = (firstResponseAt) => (q) => {
  const first = firstResponseAt.get(String(q._id))
  if (first) return new Date(first)
  if (q.closeAt && q.timeToAnswer) return new Date(new Date(q.closeAt).getTime() - q.timeToAnswer * 1000)
  return q.createdAt ? new Date(q.createdAt) : null
}

// studentId (students only): adds `me` — that student's own results against the class (no names).
export function computeInsights({ room, questions, responses, members, transcripts = [], usersById = new Map(), forTeacher = false, studentId = null }) {
  const meFor = !forTeacher && studentId ? [String(studentId)] : null
  const { base, teacher, me } = computeRoomInsights({ room, questions, responses, members, transcripts, usersById, withTeacher: forTeacher, meFor })
  if (forTeacher) return teacher
  return meFor ? { ...base, me: me.get(meFor[0]) } : base
}

// One pass over a room → { base, teacher, me }:
//   base     class-level payload (what every student sees)
//   teacher  base + names, heatmap, wrong-answer lists (only when withTeacher)
//   me       Map studentId -> that student's `me` block, for meFor = 'all' (every member and
//            responder) or an array of ids; empty when meFor is null.
export function computeRoomInsights({ room, questions, responses, members, transcripts = [], usersById = new Map(), withTeacher = true, meFor = 'all' }) {
  const start = room?.createdAt ? new Date(room.createdAt) : null
  const end = room?.endedAt ? new Date(room.endedAt) : null
  const minuteOf = (d) => (start && d ? Math.max(0, (new Date(d).getTime() - start.getTime()) / 60000) : null)
  // First pass over ALL responses: each question's first-response time, and (when `me` blocks are
  // wanted) each student's own responses keyed by question plus their response times.
  const firstResponseAt = new Map()
  const ownByStudent = meFor ? new Map() : null // studentId -> { byQ: Map(qid -> response), times: [] }
  for (const r of responses) {
    const k = sid(r.questionId), t = r.createdAt ? new Date(r.createdAt).getTime() : null
    if (t !== null && (!firstResponseAt.has(k) || t < firstResponseAt.get(k))) firstResponseAt.set(k, t)
    if (ownByStudent) {
      const st = sid(r.studentId)
      let o = ownByStudent.get(st)
      if (!o) { o = { byQ: new Map(), times: [] }; ownByStudent.set(st, o) }
      o.byQ.set(k, r)
      const rt = num(r.responseTime, NaN)
      if (Number.isFinite(rt) && rt >= 0) o.times.push(rt)
    }
  }
  const launchTime = makeLaunchTime(firstResponseAt)

  // Order questions by launch time (fallback creation time), 1-based n.
  const qs = [...questions].sort((a, b) => (launchTime(a)?.getTime() || 0) - (launchTime(b)?.getTime() || 0))
  const qIndex = new Map(qs.map((q, i) => [sid(q), i]))

  // Per-student totals (points, correct, answered) and per-question response lists.
  const byQuestion = new Map(qs.map((q) => [sid(q), []]))
  const perStudent = new Map() // studentId -> { points, correct, answered, name, cells: Map(qid -> 'c'|'w') }
  for (const r of responses) {
    const qid = sid(r.questionId)
    if (!byQuestion.has(qid)) continue
    byQuestion.get(qid).push(r)
    const st = sid(r.studentId)
    let s = perStudent.get(st)
    if (!s) { s = { points: 0, correct: 0, answered: 0, cells: new Map() }; perStudent.set(st, s) }
    s.points += num(r.points)
    s.correct += r.isCorrect ? 1 : 0
    s.answered += 1
    s.cells.set(qid, r.isCorrect ? 'c' : 'w')
  }
  const joinedIds = new Set(members.map((m) => sid(m.studentId)))
  for (const st of perStudent.keys()) joinedIds.add(st) // a responder is in the room even if the membership row is missing
  const studentTotals = [...perStudent.values()].map((s) => s.points)
  const scoreSd = stdev(studentTotals)

  // Rank = the leaderboard's order (points desc, then studentId), sorted once.
  const ranked = [...perStudent.entries()].sort((a, b) => b[1].points - a[1].points || (a[0] < b[0] ? -1 : 1))
  const rankOf = new Map(ranked.map(([id], k) => [id, k + 1]))
  const anonymous = !!room?.settings?.anonymousLeaderboard
  const who = withTeacher ? teacherIdentities({ ranked, members, usersById, anonymous, pct: room?.settings?.anonymityPercent }) : null

  // ---- per question ----
  const teacherQ = withTeacher ? new Map() : null // qid -> { wrongStudents, noAnswer }
  const questionsOut = qs.map((q, i) => {
    const rs = byQuestion.get(sid(q)) || []
    const n = rs.length
    let correct = 0
    for (const r of rs) if (r.isCorrect) correct += 1
    const counts = q.options.map(() => 0)
    for (const r of rs) {
      const picks = Array.isArray(r.selectedOptions) && r.selectedOptions.length ? r.selectedOptions : [r.selectedOption]
      for (const p of picks) if (Number.isInteger(p) && p >= 0 && p < counts.length) counts[p] += 1
    }
    const wrongPicks = q.options.reduce((a, o, k) => a + (o.isCorrect ? 0 : counts[k]), 0)
    const options = q.options.map((o, k) => ({
      text: o.text, isCorrect: !!o.isCorrect, count: counts[k],
      share: n ? round((counts[k] / n) * 100, 0) : 0,
      // distractor efficiency: share of all wrong picks this distractor attracted (null for correct options)
      distractorShare: o.isCorrect ? null : (wrongPicks ? round((counts[k] / wrongPicks) * 100, 0) : 0)
    }))
    const times = rs.map((r) => num(r.responseTime, NaN)).filter((t) => Number.isFinite(t) && t >= 0)
    const rtBuckets = RT_BUCKETS.map(() => 0)
    for (const t of times) { const b = rtBucketIndex(t); if (b >= 0) rtBuckets[b] += 1 }
    const difficulty = n ? correct / n : null // classical "p": proportion correct
    // Point-biserial discrimination: do students who got this right score higher overall?
    let discrimination = null
    if (n >= 5 && scoreSd > 0 && correct > 0 && correct < n) {
      const right = rs.filter((r) => r.isCorrect).map((r) => perStudent.get(sid(r.studentId)).points)
      const wrong = rs.filter((r) => !r.isCorrect).map((r) => perStudent.get(sid(r.studentId)).points)
      const p = correct / n
      discrimination = round(((mean(right) - mean(wrong)) / scoreSd) * Math.sqrt(p * (1 - p)), 2)
    }
    const flags = []
    if (difficulty !== null && n >= 5) {
      if (difficulty >= 0.9) flags.push('too-easy')
      if (difficulty < 0.3) flags.push('hard')
    }
    if (discrimination !== null && discrimination < 0.2) flags.push('low-discrimination')
    if (q.type !== 'TF' && n >= 10 && options.some((o) => !o.isCorrect && o.count === 0)) flags.push('dead-distractor')
    const launchedAt = launchTime(q)
    const minute = minuteOf(launchedAt)
    if (teacherQ) {
      teacherQ.set(sid(q), {
        wrongStudents: rs.filter((r) => !r.isCorrect).map((r) => { const w = who(sid(r.studentId)); return { id: w.studentId, name: w.name } }),
        noAnswer: Math.max(0, joinedIds.size - n)
      })
    }
    return {
      id: sid(q), n: i + 1, segmentIndex: q.segmentIndex ?? null, type: q.type, text: q.question,
      options, explanation: q.explanation || '', points: q.points ?? null, timeToAnswer: q.timeToAnswer ?? null,
      launchedAt, minute: minute !== null ? round(minute, 1) : null,
      responses: n, correct, correctRate: n ? round((correct / n) * 100, 0) : null,
      medianResponseTime: times.length ? round(median(times), 1) : null,
      rtBuckets, difficulty: difficulty !== null ? round(difficulty, 2) : null, discrimination, flags
    }
  })

  // ---- totals + funnel ----
  const polls = questionsOut.length
  const responders = perStudent.size
  let answeredHalf = 0, answeredAll = 0
  if (polls) for (const s of perStudent.values()) { if (s.answered >= polls / 2) answeredHalf += 1; if (s.answered >= polls) answeredAll += 1 }
  const allTimes = []
  let correctResponses = 0
  for (const r of responses) {
    const t = num(r.responseTime, NaN)
    if (Number.isFinite(t) && t >= 0) allTimes.push(t)
    if (r.isCorrect) correctResponses += 1
  }
  const totals = {
    questions: polls, responses: responses.length, joined: joinedIds.size, responders, answeredHalf, answeredAll,
    participationRate: joinedIds.size ? round((responders / joinedIds.size) * 100, 0) : null,
    medianResponseTime: allTimes.length ? round(median(allTimes), 1) : null,
    meanScore: studentTotals.length ? round(mean(studentTotals), 0) : null,
    medianScore: studentTotals.length ? round(median(studentTotals), 0) : null,
    maxScore: studentTotals.length ? Math.max(...studentTotals) : null,
    maxPossible: questionsOut.reduce((a, q) => a + num(q.points), 0),
    overallCorrectRate: responses.length ? round((correctResponses / responses.length) * 100, 0) : null,
    durationMin: start && end ? round((end - start) / 60000, 0) : null
  }

  // ---- timeline + join curve ----
  const timeline = questionsOut.map((q) => ({ id: q.id, n: q.n, segmentIndex: q.segmentIndex, minute: q.minute, responders: q.responses, correctRate: q.correctRate }))
  const joinMinutes = members.map((m) => minuteOf(m.joinedAt)).filter((m) => m !== null).sort((a, b) => a - b)
  const joinCurve = joinMinutes.map((m, i) => ({ minute: round(m, 1), cumulative: i + 1 }))

  // ---- score distribution ----
  const maxPts = Math.max(totals.maxPossible, totals.maxScore || 0, 1)
  const nb = 8
  const width = Math.ceil(maxPts / nb)
  const buckets = Array.from({ length: nb }, (_, k) => ({ from: k * width, to: (k + 1) * width, count: 0 }))
  for (const t of studentTotals) buckets[Math.min(nb - 1, Math.floor(t / width))].count += 1
  const scores = { buckets, mean: totals.meanScore, median: totals.medianScore, max: totals.maxScore, maxPossible: totals.maxPossible }

  // ---- per segment ----
  // Live recording numbers segments from 1 (RoomDetailPage currentSegment). 0 = created outside a
  // recording (Create Q / before recording) and -1 = pasted text: both are grouped under 0
  // ("manual / pasted"), so pasted text stays with the questions made from it.
  const segKey = (v) => (Number.isInteger(v) && v >= 1 ? v : 0)
  const segMap = new Map()
  for (const q of questionsOut) {
    const k = segKey(q.segmentIndex)
    let s = segMap.get(k)
    if (!s) { s = { segmentIndex: k, questions: 0, responses: 0, correct: 0, words: 0, durationSec: 0 }; segMap.set(k, s) }
    s.questions += 1; s.responses += q.responses; s.correct += q.correct
  }
  for (const t of transcripts) {
    const k = segKey(t.segmentIndex)
    let s = segMap.get(k)
    if (!s) { s = { segmentIndex: k, questions: 0, responses: 0, correct: 0, words: 0, durationSec: 0 }; segMap.set(k, s) }
    s.words += num(t.wordCount); s.durationSec += num(t.duration)
  }
  const segments = [...segMap.values()].sort((a, b) => (a.segmentIndex || Infinity) - (b.segmentIndex || Infinity)) // live segments 1, 2, …; manual / pasted last
    .map((s) => ({ ...s, correctRate: s.responses ? round((s.correct / s.responses) * 100, 0) : null }))

  const base = { room: { id: sid(room), name: room.name, code: room.code, mode: room.settings?.mode || 'normal', createdAt: start, endedAt: end }, totals, timeline, joinCurve, questions: questionsOut, scores, segments }

  // ---- teacher view: base + names (questions and scores are copied, never mutated, so base stays student-safe) ----
  // Anonymous session: identities are masked HERE, on the server (see teacherIdentities).
  let teacher = null
  if (withTeacher) {
    const rows = ranked.map(([st, s]) => ({
      ...who(st),
      points: s.points, correct: s.correct, answered: s.answered,
      cells: questionsOut.map((q) => s.cells.get(q.id) || '-')
    }))
    // Named: points desc, then name. Anonymous: rank order only (a name tie-break would leak the
    // alphabetical order of the hidden names).
    if (!anonymous) rows.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
    // joined but never answered
    for (const m of members) {
      const st = sid(m.studentId)
      if (!perStudent.has(st)) rows.push({ ...who(st), points: 0, correct: 0, answered: 0, cells: questionsOut.map(() => '-') })
    }
    teacher = {
      ...base,
      questions: questionsOut.map((q) => ({ ...q, ...teacherQ.get(q.id) })),
      scores: { ...scores, students: rows.map(({ cells, ...r }) => r) },
      heatmap: { questionIds: questionsOut.map((q) => q.id), rows },
      anonymity: anonymous ? { percent: room?.settings?.anonymityPercent ?? 0 } : null
    }
  }

  // ---- each student's own view (no names) ----
  const me = new Map()
  if (meFor) {
    const ids = meFor === 'all' ? joinedIds : meFor
    // Anonymous leaderboard: students are never told their own rank (same rule as GET /leaderboard,
    // which withholds userRank so nobody can locate themselves on the board).
    const rankHidden = anonymous
    const noResponses = { byQ: new Map(), times: [] }
    for (const id of ids) {
      const st = String(id)
      const own = ownByStudent.get(st) || noResponses
      let cumulative = 0, answered = 0, correctN = 0, fasterThanClass = 0, best = 0, run = 0
      const perQuestion = questionsOut.map((q) => {
        const r = own.byQ.get(q.id)
        const isAnswered = !!r
        const pts = isAnswered ? num(r.points) : 0
        cumulative += pts
        const picks = isAnswered ? (Array.isArray(r.selectedOptions) && r.selectedOptions.length ? r.selectedOptions : [r.selectedOption]) : []
        const responseTime = isAnswered && Number.isFinite(num(r.responseTime, NaN)) ? round(num(r.responseTime), 1) : null
        const isCorrect = isAnswered ? !!r.isCorrect : null
        if (isAnswered) {
          answered += 1
          if (isCorrect) correctN += 1
          if (responseTime !== null && q.medianResponseTime !== null && responseTime < q.medianResponseTime) fasterThanClass += 1
        }
        // longest run of consecutive correct answers (in launch order, unanswered breaks the run)
        run = isAnswered && isCorrect ? run + 1 : 0
        if (run > best) best = run
        return {
          id: q.id, n: q.n, answered: isAnswered, isCorrect, points: pts, cumulativePoints: cumulative,
          responseTime, selected: picks.filter((p) => Number.isInteger(p)),
          classCorrectRate: q.correctRate, classMedianResponseTime: q.medianResponseTime, maxPoints: q.points
        }
      })
      me.set(st, {
        rank: rankHidden ? null : (rankOf.get(st) ?? null), rankHidden, of: ranked.length,
        points: perStudent.get(st)?.points ?? 0, maxPossible: totals.maxPossible,
        answered, correct: correctN, missed: polls - answered,
        correctRate: answered ? round((correctN / answered) * 100, 0) : null,
        medianResponseTime: own.times.length ? round(median(own.times), 1) : null,
        fasterThanClass, bestStreak: best,
        classMedianScore: totals.medianScore, classCorrectRate: totals.overallCorrectRate, classMedianResponseTime: totals.medianResponseTime,
        perQuestion
      })
    }
  }
  return { base, teacher, me }
}

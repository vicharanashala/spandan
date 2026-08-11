// Pure scoring math. No DB calls, no socket calls.
// All weights/thresholds are named constants at the top so they can be tuned
// without touching the logic below.

import RiskScore from '../models/RiskScore.js'

// ─── Tunable constants ────────────────────────────────────────────────────
// Zone thresholds on the 0-100 scale.
export const SAFE_THRESHOLD = 70      // >= 70 → safe
export const WARNING_THRESHOLD = 40   // >= 40 (and < 70) → warning; < 40 → risk

// Per-event weights (delta points).
//
// IMPORTANT: SKIP_PENALTY is intentionally larger than WRONG_PENALTY.
// A wrong answer signals the student is at least *attempting* engagement.
// A skip signals "attendance only" behavior — the exact pattern the spec
// wants surfaced to teachers. The gap is deliberate and commented so
// reviewers don't "tidy" it back to equality.
export const CORRECT_REWARD = 8
export const WRONG_PENALTY = -5
export const SKIP_PENALTY = -10        // MUST be more negative than WRONG_PENALTY
export const LATENCY_PENALTY_PER_SEC_OVER = -0.5  // above fastThresholdSec

// Latency curve parameters.
export const FAST_THRESHOLD_SEC = 3    // answers faster than this incur no latency penalty
export const SLOW_THRESHOLD_SEC = 20   // beyond this, latency penalty is capped

// How many consecutive correct answers a clean streak needs to fully
// reset the penalty tail. Used for correctStreakNeeded derivation.
export const STREAK_RECOVERY_RATE = 8  // points gained per consecutive correct answer

// ─── Zone derivation ──────────────────────────────────────────────────────
export function zoneFromScore(score) {
  if (score >= SAFE_THRESHOLD) return 'safe'
  if (score >= WARNING_THRESHOLD) return 'warning'
  return 'risk'
}

// How many MORE consecutive correct answers a student needs to climb
// back to the SAFE_THRESHOLD, given their current score. Zero if already
// at/above safe. Capped at a sane upper bound.
export function streakNeededFromScore(score) {
  if (score >= SAFE_THRESHOLD) return 0
  const gap = SAFE_THRESHOLD - score
  // Each correct answer doesn't move the score by the full CORRECT_REWARD (+8).
  // Because of the 85/15 blend, the actual score movement per correct answer is
  // CORRECT_REWARD * EVENT_WEIGHT_NEW ≈ 6.8 points. Using the raw +8 here made
  // the UI display fewer answers needed than reality (optimistic by ~1 answer).
  // 0.85 mirrors EVENT_WEIGHT_NEW — update both together if the blend is retuned.
  const actualGainPerCorrect = CORRECT_REWARD * 0.85
  const needed = Math.ceil(gap / actualGainPerCorrect)
  return Math.max(1, Math.min(needed, 20))
}

// ─── Decay model ──────────────────────────────────────────────────────────
// SPEC FIX 2026-07-08:
// The previous formula `prior*0.65 + (prior+delta)*0.35` reduced algebraically
// to `prior + 0.35*delta`, which means every event only contributed 35% of
// its raw delta. A correct answer moved the student by +2.8 (not +8), a wrong
// by -1.75 (not -5), and a skip by -3.5 (not -10). Teachers read the UI as
// "the score barely moves even when students skip repeatedly", which is the
// "constantly decreasing but never enough" symptom.
//
// The fix below treats each event's raw delta as authoritative, then applies
// a small inertia blend so single events don't produce jarring single-event
// spikes. The blend acts on the TARGET (post-delta) score, so the per-event
// change is mostly the delta itself (alpha is close to 1) with a gentle tug
// back toward the prior score.
//
// Tuning notes:
//   - alpha = 0.85: each event moves the score ~85% of the way to the
//                    delta-adjusted target. Single correct/wrong is felt
//                    clearly, multiple wrongs still accumulate, and the
//                    score doesn't oscillate wildly.
//   - Inertia provides smoothness without making events feel invisible.
const EVENT_WEIGHT_NEW = 0.85       // how much each event moves the score (single-event impact)
const EVENT_WEIGHT_HISTORY = 0.15   // small inertia toward prior (smoothness, not signal dilution)

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)) }

// ─── Streak-aware delta ──────────────────────────────────────────────────
// SPEC 2026-07-08: streaks compound the reward/penalty so that
// disengagement or sustained effort is felt faster than per-event flat
// deltas. A student who gets 5 wrong answers in a row drops more
// steeply than a student who gets 1 wrong in 5 questions.
const STREAK_BONUS_PER_STEP = 2   // extra points per consecutive same-outcome
const STREAK_CAP = 5             // count streaks up to 5
const CORRECT_MAX_DELTA = 15     // cap single-event reward at +15
const WRONG_MAX_DELTA = -15      // cap single-event penalty at -15

// Look at the doc's history (most recent first) to determine the streak
// the next event will extend. Returns the *current* streak length for
// the same outcome (correct or wrong). Skips break the streak entirely
// and return 0.
function priorStreak(currentDoc, eventType) {
  if (!currentDoc || !Array.isArray(currentDoc.history) || currentDoc.history.length === 0) return 0
  // Walk backwards through history. Each consecutive same-outcome
  // event increments the streak; any break (opposite outcome OR skip)
  // terminates it. We cap at STREAK_CAP to bound the bonus.
  let n = 0
  for (let i = currentDoc.history.length - 1; i >= 0; i--) {
    const e = currentDoc.history[i]
    if (e.skipped) break  // skip breaks both streaks
    if (eventType === 'correct' && e.answeredCorrectly === true) n++
    else if (eventType === 'wrong' && e.answeredCorrectly === false) n++
    else break
    if (n >= STREAK_CAP) break
  }
  return n
}

// ─── Core: compute a delta for one event ─────────────────────────────────
// Returns a streak-scaled delta. Caller passes the current doc so we
// can look at the history and decide whether to apply the streak bonus.
// (For test code or contexts without a doc, pass null and the delta is
// the base value with no streak bonus.)
export function computeEventDelta(event, currentDoc = null) {
  // event: { type: 'correct' | 'wrong' | 'skip', responseTimeMs?, timeToAnswerMs? }
  if (!event || !event.type) return 0

  // Skip is a flat penalty (and breaks streak, so it never compounds).
  if (event.type === 'skip') return SKIP_PENALTY

  // Compute the streak of consecutive same-outcome events BEFORE this
  // one is recorded. If 0, this is the first of a new run.
  const baseStreak = priorStreak(currentDoc, event.type)

  let delta
  if (event.type === 'correct') {
    // Reward grows with consecutive corrects, capped at +15.
    const streakBonus = Math.min(baseStreak * STREAK_BONUS_PER_STEP, CORRECT_MAX_DELTA - CORRECT_REWARD)
    delta = CORRECT_REWARD + streakBonus
  } else if (event.type === 'wrong') {
    // Penalty deepens with consecutive wrongs, capped at -15.
    const streakBonus = Math.min(baseStreak * STREAK_BONUS_PER_STEP, Math.abs(WRONG_MAX_DELTA - WRONG_PENALTY))
    delta = WRONG_PENALTY - streakBonus  // subtract bonus from a negative number
  } else {
    delta = 0
  }

  return delta
}

// Latency is a SECONDARY signal — added on top of correctness/skip deltas
// but never the dominant term (capped via the bounds below).
export function computeLatencyPenalty(responseTimeMs, timeToAnswerMs) {
  if (!responseTimeMs || !timeToAnswerMs) return 0
  const responseSec = responseTimeMs / 1000
  const ttaSec = timeToAnswerMs / 1000

  // Express response time as a FRACTION of the allowed window so that
  // a 10s answer on a 60s question (17% of time used) is not penalized
  // the same as a 10s answer on a 15s question (67% of time used).
  //
  // Penalty curve:
  //   0% – 25% of allowed time  → no penalty (fast enough)
  //   25% – 85% of allowed time → linear ramp up to MAX_LATENCY_PENALTY
  //   85% – 100%                → capped at MAX_LATENCY_PENALTY
  const usedFraction = Math.min(1, responseSec / ttaSec)
  const FAST_FRAC = 0.25   // use < 25% of time → free
  const SLOW_FRAC = 0.85   // use > 85% of time → max penalty
  const MAX_LATENCY_PENALTY = 2.5  // at most half of WRONG_PENALTY

  if (usedFraction <= FAST_FRAC) return 0

  const ratio = Math.min(1, (usedFraction - FAST_FRAC) / (SLOW_FRAC - FAST_FRAC))
  const raw = -Math.round(MAX_LATENCY_PENALTY * ratio * 10) / 10
  // Normalize -0 to 0 so equality assertions are stable.
  return raw === 0 ? 0 : raw
}

// ─── Pure update: given the current doc state (or null) and an event,
// return what the new state should look like. No DB writes here. ─────────
export function computeRiskUpdate(currentDoc, event) {
  const priorScore = currentDoc?.currentScore ?? 100
  const eventDelta = computeEventDelta(event, currentDoc)
  const latencyDelta = event.type === 'correct' || event.type === 'wrong'
    ? computeLatencyPenalty(event.responseTimeMs, event.timeToAnswerMs)
    : 0

  const totalDelta = eventDelta + latencyDelta

  // Compute the post-delta target first (the score the event would
  // produce if applied at full weight).
  const target = clamp(priorScore + totalDelta, 0, 100)
  // Blend toward the target with a small inertia factor so a single
  // event doesn't jolt the score, but the delta is still felt clearly.
  // priorScore + (target - priorScore) * alpha ===
  // priorScore * (1 - alpha) + target * alpha
  const blended = priorScore * EVENT_WEIGHT_HISTORY + target * EVENT_WEIGHT_NEW
  const newScore = Math.round(clamp(blended, 0, 100) * 10) / 10

  return {
    scoreDelta: Math.round(totalDelta * 10) / 10,
    newScore,
    newZone: zoneFromScore(newScore),
    correctStreakNeeded: streakNeededFromScore(newScore),
    historyEntry: {
      questionId: event.questionId ?? null,
      answeredCorrectly: event.type === 'correct',
      responseTimeMs: event.responseTimeMs ?? null,
      skipped: event.type === 'skip',
      scoreAfter: newScore,
      timestamp: new Date()
    }
  }
}

// ─── Persistence helpers ─────────────────────────────────────────────────
// These wrap the pure function above with DB read/write. Kept here so
// callers (the socket layer, the skip detector, the API) don't need to
// touch Mongoose directly.

export async function applyEvent(studentId, roomId, event, sessionDate) {
  // Dedupe guard: the front-end (or a stray socket replay) can fire
  // `response:submit` multiple times per question, and `question:end`
  // can race with the student's last-second answer. Without this guard,
  // every duplicate wire event would re-blend the score and visibly drag
  // it down on each poll. We accept the FIRST event for a given
  // (student, question) pair and silently drop later ones.
  if (event?.questionId) {
    const existing = await RiskScore.findOne({ studentId, roomId })
      .select('history')
      .lean()
    const alreadySeen = Array.isArray(existing?.history)
      && existing.history.some(h => h.questionId?.toString() === event.questionId.toString())
    if (alreadySeen) {
      // Return the current state unchanged so callers don't break.
      const doc = await RiskScore.findOne({ studentId, roomId }).lean()
      return {
        doc,
        update: {
          scoreDelta: 0,
          newScore: doc?.currentScore ?? 100,
          newZone: doc?.zone ?? 'safe',
          correctStreakNeeded: doc?.correctStreakNeeded ?? 0,
          historyEntry: null,
          deduped: true
        }
      }
    }
  }

  const existing = await RiskScore.findOne({ studentId, roomId })
  const update = computeRiskUpdate(existing, event)

  const doc = await RiskScore.findOneAndUpdate(
    { studentId, roomId },
    {
      $set: {
        studentId,
        roomId,
        date: sessionDate || (existing?.date) || new Date(),
        currentScore: update.newScore,
        zone: update.newZone,
        correctStreakNeeded: update.correctStreakNeeded,
        lastUpdated: new Date()
      },
      $push: { history: update.historyEntry }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )

  return { doc, update }
}

export async function getRoomRiskSnapshot(roomId) {
  const docs = await RiskScore.find({ roomId }).populate('studentId', 'name email').lean()
  return docs.map(d => ({
    studentId: d.studentId?._id?.toString() ?? d.studentId?.toString(),
    studentName: d.studentId?.name ?? 'Unknown',
    currentScore: d.currentScore,
    zone: d.zone,
    correctStreakNeeded: d.correctStreakNeeded,
    lastUpdated: d.lastUpdated
  }))
}

export async function getStudentRiskForDate(studentId, date) {
  // date: JS Date (UTC midnight onward). We filter by day window.
  const dayStart = new Date(date)
  dayStart.setUTCHours(0, 0, 0, 0)
  const dayEnd = new Date(dayStart)
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1)

  return RiskScore.find({
    studentId,
    date: { $gte: dayStart, $lt: dayEnd }
  }).sort({ date: 1 }).lean()
}

export async function getStudentRiskTrend(studentId, roomId = null) {
  const filter = { studentId }
  if (roomId) filter.roomId = roomId

  const docs = await RiskScore.find(filter)
    .sort({ date: 1 })
    .populate('roomId', 'name code')
    .lean()

  const points = []
  for (const d of docs) {
    if (Array.isArray(d.history) && d.history.length > 0) {
      // Use each historical event as a point in the trend (high resolution).
      for (const h of d.history) {
        points.push({
          at: h.timestamp || d.lastUpdated || d.date,
          currentScore: h.scoreAfter,
          zone: zoneFromScore(h.scoreAfter),
          roomCode: d.roomId?.code,
          questionId: h.questionId
        })
      }
    } else {
      points.push({
        at: d.lastUpdated || d.date,
        currentScore: d.currentScore,
        zone: d.zone,
        roomCode: d.roomId?.code,
        questionId: null
      })
    }
  }

  // Sort by time ascending (history items inside one doc may already be in order,
  // but a date filter can mix rooms). Stable sort by `at` is enough.
  points.sort((a, b) => new Date(a.at) - new Date(b.at))

  const latest = docs[docs.length - 1]
  return {
    currentScore: latest?.currentScore ?? null,
    currentZone: latest?.zone ?? null,
    points
  }
}

// ─── Consecutive-day trend ──────────────────────────────────────────────
// Returns one bucket PER CALENDAR DAY in the requested window (oldest first).
// Per-day aggregates computed from RiskScore.history entries (each event
// records scoreAfter + skipped + answeredCorrectly + timestamp).
//
// Range buckets: 'today' | '7d' | '30d'. Defaults to '7d' on the server side
// AND on the frontend so they stay in sync.
export async function getStudentDailyTrend(studentId, range = '7d', roomId = null) {
  const now = new Date()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const days = rangeToDays(range)

  const rangeStart = new Date(today)
  rangeStart.setUTCDate(rangeStart.getUTCDate() - (days - 1))

  const filter = {
    studentId,
    'history.timestamp': { $gte: rangeStart, $lt: new Date(today.getTime() + 24 * 3600 * 1000) }
  }
  if (roomId) filter.roomId = roomId

  const docs = await RiskScore.find(filter)
    .populate('roomId', 'name code')
    .lean()

  const points = aggregateHistoryIntoDailyBuckets(docs, days, rangeStart, range)
  return {
    range,
    rangeStart: rangeStart.toISOString(),
    rangeEnd: today.toISOString(),
    days,
    points
  }
}

// Pure helper: takes RiskScore documents (already filtered to the window)
// and builds the per-day point list. Exported so tests can drive it
// without a Mongo connection.
export function aggregateHistoryIntoDailyBuckets(docs, days, rangeStart, range) {
  const buckets = new Map() // ymd => { scores: [], skipped:0, answered:0, rooms:Set }
  for (let i = 0; i < days; i++) {
    const d = new Date(rangeStart)
    d.setUTCDate(d.getUTCDate() + i)
    const key = toYMD(d)
    buckets.set(key, {
      date: key,
      scores: [],
      skipped: 0,
      answered: 0,
      rooms: new Set()
    })
  }

  for (const doc of docs) {
    if (!Array.isArray(doc.history)) continue
    const roomCode = doc.roomId?.code
    for (const h of doc.history) {
      const t = new Date(h.timestamp || doc.lastUpdated || doc.date)
      const key = toYMD(t)
      const bucket = buckets.get(key)
      if (!bucket || h.scoreAfter == null) continue
      bucket.scores.push(h.scoreAfter)
      if (h.skipped) bucket.skipped++
      else bucket.answered++
      if (roomCode) bucket.rooms.add(roomCode)
    }
  }

  const points = []
  for (const key of [...buckets.keys()].sort()) {
    const b = buckets.get(key)
    const scores = b.scores
    let minScore = null, maxScore = null, avgScore = null, endingScore = null, worstZone = null, hasData = false
    if (scores.length > 0) {
      minScore = Math.min(...scores)
      maxScore = Math.max(...scores)
      avgScore = Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 10) / 10
      // Ending score is the last event of the day (most representative).
      endingScore = scores[scores.length - 1]
      worstZone = zoneFromScore(minScore)
      hasData = true
    }
    points.push({
      date: key,
      answered: b.answered,
      skipped: b.skipped,
      totalEvents: scores.length,
      minScore,
      maxScore,
      avgScore,
      endingScore,
      worstZone,
      rooms: [...b.rooms],
      hasData
    })
  }

  return points
}

export function rangeToDays(range) {
  if (range === '30d') return 30
  if (range === 'today') return 1
  return 7
}

function toYMD(d) {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
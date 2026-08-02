/**
 * test-penalty.mjs — Standalone verification for random-guess detection
 *
 * Run from backend/:
 *   node test-penalty.mjs
 *
 * No Jest, no MongoDB, no Redis required.
 * Uses the same in-memory Map fallback the service uses in dev/test.
 *
 * Each test prints PASS ✅ or FAIL ❌ with a clear explanation.
 * Exit code 0 = all tests passed, 1 = at least one failed.
 */

// ── Setup: inject test env vars so results are predictable regardless of .env ──
// Ultra-fast window: 5 s (generous — easy to "answer fast" in tests)
// Streaks:  insight at 3, penalty at 4  (production defaults)
process.env.RANDOM_GUESS_DEBUG            = 'false'   // keep output clean
process.env.RANDOM_GUESS_ULTRA_FAST_MAX_SEC  = '5'
process.env.RANDOM_GUESS_ULTRA_FAST_MIN_SEC  = '1'
process.env.RANDOM_GUESS_ULTRA_FAST_FRACTION = '0.15'
process.env.RANDOM_GUESS_INSIGHT_STREAK      = '3'
process.env.RANDOM_GUESS_PENALTY_STREAK      = '4'

// Disable Redis so all state lives in the local in-memory Map.
process.env.REDIS_URL = ''
process.env.REDIS_ENABLED = 'false'

import {
  evaluateAnswer,
  ultraFastThreshold,
  isUltraFast,
  getStreak,
  clearRoomStreaks
} from './src/services/penaltyService.js'

// ── Tiny test harness ──────────────────────────────────────────────────────────
let passed = 0, failed = 0
function assert(condition, testName, detail = '') {
  if (condition) {
    console.log(`  ✅  ${testName}`)
    passed++
  } else {
    console.error(`  ❌  ${testName}`)
    if (detail) console.error(`      → ${detail}`)
    failed++
  }
}

async function suite(name, fn) {
  console.log(`\n▶  ${name}`)
  await fn()
}

// unique room/student IDs per suite to keep state isolated
let suiteCounter = 0
function ids() {
  suiteCounter++
  return { roomId: `room-${suiteCounter}`, studentId: `student-${suiteCounter}` }
}

// Shorthand: submit one answer and return the result
async function answer(roomId, studentId, {
  fast = true, correct = false, tta = 30, options = 4, strict = false
} = {}) {
  const timeTaken = fast ? 1.0 : 20   // 1 s = ultra-fast, 20 s = normal
  return evaluateAnswer(roomId, studentId, {
    timeTakenInSeconds:  timeTaken,
    timeToAnswerSeconds: tta,
    isCorrect:  correct,
    numOptions: options,
    strictMode: strict
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Speed threshold
// ─────────────────────────────────────────────────────────────────────────────
await suite('Speed threshold — ultraFastThreshold()', async () => {
  assert(ultraFastThreshold(5)  <  5,   'Short question (5 s): threshold < 5 s')
  assert(ultraFastThreshold(30) <= 5,   'Standard question (30 s): threshold ≤ 5 s (ULTRA_FAST_MAX_SEC)')
  assert(ultraFastThreshold(60) <= 5,   'Long question (60 s): capped at ULTRA_FAST_MAX_SEC')
  assert(ultraFastThreshold(30) >= 1,   'Always ≥ ULTRA_FAST_MIN_SEC (1 s)')
  assert(isUltraFast(1.0, 30),          '1 s answer on 30 s question → ultra-fast')
  assert(!isUltraFast(20, 30),          '20 s answer on 30 s question → NOT ultra-fast')
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Fast + CORRECT → never flagged
// ─────────────────────────────────────────────────────────────────────────────
await suite('Fast + CORRECT streak → no signal (never flag a sharp student)', async () => {
  const { roomId, studentId } = ids()
  let last
  for (let i = 0; i < 6; i++) {
    last = await answer(roomId, studentId, { fast: true, correct: true, strict: true })
  }
  assert(last.insight === null, 'After 6 fast-correct answers: insight = null')
  assert(last.penalty === null, 'After 6 fast-correct answers: penalty = null')
  assert(getStreak(roomId, studentId) === 6, 'consecutiveFast streak still at 6 (not reset)')
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Fast + WRONG streak (non-strict) → insight fires, answer NOT rejected
// ─────────────────────────────────────────────────────────────────────────────
await suite('Fast + WRONG streak (strictMode OFF) — insight at 3, answer still saved', async () => {
  const { roomId, studentId } = ids()

  const r1 = await answer(roomId, studentId, { fast: true, correct: false, strict: false })
  const r2 = await answer(roomId, studentId, { fast: true, correct: false, strict: false })
  assert(r1.insight === null, 'Answer 1: no insight yet (streak 1 < threshold 3)')
  assert(r2.insight === null, 'Answer 2: no insight yet (streak 2 < threshold 3)')

  const r3 = await answer(roomId, studentId, { fast: true, correct: false, strict: false })
  assert(r3.insight !== null,  'Answer 3: soft insight fires (streak 3 = threshold)')
  assert(r3.penalty === null,  'Answer 3: no penalty yet (streak 3 < penalty threshold 4)')
  assert(r3.insight.streak === 3, `Insight carries streak = 3 (got ${r3.insight?.streak})`)

  // Answer is still saved — caller (responses.js) must NOT reject on non-null insight alone
  // Here we verify evaluateAnswer itself does not set penalty:
  assert(r3.penalty === null, 'Penalty is null → responses.js falls through, saves answer')
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Fast + WRONG streak (strict ON) → penalty fires at 4, streak resets
// ─────────────────────────────────────────────────────────────────────────────
await suite('Fast + WRONG streak (strictMode ON) — penalty fires at 4, streak resets', async () => {
  const { roomId, studentId } = ids()

  await answer(roomId, studentId, { fast: true, correct: false, strict: true }) // 1
  await answer(roomId, studentId, { fast: true, correct: false, strict: true }) // 2
  const r3 = await answer(roomId, studentId, { fast: true, correct: false, strict: true }) // 3
  assert(r3.insight !== null, 'Answer 3: soft insight fires first')
  assert(r3.penalty === null,  'Answer 3: still no penalty')

  const r4 = await answer(roomId, studentId, { fast: true, correct: false, strict: true }) // 4
  assert(r4.penalty !== null,             'Answer 4: hard penalty fires')
  assert(r4.penalty.pointsDeducted === 5, `pointsDeducted = 5 in strict mode (got ${r4.penalty?.pointsDeducted})`)
  assert(getStreak(roomId, studentId) === 0, 'Streak reset to 0 after penalty')
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. Penalty does NOT fire without strictMode even at long streak
// ─────────────────────────────────────────────────────────────────────────────
await suite('Fast + WRONG streak (strictMode OFF) — evaluateAnswer.penalty.pointsDeducted = 0', async () => {
  const { roomId, studentId } = ids()
  let r4
  for (let i = 0; i < 4; i++) {
    r4 = await answer(roomId, studentId, { fast: true, correct: false, strict: false })
  }
  // penalty object exists (internal tracking) but pointsDeducted = 0
  assert(r4.penalty !== null,              'Penalty object returned (streak tracking fired)')
  assert(r4.penalty.pointsDeducted === 0,  'pointsDeducted = 0 (no strict mode)')
  // responses.js checks: if (penalty && room.settings.strictMode) → skips, saves answer normally
  // We verify the object here so the handler behaviour can be validated:
  assert(getStreak(roomId, studentId) === 0, 'Streak still resets after the threshold (detection reset)')
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. One slow answer breaks the streak
// ─────────────────────────────────────────────────────────────────────────────
await suite('Slow answer mid-streak → streak resets, suspicion cleared', async () => {
  const { roomId, studentId } = ids()

  await answer(roomId, studentId, { fast: true,  correct: false })
  await answer(roomId, studentId, { fast: true,  correct: false })
  assert(getStreak(roomId, studentId) === 2, 'Streak = 2 before slow answer')

  await answer(roomId, studentId, { fast: false, correct: false }) // slow
  assert(getStreak(roomId, studentId) === 0, 'Streak reset to 0 after one slow answer')

  // Next fast answer starts a fresh streak of 1 (no carry-over)
  const r = await answer(roomId, studentId, { fast: true, correct: false })
  assert(r.insight === null, 'Fresh streak of 1: no insight')
  assert(getStreak(roomId, studentId) === 1, 'Streak = 1 (fresh start)')
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. Insight throttle — fires once per streak level, not on every answer
// ─────────────────────────────────────────────────────────────────────────────
await suite('Insight throttle — second ping only after streak grows further', async () => {
  const { roomId, studentId } = ids()

  for (let i = 0; i < 3; i++) await answer(roomId, studentId, { fast: true, correct: false })
  // streak = 3, insight fires once
  const r4 = await answer(roomId, studentId, { fast: true, correct: false }) // 4 → penalty fires, resets
  // after reset, start again to reach insight
  for (let i = 0; i < 2; i++) await answer(roomId, studentId, { fast: true, correct: false })
  const rAgain3 = await answer(roomId, studentId, { fast: true, correct: false }) // streak 3 again
  assert(rAgain3.insight !== null, 'Insight fires again at streak 3 after a full reset')
})

// ─────────────────────────────────────────────────────────────────────────────
// 8. clearRoomStreaks clears only the target room
// ─────────────────────────────────────────────────────────────────────────────
await suite('clearRoomStreaks — removes only the specified room', async () => {
  const roomA = 'clear-test-A', roomB = 'clear-test-B', sid = 'student-clear'

  await answer(roomA, sid, { fast: true, correct: false })
  await answer(roomA, sid, { fast: true, correct: false })
  await answer(roomB, sid, { fast: true, correct: false })
  assert(getStreak(roomA, sid) === 2, 'Room A streak = 2 before clear')
  assert(getStreak(roomB, sid) === 1, 'Room B streak = 1 before clear')

  await clearRoomStreaks(roomA)
  assert(getStreak(roomA, sid) === 0, 'Room A cleared')
  assert(getStreak(roomB, sid) === 1, 'Room B untouched')
})

// ─────────────────────────────────────────────────────────────────────────────
// 9. Accuracy gate — mixed fast correct+wrong below penalty threshold
// ─────────────────────────────────────────────────────────────────────────────
await suite('Accuracy gate — high accuracy on fast streak does not trigger insight', async () => {
  const { roomId, studentId } = ids()

  // 3 fast answers: 2 correct, 1 wrong → accuracy = 66 % >> chance (25 %) + buffer (15 %) = 40 %
  await answer(roomId, studentId, { fast: true, correct: true,  options: 4 })
  await answer(roomId, studentId, { fast: true, correct: true,  options: 4 })
  const r3 = await answer(roomId, studentId, { fast: true, correct: false, options: 4 })
  assert(r3.insight === null, 'streak=3 but accuracy 66 % > 40 % → no insight (strong student)')
})

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(52)}`)
console.log(`  Results: ${passed} passed, ${failed} failed`)
console.log('─'.repeat(52))
if (failed > 0) {
  console.error('\nSome tests FAILED. Review the ❌ lines above.\n')
  process.exit(1)
} else {
  console.log('\nAll tests passed ✅\n')
  process.exit(0)
}

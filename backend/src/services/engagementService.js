/**
 * Spandan Engagement Index (SEI)
 *
 * Computes a per-student behavioral engagement score (0-100) from
 * response signals, smoothed with an exponentially weighted moving
 * average (EWMA), and detects sustained disengagement over a rolling
 * window of questions.
 *
 * Design notes:
 * - All scoring functions are pure (no I/O) for testability.
 * - State is kept in-memory per room; rooms are evicted on room end.
 * - Signals are research-grounded proxies for engagement:
 *   response latency, answer switching, participation, correctness.
 */

// ---- Tunables (single source of truth) ----
export const SEI_CONFIG = {
  EWMA_ALPHA: 0.4,          // weight of the newest question's score
  WINDOW_SIZE: 3,           // rolling window for disengagement detection
  ALERT_THRESHOLD: 35,      // avg window score below this => alert
  WEIGHTS: {
    participation: 0.40,    // did the student answer at all
    timing: 0.25,           // how quickly they engaged relative to timer
    decisiveness: 0.15,     // answer switching (thrash = low)
    correctness: 0.20       // outcome signal
  }
}

const clamp01 = (v) => Math.max(0, Math.min(1, v))

/**
 * Score a single question interaction. Returns 0-100.
 * @param {object} signal
 * @param {boolean} signal.answered
 * @param {boolean} signal.isCorrect
 * @param {number}  signal.responseTime  seconds taken to submit
 * @param {number}  signal.timerSeconds  total time allowed
 * @param {number}  signal.answerSwitches
 */
export function scoreQuestion({ answered, isCorrect, responseTime, timerSeconds, answerSwitches }) {
  const w = SEI_CONFIG.WEIGHTS

  if (!answered) {
    // Non-participation is the strongest disengagement signal
    return 0
  }

  const participation = 1

  // Timing: submitting in the first ~70% of the window scores full;
  // last-second submissions decay linearly. Guard divide-by-zero.
  const safeTimer = Math.max(1, timerSeconds || 30)
  const ratio = clamp01((responseTime || 0) / safeTimer)
  const timing = ratio <= 0.7 ? 1 : clamp01((1 - ratio) / 0.3)

  // Decisiveness: 0-1 switches is normal deliberation; heavy
  // thrashing (4+) suggests guessing / distraction.
  const switches = Math.max(0, answerSwitches || 0)
  const decisiveness = switches <= 1 ? 1 : clamp01(1 - (switches - 1) / 3)

  const correctness = isCorrect ? 1 : 0.4 // wrong-but-attempted still shows engagement

  const score =
    w.participation * participation +
    w.timing * timing +
    w.decisiveness * decisiveness +
    w.correctness * correctness

  return Math.round(clamp01(score) * 100)
}

/**
 * EWMA update: newScore blended into previous index.
 */
export function updateIndex(previousIndex, questionScore, alpha = SEI_CONFIG.EWMA_ALPHA) {
  if (previousIndex === null || previousIndex === undefined) return questionScore
  return Math.round(alpha * questionScore + (1 - alpha) * previousIndex)
}

/**
 * Disengagement check over the rolling window.
 * Returns true only when the window is FULL and its average is low —
 * avoids false alarms on the first question or two.
 */
export function isDisengaged(recentScores, config = SEI_CONFIG) {
  if (recentScores.length < config.WINDOW_SIZE) return false
  const window = recentScores.slice(-config.WINDOW_SIZE)
  const avg = window.reduce((a, b) => a + b, 0) / window.length
  return avg < config.ALERT_THRESHOLD
}

// ---- In-memory per-room engagement store ----
// Map<roomCode, Map<studentId, { index, recentScores, alerted }>>
const roomStore = new Map()

export function recordSignal(roomCode, studentId, signal) {
  if (!roomStore.has(roomCode)) roomStore.set(roomCode, new Map())
  const students = roomStore.get(roomCode)

  const prev = students.get(studentId) || { index: null, recentScores: [], alerted: false }
  const qScore = scoreQuestion(signal)
  const index = updateIndex(prev.index, qScore)
  const recentScores = [...prev.recentScores, qScore].slice(-SEI_CONFIG.WINDOW_SIZE * 2)
  const disengaged = isDisengaged(recentScores)

  // Alert fires once per disengagement episode, not on every question
  const shouldAlert = disengaged && !prev.alerted
  students.set(studentId, { index, recentScores, alerted: disengaged })

  return { index, questionScore: qScore, disengaged, shouldAlert }
}

export function getRoomEngagement(roomCode) {
  const students = roomStore.get(roomCode)
  if (!students) return []
  return Array.from(students.entries()).map(([studentId, s]) => ({
    studentId,
    index: s.index,
    disengaged: s.alerted
  }))
}

export function clearRoom(roomCode) {
  roomStore.delete(roomCode)
}
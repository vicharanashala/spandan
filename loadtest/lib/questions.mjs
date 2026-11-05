// Hand-written poll questions: created through POST /api/questions with status 'approved', exactly
// like the teacher's "Create Q" path. No question generation endpoint is called, so no LLM is used.
// Mixes the three types the app supports (MCQ, TF, MSQ).
export const QUESTION_BANK = [
  {
    type: 'MCQ',
    question: '[load test] Which planet is closest to the Sun?',
    options: [
      { text: 'Mercury', isCorrect: true }, { text: 'Venus', isCorrect: false },
      { text: 'Earth', isCorrect: false }, { text: 'Mars', isCorrect: false }
    ]
  },
  {
    type: 'TF',
    question: '[load test] Water boils at 100 °C at sea level.',
    options: [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }]
  },
  {
    type: 'MSQ',
    question: '[load test] Which of these are prime numbers?',
    options: [
      { text: '2', isCorrect: true }, { text: '4', isCorrect: false },
      { text: '7', isCorrect: true }, { text: '9', isCorrect: false }
    ]
  },
  {
    type: 'MCQ',
    question: '[load test] What is 6 × 7?',
    options: [
      { text: '36', isCorrect: false }, { text: '42', isCorrect: true },
      { text: '48', isCorrect: false }, { text: '56', isCorrect: false }
    ]
  },
  {
    type: 'TF',
    question: '[load test] Sound travels faster than light.',
    options: [{ text: 'True', isCorrect: false }, { text: 'False', isCorrect: true }]
  }
]

export const questionFor = (i) => QUESTION_BANK[i % QUESTION_BANK.length]

// What a simulated student picks. Students never see isCorrect (the server strips it before the
// broadcast), so the choice is random, like a guess: one option for MCQ/TF, one or two for MSQ.
export function pickOptions(question, rand = Math.random) {
  const n = Array.isArray(question?.options) ? question.options.length : 0
  if (n === 0) return [0]
  const first = Math.floor(rand() * n)
  if (question.type !== 'MSQ' || n < 2 || rand() < 0.5) return [first]
  let second = Math.floor(rand() * (n - 1))
  if (second >= first) second++
  return [first, second].sort((a, b) => a - b)
}

/**
 * When a student "clicks" and when the request is actually sent, in ms after the poll arrives.
 * Mirrors StudentRoomPage: responseTime is frozen at click time as (tta - timeLeft) in whole
 * seconds, then the POST is deferred by a 0-2 s jitter. The click is kept early enough that
 * click + jitter + network always lands inside the answering window.
 */
export function answerPlan(ttaSeconds, rand = Math.random) {
  const minThinkMs = 1000
  const maxThinkMs = Math.max(minThinkMs, (ttaSeconds - 3) * 1000) // leave room for 2 s jitter + network
  const thinkMs = minThinkMs + rand() * (maxThinkMs - minThinkMs)
  const jitterMs = Math.floor(rand() * 2000)
  const elapsedWholeSeconds = Math.floor(thinkMs / 1000) // the client's timeLeft ticks once a second
  const responseTime = Math.min(ttaSeconds, Math.max(0, elapsedWholeSeconds))
  return { thinkMs, jitterMs, responseTime, sendAtMs: thinkMs + jitterMs }
}

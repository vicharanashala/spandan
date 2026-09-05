// Lightweight WebAudio sound-effects service for interactive feedback.
//
// All sounds are synthesized on the fly (no audio files, no deps) so they work
// offline and are instantly tweakable. Every play function is a no-op when the
// user has muted sounds or when WebAudio isn't available (e.g. in tests/CI).
//
// Mute state is persisted to localStorage ('spandan-sound-enabled', default ON)
// and exposed via setSoundEnabled / isSoundEnabled so a UI toggle can read it.

const STORAGE_KEY = 'spandan-sound-enabled'
const SOUND_ENABLED_DEFAULT = true

let audioCtx = null
let soundEnabled = SOUND_ENABLED_DEFAULT

// Read the persisted mute flag once at module load (safe in non-browser envs).
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    soundEnabled = stored === null ? SOUND_ENABLED_DEFAULT : stored !== 'false'
  }
} catch {
  soundEnabled = SOUND_ENABLED_DEFAULT
}

export const setSoundEnabled = (enabled) => {
  soundEnabled = !!enabled
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, String(soundEnabled))
    }
  } catch {
    // ignore storage failures (private mode etc.)
  }
}

export const isSoundEnabled = () => soundEnabled

function getCtx() {
  if (!soundEnabled) return null
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  if (!audioCtx) audioCtx = new AC()
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {})
  return audioCtx
}

// Schedule a single note (oscillator + short gain envelope) at time offset.
function note(ctx, freq, { type = 'sine', gain = 0.2, dur = 0.15, delay = 0, attack = 0.008 } = {}) {
  if (!ctx) return
  try {
    const t0 = ctx.currentTime + delay
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t0)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(g).connect(ctx.destination)
    osc.start(t0)
    osc.stop(t0 + dur + 0.05)
  } catch {
    // never let an audio hiccup break the app
  }
}

// Runs a short sequence of notes.
function sequence(specs) {
  const ctx = getCtx()
  if (!ctx) return
  specs.forEach(([freq, opts]) => note(ctx, freq, opts))
}

// --- Named sounds ----------------------------------------------------------

// A new question just arrived on the student screen.
export const playQuestionReceived = () =>
  sequence([
    [660, { gain: 0.16, dur: 0.12 }],
    [880, { gain: 0.16, dur: 0.16, delay: 0.11 }],
  ])

// Student tapped "Submit Answer" — a quiet confirmation blip.
export const playAnswerSubmitted = () =>
  note(getCtx(), 520, { type: 'triangle', gain: 0.18, dur: 0.09 })

// Poll closed and the answer was correct — upbeat three-note chime (C-E-G).
export const playCorrect = () =>
  sequence([
    [523.25, { gain: 0.2, dur: 0.14 }],
    [659.25, { gain: 0.2, dur: 0.14, delay: 0.09 }],
    [783.99, { gain: 0.2, dur: 0.22, delay: 0.18 }],
  ])

// Poll closed and the answer was wrong — low descending "wah".
export const playIncorrect = () =>
  sequence([
    [220, { type: 'triangle', gain: 0.16, dur: 0.18 }],
    [165, { type: 'triangle', gain: 0.16, dur: 0.24, delay: 0.12 }],
  ])

// Question timer hit zero — short double alarm beep (pairs with the visual flash).
export const playTimeUp = () =>
  sequence([
    [880, { type: 'square', gain: 0.16, dur: 0.15 }],
    [880, { type: 'square', gain: 0.16, dur: 0.22, delay: 0.24 }],
  ])

// Teacher launched a question to the class — short confirmation ding.
export const playQuestionLaunched = () =>
  note(getCtx(), 740, { gain: 0.2, dur: 0.2 })

// Teacher started recording.
export const playRecordOn = () =>
  note(getCtx(), 700, { type: 'triangle', gain: 0.18, dur: 0.12 })

// Teacher stopped recording — double blip.
export const playRecordOff = () =>
  sequence([
    [700, { type: 'triangle', gain: 0.18, dur: 0.1 }],
    [520, { type: 'triangle', gain: 0.18, dur: 0.14, delay: 0.08 }],
  ])

// The student's rank/points improved — a bright rising "level-up" chime.
export const playRankUp = () =>
  sequence([
    [523.25, { gain: 0.18, dur: 0.1 }],
    [659.25, { gain: 0.18, dur: 0.1, delay: 0.07 }],
    [783.99, { gain: 0.18, dur: 0.1, delay: 0.14 }],
    [1046.5, { gain: 0.2, dur: 0.2, delay: 0.21 }],
  ])

export default {
  playQuestionReceived,
  playAnswerSubmitted,
  playCorrect,
  playIncorrect,
  playTimeUp,
  playQuestionLaunched,
  playRecordOn,
  playRecordOff,
  playRankUp,
  setSoundEnabled,
  isSoundEnabled,
}
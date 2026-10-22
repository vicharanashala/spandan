// Attention sounds, synthesised with the Web Audio API (no audio asset, no network).
//
//   playTeacherReady()    — ~5 s two-tone ring (10 alternating tones): a generated batch is ready for review.
//   playStudentQuestion() — ~5 s rising three-note motif repeated 6×: it is question time (once per batch).
//   playPreview()         — one short tone, used when the bell toggle is switched on.
//
// Both cues are deliberately long and loud (≈5 s, triangle wave, peak 0.35) so they carry in a classroom
// and from a background tab; the preview is a single quiet tone.
//
// Each returns a Promise of 'played' | 'muted' | 'blocked' | 'unsupported'. 'blocked' means the browser's
// autoplay policy has not yet seen a user gesture on this page; installUnlockOnInteraction() resumes the
// context on the first click/key/touch so later cues play, and callers can show an "Enable sound" prompt.
//
// The mute is per browser (localStorage), default ON. Pages subscribe to changes via the 'spandan:sound'
// window event so a toggle in one place updates every listener.

const STORAGE_KEY = 'spandan.soundEnabled'
export const SOUND_CHANGE_EVENT = 'spandan:sound'

let ctx = null
let unlockInstalled = false

export function isSoundEnabled() {
  try { return window.localStorage.getItem(STORAGE_KEY) !== 'off' } catch (e) { return true }
}

export function setSoundEnabled(on) {
  try {
    if (on) window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, 'off')
  } catch (e) { /* storage unavailable (private mode) — the toggle still works for this page load */ }
  try { window.dispatchEvent(new CustomEvent(SOUND_CHANGE_EVENT, { detail: { enabled: !!on } })) } catch (e) { /* ignore */ }
}

function getContext() {
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  if (!ctx) {
    try { ctx = new AC() } catch (e) { return null }
  }
  return ctx
}

// Resume the (possibly suspended) context. Returns true when audio can play now.
export async function unlockAudio() {
  const c = getContext()
  if (!c) return false
  if (c.state !== 'running') {
    try { await c.resume() } catch (e) { /* still blocked */ }
  }
  return c.state === 'running'
}

// Browsers only allow sound after a user gesture on the page. Install once; the listeners stay (resume
// is idempotent and cheap) so a context suspended later (e.g. by iOS) is revived on the next tap.
export function installUnlockOnInteraction() {
  if (unlockInstalled || typeof window === 'undefined') return
  unlockInstalled = true
  const handler = () => { unlockAudio() }
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
    window.addEventListener(ev, handler, { passive: true })
  }
}

// One tone with a quick attack and exponential decay (no click, no tail). Triangle has more presence
// than sine at the same level; still clean enough to be pleasant.
function tone(c, freq, start, duration, peak, type = 'triangle') {
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.linearRampToValueAtTime(peak, start + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.connect(gain)
  gain.connect(c.destination)
  osc.start(start)
  osc.stop(start + duration + 0.02)
}

// notes: [frequencyHz, offsetSeconds, durationSeconds][]
async function playPattern(notes, peak = 0.35, type = 'triangle') {
  if (!isSoundEnabled()) return 'muted'
  const c = getContext()
  if (!c) return 'unsupported'
  if (c.state !== 'running') {
    try { await c.resume() } catch (e) { /* blocked until a gesture */ }
  }
  if (c.state !== 'running') return 'blocked'
  const t0 = c.currentTime + 0.02
  for (const [freq, at, dur] of notes) tone(c, freq, t0 + at, dur, peak, type)
  return 'played'
}

// Teacher: "ding-dong" ring — A5/E5 alternating every 0.5 s, 10 tones ≈ 5 s.
export const TEACHER_READY_NOTES = Array.from({ length: 10 }, (_, i) => [i % 2 === 0 ? 880 : 659, i * 0.5, 0.45])
// Student: rising G5-B5-D6 motif (0.9 s) repeated 6× ≈ 5.4 s, 18 tones.
export const STUDENT_QUESTION_NOTES = Array.from({ length: 6 }, (_, r) => [
  [784, r * 0.9, 0.22], [988, r * 0.9 + 0.22, 0.22], [1175, r * 0.9 + 0.44, 0.4]
]).flat()
export const CUE_DURATION_SECONDS = 5.5

export const playTeacherReady = () => playPattern(TEACHER_READY_NOTES)
export const playStudentQuestion = () => playPattern(STUDENT_QUESTION_NOTES)
export const playPreview = () => playPattern([[880, 0, 0.15]], 0.14, 'sine')

// Test hook: forget the cached context so a fresh AudioContext mock is picked up.
export function _resetForTests() { ctx = null; unlockInstalled = false }

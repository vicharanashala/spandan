/**
 * hype.js
 * -------
 * Single shared AudioContext manager for Phase 5 hype audio.
 *
 * Design contract (locked at 19:22 IST):
 *   - ONE AudioContext per page tab, lazily created on first user
 *     gesture (browsers block autoplay until gesture).
 *   - Clean, NON-OVERLAPPING trigger execution: every blip uses the
 *     same single AudioContext, but each blip is wrapped in its own
 *     short-lived OscillatorNode + GainNode chain that auto-disconnects
 *     after the envelope finishes.
 *   - Synthesised blips only. NO asset files, NO fetch.
 *   - Each emoji gets a slightly different pitch for "feel".
 */

let _ctx = null
let _unlocked = false
let _muted = true // default muted; user opts in

const PITCH_TABLE = {
  '\u{1F525}': 660, // fire
  '\u{1F44F}': 520, // clap
  '\u{1F602}': 440, // joy
  '\u{1F62E}': 500, // wow
  '\u{1F4AF}': 700, // 100
  '\u{1F914}': 380  // thinking
}

const DEFAULT_PITCH_HZ = 500
const BLIP_DURATION_S = 0.08
const BLIP_ATTACK_S = 0.005

export function isAudioAvailable() {
  if (typeof window === 'undefined') return false
  return Boolean(
    typeof window.AudioContext === 'function' ||
      (typeof window !== 'undefined' && typeof window.webkitAudioContext === 'function')
  )
}

export function getAudioContext() {
  if (_ctx) return _ctx
  if (typeof window === 'undefined') return null
  if (typeof window.AudioContext !== 'function' && typeof window.webkitAudioContext !== 'function') {
    return null
  }
  try {
    const Ctor = window.AudioContext || window.webkitAudioContext
    _ctx = new Ctor()
    return _ctx
  } catch (_err) {
    return null
  }
}

/**
 * unlockAudio()
 * Must be called from within a user-gesture handler (e.g. onClick).
 * Returns true if the context is now running.
 */
export function unlockAudio() {
  if (_unlocked && _ctx && _ctx.state === 'running') {
    return Promise.resolve(true)
  }
  const ctx = getAudioContext()
  if (!ctx) return Promise.resolve(false)
  if (typeof ctx.resume === 'function') {
    return Promise.resolve(ctx.resume()).then(
      () => {
        _unlocked = ctx.state === 'running'
        return _unlocked
      },
      () => {
        _unlocked = false
        return false
      }
    )
  }
  _unlocked = ctx.state === 'running'
  return Promise.resolve(_unlocked)
}

/**
 * playHypeBlip(emojiId)
 * Synthesises a short blip. Non-throwing: returns false if audio
 * is unavailable, suspended, muted, or if the graph throws.
 */
export function playHypeBlip(emojiId) {
  if (_muted) return false
  if (!isAudioAvailable()) return false
  const ctx = getAudioContext()
  if (!ctx) return false
  if (ctx.state !== 'running') return false
  try {
    const pitch = PITCH_TABLE[emojiId] || DEFAULT_PITCH_HZ
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = pitch

    const t0 = ctx.currentTime
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(0.4, t0 + BLIP_ATTACK_S)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + BLIP_DURATION_S)

    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t0)
    osc.stop(t0 + BLIP_DURATION_S + 0.01)
    osc.onended = function () {
      try {
        osc.disconnect()
        gain.disconnect()
      } catch (_e) { /* already disconnected */ }
    }
    return true
  } catch (_e) {
    return false
  }
}

export function setMuted(value) {
  _muted = !!value
}

export function isMuted() {
  return _muted
}

/**
 * _resetHypeForTests()
 * Restores hype.js to its initial state. Closes any open context.
 */
export function _resetHypeForTests() {
  try {
    if (_ctx && typeof _ctx.close === 'function') {
      _ctx.close().catch(() => { /* swallow */ })
    }
  } catch (_e) { /* swallow */ }
  _ctx = null
  _unlocked = false
  _muted = true
}

const hype = {
  isAudioAvailable,
  getAudioContext,
  unlockAudio,
  playHypeBlip,
  setMuted,
  isMuted,
  _resetHypeForTests
}

export default hype
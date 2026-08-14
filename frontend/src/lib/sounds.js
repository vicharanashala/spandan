// sounds.js — tiny Web Audio API synth, no audio files needed.
// Three short cues used by the Doubt-Anchored Polling button:
//   tap()    : idle confirmation, gentle "tink"
//   send()   : signal recorded, ascending chime
//   deny()   : anti-spam / cooldown, soft muted thud

let ctx = null

function getCtx () {
  if (!ctx) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      ctx = new AC()
    } catch (e) {
      console.warn('[sounds] AudioContext unavailable:', e?.message)
      return null
    }
  }
  // Some browsers suspend the context until a user gesture resumes it.
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

// single-tone envelope (attack + exponential decay) -- produces a clean "ping"
function blip ({ freq = 440, dur = 0.18, type = 'sine', gain = 0.18, attack = 0.005, decay = 0.16 } = {}) {
  const c = getCtx()
  if (!c) return
  const t = c.currentTime
  const osc = c.createOscillator()
  const env = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  // Attack ramp 0 -> gain
  env.gain.setValueAtTime(0, t)
  env.gain.linearRampToValueAtTime(gain, t + attack)
  // Decay ramp gain -> 0
  env.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
  osc.connect(env)
  env.connect(c.destination)
  osc.start(t)
  osc.stop(t + attack + decay + 0.02)
}

export const sounds = {
  // Idle / pressed before send -- short, light, mid-high frequency
  tap () {
    blip({ freq: 880, dur: 0.12, type: 'sine', gain: 0.10, attack: 0.004, decay: 0.10 })
  },
  // Send confirmed -- two-note ascending chime (C5 -> E5 -> G5) for "all good"
  send () {
    blip({ freq: 523.25, dur: 0.16, type: 'triangle', gain: 0.18, attack: 0.005, decay: 0.14 }) // C5
    setTimeout(() => blip({ freq: 659.25, dur: 0.18, type: 'triangle', gain: 0.18, attack: 0.005, decay: 0.16 }), 70) // E5
    setTimeout(() => blip({ freq: 783.99, dur: 0.22, type: 'triangle', gain: 0.16, attack: 0.005, decay: 0.20 }), 140) // G5
  },
  // Cooldown / error -- single low muted thud
  deny () {
    blip({ freq: 180, dur: 0.10, type: 'sine', gain: 0.10, attack: 0.003, decay: 0.09 })
  }
}

export default sounds
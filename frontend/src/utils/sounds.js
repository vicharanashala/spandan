// Web Audio API notification sounds — shared AudioContext to avoid browser limit (~6 concurrent)
let sharedCtx = null

function getAudioContext() {
  if (!sharedCtx || sharedCtx.state === 'closed') {
    sharedCtx = new (window.AudioContext || window.webkitAudioContext)()
  }
  if (sharedCtx.state === 'suspended') {
    sharedCtx.resume().catch(() => {})
  }
  return sharedCtx
}

export function playNotificationSound(soundId = 'beep') {
  if (soundId === 'none') return
  try {
    const ctx = getAudioContext()
    switch (soundId) {
      case 'chime': {
        const osc1 = ctx.createOscillator()
        const gain1 = ctx.createGain()
        osc1.connect(gain1); gain1.connect(ctx.destination)
        osc1.frequency.value = 523; osc1.type = 'sine'
        gain1.gain.setValueAtTime(0.3, ctx.currentTime)
        gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3)
        osc1.start(ctx.currentTime); osc1.stop(ctx.currentTime + 0.3)
        const osc2 = ctx.createOscillator()
        const gain2 = ctx.createGain()
        osc2.connect(gain2); gain2.connect(ctx.destination)
        osc2.frequency.value = 659; osc2.type = 'sine'
        gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.15)
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45)
        osc2.start(ctx.currentTime + 0.15); osc2.stop(ctx.currentTime + 0.45)
        break
      }
      case 'bell': {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.frequency.value = 1200; osc.type = 'sine'
        gain.gain.setValueAtTime(0.3, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5)
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5)
        break
      }
      case 'ding': {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.frequency.value = 1047; osc.type = 'triangle'
        gain.gain.setValueAtTime(0.4, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2)
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.2)
        break
      }
      case 'pop': {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.frequency.setValueAtTime(400, ctx.currentTime)
        osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.1)
        osc.type = 'sine'
        gain.gain.setValueAtTime(0.5, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15)
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.15)
        break
      }
      default: { // beep
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.frequency.value = 880; osc.type = 'sine'
        gain.gain.setValueAtTime(0.3, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3)
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3)
      }
    }
  } catch {}
}

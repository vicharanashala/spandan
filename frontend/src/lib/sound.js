// Small utility to play a buzzer sound using Web Audio API
export function playBuzzer({ volume = 0.4 } = {}) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return
    const ctx = new AudioContext()

    // Play two short square-wave beeps for a buzzer-like sound
    const playBeep = (freq, dur, when = 0) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'square'
      o.frequency.value = freq
      g.gain.value = volume
      o.connect(g)
      g.connect(ctx.destination)
      const start = ctx.currentTime + when
      o.start(start)
      o.stop(start + dur / 1000)
    }

    playBeep(1000, 140, 0)
    playBeep(1400, 220, 0.16)

    // Close the context after the sound finishes
    setTimeout(() => {
      try { ctx.close() } catch (e) {}
    }, 600)

    // Try vibration for supported devices
    if (navigator.vibrate) {
      navigator.vibrate([150, 80, 150])
    }
  } catch (err) {
    console.warn('playBuzzer failed', err)
  }
}

export function notifyUser(title = 'Poll started', body = "A new poll has started. Answer now!") {
  try {
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(title, { body })
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(p => {
          if (p === 'granted') new Notification(title, { body })
        })
      }
    }
  } catch (err) {
    // ignore
  }
}

import { useRef, useCallback } from 'react'

/**
 * useSound — Web Audio API sound effects, no external dependencies
 * Returns: { playCorrect, playWrong, playTick, playSuccess, enabled, toggle }
 */
export default function useSound() {
  const ctxRef = useRef(null)
  const enabledRef = useRef(
    localStorage.getItem('spandan_sound') !== 'off'
  )

  const getCtx = () => {
    if (!ctxRef.current) ctxRef.current = new (window.AudioContext || window.webkitAudioContext)()
    return ctxRef.current
  }

  const beep = useCallback((frequency, duration, type = 'sine', gain = 0.18, delay = 0) => {
    if (!enabledRef.current) return
    try {
      const ctx = getCtx()
      const osc = ctx.createOscillator()
      const gainNode = ctx.createGain()
      osc.connect(gainNode)
      gainNode.connect(ctx.destination)
      osc.type = type
      osc.frequency.setValueAtTime(frequency, ctx.currentTime + delay)
      gainNode.gain.setValueAtTime(gain, ctx.currentTime + delay)
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration)
      osc.start(ctx.currentTime + delay)
      osc.stop(ctx.currentTime + delay + duration)
    } catch {}
  }, [])

  // Correct answer: ascending 3-note ding
  const playCorrect = useCallback(() => {
    beep(523, 0.12, 'sine', 0.15, 0)
    beep(659, 0.12, 'sine', 0.15, 0.12)
    beep(784, 0.22, 'sine', 0.20, 0.24)
  }, [beep])

  // Wrong answer: low descending buzz
  const playWrong = useCallback(() => {
    beep(300, 0.18, 'sawtooth', 0.12, 0)
    beep(220, 0.22, 'sawtooth', 0.10, 0.18)
  }, [beep])

  // Tick: subtle click each second on timer
  const playTick = useCallback(() => {
    beep(880, 0.04, 'square', 0.04)
  }, [beep])

  // Success: fanfare (achievement)
  const playSuccess = useCallback(() => {
    beep(523, 0.1, 'sine', 0.15, 0)
    beep(659, 0.1, 'sine', 0.15, 0.1)
    beep(784, 0.1, 'sine', 0.18, 0.2)
    beep(1047, 0.3, 'sine', 0.20, 0.3)
  }, [beep])

  // Whoosh for announcement
  const playWhoosh = useCallback(() => {
    beep(600, 0.08, 'sine', 0.10, 0)
    beep(400, 0.12, 'sine', 0.08, 0.08)
  }, [beep])

  const toggle = useCallback(() => {
    enabledRef.current = !enabledRef.current
    localStorage.setItem('spandan_sound', enabledRef.current ? 'on' : 'off')
    return enabledRef.current
  }, [])

  return { playCorrect, playWrong, playTick, playSuccess, playWhoosh, toggle, enabled: enabledRef }
}

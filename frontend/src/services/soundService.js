const audioContext = typeof window !== 'undefined' ? new (window.AudioContext || window.webkitAudioContext)() : null

export const playQuestionSound = () => {
  if (!audioContext) return
  
  const oscillator = audioContext.createOscillator()
  const gainNode = audioContext.createGain()
  
  oscillator.connect(gainNode)
  gainNode.connect(audioContext.destination)
  
  oscillator.frequency.setValueAtTime(587.33, audioContext.currentTime)
  oscillator.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.1)
  oscillator.frequency.setValueAtTime(880, audioContext.currentTime + 0.2)
  
  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4)
  
  oscillator.start(audioContext.currentTime)
  oscillator.stop(audioContext.currentTime + 0.4)
}

export const playSubmitSound = () => {
  if (!audioContext) return
  
  const oscillator = audioContext.createOscillator()
  const gainNode = audioContext.createGain()
  
  oscillator.connect(gainNode)
  gainNode.connect(audioContext.destination)
  
  oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime)
  oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.08)
  
  gainNode.gain.setValueAtTime(0.2, audioContext.currentTime)
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2)
  
  oscillator.start(audioContext.currentTime)
  oscillator.stop(audioContext.currentTime + 0.2)
}

export const playCorrectSound = () => {
  if (!audioContext) return
  
  const notes = [523.25, 659.25, 783.99, 1046.50]
  notes.forEach((freq, i) => {
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()
    
    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)
    
    oscillator.frequency.setValueAtTime(freq, audioContext.currentTime + i * 0.1)
    gainNode.gain.setValueAtTime(0.15, audioContext.currentTime + i * 0.1)
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + i * 0.1 + 0.15)
    
    oscillator.start(audioContext.currentTime + i * 0.1)
    oscillator.stop(audioContext.currentTime + i * 0.1 + 0.15)
  })
}

export const playTimerWarningSound = () => {
  if (!audioContext) return
  
  const oscillator = audioContext.createOscillator()
  const gainNode = audioContext.createGain()
  
  oscillator.connect(gainNode)
  gainNode.connect(audioContext.destination)
  
  oscillator.type = 'square'
  oscillator.frequency.setValueAtTime(440, audioContext.currentTime)
  
  gainNode.gain.setValueAtTime(0.1, audioContext.currentTime)
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15)
  
  oscillator.start(audioContext.currentTime)
  oscillator.stop(audioContext.currentTime + 0.15)
}

export default { playQuestionSound, playSubmitSound, playCorrectSound, playTimerWarningSound }
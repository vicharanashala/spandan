import { useState, useEffect, useRef, useCallback } from 'react'

// Countdown for the question that is live with students, owned by an approval pop-up as a whole.
// It belongs to the launched question, not to the question on screen: switching, rejecting or moving
// on leaves it running, and only a new launch (which replaces it) or reaching 0 ends it.
// Counts down to a deadline, so a throttled background tab never drifts.
export default function useLiveQuestionTimer(onExpire) {
  const [liveIndex, setLiveIndex] = useState(-1) // index of the launched question, -1 before any launch
  const [timeLeft, setTimeLeft] = useState(0)
  const [isActive, setIsActive] = useState(false)
  const intervalRef = useRef(null)
  const onExpireRef = useRef(onExpire)
  onExpireRef.current = onExpire

  const clear = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  const start = useCallback((index, seconds) => {
    clear()
    const endAt = Date.now() + seconds * 1000
    setLiveIndex(index)
    setTimeLeft(seconds)
    setIsActive(true)
    intervalRef.current = setInterval(() => {
      const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000))
      setTimeLeft(left)
      if (left === 0) {
        clear()
        setIsActive(false)
        if (onExpireRef.current) onExpireRef.current(index)
      }
    }, 250)
  }, [])

  // Stop counting when the pop-up closes.
  useEffect(() => clear, [])

  return { liveIndex, timeLeft, isActive, start }
}

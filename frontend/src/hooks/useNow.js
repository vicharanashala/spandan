import { useState, useEffect } from 'react'

// The current time, re-rendered at the start of every step (default: every minute), aligned to the
// clock so a display never lags. Dashboards use useNow() for the greeting; LiveClock uses useNow(1000).
export default function useNow(stepMs = 60000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let timer
    const wait = () => stepMs - (Date.now() % stepMs)
    const tick = () => { setNow(new Date()); timer = setTimeout(tick, wait()) }
    timer = setTimeout(tick, wait())
    return () => clearTimeout(timer)
  }, [stepMs])
  return now
}

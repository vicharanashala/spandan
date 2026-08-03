import { useState, useEffect } from 'react'

// Reactive media-query hook. useIsMobile() → true below 768px. Pages use it to switch inline
// styles (stack grids, shrink padding, leave room for the mobile hamburger, etc.).
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = (e) => setMatches(e.matches)
    setMatches(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return matches
}

export default function useIsMobile(maxWidth = 768) {
  return useMediaQuery(`(max-width: ${maxWidth}px)`)
}

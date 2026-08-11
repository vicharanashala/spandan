// import { useState, useRef, useCallback, useEffect } from 'react'

// // Normalize for forgiving comparisons: lowercase, strip punctuation, collapse whitespace.
// const normalize = (s) =>
//   (s || '')
//     .toLowerCase()
//     .replace(/[.,!?'"]/g, '')
//     .replace(/\s+/g, ' ')
//     .trim()

// const LETTER_INDEX = { a: 0, b: 1, c: 2, d: 3 }

// /**
//  * Given a raw spoken/typed phrase and the current question's options, figure out which option
//  * (if any) it refers to. Tried in order, most-specific first:
//  *   1. Letter commands — "option a", "choice b", "answer c", or a bare "a"/"b"/"c"/"d"
//  *   2. True/False commands — matched against whichever option's own text actually says
//  *      "true"/"false" (so it still works even if a quiz author reorders or relabels them)
//  *   3. Loose match against the option's own text — lets a student just say the answer itself
//  *      (e.g. "Paris") instead of "Option B". Exact match wins; otherwise falls back to a
//  *      containment check for short phrases.
//  * Returns the matched option index, or null if nothing matched confidently. Deliberately
//  * conservative: better to report "didn't catch that" than guess wrong on a graded question.
//  */
// export function matchOptionFromPhrase(phrase, options) {
//   const text = normalize(phrase)
//   if (!text || !options || options.length === 0) return null

//   // 1. Letter command
//   const letterMatch = text.match(/\b(?:option|choice|answer)?\s*([a-d])\b/)
//   if (letterMatch) {
//     const idx = LETTER_INDEX[letterMatch[1]]
//     if (idx != null && idx < options.length) return idx
//   }

//   // 2. True / False
//   const optionText = (o) => normalize(typeof o === 'string' ? o : o.text)
//   if (/\btrue\b/.test(text)) {
//     const idx = options.findIndex((o) => optionText(o) === 'true')
//     if (idx !== -1) return idx
//   }
//   if (/\bfalse\b/.test(text)) {
//     const idx = options.findIndex((o) => optionText(o) === 'false')
//     if (idx !== -1) return idx
//   }

//   // 3. Loose match against option content itself
//   const normalizedOptions = options.map(optionText)
//   const exactIdx = normalizedOptions.findIndex((o) => o === text)
//   if (exactIdx !== -1) return exactIdx

//   const containsIdx = normalizedOptions.findIndex((o) => o && (text.includes(o) || o.includes(text)))
//   if (containsIdx !== -1) return containsIdx

//   return null
// }

// const SpeechRecognitionImpl =
//   typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null

// /**
//  * Tap-to-listen voice answering. Wraps the browser's SpeechRecognition API: starts on demand,
//  * auto-stops as soon as it hears something (or on silence/error), and reports the matched option
//  * index back via onMatch. isSupported is false in browsers without the Web Speech API (e.g.
//  * Firefox as of this writing) — callers should show the typed-answer fallback in that case, which
//  * runs through the same matchOptionFromPhrase() so behavior stays consistent either way.
//  */
// export function useVoiceAnswer({ options, onMatch }) {
//   const [status, setStatus] = useState('idle') // idle | listening | no-match | error
//   const [transcript, setTranscript] = useState('')
//   const recognitionRef = useRef(null)
//   const optionsRef = useRef(options)
//   optionsRef.current = options
//   const onMatchRef = useRef(onMatch)
//   onMatchRef.current = onMatch

//   const isSupported = !!SpeechRecognitionImpl

//   const stop = useCallback(() => {
//     recognitionRef.current?.stop()
//   }, [])

//   const start = useCallback(() => {
//     if (!isSupported) return
//     // Tapping the mic again while it's listening acts as a manual stop.
//     if (recognitionRef.current) {
//       recognitionRef.current.stop()
//       return
//     }

//     const recognition = new SpeechRecognitionImpl()
//     recognition.lang = 'en-US'
//     recognition.interimResults = false
//     recognition.maxAlternatives = 3

//     recognition.onstart = () => {
//       setStatus('listening')
//       setTranscript('')
//     }

//     recognition.onresult = (event) => {
//       // The engine gives several guesses at what it heard ("Option A" vs "Option Eh", etc) —
//       // try each until one maps to a real option.
//       const results = event.results[event.results.length - 1]
//       let matched = null
//       let heard = ''
//       for (let i = 0; i < results.length; i++) {
//         const alt = results[i].transcript
//         if (!heard) heard = alt
//         const idx = matchOptionFromPhrase(alt, optionsRef.current)
//         if (idx != null) {
//           matched = idx
//           heard = alt
//           break
//         }
//       }
//       setTranscript(heard)
//       if (matched != null) {
//         setStatus('idle')
//         onMatchRef.current?.(matched, heard)
//       } else {
//         setStatus('no-match')
//       }
//     }

//     recognition.onerror = (event) => {
//       console.error('Speech recognition error:', event.error)
//       setStatus('error')
//     }

//     recognition.onend = () => {
//       recognitionRef.current = null
//       // onresult already moved status to idle/no-match for a real result. Landing here still
//       // 'listening' means it stopped on silence/timeout without hearing anything usable.
//       setStatus((prev) => (prev === 'listening' ? 'no-match' : prev))
//     }

//     recognitionRef.current = recognition
//     recognition.start()
//   }, [isSupported])

//   // Stop any in-flight recognition on unmount (e.g. student navigates away mid-listen).
//   useEffect(() => () => recognitionRef.current?.stop(), [])

//   return { isSupported, status, transcript, start, stop }
// }

import { useState, useRef, useCallback, useEffect } from 'react'

// Normalize for forgiving comparisons: lowercase, strip punctuation, collapse whitespace.
const normalize = (s) =>
  (s || '')
    .toLowerCase()
    .replace(/[.,!?'"]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

const LETTER_INDEX = { a: 0, b: 1, c: 2, d: 3 }

/**
 * Given a raw spoken/typed phrase and the current question's options, figure out which option
 * (if any) it refers to. Tried in order, most-specific first:
 *   1. Letter commands — "option a", "choice b", "answer c", or a bare "a"/"b"/"c"/"d"
 *   2. True/False commands — matched against whichever option's own text actually says
 *      "true"/"false" (so it still works even if a quiz author reorders or relabels them)
 *   3. Loose match against the option's own text — lets a student just say the answer itself
 *      (e.g. "Paris") instead of "Option B". Exact match wins; otherwise falls back to a
 *      containment check for short phrases.
 * Returns the matched option index, or null if nothing matched confidently. Deliberately
 * conservative: better to report "didn't catch that" than guess wrong on a graded question.
 */
export function matchOptionFromPhrase(phrase, options) {
  const text = normalize(phrase)
  if (!text || !options || options.length === 0) return null

  // 1. Letter command
  const letterMatch = text.match(/\b(?:option|choice|answer)?\s*([a-d])\b/)
  if (letterMatch) {
    const idx = LETTER_INDEX[letterMatch[1]]
    if (idx != null && idx < options.length) return idx
  }

  // 2. True / False
  const optionText = (o) => normalize(typeof o === 'string' ? o : o.text)
  if (/\btrue\b/.test(text)) {
    const idx = options.findIndex((o) => optionText(o) === 'true')
    if (idx !== -1) return idx
  }
  if (/\bfalse\b/.test(text)) {
    const idx = options.findIndex((o) => optionText(o) === 'false')
    if (idx !== -1) return idx
  }

  // 3. Loose match against option content itself
  const normalizedOptions = options.map(optionText)
  const exactIdx = normalizedOptions.findIndex((o) => o === text)
  if (exactIdx !== -1) return exactIdx

  const containsIdx = normalizedOptions.findIndex((o) => o && (text.includes(o) || o.includes(text)))
  if (containsIdx !== -1) return containsIdx

  return null
}

const SpeechRecognitionImpl =
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null

const AUTO_RETRY_DELAY_MS = 500  // pause between a missed attempt and the next auto-retry
const WARMUP_DELAY_MS = 200      // pause after start() before we actually begin listening —
                                  // without this, the mic hardware often isn't ready yet and the
                                  // first word gets clipped, which was the main cause of "first
                                  // attempt doesn't catch it"

/**
 * Voice answering with an optional hands-free auto-retry mode. Wraps the browser's
 * SpeechRecognition API.
 *
 * Two ways to trigger it:
 *  - Manual: call start() (e.g. from a mic button tap). Auto-stops after one result, tapping
 *    again while listening cancels it.
 *  - Auto: pass `autoListen: true` + a `sessionKey` that changes per question (e.g. the question
 *    id). Whenever sessionKey changes, it starts listening on its own, and — capped at
 *    `maxAutoAttempts` — silently retries on a miss before giving up and leaving status
 *    'exhausted' so the UI can prompt the student to answer by tap/type instead. Capped, not
 *    unlimited: in a room of hundreds of simultaneously-open mics, an attempt ceiling that hands
 *    control back to manual answering is far more robust than listening indefinitely and risking
 *    cross-talk from neighboring students.
 *
 * isSupported is false in browsers without the Web Speech API (e.g. Firefox as of this writing)
 * — callers should show the typed-answer fallback in that case, which runs through the same
 * matchOptionFromPhrase() so behavior stays consistent either way.
 */
export function useVoiceAnswer({ options, onMatch, autoListen = false, sessionKey = null, maxAutoAttempts = 3 }) {
  const [status, setStatus] = useState('idle') // idle | starting | listening | no-match | error | exhausted
  const [transcript, setTranscript] = useState('')
  const [attempt, setAttempt] = useState(0)

  const recognitionRef = useRef(null)
  const warmupTimeoutRef = useRef(null)
  const retryTimeoutRef = useRef(null)
  const pendingRef = useRef(false)   // true during the warm-up window, before the real recognition object exists
  const matchedRef = useRef(false)
  const attemptRef = useRef(0)

  const optionsRef = useRef(options)
  optionsRef.current = options
  const onMatchRef = useRef(onMatch)
  onMatchRef.current = onMatch

  const isSupported = !!SpeechRecognitionImpl

  const clearTimers = () => {
    if (warmupTimeoutRef.current) { clearTimeout(warmupTimeoutRef.current); warmupTimeoutRef.current = null }
    if (retryTimeoutRef.current) { clearTimeout(retryTimeoutRef.current); retryTimeoutRef.current = null }
  }

  const stop = useCallback(() => {
    clearTimers()
    pendingRef.current = false
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    } else {
      setStatus('idle')
    }
  }, [])

  // Kicks off one listening attempt (with the warm-up pause). Safe to call repeatedly — it's a
  // no-op while an attempt is already pending or in progress, so overlapping triggers (e.g. a
  // fast-firing effect) can't spin up two recognizers at once.
  const runAttempt = useCallback(() => {
    if (!isSupported || pendingRef.current || recognitionRef.current) return
    pendingRef.current = true
    matchedRef.current = false
    setStatus('starting')

    warmupTimeoutRef.current = setTimeout(() => {
      pendingRef.current = false
      const recognition = new SpeechRecognitionImpl()
      recognition.lang = 'en-US'
      recognition.interimResults = false
      recognition.maxAlternatives = 3

      recognition.onstart = () => {
        setStatus('listening')
        setTranscript('')
      }

      recognition.onresult = (event) => {
        // The engine gives several guesses at what it heard ("Option A" vs "Option Eh", etc) —
        // try each until one maps to a real option.
        const results = event.results[event.results.length - 1]
        let matched = null
        let heard = ''
        for (let i = 0; i < results.length; i++) {
          const alt = results[i].transcript
          if (!heard) heard = alt
          const idx = matchOptionFromPhrase(alt, optionsRef.current)
          if (idx != null) {
            matched = idx
            heard = alt
            break
          }
        }
        setTranscript(heard)
        if (matched != null) {
          matchedRef.current = true
          setStatus('idle')
          onMatchRef.current?.(matched, heard)
        } else {
          setStatus('no-match')
        }
      }

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error)
        setStatus('error')
      }

      recognition.onend = () => {
        recognitionRef.current = null
        if (matchedRef.current) return // onresult already reported the match
        // Landing here still 'listening'/'starting' means it stopped on silence/timeout without
        // hearing anything usable.
        setStatus((prev) => (prev === 'listening' || prev === 'starting' ? 'no-match' : prev))
      }

      recognitionRef.current = recognition
      recognition.start()
    }, WARMUP_DELAY_MS)
  }, [isSupported])

  // Manual tap-to-listen. Tapping again while listening/starting cancels instead of restarting.
  const start = useCallback(() => {
    if (pendingRef.current || recognitionRef.current) {
      stop()
      return
    }
    clearTimers()
    attemptRef.current = 0
    setAttempt(0)
    runAttempt()
  }, [runAttempt, stop])

  // Auto-listen: fires the first attempt whenever sessionKey changes (a new question arrived).
  useEffect(() => {
    if (!autoListen || !isSupported || sessionKey == null) return
    clearTimers()
    attemptRef.current = 1
    setAttempt(1)
    setStatus('idle')
    runAttempt()
    return () => {
      clearTimers()
      pendingRef.current = false
      recognitionRef.current?.stop()
    }
    // Only re-run when the question actually changes or auto-listen is toggled — runAttempt is
    // stable (depends only on isSupported).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey, autoListen, isSupported])

  // Auto-retry on a miss, capped at maxAutoAttempts, then hands off to manual/typed answering.
  useEffect(() => {
    if (!autoListen || matchedRef.current) return
    if (status !== 'no-match' && status !== 'error') return
    if (attemptRef.current >= maxAutoAttempts) {
      setStatus('exhausted')
      return
    }
    retryTimeoutRef.current = setTimeout(() => {
      attemptRef.current += 1
      setAttempt(attemptRef.current)
      runAttempt()
    }, AUTO_RETRY_DELAY_MS)
    return () => { if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current) }
  }, [status, autoListen, maxAutoAttempts, runAttempt])

  // Stop everything on unmount (e.g. student navigates away mid-listen).
  useEffect(() => () => {
    clearTimers()
    recognitionRef.current?.stop()
  }, [])

  return { isSupported, status, transcript, attempt, maxAutoAttempts, start, stop }
}
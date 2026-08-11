import { useState, useRef, useCallback, useEffect } from 'react'

const SpeechRecognitionImpl =
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null

/**
 * Tap-to-dictate: converts speech to text and hands it back via onResult. Used by the peer-chat
 * input's mic button — unlike useVoiceAnswer, there's no option-matching here, just plain
 * dictation, since a discussion message can be anything.
 */
export function useDictation({ onResult } = {}) {
  const [status, setStatus] = useState('idle') // idle | listening | error
  const recognitionRef = useRef(null)
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult

  const isSupported = !!SpeechRecognitionImpl

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  const start = useCallback(() => {
    if (!isSupported) return
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      return
    }

    const recognition = new SpeechRecognitionImpl()
    recognition.lang = 'en-US'
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onstart = () => setStatus('listening')

    recognition.onresult = (event) => {
      const text = event.results[event.results.length - 1][0]?.transcript || ''
      if (text) onResultRef.current?.(text)
    }

    recognition.onerror = (event) => {
      console.error('Dictation error:', event.error)
      setStatus('error')
    }

    recognition.onend = () => {
      recognitionRef.current = null
      setStatus((prev) => (prev === 'listening' ? 'idle' : prev))
    }

    recognitionRef.current = recognition
    recognition.start()
  }, [isSupported])

  useEffect(() => () => recognitionRef.current?.stop(), [])

  return { isSupported, status, start, stop }
}

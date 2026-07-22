/**
 * useTranscript.js
 * Custom hook that manages the live speech-to-text session.
 *
 * Provider strategy (abstraction layer):
 *  - Primary:  Web Speech API (SpeechRecognition) — browser-native, zero-latency
 *  - Fallback: Server-side Whisper via existing serverTranscriptionService
 *
 * The hook exposes a clean interface so the panel component never talks
 * directly to the recognition APIs. Swapping providers just requires
 * updating this file.
 */

import { useEffect, useRef, useCallback } from 'react'
import useTranscriptStore from '../stores/transcriptStore'
import { transcribeAudio, convertWebMToWav } from './serverTranscriptionService'

// ─── Provider detection ────────────────────────────────────────────────────

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition || null

/** True when browser supports native recognition */
export const hasNativeSupport = Boolean(SpeechRecognition)

// ─── Hook ─────────────────────────────────────────────────────────────────

/**
 * useTranscript
 *
 * @param {Object} opts
 * @param {string}  [opts.lang='en-US']     BCP-47 language tag
 * @param {boolean} [opts.continuous=true]  Keep listening between pauses
 * @param {string}  [opts.roomId]           Optional room context for Whisper fallback
 * @returns {{ start, stop, toggle, isSupported }}
 */
export function useTranscript({ lang = 'en-US', continuous = true, roomId } = {}) {
  const {
    addSegment,
    setInterimText,
    setStatus,
    setError,
    changeSpeaker,
    status,
    segments,
  } = useTranscriptStore()

  // ── Web Speech API refs ──────────────────────────────────────────────────
  const recognitionRef = useRef(null)
  const restartOnEndRef = useRef(false)
  const pauseTimeoutRef = useRef(null)
  const lastActivityRef = useRef(Date.now())
  const segmentsLengthRef = useRef(0) // avoids stale closure in callbacks

  // ── Whisper fallback refs ────────────────────────────────────────────────
  const mediaRecorderRef = useRef(null)
  const streamRef = useRef(null)
  const audioChunksRef = useRef([])
  const whisperIntervalRef = useRef(null)

  const isListening = status === 'listening'

  // Keep ref in sync so callbacks don't hold stale closures
  useEffect(() => {
    segmentsLengthRef.current = segments.length
  }, [segments.length])

  // ── Native Web Speech provider ───────────────────────────────────────────

  const initNativeRecognition = useCallback(() => {
    if (!SpeechRecognition) return null

    const rec = new SpeechRecognition()
    rec.lang = lang
    rec.continuous = continuous
    rec.interimResults = true
    rec.maxAlternatives = 1

    rec.onstart = () => {
      setStatus('listening')
    }

    rec.onresult = (event) => {
      let interim = ''
      let finalChunk = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0].transcript

        if (result.isFinal) {
          finalChunk += text

          // Heuristic speaker-change detection:
          // If silence gap >3s between final results, treat as new speaker.
          const now = Date.now()
          if (now - lastActivityRef.current > 3000 && segmentsLengthRef.current > 0) {
            changeSpeaker()
          }
          lastActivityRef.current = now
        } else {
          interim += text
        }
      }

      if (interim) setInterimText(interim)
      if (finalChunk.trim()) addSegment(finalChunk)
    }

    rec.onerror = (event) => {
      const errorMap = {
        'not-allowed': ['permission_denied', 'Microphone access was denied. Please allow microphone access in your browser.'],
        'service-not-allowed': ['permission_denied', 'Microphone access was denied.'],
        'audio-capture': ['mic_unavailable', 'No microphone was found or it is unavailable.'],
        'network': ['network', 'A network error occurred. Check your internet connection.'],
        'aborted': null, // User-initiated stop, not an error
      }

      const mapped = errorMap[event.error]
      if (mapped) {
        setError(mapped[0], mapped[1])
      }
      // Other errors we log quietly
      console.warn('[Transcript] Speech recognition error:', event.error)
    }

    rec.onend = () => {
      // Auto-restart if we're supposed to still be listening
      if (restartOnEndRef.current) {
        try {
          setTimeout(() => {
            if (restartOnEndRef.current && recognitionRef.current) {
              recognitionRef.current.start()
            }
          }, 200)
        } catch (_) {}
      } else {
        setStatus('idle')
        setInterimText('')
      }
    }

    return rec
  }, [lang, continuous, addSegment, setInterimText, setStatus, setError, changeSpeaker])

  // ── Whisper fallback provider ────────────────────────────────────────────

  const startWhisperFallback = useCallback(async () => {
    try {
      setStatus('requesting')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorderRef.current = recorder
      audioChunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onerror = () => {
        setError('unknown', 'Recording device encountered an error.')
      }

      recorder.start(1000)
      setStatus('listening')

      // Transcribe every 5 s
      whisperIntervalRef.current = setInterval(async () => {
        if (audioChunksRef.current.length === 0) return
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        audioChunksRef.current = []
        try {
          const wav = await convertWebMToWav(blob)
          const result = await transcribeAudio(wav)
          if (result?.text?.trim()) {
            addSegment(result.text.trim())
          }
        } catch (err) {
          console.warn('[Transcript] Whisper error:', err)
        }
      }, 5000)
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('permission_denied', 'Microphone access was denied. Please allow access in your browser settings.')
      } else if (err.name === 'NotFoundError') {
        setError('mic_unavailable', 'No microphone was found. Please connect a microphone and try again.')
      } else {
        setError('unknown', `Could not start recording: ${err.message}`)
      }
    }
  }, [addSegment, setStatus, setError])

  const stopWhisperFallback = useCallback(() => {
    if (whisperIntervalRef.current) {
      clearInterval(whisperIntervalRef.current)
      whisperIntervalRef.current = null
    }
    if (mediaRecorderRef.current?.state !== 'inactive') {
      try { mediaRecorderRef.current?.stop() } catch (_) {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setStatus('idle')
    setInterimText('')
  }, [setStatus, setInterimText])

  // ── Public API ───────────────────────────────────────────────────────────

  const start = useCallback(async () => {
    if (isListening) return

    if (hasNativeSupport) {
      // Native path
      setStatus('requesting')
      try {
        // Quick permission check
        await navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => {
          s.getTracks().forEach((t) => t.stop())
        })
      } catch (err) {
        setError('permission_denied', 'Microphone access was denied.')
        return
      }

      const rec = initNativeRecognition()
      recognitionRef.current = rec
      restartOnEndRef.current = true
      setStatus('listening')
      try { rec.start() } catch (e) {
        console.warn('[Transcript] Could not start recognition:', e)
      }
    } else {
      // Whisper fallback
      await startWhisperFallback()
    }
  }, [isListening, initNativeRecognition, startWhisperFallback, setStatus, setError])

  const stop = useCallback(() => {
    if (hasNativeSupport) {
      restartOnEndRef.current = false
      try { recognitionRef.current?.stop() } catch (_) {}
      recognitionRef.current = null
    } else {
      stopWhisperFallback()
    }
    if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current)
    setStatus('idle')
    setInterimText('')
  }, [stopWhisperFallback, setStatus, setInterimText])

  const toggle = useCallback(() => {
    if (isListening) {
      stop()
    } else {
      start()
    }
  }, [isListening, start, stop])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      restartOnEndRef.current = false
      try { recognitionRef.current?.stop() } catch (_) {}
      stopWhisperFallback()
      if (pauseTimeoutRef.current) clearTimeout(pauseTimeoutRef.current)
    }
  }, [stopWhisperFallback])

  return {
    start,
    stop,
    toggle,
    isSupported: hasNativeSupport || Boolean(navigator.mediaDevices),
    isListening,
    provider: hasNativeSupport ? 'native' : 'whisper',
  }
}

export default useTranscript

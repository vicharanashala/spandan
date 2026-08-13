/**
 * Web Speech API transcription service.
 *
 * Used as a FALLBACK when the Python Whisper server is unavailable.
 * The SpeechRecognition API is available in Chrome/Edge without any server or
 * model download — it runs entirely in the browser (backed by Google's cloud
 * speech API when online).
 *
 * Usage:
 *   const svc = createWebSpeechService()
 *   svc.start(onInterimResult, onFinalResult, onError)
 *   svc.stop()
 *   svc.isSupported()
 */

export function isWebSpeechSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition)
}

/**
 * Creates a long-running Web Speech recognition session that auto-restarts
 * on `end` so it keeps transcribing for the lifetime of a recording segment.
 *
 * @returns {{ start, stop, isSupported }}
 */
export function createWebSpeechService() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SR) return null

  let recognition = null
  let active = false
  let interimCb = null
  let finalCb = null
  let errorCb = null

  function buildRecognition() {
    const r = new SR()
    r.continuous = true
    r.interimResults = true
    r.lang = 'en-US'
    r.maxAlternatives = 1

    r.onresult = (event) => {
      let interim = ''
      let final = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          final += transcript + ' '
        } else {
          interim += transcript
        }
      }
      if (interim && interimCb) interimCb(interim)
      if (final && finalCb) finalCb(final.trim())
    }

    r.onerror = (e) => {
      // 'no-speech' is benign — just restart silently.
      if (e.error === 'no-speech') return
      console.warn('[WebSpeech] error:', e.error)
      if (errorCb) errorCb(e.error)
    }

    r.onend = () => {
      // Auto-restart as long as we're supposed to be active.
      if (active) {
        try { r.start() } catch (_) { /* ignore start-while-running */ }
      }
    }

    return r
  }

  return {
    isSupported: () => true,

    start(onInterim, onFinal, onError) {
      if (active) return
      active = true
      interimCb = onInterim
      finalCb = onFinal
      errorCb = onError
      recognition = buildRecognition()
      try { recognition.start() } catch (e) { console.error('[WebSpeech] start error:', e) }
    },

    stop() {
      active = false
      if (recognition) {
        try { recognition.stop() } catch (_) { /* already stopped */ }
        recognition = null
      }
    }
  }
}

import { convertWebMToWav, transcribeAudio } from './serverTranscriptionService'

// Each run owns its recorder, timer, tracks and cancellation signal. Old callbacks
// can settle their own run, but cannot restart or stop a newer one.
export function createRecordingPipeline({ metadata, onTranscription, onError, onRecordingStateChange }) {
  let current = null
  let disposed = false
  const stopTracks = run => run.stream?.getTracks().forEach(track => track.stop())
  const windowFor = run => {
    if (current !== run || !run.active || run.cancelled) return
    const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/ogg'].find(type => MediaRecorder.isTypeSupported(type))
    const recorder = new MediaRecorder(run.stream, mimeType ? { mimeType } : undefined)
    run.recorder = recorder
    const chunks = []
    const sequence = run.next++
    run.done = new Promise(resolve => {
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
      recorder.onerror = event => { if (!run.cancelled) onError?.(event.error || new Error('Recording failed')) }
      recorder.onstop = async () => {
        clearTimeout(run.timer)
        let text = ''
        try {
          const blob = new Blob(chunks, { type: recorder.mimeType })
          if (!run.cancelled && blob.size >= 5000) {
            const wav = await convertWebMToWav(blob)
            if (!run.cancelled) {
              const result = await transcribeAudio(wav, metadata, { signal: run.abort.signal })
              text = result.text || ''
            }
          }
        } catch (error) {
          if (!run.cancelled) onError?.(error)
        } finally {
          // Empty settlements ensure a failed/short window never blocks ordering.
          if (!run.cancelled) onTranscription?.(sequence, text)
          resolve()
          if (current === run && run.active && !run.cancelled) {
            try { windowFor(run) } catch (error) { fail(run, error) }
          }
        }
      }
    })
    recorder.start()
    run.timer = setTimeout(() => { if (recorder.state !== 'inactive') recorder.stop() }, 10000)
  }
  const fail = (run, error) => {
    run.active = false
    stopTracks(run)
    if (current === run) { current = null; onRecordingStateChange?.(false); onError?.(error) }
  }
  const startRecording = async () => {
    if (disposed || current) return
    const run = { active: true, cancelled: false, next: 0, abort: new AbortController() }
    current = run
    try {
      run.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (current !== run || run.cancelled || !run.active) { stopTracks(run); return }
      windowFor(run)
      onRecordingStateChange?.(true)
    } catch (error) { fail(run, error) }
  }
  const stopRecording = async ({ discard = false } = {}) => {
    const run = current
    if (!run) return
    current = null
    run.active = false
    run.cancelled = discard
    if (discard) run.abort.abort()
    clearTimeout(run.timer)
    if (run.recorder?.state && run.recorder.state !== 'inactive') run.recorder.stop()
    stopTracks(run)
    onRecordingStateChange?.(false)
    await run.done
  }
  return {
    startRecording, stopRecording,
    dispose: () => { disposed = true; return stopRecording({ discard: true }) },
    isRecording: () => !!current?.active
  }
}

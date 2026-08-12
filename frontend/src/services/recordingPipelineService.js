import { convertWebMToWav, transcribeAudio } from './serverTranscriptionService'

const MIME_TYPES = [
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/webm;codecs=opus',
  'audio/webm'
]

const getSupportedMimeType = () => {
  for (const mimeType of MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType
    }
  }
  return 'audio/webm'
}

export function createRecordingPipeline({ speakerRole, speakerId, roomId, onTranscription, onStatus, onError, onRecordingStateChange }) {
  let stream = null
  let mediaRecorder = null
  let transcriptionInterval = null
  let mediaRecorderStopPromise = null
  let selectedMimeType = 'audio/webm'
  let recordingActive = false
  let nextSequence = 0

  const stopMediaTracks = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
      stream = null
    }
  }

  const getMetadata = () => ({
    speakerRole,
    speakerId,
    roomId
  })

  const sendForTranscription = async (audioBlob, sequence) => {
    if (!audioBlob || audioBlob.size < 5000) {
      console.log(`[RECORDING] Skipping short audio chunk sequence ${sequence}, size ${audioBlob?.size || 0}`)
      return
    }

    try {
      const wavBlob = await convertWebMToWav(audioBlob)
      const result = await transcribeAudio(wavBlob, getMetadata())
      onTranscription?.(sequence, result.text || '', result.metadata || null)
    } catch (error) {
      onError?.(error)
    }
  }

  const startTranscriptionWindow = () => {
    if (!stream) return

    const sequence = nextSequence++
    const chunks = []

    mediaRecorder = new MediaRecorder(stream, { mimeType: selectedMimeType })
    mediaRecorderStopPromise = new Promise((resolve) => {
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data)
        }
      }

      mediaRecorder.onerror = (event) => {
        onError?.(event.error || new Error('MediaRecorder error'))
      }

      mediaRecorder.onstop = async () => {
        if (transcriptionInterval) {
          clearTimeout(transcriptionInterval)
          transcriptionInterval = null
        }

        const audioBlob = new Blob(chunks, { type: mediaRecorder.mimeType || selectedMimeType })
        await sendForTranscription(audioBlob, sequence)
        resolve()

        if (recordingActive) {
          startTranscriptionWindow()
        }
      }
    })

    mediaRecorder.start()
    transcriptionInterval = setTimeout(() => {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop()
      }
    }, 10000)
  }

  const startRecording = async () => {
    if (recordingActive) return

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      selectedMimeType = getSupportedMimeType()
      nextSequence = 0
      recordingActive = true

      onRecordingStateChange?.(true)
      onStatus?.('Listening...')
      startTranscriptionWindow()
    } catch (error) {
      onError?.(error)
      onStatus?.('Microphone access denied')
      recordingActive = false
      onRecordingStateChange?.(false)
    }
  }

  const stopRecording = async () => {
    if (!recordingActive) return

    recordingActive = false
    if (transcriptionInterval) {
      clearTimeout(transcriptionInterval)
      transcriptionInterval = null
    }

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop()
    }

    if (mediaRecorderStopPromise) {
      await mediaRecorderStopPromise
      mediaRecorderStopPromise = null
    }

    stopMediaTracks()
    onRecordingStateChange?.(false)
    onStatus?.('Ready')
  }

  return {
    startRecording,
    stopRecording,
    isRecording: () => recordingActive
  }
}

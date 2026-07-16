import useAuthStore from '../stores/authStore'

import { API_URL } from '../config.js'

// Transcribe audio using server-side Whisper
export const transcribeAudio = async (audioBlob) => {
  const token = useAuthStore.getState().token
  
  // Convert blob to base64
  const base64 = await blobToBase64(audioBlob)
  
  const response = await fetch(`${API_URL}/transcription/transcribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ audio: base64 })
  })
  
  if (!response.ok) {
    throw new Error(`Transcription failed: ${response.statusText}`)
  }
  
  return response.json()
}

// Convert blob to base64
export const blobToBase64 = (blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const base64 = reader.result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

// Check transcription service status
export const getTranscriptionStatus = async () => {
  const response = await fetch(`${API_URL}/transcription/status`)
  if (!response.ok) {
    throw new Error(`Failed to check transcription status: ${response.statusText}`)
  }
  return response.json()
}

// Convert WebM audio to WAV (16kHz mono) using Web Audio API
export const convertWebMToWav = async (webmBlob) => {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 })
    
    const arrayBuffer = await webmBlob.arrayBuffer()
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
    
    // Get mono channel data at 16kHz
    const numberOfSamples = audioBuffer.length
    const audioData = audioBuffer.getChannelData(0)
    
    // Convert Float32 to Int16
    const int16Data = new Int16Array(audioData.length)
    for (let i = 0; i < audioData.length; i++) {
      const s = Math.max(-1, Math.min(1, audioData[i]))
      int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
    }
    
    // Create WAV header + data
    const wavBuffer = createWavFile(int16Data, 16000, 1)
    
    audioContext.close()
    
    return new Blob([wavBuffer], { type: 'audio/wav' })
  } catch (error) {
    console.error('Error converting audio:', error)
    throw error
  }
}

// Create WAV file from Int16Array
function createWavFile(samples, sampleRate, numChannels) {
  const bytesPerSample = 2
  const blockAlign = numChannels * bytesPerSample
  const byteRate = sampleRate * blockAlign
  const dataSize = samples.length * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  
  // RIFF header
  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(view, 8, 'WAVE')
  
  // fmt chunk
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // chunk size
  view.setUint16(20, 1, true) // audio format (PCM)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true) // bits per sample
  
  // data chunk
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)
  
  // Write PCM samples
  const dataOffset = 44
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(dataOffset + i * 2, samples[i], true)
  }
  
  return buffer
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i))
  }
}
/**
 * Sarvam AI Saaras V3 Transcription Service
 *
 * Calls the Sarvam REST API (https://api.sarvam.ai/speech-to-text) to transcribe
 * audio using the saaras:v3 model. Optimized for Indian English accents and Hinglish.
 *
 * Input:  base64-encoded WAV audio (16kHz mono, same format the frontend already sends)
 * Output: { text, language, segments } — same shape as the Whisper response
 */

const SARVAM_API_URL = 'https://api.sarvam.ai/speech-to-text'
const SARVAM_MODEL = 'saaras:v3'
const SARVAM_MODE = 'transcribe'

/**
 * Transcribe base64-encoded WAV audio using Sarvam AI.
 * @param {string} audioBase64 - Base64-encoded WAV audio data
 * @param {string} [language] - BCP-47 language code (e.g. 'hi-IN', 'en-IN', 'unknown')
 * @returns {Promise<{text: string, language: string, segments: Array}>}
 */
export async function transcribe(audioBase64, language) {
  const apiKey = process.env.SARVAM_API_KEY
  if (!apiKey) {
    throw new Error(
      'SARVAM_API_KEY is not configured. Please add your Sarvam AI API key to the .env file. ' +
      'Sign up at https://console.sarvam.ai for ₹1000 free credits.'
    )
  }

  // Decode base64 to a binary Buffer
  const audioBuffer = Buffer.from(audioBase64, 'base64')

  if (audioBuffer.length < 100) {
    console.log('[SARVAM] Audio too short (<100 bytes), skipping')
    return { text: '', language: 'en', segments: [] }
  }

  // IMPORTANT: Use File instead of Blob for Node.js undici FormData.
  // Node's undici sends Blob with a generic filename "blob" which causes
  // Sarvam API to reject or misinterpret the upload. The File constructor
  // properly sets the filename in the multipart Content-Disposition header.
  const audioFile = new File([audioBuffer], 'audio.wav', { type: 'audio/wav' })

  // Determine target language code (e.g. hi-IN, en-IN, unknown)
  // Default to 'hi-IN' if not specified to ensure proper mixed Hindi/English transcription.
  // Use 'unknown' for auto-detection when language is uncertain.
  const targetLangCode = language || process.env.SARVAM_LANGUAGE_CODE || 'unknown'

  const formData = new FormData()
  formData.append('file', audioFile)
  formData.append('model', SARVAM_MODEL)
  formData.append('mode', SARVAM_MODE)
  formData.append('language_code', targetLangCode)

  console.log(`[SARVAM] Transcribing ${audioBuffer.length} bytes, lang=${targetLangCode}, model=${SARVAM_MODEL}, mode=${SARVAM_MODE}`)

  const response = await fetch(SARVAM_API_URL, {
    method: 'POST',
    headers: {
      'api-subscription-key': apiKey
      // Do NOT set Content-Type manually — fetch auto-generates the
      // correct multipart/form-data header with boundary when body is FormData
    },
    body: formData,
    signal: AbortSignal.timeout(30000) // 30s timeout
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'No error body')
    console.error(`[SARVAM] API error ${response.status}: ${errorBody}`)
    throw new Error(
      `Sarvam API error (${response.status}): ${errorBody}`
    )
  }

  const data = await response.json()
  console.log(`[SARVAM] Response:`, JSON.stringify(data).slice(0, 300))

  // Normalize Sarvam response to match the Whisper response shape:
  // Sarvam returns: { transcript: "...", language_code: "..." }
  // We return:      { text: "...", language: "...", segments: [] }
  const result = {
    text: data.transcript || data.text || '',
    language: data.language_code || data.language || 'en',
    segments: data.segments || []
  }

  if (!result.text) {
    console.warn('[SARVAM] Empty transcript returned. Raw response keys:', Object.keys(data))
  }

  return result
}


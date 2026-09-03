/**
 * vadSegmentationService.js
 * 
 * In-browser Voice Activity Detection (VAD) using Silero VAD (@ricky0123/vad-web)
 * and ONNX Runtime Web.
 * 
 * Replaces fixed-duration recording timers with speech/silence-aware chunking:
 * - Natural pause detection (silence >= 500ms after speech)
 * - Minimum chunk duration cap (3000ms) to avoid chattering
 * - Maximum chunk duration cap (30000ms) for unbounded monologue safety
 * - Preload + fallback pattern matching existing audio services
 * - Tab-backgrounding mitigation via wall-clock deltas and Page Visibility API
 */

import { MicVAD } from '@ricky0123/vad-web'

class VADSegmentationService {
  constructor() {
    this.vadInstance = null
    this.isPreloaded = false
    this.isPreloading = false
    this.preloadError = null
    this.isActive = false

    // Chunk timing and control
    this.chunkStartTime = 0
    this.hasSpokenInChunk = false
    this.pendingCutAfterMin = false
    this.maxCapTimer = null
    this.onPauseCutCallback = null
    this.minChunkDurationMs = 3000
    this.maxChunkDurationMs = 30000

    // Tab visibility handler
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this)
  }

  /**
   * Returns current high-resolution timestamp.
   */
  getNow() {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now()
  }

  /**
   * Returns the runtime public asset base path.
   * Using a fully qualified URL ensures ONNX runtime loads public assets via standard HTTP
   * rather than Vite's module graph transform.
   */
  getAssetBasePath() {
    if (typeof window !== 'undefined' && window.location && window.location.origin) {
      return `${window.location.origin}/vad/`
    }
    return '/vad/'
  }

  /**
   * Preload Silero VAD model assets on page mount (fire-and-forget).
   * Hides ONNX model loading and WASM compilation latency before recording starts.
   */
  async preload() {
    if (this.isPreloaded || this.isPreloading) return
    this.isPreloading = true
    this.preloadError = null

    try {
      // Warm up by verifying model fetch and WebAssembly environment
      const assetBasePath = this.getAssetBasePath()
      const res = await fetch(`${assetBasePath}silero_vad_v5.onnx`, { method: 'HEAD' })
      if (!res.ok) {
        throw new Error(`Failed to fetch VAD model asset: HTTP ${res.status}`)
      }
      this.isPreloaded = true
      console.log('[VAD] Model assets preloaded successfully')
    } catch (err) {
      console.warn('[VAD] Preload failed, fallback will be used if needed:', err.message)
      this.preloadError = err
      this.isPreloaded = false
    } finally {
      this.isPreloading = false
    }
  }

  /**
   * Returns true if VAD can be initialized.
   */
  isAvailable() {
    return typeof window !== 'undefined' &&
      typeof window.AudioContext !== 'undefined' &&
      !this.preloadError
  }

  /**
   * Starts real-time VAD on the provided MediaStream.
   * 
   * @param {Object} options
   * @param {MediaStream} options.stream - The live raw microphone/audio stream.
   * @param {Function} options.onPauseCut - Callback to stop current MediaRecorder chunk.
   * @param {Function} [options.onSpeechStart] - Optional callback when speech starts.
   * @param {Function} [options.onSpeechEnd] - Optional callback when speech ends.
   * @param {number} [options.minChunkDurationMs=3000] - Minimum chunk duration before cutting on pause.
   * @param {number} [options.maxChunkDurationMs=30000] - Hard cap duration before forcing cut.
   * @param {number} [options.redemptionFrames=16] - Sustained silence frames (~512ms @ 32ms/frame).
   * @returns {Promise<boolean>} True if VAD started successfully, false on fallback.
   */
  async start({
    stream,
    onPauseCut,
    onSpeechStart,
    onSpeechEnd,
    minChunkDurationMs = 3000,
    maxChunkDurationMs = 30000,
    redemptionFrames = 16,
    positiveSpeechThreshold = 0.5,
    negativeSpeechThreshold = 0.35,
  }) {
    if (!stream || !stream.getAudioTracks().length) {
      console.warn('[VAD] Cannot start VAD: no valid audio tracks on stream')
      return false
    }

    try {
      // Clean up any prior instance first
      await this.stop()

      this.onPauseCutCallback = onPauseCut
      this.minChunkDurationMs = minChunkDurationMs
      this.maxChunkDurationMs = maxChunkDurationMs
      this.chunkStartTime = this.getNow()
      this.hasSpokenInChunk = false
      this.pendingCutAfterMin = false

      const assetBasePath = this.getAssetBasePath()

      this.vadInstance = await MicVAD.new({
        model: 'v5',
        baseAssetPath: assetBasePath,
        onnxWASMBasePath: assetBasePath,
        ortConfig: (ort) => {
          if (ort && ort.env && ort.env.wasm) {
            ort.env.wasm.wasmPaths = assetBasePath
            ort.env.wasm.numThreads = 1
          }
          if (ort && ort.env) {
            ort.env.logLevel = 'error'
          }
        },
        positiveSpeechThreshold,
        negativeSpeechThreshold,
        redemptionMs: (redemptionFrames || 16) * 32, // ~512ms silence threshold
        minSpeechMs: 160, // ~160ms speech threshold to start
        preSpeechPadMs: 100,
        minSpeechFrames: 5,
        redemptionFrames,
        preSpeechPadFrames: 1,
        startOnLoad: true,
        getStream: async () => stream,
        pauseStream: async () => {
          // Do NOT stop media stream tracks — MediaRecorder and app own the stream
        },
        resumeStream: async (s) => s,
        onSpeechStart: () => {
          this.hasSpokenInChunk = true
          this.pendingCutAfterMin = false
          if (onSpeechStart) onSpeechStart()
        },
        onSpeechEnd: () => {
          if (onSpeechEnd) onSpeechEnd()
          this.handlePauseDetected()
        },
        onFrameProcessed: (probs) => {
          // Check if a cut was pending due to early pause before minimum duration
          if (this.pendingCutAfterMin) {
            const elapsed = this.getNow() - this.chunkStartTime
            if (elapsed >= this.minChunkDurationMs) {
              const isSilent = probs.isSpeech < negativeSpeechThreshold
              if (isSilent) {
                this.pendingCutAfterMin = false
                console.log(`[VAD] Delayed pause cut triggered after min duration reached (${elapsed.toFixed(0)}ms)`)
                this.triggerCut()
              }
            }
          }
        },
        onVADMisfire: () => {
          // False alarm or ultra-short noise burst — keep monitoring
        }
      })

      this.isActive = true
      this.armMaxDurationSafetyCap()

      // Tab backgrounding mitigation
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', this.handleVisibilityChange)
      }

      console.log('[VAD] Active method: vad')
      return true
    } catch (err) {
      console.error('[VAD] Failed to initialize real-time VAD:', err)
      await this.stop()
      console.log('[VAD] Active method: fixed-timer-fallback (reason: initialization failure)')
      return false
    }
  }

  /**
   * Called when VAD detects sustained silence (>= 500ms) after speech.
   */
  handlePauseDetected() {
    if (!this.isActive) return

    const elapsed = this.getNow() - this.chunkStartTime
    if (elapsed >= this.minChunkDurationMs) {
      console.log(`[VAD] Natural pause cut triggered (${elapsed.toFixed(0)}ms in chunk)`)
      this.triggerCut()
    } else if (this.hasSpokenInChunk) {
      // Speech finished before 3s; defer cut until min duration is reached if silence persists
      this.pendingCutAfterMin = true
    }
  }

  /**
   * Arms the 30-second hard cap safety timeout.
   */
  armMaxDurationSafetyCap() {
    if (this.maxCapTimer) {
      clearTimeout(this.maxCapTimer)
      this.maxCapTimer = null
    }

    this.maxCapTimer = setTimeout(() => {
      if (!this.isActive) return
      const elapsed = this.getNow() - this.chunkStartTime
      console.log(`[VAD] Max chunk duration hard cap reached (${elapsed.toFixed(0)}ms), forcing cut`)
      this.triggerCut()
    }, this.maxChunkDurationMs)
  }

  /**
   * Signals that a new MediaRecorder window/chunk has started.
   * Resets per-chunk state and the 30s safety cap.
   */
  notifyChunkStarted() {
    this.chunkStartTime = this.getNow()
    this.hasSpokenInChunk = false
    this.pendingCutAfterMin = false
    if (this.isActive) {
      this.armMaxDurationSafetyCap()
    }
  }

  /**
   * Executes the chunk boundary cut by calling onPauseCutCallback.
   */
  triggerCut() {
    if (this.maxCapTimer) {
      clearTimeout(this.maxCapTimer)
      this.maxCapTimer = null
    }
    this.pendingCutAfterMin = false

    if (typeof this.onPauseCutCallback === 'function') {
      try {
        this.onPauseCutCallback()
      } catch (err) {
        console.error('[VAD] Error in onPauseCutCallback:', err)
      }
    }
  }

  /**
   * Page Visibility API listener: checks if chunk exceeded cap while tab was backgrounded.
   */
  handleVisibilityChange() {
    if (typeof document === 'undefined' || document.visibilityState !== 'visible' || !this.isActive) {
      return
    }

    const elapsed = this.getNow() - this.chunkStartTime
    if (elapsed >= this.maxChunkDurationMs) {
      console.log(`[VAD] Tab resumed and chunk duration exceeded cap (${elapsed.toFixed(0)}ms), cutting immediately`)
      this.triggerCut()
    }
  }

  /**
   * Stops VAD, disconnects AudioWorklet, clears timers and listeners.
   */
  async stop() {
    this.isActive = false

    if (this.maxCapTimer) {
      clearTimeout(this.maxCapTimer)
      this.maxCapTimer = null
    }

    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange)
    }

    if (this.vadInstance) {
      try {
        await this.vadInstance.destroy()
      } catch (err) {
        console.warn('[VAD] Error destroying VAD instance:', err)
      }
      this.vadInstance = null
    }

    this.hasSpokenInChunk = false
    this.pendingCutAfterMin = false
    this.onPauseCutCallback = null
  }
}

// Singleton instance export
export const vadSegmentationService = new VADSegmentationService()
export default vadSegmentationService

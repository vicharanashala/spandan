/**
 * Noise Suppression Service — Step 3: Lightweight Noise Removal
 *
 * Applies RNNoise (via @timephy/rnnoise-wasm, an AudioWorkletProcessor) to the
 * raw microphone MediaStream before it reaches the MediaRecorder / Whisper.
 *
 * Pipeline:
 *   raw mic stream
 *     → AudioContext.createMediaStreamSource   (browser resamples mic → 48 kHz)
 *     → AudioWorkletNode (RNNoise WASM — audio thread)
 *     → AudioContext.createMediaStreamDestination
 *     → clean MediaStream → MediaRecorder + AudioQualityDetector
 *
 * Sample rate: AudioContext is explicitly set to 48 kHz (sampleRate: 48000).
 * RNNoise was trained at 48 kHz — its 480-sample frame = 10 ms only at that
 * rate. macOS/CoreAudio defaults to 44.1 kHz; forcing 48 kHz ensures the
 * worklet always receives correctly-sampled audio. The browser automatically
 * resamples the getUserMedia stream when it is connected to a 48 kHz context.
 *
 * Downstream compatibility (48 kHz change):
 *   - AudioQualityDetector: creates its own AudioContext with default rate and
 *     receives the cleanStream. Its metrics (RMS, ZCR) are dimensionless ratios
 *     — completely sample-rate agnostic. ✓ Unaffected.
 *   - MediaRecorder (Opus): natively operates at 48 kHz, accepts any rate. ✓
 *   - convertWebMToWav: decodes the blob into its own 16 kHz AudioContext for
 *     Whisper. Decoupled from capture rate. ✓ Unaffected.
 *
 * Pre-loading:
 *   Call preloadNoiseSuppressor() on page mount (fire-and-forget) to download
 *   the 1.88 MB WASM bundle into the browser HTTP cache before the user clicks
 *   record. applyNoiseSuppression() always calls addModule() on its own fresh
 *   AudioContext, but after preloading the download is served from cache
 *   (~50 ms) instead of the network (~10 s on Fast 3G).
 *
 * Latency: ~10–20 ms added (1–2 RNNoise 480-sample frames at 48 kHz).
 */

import { NoiseSuppressorWorklet_Name } from '@timephy/rnnoise-wasm'
import NoiseSuppressorWorklet from '@timephy/rnnoise-wasm/NoiseSuppressorWorklet?worker&url'

// RNNoise requires 48 kHz — its model was trained at this rate.
const RNNOISE_SAMPLE_RATE = 48000

// ── Pre-load singleton ────────────────────────────────────────────────────────
// Tracks whether a preload call has been made. The actual network download is
// cached by the browser HTTP cache; each recording AudioContext still calls
// addModule() itself, but finds the bundle already cached.
let _preloadPromise = null

/**
 * Pre-warm the browser's HTTP cache for the RNNoise worklet bundle.
 *
 * Call this fire-and-forget on page mount (teacher room page) so the 1.88 MB
 * WASM bundle downloads in the background. Recording start will then await
 * addModule() against an already-cached asset (~50 ms) instead of a cold
 * network fetch (~3–10 s on throttled connections).
 *
 * Does NOT block page render — it returns a promise that can be ignored.
 * Safe to call multiple times; only the first call does any work.
 */
export function preloadNoiseSuppressor() {
  if (_preloadPromise) return _preloadPromise

  const AudioCtx = window.AudioContext || window.webkitAudioContext
  if (!AudioCtx) {
    _preloadPromise = Promise.resolve()
    return _preloadPromise
  }

  _preloadPromise = (async () => {
    let preloadCtx
    try {
      // Create a temporary AudioContext just to trigger addModule().
      // The context can stay suspended — addModule() works without resuming.
      // sampleRate: 48000 so the WASM is compiled at the correct rate even here.
      preloadCtx = new AudioCtx({ sampleRate: RNNOISE_SAMPLE_RATE })
      await preloadCtx.audioWorklet.addModule(NoiseSuppressorWorklet)
      console.log('[NoiseSuppression] Worklet preloaded into browser cache.')
    } catch (err) {
      console.warn('[NoiseSuppression] Preload failed (will retry on recording start):', err?.message || err)
      // Reset so a real recording attempt can try again.
      _preloadPromise = null
    } finally {
      // Release the audio hardware — we only needed the download, not a live context.
      if (preloadCtx) {
        try { await preloadCtx.close() } catch (_) {}
      }
    }
  })()

  return _preloadPromise
}

/**
 * Apply RNNoise noise suppression to a raw microphone MediaStream.
 *
 * @param {MediaStream} rawStream  — stream from getUserMedia (WebRTC
 *                                   noiseSuppression:true already applied)
 * @returns {Promise<{ cleanStream: MediaStream, dispose: () => void, method: string }>}
 *   cleanStream — denoised stream to hand to MediaRecorder / AudioQualityDetector
 *   dispose()   — teardown; call when recording stops
 *   method      — 'rnnoise' | 'webrtc-only' (logged by caller)
 */
export async function applyNoiseSuppression(rawStream) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  if (!AudioCtx) {
    console.warn('[NoiseSuppression] Web Audio API not supported — WebRTC-only fallback.')
    return { cleanStream: rawStream, dispose: () => {}, method: 'webrtc-only' }
  }

  let ctx

  try {
    // ── AudioContext at 48 kHz ────────────────────────────────────────────────
    // Each recording gets a fresh AudioContext so there are no shared-state
    // issues between recordings. addModule() is always called explicitly here;
    // if preloadNoiseSuppressor() already ran, the fetch is served from the
    // browser HTTP cache in ~50 ms.
    ctx = new AudioCtx({ latencyHint: 'interactive', sampleRate: RNNOISE_SAMPLE_RATE })
    if (ctx.state === 'suspended') await ctx.resume()

    // Register the worklet on this specific AudioContext.
    // (Each AudioContext needs its own addModule() call — the browser's HTTP
    // cache and WASM code cache make this fast after the preload or first run.)
    await ctx.audioWorklet.addModule(NoiseSuppressorWorklet)

    // ── Audio graph: source → RNNoise → destination ───────────────────────────
    // createMediaStreamSource automatically resamples the getUserMedia stream
    // (device-native rate, e.g. 44.1 kHz on Mac) to the context's 48 kHz.
    const source      = ctx.createMediaStreamSource(rawStream)
    const rnnoiseNode = new AudioWorkletNode(ctx, NoiseSuppressorWorklet_Name)
    const destination = ctx.createMediaStreamDestination()

    source.connect(rnnoiseNode)
    rnnoiseNode.connect(destination)

    const cleanStream = destination.stream

    console.log(
      '[NoiseSuppression] RNNoise pipeline active (48 kHz). ' +
      'Added latency: ~10–20 ms.'
    )

    function dispose() {
      try { source.disconnect()      } catch (_) {}
      try { rnnoiseNode.disconnect() } catch (_) {}
      try { ctx.close()              } catch (_) {}
      console.log('[NoiseSuppression] RNNoise pipeline disposed.')
    }

    return { cleanStream, dispose, method: 'rnnoise' }

  } catch (err) {
    console.warn(
      '[NoiseSuppression] RNNoise failed — WebRTC-only fallback.\nReason:', err?.message || err
    )
    if (ctx) { try { ctx.close() } catch (_) {} }
    return { cleanStream: rawStream, dispose: () => {}, method: 'webrtc-only' }
  }
}

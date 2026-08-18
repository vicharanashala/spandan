# Version 1.2 — RNNoise Lightweight Noise Suppression

## Document Metadata

| Field | Value |
|---|---|
| Document Version | 1.2 |
| Status | Completed |
| Last Updated | 2026-07-22 |
| Platform | Spandan |
| Release Phase | v1.2 |

---

# 1. PURPOSE & SCOPE

This document defines the Software Requirement Specification (SRS) and implementation details for the RNNoise Lightweight Noise Suppression feature.

The goal of this feature is to apply real-time, ML-based noise removal to the teacher's microphone stream **before** audio reaches the MediaRecorder and the Whisper transcription pipeline. This reduces background noise artefacts in transcripts and therefore improves the quality of AI-generated questions.

RNNoise is a recurrent neural network trained on speech data at 48 kHz. It runs entirely in the browser via a WebAssembly AudioWorkletProcessor, adding only ~10–20 ms of latency.

---

# 2. DEPENDENCIES

| Dependency | Version | Purpose |
|---|---|---|
| `@timephy/rnnoise-wasm` | `^1.0.0` | Provides the `NoiseSuppressorWorklet` AudioWorkletProcessor and its WASM bundle |
| Web Audio API | Browser native | `AudioContext`, `AudioWorkletNode`, `createMediaStreamSource`, `createMediaStreamDestination` |
| MediaRecorder API | Browser native | Consumes the clean `MediaStream` produced by the pipeline |

---

# 3. ARCHITECTURE & WORKFLOW

## Pipeline Flow

```text
getUserMedia (raw mic stream)
  → AudioContext.createMediaStreamSource   [browser resamples to 48 kHz]
  → AudioWorkletNode (RNNoise WASM)        [ML denoising, ~10–20 ms latency]
  → AudioContext.createMediaStreamDestination
  → cleanStream
       ├─→ MediaRecorder (10-second windows → Whisper)
       └─→ AudioQualityDetector (RMS / ZCR monitoring)
```

## Sample Rate

The `AudioContext` is explicitly created at **48 kHz** (`sampleRate: 48000`).

- RNNoise was trained at 48 kHz — its 480-sample frame equals exactly 10 ms only at this rate.
- macOS/CoreAudio defaults to 44.1 kHz; the explicit rate forces correct behaviour on all platforms.
- The browser automatically resamples the `getUserMedia` stream when it is connected to the 48 kHz context.

## Downstream Compatibility

| Consumer | Impact |
|---|---|
| `AudioQualityDetector` | Creates its own `AudioContext` with default rate. Metrics (RMS, ZCR) are dimensionless ratios — completely sample-rate agnostic. ✅ Unaffected |
| `MediaRecorder` (Opus) | Natively operates at 48 kHz, accepts any rate. ✅ Unaffected |
| `convertWebMToWav` | Decodes the blob into its own 16 kHz `AudioContext` for Whisper. Decoupled from capture rate. ✅ Unaffected |

---

# 4. KEY DESIGN DECISIONS

## Pre-loading (HTTP Cache Warm-up)

The RNNoise WASM bundle is **1.88 MB**. On a cold load:
- Fast 3G: ~10 s download
- After HTTP cache: ~50 ms

`preloadNoiseSuppressor()` is called **fire-and-forget on page mount** (before the teacher clicks "Start Recording"). It creates a temporary suspended `AudioContext`, calls `addModule()` to trigger the download, then immediately closes the context. The browser HTTP cache retains the bundle so the next `addModule()` call (inside the live recording context) is near-instant.

## Per-Recording AudioContext

Each recording session creates its own fresh `AudioContext`. This avoids shared-state issues between recordings and follows the same pattern used by `AudioQualityDetector`.

## Graceful Fallback

If `AudioWorklet` is unsupported or the WASM fails to load, `applyNoiseSuppression()` catches the error and returns the raw `getUserMedia` stream with `method: 'webrtc-only'`. The recording continues uninterrupted using the browser's built-in WebRTC noise suppression (`noiseSuppression: true` in `getUserMedia` constraints).

## Microphone Track Release

`streamRef` is reassigned to hold the synthetic **clean stream** (the `AudioContext` destination). Stopping tracks on this stream has no effect. The **raw** `getUserMedia` stream is tracked separately in `rawStreamRef` and its tracks are explicitly stopped on `stopRecording()` to release the OS microphone indicator.

---

# 5. CONFIGURABLE PARAMETERS

| Parameter | Value | Purpose |
|---|---|---|
| `RNNOISE_SAMPLE_RATE` | `48000` | AudioContext sample rate; must match the RNNoise training rate |
| Recording window size | `10 000 ms` | Set in `startTranscriptionWindow()` — unchanged by this feature |

---

# 6. FILES CHANGED

| File | Action | Description |
|---|---|---|
| `frontend/src/services/noiseSuppressionService.js` | **Created** | `applyNoiseSuppression()` + `preloadNoiseSuppressor()` service |
| `frontend/src/pages/RoomDetailPage.jsx` | Modified | Preload on mount; apply on record start; dispose on stop; `rawStreamRef` tracking |
| `frontend/package.json` | Modified | Added `@timephy/rnnoise-wasm ^1.0.0` dependency |
| `backend/src/services/questionService.js` | Modified | Trailing-whitespace cleanup only — no logic change |

---

# 7. VERIFICATION STATUS

- **Automated Tests**: Unit tests added in [noiseSuppressionService.test.js](file:///d:/projects/spandan/frontend/src/__tests__/noiseSuppressionService.test.js) covering the preload lifecycle, pipeline graph construction, fallback behaviour, and resource cleanup.
- **Manual Verification**: Visual check confirms recording starts/stops cleanly and the `modelStatus` indicator behaves correctly with RNNoise active.

---

# 8. COMMIT REFERENCE

| Commit | Message |
|---|---|
| `d08dfe9` | `feat(v1.2): RNNoise lightweight noise suppression via AudioWorklet` |

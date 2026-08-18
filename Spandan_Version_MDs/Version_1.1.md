# Version 1.1 — Audio Quality Check

## Document Metadata

| Field | Value |
|---|---|
| Document Version | 1.1 |
| Status | Completed |
| Last Updated | 2026-07-18 |
| Platform | Spandan |
| Release Phase | v1.1 |

---

# 1. PURPOSE & SCOPE

This document defines the Software Requirement Specification (SRS) and implementation details for the Audio Quality Check feature.
The goal of this feature is to run quality checks on client-side teacher audio streams before/during transcription, catching issues like muted microphones, low volume, or excessive background noise.

---

# 2. CONFIGURABLE THRESHOLDS

The quality detector module is configured via the `DEFAULT_CONFIG` object inside [audioQualityDetector.js](file:///d:/projects/spandan/frontend/src/services/audioQualityDetector.js):

| Config Parameter | Default Value | Purpose |
|---|---|---|
| `intervalMs` | `300` | Frequency of checking loop ticks (ms) |
| `muteThreshold` | `0.002` | Root Mean Square (RMS) amplitude below which audio is considered silent |
| `muteDurationMs` | `4000` | Duration of sustained silence required before flagging a muted microphone issue |
| `volumeThreshold` | `0.015` | RMS amplitude below which microphone volume is flagged as low |
| `noiseThreshold` | `0.25` | Zero-Crossing Rate (ZCR) threshold above which background noise is considered excessive |
| `fftSize` | `2048` | Fast Fourier Transform (FFT) analysis size for time-domain buffer |

---

# 3. ARCHITECTURE & WORKFLOW

## Pipeline Flow:
```text
Teacher Audio → Audio Quality Detector (Continuous tap)
                     ↓
         RMS & ZCR Signal Checks
                     ↓
  Model Status UI Warnings (Advisory feedback)
```

1. **Tap Microphone**: Taps `streamRef.current` using the Web Audio API (`AudioContext` and `AnalyserNode`) during active recording.
2. **Analysis Loop**: Pulls time-domain data every 300ms.
3. **Trigger Issues**: Updates the page's `modelStatus` text state using transition debouncing:
   - Muted Microphone: `"No audio detected. Check your microphone."`
   - Low Volume: `"Your microphone volume seems low."`
   - High Noise: `"Background noise is too high."`
4. **Resolution**: Restores the `modelStatus` state to `"Listening..."` once parameters return to acceptable boundaries.

---

# 4. VERIFICATION STATUS

- **Automated Tests**: Unit tests added in [audioQualityDetector.test.js](file:///d:/projects/spandan/frontend/src/__tests__/audioQualityDetector.test.js) validating RMS computations, ZCR noise thresholds, and sustained silence duration.
- **Manual Verification**: Visual check verifies room detail page is fully responsive under microphone stream activation.

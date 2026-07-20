/**
 * Audio Quality Detector
 * Taps a MediaStream using the Web Audio API to detect:
 * 1. Muted Microphone (sustained silence)
 * 2. Low Volume
 * 3. Excessive Background Noise
 */

export const DEFAULT_CONFIG = {
  intervalMs: 300,            // Interval to run checks (250-500ms)
  volumeThreshold: 0.015,     // RMS threshold for low volume
  muteThreshold: 0.002,       // RMS threshold for muted microphone
  muteDurationMs: 4000,       // Duration (ms) of sustained silence before flagging 'muted'
  noiseThreshold: 0.25,       // Zero-crossing rate threshold for background noise
  fftSize: 2048               // FFT size for analyzer node
};

export function createAudioQualityDetector(stream, options = {}) {
  const { onIssue, onClear, ...customConfig } = options;
  const config = { ...DEFAULT_CONFIG, ...customConfig };

  let audioContext = null;
  let sourceNode = null;
  let analyserNode = null;
  let intervalId = null;
  let silenceStartTimestamp = null;
  let lastEmittedState = 'ok'; // 'ok' | 'muted' | 'low_volume' | 'noisy'

  function checkQuality() {
    if (!analyserNode) return;

    const dataArray = new Float32Array(analyserNode.fftSize);
    analyserNode.getFloatTimeDomainData(dataArray);

    // 1. Calculate RMS (Root Mean Square) energy
    let sumSquares = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sumSquares += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sumSquares / dataArray.length);

    // 2. Calculate Zero-Crossing Rate (ZCR)
    let zeroCrossings = 0;
    for (let i = 1; i < dataArray.length; i++) {
      if ((dataArray[i] >= 0 && dataArray[i - 1] < 0) || (dataArray[i] < 0 && dataArray[i - 1] >= 0)) {
        zeroCrossings++;
      }
    }
    const zcr = dataArray.length > 1 ? zeroCrossings / (dataArray.length - 1) : 0;

    // 3. Determine quality state
    let detectedState = 'ok';
    const currentTime = Date.now();

    if (rms < config.muteThreshold) {
      if (silenceStartTimestamp === null) {
        silenceStartTimestamp = currentTime;
      }
      if (currentTime - silenceStartTimestamp >= config.muteDurationMs) {
        detectedState = 'muted';
      } else {
        // Fallback to ok during brief conversational pauses
        detectedState = 'ok';
      }
    } else {
      silenceStartTimestamp = null;

      if (rms < config.volumeThreshold) {
        detectedState = 'low_volume';
      } else if (zcr > config.noiseThreshold) {
        detectedState = 'noisy';
      } else {
        detectedState = 'ok';
      }
    }

    // 4. Handle transitions
    if (detectedState !== lastEmittedState) {
      if (detectedState === 'ok') {
        if (onClear) onClear();
      } else {
        let message = '';
        if (detectedState === 'low_volume') {
          message = 'Your microphone volume seems low.';
        } else if (detectedState === 'muted') {
          message = 'No audio detected. Check your microphone.';
        } else if (detectedState === 'noisy') {
          message = 'Background noise is too high.';
        }
        if (onIssue) {
          onIssue({ type: detectedState, message });
        }
      }
      lastEmittedState = detectedState;
    }
  }

  return {
    start() {
      if (intervalId) return;

      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
          console.warn('Web Audio API not supported in this browser.');
          return;
        }

        audioContext = new AudioContextClass();
        sourceNode = audioContext.createMediaStreamSource(stream);
        analyserNode = audioContext.createAnalyser();
        analyserNode.fftSize = config.fftSize;

        sourceNode.connect(analyserNode);

        // Reset variables and start checking loop
        silenceStartTimestamp = null;
        lastEmittedState = 'ok';
        intervalId = setInterval(checkQuality, config.intervalMs);
      } catch (err) {
        console.error('Failed to initialize AudioQualityDetector:', err);
      }
    },

    stop() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }

      if (sourceNode) {
        try {
          sourceNode.disconnect();
        } catch (e) {}
        sourceNode = null;
      }

      if (analyserNode) {
        try {
          analyserNode.disconnect();
        } catch (e) {}
        analyserNode = null;
      }

      if (audioContext) {
        try {
          audioContext.close();
        } catch (e) {}
        audioContext = null;
      }

      silenceStartTimestamp = null;
      lastEmittedState = 'ok';
    }
  };
}

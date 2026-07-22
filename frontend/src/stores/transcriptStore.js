/**
 * transcriptStore.js
 * Zustand store for live transcript state management.
 * Handles segments, status, speaker tracking, and error states.
 */

import { create } from 'zustand'

/**
 * @typedef {Object} TranscriptSegment
 * @property {string} id          - Unique segment ID
 * @property {string} text        - Recognized speech text
 * @property {string} timestamp   - ISO timestamp of recognition
 * @property {string} speaker     - Speaker label (e.g. "Speaker 1")
 * @property {boolean} isFinal    - Whether this is a finalized segment
 */

/**
 * @typedef {'idle'|'requesting'|'listening'|'paused'|'error'} TranscriptStatus
 */

/**
 * @typedef {'permission_denied'|'mic_unavailable'|'network'|'not_supported'|'unknown'} TranscriptErrorType
 */

const useTranscriptStore = create((set, get) => ({
  /** @type {TranscriptSegment[]} */
  segments: [],

  /** @type {string} Interim (non-final) text being spoken right now */
  interimText: '',

  /** @type {TranscriptStatus} */
  status: 'idle',

  /** @type {TranscriptErrorType|null} */
  errorType: null,

  /** @type {string|null} */
  errorMessage: null,

  /** Whether the panel is visible */
  isPanelOpen: false,

  /** Auto-scroll enabled flag (user can turn it off by scrolling up) */
  autoScroll: true,

  /** Next speaker index for label assignment */
  _nextSpeakerIndex: 1,

  // ─── Actions ──────────────────────────────────────────────────────────────

  /** Append a finalized transcript segment */
  addSegment: (text, speaker = null) => {
    const { segments, _nextSpeakerIndex } = get()

    // Detect speaker change heuristic: assign speaker ID per session start
    const resolvedSpeaker = speaker || `Speaker ${_nextSpeakerIndex}`

    const segment = {
      id: `seg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text: text.trim(),
      timestamp: new Date().toISOString(),
      speaker: resolvedSpeaker,
      isFinal: true,
    }

    set({ segments: [...segments, segment], interimText: '' })
  },

  /** Update the live interim (non-final) preview text */
  setInterimText: (text) => set({ interimText: text }),

  /** Notify a speaker change (when provider supports it) */
  changeSpeaker: () => {
    const { _nextSpeakerIndex } = get()
    set({ _nextSpeakerIndex: _nextSpeakerIndex + 1 })
  },

  /** Set listening status */
  setStatus: (status) => set({ status }),

  /** Record an error state */
  setError: (errorType, errorMessage) =>
    set({ status: 'error', errorType, errorMessage }),

  /** Clear all errors back to idle */
  clearError: () =>
    set({ status: 'idle', errorType: null, errorMessage: null }),

  /** Clear the entire transcript */
  clearTranscript: () =>
    set({
      segments: [],
      interimText: '',
      _nextSpeakerIndex: 1,
    }),

  /** Toggle panel visibility */
  togglePanel: () => set((s) => ({ isPanelOpen: !s.isPanelOpen })),
  openPanel: () => set({ isPanelOpen: true }),
  closePanel: () => set({ isPanelOpen: false }),

  /** Auto-scroll control */
  setAutoScroll: (val) => set({ autoScroll: val }),

  /** Build the full transcript text for export */
  getFullText: () => {
    const { segments } = get()
    if (segments.length === 0) return ''
    return segments
      .map((seg) => {
        const time = new Date(seg.timestamp).toLocaleTimeString()
        return `[${time}] ${seg.speaker}: ${seg.text}`
      })
      .join('\n\n')
  },
}))

export default useTranscriptStore

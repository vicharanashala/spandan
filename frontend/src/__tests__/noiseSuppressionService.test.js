/**
 * Unit tests for noiseSuppressionService
 *
 * Strategy: Mock the Web Audio API (AudioContext, AudioWorkletNode) and the
 * @timephy/rnnoise-wasm module so tests run in jsdom without real audio hardware.
 *
 * Tests cover:
 *   preloadNoiseSuppressor()
 *     1. Calls addModule() and closes the temporary AudioContext
 *     2. Is idempotent — second call returns the same resolved promise
 *     3. Resets _preloadPromise on addModule failure so recording can retry
 *
 *   applyNoiseSuppression()
 *     4. Returns webrtc-only fallback when Web Audio API is unavailable
 *     5. Builds the source → RNNoise → destination graph on success
 *     6. Returns method: 'rnnoise' on success
 *     7. dispose() disconnects all nodes and closes the AudioContext
 *     8. Falls back to webrtc-only (not throwing) when addModule throws
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock the rnnoise-wasm package so Jest does not try to load WASM
jest.mock('@timephy/rnnoise-wasm', () => ({
  NoiseSuppressorWorklet_Name: 'NoiseSuppressorWorklet',
}), { virtual: true })

// The ?worker&url import is handled by Vite at build time; in Jest we just need
// a string URL so the import resolves.
jest.mock(
  '@timephy/rnnoise-wasm/NoiseSuppressorWorklet?worker&url',
  () => 'mocked-worklet-url',
  { virtual: true }
)

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal AudioContext mock. */
function makeMockAudioContext({ addModuleShouldFail = false } = {}) {
  const mockDestinationStream = { id: 'clean-stream' }
  const mockDestinationNode = { stream: mockDestinationStream }
  const mockSourceNode = { connect: jest.fn(), disconnect: jest.fn() }
  const mockWorkletNode = { connect: jest.fn(), disconnect: jest.fn() }

  const ctx = {
    state: 'running',
    resume: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    createMediaStreamSource: jest.fn().mockReturnValue(mockSourceNode),
    createMediaStreamDestination: jest.fn().mockReturnValue(mockDestinationNode),
    audioWorklet: {
      addModule: addModuleShouldFail
        ? jest.fn().mockRejectedValue(new Error('addModule failed'))
        : jest.fn().mockResolvedValue(undefined),
    },
    _nodes: { source: mockSourceNode, worklet: mockWorkletNode, destination: mockDestinationNode },
  }
  return ctx
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('noiseSuppressionService', () => {
  let AudioContextMock
  let AudioWorkletNodeMock

  // We re-import the module freshly before each test so the module-level
  // _preloadPromise singleton is reset.
  let preloadNoiseSuppressor
  let applyNoiseSuppression

  beforeEach(async () => {
    jest.resetModules()

    AudioContextMock = jest.fn()
    AudioWorkletNodeMock = jest.fn()

    global.AudioContext = AudioContextMock
    global.webkitAudioContext = AudioContextMock
    global.AudioWorkletNode = AudioWorkletNodeMock

    // Dynamically import AFTER resetting modules so singleton state is fresh
    const mod = await import('../services/noiseSuppressionService.js')
    preloadNoiseSuppressor = mod.preloadNoiseSuppressor
    applyNoiseSuppression = mod.applyNoiseSuppression
  })

  afterEach(() => {
    jest.restoreAllMocks()
    delete global.AudioContext
    delete global.webkitAudioContext
    delete global.AudioWorkletNode
  })

  // ── preloadNoiseSuppressor ─────────────────────────────────────────────────

  describe('preloadNoiseSuppressor()', () => {
    it('calls addModule() and closes the temporary AudioContext', async () => {
      const ctx = makeMockAudioContext()
      AudioContextMock.mockImplementation(() => ctx)

      await preloadNoiseSuppressor()

      expect(ctx.audioWorklet.addModule).toHaveBeenCalledWith('mocked-worklet-url')
      expect(ctx.close).toHaveBeenCalledTimes(1)
    })

    it('is idempotent — second call returns the same promise without a second addModule', async () => {
      const ctx = makeMockAudioContext()
      AudioContextMock.mockImplementation(() => ctx)

      const p1 = preloadNoiseSuppressor()
      const p2 = preloadNoiseSuppressor()

      expect(p1).toBe(p2)

      await p1

      // addModule should only have been called once
      expect(ctx.audioWorklet.addModule).toHaveBeenCalledTimes(1)
    })

    it('resets _preloadPromise on addModule failure so a later call can retry', async () => {
      const failCtx = makeMockAudioContext({ addModuleShouldFail: true })
      AudioContextMock.mockImplementationOnce(() => failCtx)

      // First call: addModule fails — promise should resolve (not reject) but reset
      await preloadNoiseSuppressor()

      // _preloadPromise is now null; a second call should create a new context
      const successCtx = makeMockAudioContext()
      AudioContextMock.mockImplementation(() => successCtx)

      await preloadNoiseSuppressor()

      expect(successCtx.audioWorklet.addModule).toHaveBeenCalledTimes(1)
    })
  })

  // ── applyNoiseSuppression ──────────────────────────────────────────────────

  describe('applyNoiseSuppression()', () => {
    const rawStream = { id: 'raw-stream' }

    it('returns webrtc-only fallback when Web Audio API is unavailable', async () => {
      delete global.AudioContext
      delete global.webkitAudioContext

      const result = await applyNoiseSuppression(rawStream)

      expect(result.method).toBe('webrtc-only')
      expect(result.cleanStream).toBe(rawStream)
      expect(typeof result.dispose).toBe('function')
    })

    it('builds the source → RNNoise → destination audio graph on success', async () => {
      const ctx = makeMockAudioContext()
      AudioContextMock.mockImplementation(() => ctx)

      const { source, worklet } = ctx._nodes
      // AudioWorkletNode constructor returns the mock worklet node
      AudioWorkletNodeMock.mockImplementation(() => worklet)

      await applyNoiseSuppression(rawStream)

      expect(ctx.createMediaStreamSource).toHaveBeenCalledWith(rawStream)
      expect(ctx.createMediaStreamDestination).toHaveBeenCalled()
      expect(source.connect).toHaveBeenCalledWith(worklet)
      expect(worklet.connect).toHaveBeenCalledWith(ctx._nodes.destination)
    })

    it('returns method: rnnoise on success', async () => {
      const ctx = makeMockAudioContext()
      AudioContextMock.mockImplementation(() => ctx)
      const { worklet } = ctx._nodes
      AudioWorkletNodeMock.mockImplementation(() => worklet)

      const result = await applyNoiseSuppression(rawStream)

      expect(result.method).toBe('rnnoise')
    })

    it('returns the clean (destination) stream on success', async () => {
      const ctx = makeMockAudioContext()
      AudioContextMock.mockImplementation(() => ctx)
      const { worklet } = ctx._nodes
      AudioWorkletNodeMock.mockImplementation(() => worklet)

      const result = await applyNoiseSuppression(rawStream)

      expect(result.cleanStream).toBe(ctx._nodes.destination.stream)
    })

    it('dispose() disconnects all nodes and closes the AudioContext', async () => {
      const ctx = makeMockAudioContext()
      AudioContextMock.mockImplementation(() => ctx)
      const { source, worklet } = ctx._nodes
      AudioWorkletNodeMock.mockImplementation(() => worklet)

      const { dispose } = await applyNoiseSuppression(rawStream)
      dispose()

      expect(source.disconnect).toHaveBeenCalled()
      expect(worklet.disconnect).toHaveBeenCalled()
      expect(ctx.close).toHaveBeenCalled()
    })

    it('falls back to webrtc-only (without throwing) when addModule throws', async () => {
      const ctx = makeMockAudioContext({ addModuleShouldFail: true })
      AudioContextMock.mockImplementation(() => ctx)

      const result = await applyNoiseSuppression(rawStream)

      expect(result.method).toBe('webrtc-only')
      expect(result.cleanStream).toBe(rawStream)
      // The failed context should have been closed
      expect(ctx.close).toHaveBeenCalled()
    })
  })
})

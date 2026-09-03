import { MicVAD } from '@ricky0123/vad-web'
import vadSegmentationService from '../services/vadSegmentationService'

jest.mock('@ricky0123/vad-web', () => ({
  MicVAD: {
    new: jest.fn(),
  },
}))

describe('VADSegmentationService', () => {
  let mockStream
  let mockDestroy
  let mockVadInstance
  let currentTime

  const advanceTime = (ms) => {
    currentTime += ms
    jest.advanceTimersByTime(ms)
  }

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()

    currentTime = 1000
    jest.spyOn(vadSegmentationService, 'getNow').mockImplementation(() => currentTime)

    mockDestroy = jest.fn().mockResolvedValue(undefined)
    mockVadInstance = {
      destroy: mockDestroy,
    }
    MicVAD.new.mockResolvedValue(mockVadInstance)

    mockStream = {
      getAudioTracks: jest.fn().mockReturnValue([{ id: 'track-1', stop: jest.fn() }]),
    }

    // Reset service state
    vadSegmentationService.vadInstance = null
    vadSegmentationService.isActive = false
    vadSegmentationService.isPreloaded = false
    vadSegmentationService.isPreloading = false
    vadSegmentationService.preloadError = null
    vadSegmentationService.hasSpokenInChunk = false
    vadSegmentationService.pendingCutAfterMin = false
  })

  afterEach(async () => {
    await vadSegmentationService.stop()
    jest.useRealTimers()
  })

  describe('preload', () => {
    it('successfully preloads when fetch succeeds', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 })

      await vadSegmentationService.preload()

      expect(global.fetch).toHaveBeenCalledWith(expect.stringMatching(/\/vad\/silero_vad_v5\.onnx$/), { method: 'HEAD' })
      expect(vadSegmentationService.isPreloaded).toBe(true)
      expect(vadSegmentationService.preloadError).toBeNull()
    })

    it('gracefully handles preload fetch failure without throwing', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 })

      await vadSegmentationService.preload()

      expect(vadSegmentationService.isPreloaded).toBe(false)
      expect(vadSegmentationService.preloadError).toBeTruthy()
      expect(vadSegmentationService.isAvailable()).toBe(false)
    })
  })

  describe('start & fallback', () => {
    it('returns false when stream has no audio tracks', async () => {
      const emptyStream = { getAudioTracks: () => [] }
      const onPauseCut = jest.fn()

      const result = await vadSegmentationService.start({
        stream: emptyStream,
        onPauseCut,
      })

      expect(result).toBe(false)
      expect(vadSegmentationService.isActive).toBe(false)
    })

    it('initializes MicVAD with Silero v5 and correct configuration', async () => {
      const onPauseCut = jest.fn()
      const onSpeechStart = jest.fn()
      const onSpeechEnd = jest.fn()

      const result = await vadSegmentationService.start({
        stream: mockStream,
        onPauseCut,
        onSpeechStart,
        onSpeechEnd,
        minChunkDurationMs: 3000,
        maxChunkDurationMs: 30000,
        redemptionFrames: 16,
      })

      expect(result).toBe(true)
      expect(vadSegmentationService.isActive).toBe(true)
      expect(MicVAD.new).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'v5',
          baseAssetPath: expect.stringMatching(/\/vad\/$/),
          onnxWASMBasePath: expect.stringMatching(/\/vad\/$/),
          redemptionFrames: 16,
          minSpeechFrames: 5,
          startOnLoad: true,
          ortConfig: expect.any(Function),
        })
      )

      // Test ortConfig behavior (forces single-threaded WASM execution)
      const passedOptions = MicVAD.new.mock.calls[0][0]
      const mockOrt = {
        env: {
          wasm: {},
          logLevel: 'verbose',
        },
      }
      passedOptions.ortConfig(mockOrt)
      expect(mockOrt.env.wasm.numThreads).toBe(1)
      expect(mockOrt.env.wasm.wasmPaths).toMatch(/\/vad\/$/)
      expect(mockOrt.env.logLevel).toBe('error')
    })

    it('gracefully returns false and falls back when MicVAD.new throws', async () => {
      MicVAD.new.mockRejectedValueOnce(new Error('WASM initialization failed'))
      const onPauseCut = jest.fn()

      const result = await vadSegmentationService.start({
        stream: mockStream,
        onPauseCut,
      })

      expect(result).toBe(false)
      expect(vadSegmentationService.isActive).toBe(false)
    })
  })

  describe('pause detection & chunking rules', () => {
    it('triggers cut when pause detected and chunk duration >= minChunkDurationMs', async () => {
      const onPauseCut = jest.fn()
      let vadCallbacks = {}

      MicVAD.new.mockImplementationOnce((options) => {
        vadCallbacks = options
        return Promise.resolve(mockVadInstance)
      })

      await vadSegmentationService.start({
        stream: mockStream,
        onPauseCut,
        minChunkDurationMs: 3000,
        maxChunkDurationMs: 30000,
      })

      // Simulate speech starting
      vadCallbacks.onSpeechStart()
      expect(vadSegmentationService.hasSpokenInChunk).toBe(true)

      // Advance time by 4 seconds (exceeding min 3s)
      advanceTime(4000)

      // Simulate speech ending (pause detected)
      vadCallbacks.onSpeechEnd()

      expect(onPauseCut).toHaveBeenCalledTimes(1)
    })

    it('delays cut if pause detected before minChunkDurationMs and triggers once min duration reached', async () => {
      const onPauseCut = jest.fn()
      let vadCallbacks = {}

      MicVAD.new.mockImplementationOnce((options) => {
        vadCallbacks = options
        return Promise.resolve(mockVadInstance)
      })

      await vadSegmentationService.start({
        stream: mockStream,
        onPauseCut,
        minChunkDurationMs: 3000,
        maxChunkDurationMs: 30000,
      })

      // Speech starts and ends quickly at 1.5s
      vadCallbacks.onSpeechStart()
      advanceTime(1500)
      vadCallbacks.onSpeechEnd()

      // Pause happened before 3s -> should NOT cut immediately
      expect(onPauseCut).not.toHaveBeenCalled()
      expect(vadSegmentationService.pendingCutAfterMin).toBe(true)

      // Advance to 3.1s and process silent frame
      advanceTime(1600)
      vadCallbacks.onFrameProcessed({ isSpeech: 0.1 })

      // Now it should cut
      expect(onPauseCut).toHaveBeenCalledTimes(1)
    })

    it('enforces 30s hard cap and cuts even during continuous speech', async () => {
      const onPauseCut = jest.fn()
      let vadCallbacks = {}

      MicVAD.new.mockImplementationOnce((options) => {
        vadCallbacks = options
        return Promise.resolve(mockVadInstance)
      })

      await vadSegmentationService.start({
        stream: mockStream,
        onPauseCut,
        minChunkDurationMs: 3000,
        maxChunkDurationMs: 30000,
      })

      // Advance time by 30 seconds
      advanceTime(30000)

      expect(onPauseCut).toHaveBeenCalledTimes(1)
    })
  })

  describe('tab backgrounding & cleanup', () => {
    it('notifies and resets state when notifyChunkStarted is called', async () => {
      const onPauseCut = jest.fn()
      await vadSegmentationService.start({
        stream: mockStream,
        onPauseCut,
        maxChunkDurationMs: 30000,
      })

      vadSegmentationService.hasSpokenInChunk = true
      vadSegmentationService.pendingCutAfterMin = true

      vadSegmentationService.notifyChunkStarted()

      expect(vadSegmentationService.hasSpokenInChunk).toBe(false)
      expect(vadSegmentationService.pendingCutAfterMin).toBe(false)
    })

    it('triggers cut when tab becomes visible and chunk exceeded hard cap', async () => {
      const onPauseCut = jest.fn()
      await vadSegmentationService.start({
        stream: mockStream,
        onPauseCut,
        maxChunkDurationMs: 30000,
      })

      // Simulate 35s passing while hidden
      advanceTime(35000)
      onPauseCut.mockClear()

      // Simulate tab visibility change
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      })
      vadSegmentationService.handleVisibilityChange()

      expect(onPauseCut).toHaveBeenCalledTimes(1)
    })

    it('cleans up resources and disconnects on stop', async () => {
      await vadSegmentationService.start({
        stream: mockStream,
        onPauseCut: jest.fn(),
      })

      await vadSegmentationService.stop()

      expect(mockDestroy).toHaveBeenCalled()
      expect(vadSegmentationService.isActive).toBe(false)
      expect(vadSegmentationService.vadInstance).toBeNull()
    })
  })
})

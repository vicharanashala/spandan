import { createRecordingPipeline } from '../services/recordingPipelineService'
import { convertWebMToWav, transcribeAudio } from '../services/serverTranscriptionService'
jest.mock('../services/serverTranscriptionService', () => ({ convertWebMToWav: jest.fn(), transcribeAudio: jest.fn() }))
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }
let recorders, streams
beforeEach(() => {
  jest.useFakeTimers(); recorders = []; streams = []
  global.MediaRecorder = class {
    static isTypeSupported() { return true }
    constructor() { this.state = 'inactive'; this.mimeType = 'audio/webm'; recorders.push(this) }
    start() { this.state = 'recording' }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['x'.repeat(6000)]) }); this.onstop?.() }
  }
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: jest.fn(async () => { const track = { stop: jest.fn() }; streams.push(track); return { getTracks: () => [track] } }) } })
  convertWebMToWav.mockReset().mockResolvedValue(new Blob(['wav']))
  transcribeAudio.mockReset().mockResolvedValue({ text: 'speech' })
})
afterEach(() => jest.useRealTimers())
test('failed windows settle empty and the next window keeps recording', async () => {
  const onTranscription = jest.fn(), onError = jest.fn()
  transcribeAudio.mockRejectedValueOnce(new Error('failed'))
  const pipeline = createRecordingPipeline({ metadata: {}, onTranscription, onError })
  await pipeline.startRecording(); jest.advanceTimersByTime(10000); await flush()
  expect(onTranscription).toHaveBeenCalledWith(0, '')
  expect(recorders).toHaveLength(2)
  jest.advanceTimersByTime(10000); await flush()
  expect(onTranscription).toHaveBeenCalledWith(1, 'speech')
  await pipeline.dispose(); expect(streams[0].stop).toHaveBeenCalled()
})
test('late microphone permission after disposal stops its tracks and creates no recorder', async () => {
  let resolve
  const track = { stop: jest.fn() }
  navigator.mediaDevices.getUserMedia.mockReturnValueOnce(new Promise(r => { resolve = r }))
  const pipeline = createRecordingPipeline({ metadata: {} })
  const start = pipeline.startRecording(); await pipeline.dispose()
  resolve({ getTracks: () => [track] }); await start
  expect(track.stop).toHaveBeenCalled(); expect(recorders).toHaveLength(0)
})
test('stale stop callbacks cannot restart or clear the newer recorder timer', async () => {
  let finish
  transcribeAudio.mockReturnValueOnce(new Promise(r => { finish = r }))
  const onTranscription = jest.fn()
  const pipeline = createRecordingPipeline({ metadata: {}, onTranscription })
  await pipeline.startRecording(); jest.advanceTimersByTime(10000); await flush()
  const stop = pipeline.stopRecording()
  await pipeline.startRecording()
  expect(recorders).toHaveLength(2)
  finish({ text: 'old final window' }); await stop; await flush()
  expect(recorders).toHaveLength(2)
  jest.advanceTimersByTime(10000); await flush()
  expect(recorders).toHaveLength(3)
  await pipeline.dispose()
})
test('revocation during conversion prevents audio upload and result callbacks', async () => {
  let resolve
  convertWebMToWav.mockReturnValueOnce(new Promise(r => { resolve = r }))
  const onTranscription = jest.fn()
  const pipeline = createRecordingPipeline({ metadata: {}, onTranscription })
  await pipeline.startRecording(); jest.advanceTimersByTime(10000); await flush()
  const disposed = pipeline.dispose(); resolve(new Blob(['wav'])); await disposed
  expect(transcribeAudio).not.toHaveBeenCalled(); expect(onTranscription).not.toHaveBeenCalled(); expect(recorders).toHaveLength(1)
})

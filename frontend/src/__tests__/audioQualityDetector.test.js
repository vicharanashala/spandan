import { createAudioQualityDetector, DEFAULT_CONFIG } from '../services/audioQualityDetector';

describe('AudioQualityDetector', () => {
  let mockAudioContext;
  let mockAnalyser;
  let mockSource;
  let mockStream;
  let timeDomainData;
  let systemTime;

  beforeEach(() => {
    timeDomainData = new Float32Array(2048);

    mockAnalyser = {
      fftSize: 2048,
      connect: jest.fn(),
      disconnect: jest.fn(),
      getFloatTimeDomainData: jest.fn((array) => {
        array.set(timeDomainData);
      })
    };

    mockSource = {
      connect: jest.fn(),
      disconnect: jest.fn()
    };

    mockAudioContext = {
      createMediaStreamSource: jest.fn().mockReturnValue(mockSource),
      createAnalyser: jest.fn().mockReturnValue(mockAnalyser),
      close: jest.fn().mockResolvedValue()
    };

    global.AudioContext = jest.fn().mockImplementation(() => mockAudioContext);
    global.webkitAudioContext = jest.fn().mockImplementation(() => mockAudioContext);

    mockStream = {};
    jest.useFakeTimers();

    systemTime = 1000000;
    jest.spyOn(Date, 'now').mockImplementation(() => systemTime);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    jest.useRealTimers();
    delete global.AudioContext;
    delete global.webkitAudioContext;
  });

  it('should initialize with default config when none is provided', () => {
    expect(DEFAULT_CONFIG).toBeDefined();
    expect(DEFAULT_CONFIG.volumeThreshold).toBe(0.015);
    expect(DEFAULT_CONFIG.muteThreshold).toBe(0.002);
    expect(DEFAULT_CONFIG.muteDurationMs).toBe(4000);
    expect(DEFAULT_CONFIG.noiseThreshold).toBe(0.25);
  });

  it('should run quality checks at the specified interval', () => {
    const onIssue = jest.fn();
    const detector = createAudioQualityDetector(mockStream, {
      onIssue,
      intervalMs: 300
    });

    detector.start();
    expect(global.AudioContext).toHaveBeenCalled();
    expect(mockAudioContext.createAnalyser).toHaveBeenCalled();
    expect(mockSource.connect).toHaveBeenCalledWith(mockAnalyser);

    // Initial check hasn't run the interval check yet
    jest.advanceTimersByTime(299);
    expect(mockAnalyser.getFloatTimeDomainData).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(mockAnalyser.getFloatTimeDomainData).toHaveBeenCalledTimes(1);

    detector.stop();
  });

  it('should transition to low_volume when RMS is below volumeThreshold but above muteThreshold', () => {
    const onIssue = jest.fn();
    const onClear = jest.fn();

    const detector = createAudioQualityDetector(mockStream, {
      onIssue,
      onClear,
      intervalMs: 300,
      volumeThreshold: 0.015,
      muteThreshold: 0.002
    });

    detector.start();

    // Constant buffer value of 0.005 gives RMS = 0.005
    timeDomainData.fill(0.005);

    jest.advanceTimersByTime(300);

    expect(onIssue).toHaveBeenCalledWith({
      type: 'low_volume',
      message: 'Your microphone volume seems low.'
    });
    expect(onClear).not.toHaveBeenCalled();

    detector.stop();
  });

  it('should transition to muted when RMS is near-zero for sustained duration', () => {
    const onIssue = jest.fn();
    const onClear = jest.fn();

    const detector = createAudioQualityDetector(mockStream, {
      onIssue,
      onClear,
      intervalMs: 300,
      muteThreshold: 0.002,
      muteDurationMs: 1000
    });

    detector.start();

    // Silence buffer
    timeDomainData.fill(0);

    // 300ms
    systemTime += 300;
    jest.advanceTimersByTime(300);
    expect(onIssue).not.toHaveBeenCalled();

    // 600ms
    systemTime += 300;
    jest.advanceTimersByTime(300);
    expect(onIssue).not.toHaveBeenCalled();

    // 900ms
    systemTime += 300;
    jest.advanceTimersByTime(300);
    expect(onIssue).not.toHaveBeenCalled();

    // 1200ms
    systemTime += 300;
    jest.advanceTimersByTime(300);
    expect(onIssue).not.toHaveBeenCalled();

    // 1500ms
    systemTime += 300;
    jest.advanceTimersByTime(300);
    expect(onIssue).toHaveBeenCalledWith({
      type: 'muted',
      message: 'No audio detected. Check your microphone.'
    });

    detector.stop();
  });

  it('should transition to noisy when zero-crossing-rate is high', () => {
    const onIssue = jest.fn();
    const onClear = jest.fn();

    const detector = createAudioQualityDetector(mockStream, {
      onIssue,
      onClear,
      intervalMs: 300,
      volumeThreshold: 0.01,
      noiseThreshold: 0.25
    });

    detector.start();

    // Alternate sign value sequence generates high ZCR: ZCR = 1.0, RMS = 0.02
    for (let i = 0; i < timeDomainData.length; i++) {
      timeDomainData[i] = i % 2 === 0 ? 0.02 : -0.02;
    }

    jest.advanceTimersByTime(300);

    expect(onIssue).toHaveBeenCalledWith({
      type: 'noisy',
      message: 'Background noise is too high.'
    });

    detector.stop();
  });

  it('should clear issues when sound goes back to normal', () => {
    const onIssue = jest.fn();
    const onClear = jest.fn();

    const detector = createAudioQualityDetector(mockStream, {
      onIssue,
      onClear,
      intervalMs: 300,
      volumeThreshold: 0.01,
      noiseThreshold: 0.25
    });

    detector.start();

    // Normal audio: RMS = 0.02, ZCR = 0
    timeDomainData.fill(0.02);

    jest.advanceTimersByTime(300);
    expect(onIssue).not.toHaveBeenCalled();

    // Change to low volume
    timeDomainData.fill(0.005);
    jest.advanceTimersByTime(300);
    expect(onIssue).toHaveBeenCalledWith({
      type: 'low_volume',
      message: 'Your microphone volume seems low.'
    });

    // Change back to normal audio
    timeDomainData.fill(0.02);
    jest.advanceTimersByTime(300);
    expect(onClear).toHaveBeenCalled();

    detector.stop();
  });

  it('should clean up AudioContext, source node and analyser node on stop', () => {
    const detector = createAudioQualityDetector(mockStream);
    detector.start();
    detector.stop();

    expect(mockSource.disconnect).toHaveBeenCalled();
    expect(mockAnalyser.disconnect).toHaveBeenCalled();
    expect(mockAudioContext.close).toHaveBeenCalled();
  });

  it('should support multiple start and stop cycles cleanly without errors', () => {
    const detector = createAudioQualityDetector(mockStream, { intervalMs: 300 });

    // Cycle 1
    detector.start();
    expect(global.AudioContext).toHaveBeenCalledTimes(1);
    detector.stop();

    // Cycle 2
    detector.start();
    expect(global.AudioContext).toHaveBeenCalledTimes(2);
    detector.stop();
  });
});

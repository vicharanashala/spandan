const mockList = jest.fn();

jest.mock('yt-caption-kit', () => {
  return {
    YtCaptionKit: jest.fn().mockImplementation(() => {
      return {
        list: mockList
      };
    })
  };
});

import { getYouTubeId, fetchYoutubeTranscript } from '../services/youtubeTranscriptService.js';
import { getTranscriptProvider } from '../services/transcriptProvider.js';
import { VideoTranscriptCoordinator } from '../services/videoTranscriptCoordinator.js';

// Mock the global fetch
const originalFetch = global.fetch;

describe('YouTube Transcript URL Parser', () => {
  test('should extract 11-char Video ID correctly from various formats', () => {
    expect(getYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(getYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(getYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(getYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s')).toBe('dQw4w9WgXcQ');
    expect(getYouTubeId('invalid-url')).toBeNull();
  });
});

describe('Transcript Provider Abstraction', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    mockList.mockReset();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('should retrieve youtube provider and parse captions using yt-caption-kit when successful', async () => {
    const mockToRawData = jest.fn().mockReturnValue([
      { start: 0, duration: 4, text: 'Hello world!' },
      { start: 5, duration: 2, text: 'Next slide.' }
    ]);
    const mockFetchTrack = jest.fn().mockResolvedValue({
      toRawData: mockToRawData,
      languageCode: 'en'
    });
    mockList.mockResolvedValue([
      { languageCode: 'en', fetch: mockFetchTrack }
    ]);

    const provider = getTranscriptProvider('youtube');
    expect(provider).toBeDefined();

    const transcript = await provider.getTranscript('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(transcript).toHaveLength(2);
    expect(transcript[0]).toEqual({ start: 0, duration: 4, text: 'Hello world!' });
    expect(transcript[1]).toEqual({ start: 5, duration: 2, text: 'Next slide.' });
  });

  test('should fallback to custom scraper and parse json3 correctly when yt-caption-kit fails', async () => {
    mockList.mockRejectedValue(new Error('Mock caption kit failure'));

    // Mock HTML watch page and json3 caption endpoint response for the fallback scraper
    const mockHtml = 'var ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"https://youtube.com/captions-endpoint","languageCode":"en"}]}}};';
    const mockCaptionsJson = {
      events: [
        { tStartMs: 0, dDurationMs: 4000, segs: [{ utf8: 'Hello' }, { utf8: ' world!' }] },
        { tStartMs: 5000, dDurationMs: 2000, segs: [{ utf8: 'Next slide.' }] }
      ]
    };

    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockHtml)
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockCaptionsJson)
      });

    const provider = getTranscriptProvider('youtube');
    const transcript = await provider.getTranscript('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(transcript).toHaveLength(2);
    expect(transcript[0]).toEqual({ start: 0, duration: 4, text: 'Hello world!' });
    expect(transcript[1]).toEqual({ start: 5, duration: 2, text: 'Next slide.' });
  });
});

describe('VideoTranscriptCoordinator logic', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    mockList.mockReset();
    VideoTranscriptCoordinator.clearTranscript('test-room-1');
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('should initialize, status-check, process playhead, and prevent seeks backward regression using yt-caption-kit', async () => {
    const mockToRawData = jest.fn().mockReturnValue([
      { start: 0, duration: 4, text: 'Welcome everyone.' },
      { start: 10, duration: 5, text: 'This is the first segment.' },
      { start: 130, duration: 3, text: 'This starts the second segment.' }
    ]);
    const mockFetchTrack = jest.fn().mockResolvedValue({
      toRawData: mockToRawData,
      languageCode: 'en'
    });
    mockList.mockResolvedValue([
      { languageCode: 'en', fetch: mockFetchTrack }
    ]);

    // Initialize transcript cache for room
    const initRes = await VideoTranscriptCoordinator.initializeTranscript('test-room-1', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(initRes.hasCaptions).toBe(true);

    const status = VideoTranscriptCoordinator.getTranscriptStatus('test-room-1');
    expect(status.hasCaptions).toBe(true);

    // Segment size is 2 min (120s)
    let result = VideoTranscriptCoordinator.processPlayback('test-room-1', 30, 2);
    expect(result.shouldGenerate).toBe(false);

    result = VideoTranscriptCoordinator.processPlayback('test-room-1', 125, 2);
    expect(result.shouldGenerate).toBe(true);
    expect(result.transcript).toBe('Welcome everyone. This is the first segment.');
    expect(result.startIndex).toBe(0);
    expect(result.endIndex).toBe(1);

    VideoTranscriptCoordinator.updateProcessedIndex('test-room-1', 1);

    result = VideoTranscriptCoordinator.processPlayback('test-room-1', 125, 2);
    expect(result.shouldGenerate).toBe(false);

    result = VideoTranscriptCoordinator.processPlayback('test-room-1', 15, 2);
    expect(result.shouldGenerate).toBe(false);

    result = VideoTranscriptCoordinator.processPlayback('test-room-1', 260, 2);
    expect(result.shouldGenerate).toBe(true);
    expect(result.transcript).toBe('This starts the second segment.');
    expect(result.startIndex).toBe(2);
    expect(result.endIndex).toBe(2);

    VideoTranscriptCoordinator.clearTranscript('test-room-1');
    const statusClear = VideoTranscriptCoordinator.getTranscriptStatus('test-room-1');
    expect(statusClear.hasCaptions).toBe(false);
  });

  test('should fallback to custom scraper end-to-end when yt-caption-kit fails during coordinator initialization', async () => {
    mockList.mockRejectedValue(new Error('Mock caption kit failure'));

    const mockHtml = 'var ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"baseUrl":"https://youtube.com/captions-endpoint","languageCode":"en"}]}}};';
    const mockCaptionsJson = {
      events: [
        { tStartMs: 0, dDurationMs: 4000, segs: [{ utf8: 'Welcome everyone.' }] },
        { tStartMs: 10000, dDurationMs: 5000, segs: [{ utf8: 'This is the first segment.' }] },
        { tStartMs: 130000, dDurationMs: 3000, segs: [{ utf8: 'This starts the second segment.' }] }
      ]
    };

    global.fetch
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(mockHtml) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockCaptionsJson) });

    const initRes = await VideoTranscriptCoordinator.initializeTranscript('test-room-1', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(initRes.hasCaptions).toBe(true);

    const status = VideoTranscriptCoordinator.getTranscriptStatus('test-room-1');
    expect(status.hasCaptions).toBe(true);

    let result = VideoTranscriptCoordinator.processPlayback('test-room-1', 125, 2);
    expect(result.shouldGenerate).toBe(true);
    expect(result.transcript).toBe('Welcome everyone. This is the first segment.');

    VideoTranscriptCoordinator.clearTranscript('test-room-1');
  });

  test('should compute getSegmentTranscript, getSegmentStatus, and commitSegment correctly', async () => {
    const mockToRawData = jest.fn().mockReturnValue([
      { start: 0, duration: 4, text: 'Welcome everyone.' },
      { start: 10, duration: 5, text: 'This is the first segment.' },
      { start: 130, duration: 3, text: 'This starts the second segment.' }
    ]);
    const mockFetchTrack = jest.fn().mockResolvedValue({
      toRawData: mockToRawData,
      languageCode: 'en'
    });
    mockList.mockResolvedValue([
      { languageCode: 'en', fetch: mockFetchTrack }
    ]);

    await VideoTranscriptCoordinator.initializeTranscript('test-room-2', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    // Test getSegmentTranscript at 15s
    let text = VideoTranscriptCoordinator.getSegmentTranscript('test-room-2', 15);
    expect(text).toBe('Welcome everyone. This is the first segment.');

    // Test getSegmentStatus at 15s (2 min segment = 120s)
    // firstCaption starts at 0s, currentTime is 15s. elapsed = 15s. timeLeft = 120 - 15 = 105s.
    let status = VideoTranscriptCoordinator.getSegmentStatus('test-room-2', 15, 2);
    expect(status.timeLeft).toBe(105);
    expect(status.firstCaptionStart).toBe(0);

    // Commit segment at 125s (which matches index 0 and 1)
    VideoTranscriptCoordinator.commitSegment('test-room-2', 125);

    // After commit, getSegmentTranscript at 135s should only return the second segment caption
    text = VideoTranscriptCoordinator.getSegmentTranscript('test-room-2', 135);
    expect(text).toBe('This starts the second segment.');

    // getSegmentStatus at 135s
    // firstCaption is now the third caption starting at 130s. elapsed = 135 - 130 = 5s. timeLeft = 120 - 5 = 115s.
    status = VideoTranscriptCoordinator.getSegmentStatus('test-room-2', 135, 2);
    expect(status.timeLeft).toBe(115);
    expect(status.firstCaptionStart).toBe(130);

    VideoTranscriptCoordinator.clearTranscript('test-room-2');
  });
});

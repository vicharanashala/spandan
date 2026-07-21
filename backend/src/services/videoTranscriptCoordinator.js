import { getTranscriptProvider } from './transcriptProvider.js';

// Cache map: roomId (string) -> { transcript, hasCaptions, lastProcessedCaptionIndex, initializedAt, provider }
const transcriptCache = new Map();

export const VideoTranscriptCoordinator = {
  /**
   * Fetches and caches a transcript for a room's media URL
   */
  async initializeTranscript(roomId, url, providerName = 'youtube') {
    const rId = String(roomId);
    if (!url) {
      transcriptCache.delete(rId);
      return { hasCaptions: false };
    }

    try {
      const provider = getTranscriptProvider(providerName);
      const transcript = await provider.getTranscript(url);

      if (transcript && transcript.length > 0) {
        transcriptCache.set(rId, {
          transcript,
          hasCaptions: true,
          lastProcessedCaptionIndex: -1,
          initializedAt: Date.now(),
          provider: providerName
        });
        return { hasCaptions: true };
      }
    } catch (error) {
      console.error(`[VideoTranscriptCoordinator] Failed to retrieve transcript for room ${roomId}:`, error.message);
    }

    // Fallback: mark transcript as unavailable but cache it to prevent repeated downloads
    transcriptCache.set(rId, {
      transcript: [],
      hasCaptions: false,
      lastProcessedCaptionIndex: -1,
      initializedAt: Date.now(),
      provider: providerName
    });
    return { hasCaptions: false };
  },

  /**
   * Clears the transcript cache for a room
   */
  clearTranscript(roomId) {
    transcriptCache.delete(String(roomId));
  },

  /**
   * Checks if a cached transcript has captions
   */
  getTranscriptStatus(roomId) {
    const entry = transcriptCache.get(String(roomId));
    return {
      hasCaptions: !!(entry && entry.hasCaptions)
    };
  },

  /**
   * Processes a playback update.
   * Compares playhead progression to determine if a full segment boundary has been crossed,
   * returning whether generation should occur along with the text slice.
   */
  processPlayback(roomId, currentTime, segmentTime = 2) {
    const entry = transcriptCache.get(String(roomId));
    if (!entry || !entry.hasCaptions || entry.transcript.length === 0) {
      return { shouldGenerate: false };
    }

    const intervalSec = segmentTime * 60;
    const firstUnprocessedIdx = entry.lastProcessedCaptionIndex + 1;
    if (firstUnprocessedIdx >= entry.transcript.length) {
      return { shouldGenerate: false };
    }

    // Collect all newly reached captions where start <= currentTime
    const newlyReached = [];
    let lastIndex = entry.lastProcessedCaptionIndex;

    for (let i = firstUnprocessedIdx; i < entry.transcript.length; i++) {
      const caption = entry.transcript[i];
      if (caption.start <= currentTime) {
        newlyReached.push(caption);
        lastIndex = i;
      } else {
        break; // Captions are sorted by start time
      }
    }

    if (newlyReached.length === 0) {
      return { shouldGenerate: false };
    }

    const firstCaption = newlyReached[0];
    const timeSpan = currentTime - firstCaption.start;

    // Trigger if the playback duration span of these new captions meets the configured segment size
    if (timeSpan >= intervalSec) {
      const text = newlyReached.map(c => c.text).join(' ').trim();
      return {
        shouldGenerate: true,
        transcript: text,
        startIndex: firstUnprocessedIdx,
        endIndex: lastIndex
      };
    }

    return { shouldGenerate: false };
  },

  /**
   * Advances the progress marker upon successful question generation
   */
  updateProcessedIndex(roomId, index) {
    const entry = transcriptCache.get(String(roomId));
    if (entry) {
      entry.lastProcessedCaptionIndex = index;
    }
  },

  /**
   * Returns all newly reached captions text up to currentTime
   */
  getSegmentTranscript(roomId, currentTime) {
    const entry = transcriptCache.get(String(roomId));
    if (!entry || !entry.hasCaptions || entry.transcript.length === 0) {
      return '';
    }

    const firstUnprocessedIdx = entry.lastProcessedCaptionIndex + 1;
    if (firstUnprocessedIdx >= entry.transcript.length) {
      return '';
    }

    const newlyReached = [];
    for (let i = firstUnprocessedIdx; i < entry.transcript.length; i++) {
      const caption = entry.transcript[i];
      if (caption.start <= currentTime) {
        newlyReached.push(caption);
      } else {
        break; // Captions are sorted by start time
      }
    }

    return newlyReached.map(c => c.text).join(' ').trim();
  },

  /**
   * Returns the segment remaining duration (timeLeft) and the first caption start time
   */
  getSegmentStatus(roomId, currentTime, segmentTime = 2) {
    const entry = transcriptCache.get(String(roomId));
    const intervalSec = segmentTime * 60;
    
    if (!entry || !entry.hasCaptions || entry.transcript.length === 0) {
      return { timeLeft: intervalSec, firstCaptionStart: 0 };
    }

    const firstUnprocessedIdx = entry.lastProcessedCaptionIndex + 1;
    if (firstUnprocessedIdx >= entry.transcript.length) {
      return { timeLeft: intervalSec, firstCaptionStart: currentTime };
    }

    const firstCaption = entry.transcript[firstUnprocessedIdx];
    const elapsed = currentTime - firstCaption.start;
    const timeLeft = Math.max(0, intervalSec - elapsed);

    return {
      timeLeft: Math.round(timeLeft),
      firstCaptionStart: firstCaption.start
    };
  },

  /**
   * Advances the last processed index to the caption matching currentTime
   */
  commitSegment(roomId, currentTime) {
    const entry = transcriptCache.get(String(roomId));
    if (!entry || !entry.hasCaptions || entry.transcript.length === 0) {
      return;
    }

    let lastIndex = entry.lastProcessedCaptionIndex;
    for (let i = entry.lastProcessedCaptionIndex + 1; i < entry.transcript.length; i++) {
      const caption = entry.transcript[i];
      if (caption.start <= currentTime) {
        lastIndex = i;
      } else {
        break; // Captions are sorted by start time
      }
    }

    entry.lastProcessedCaptionIndex = lastIndex;
  }
};

import { YtCaptionKit } from 'yt-caption-kit';

export function getYouTubeId(url) {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

export async function fetchYoutubeTranscript(url) {
  const videoId = getYouTubeId(url);
  if (!videoId) {
    throw new Error('Invalid YouTube URL');
  }

  try {
    const api = new YtCaptionKit();
    const transcriptList = await api.list(videoId);
    const transcripts = [...transcriptList];

    if (transcripts.length > 0) {
      const chosenTranscript = transcripts.find(t => t.languageCode === 'en') ||
                               transcripts.find(t => t.languageCode.startsWith('en-')) ||
                               transcripts[0];

      const fetched = await chosenTranscript.fetch();
      const rawData = fetched.toRawData();

      return rawData.map(item => ({
        start: Math.round(item.start),
        duration: Math.round(item.duration),
        text: item.text.replace(/\s+/g, ' ').trim()
      })).filter(item => item.text.length > 0);
    }
  } catch (e) {
    console.warn('[youtubeTranscriptService] yt-caption-kit failed, falling back to scraper:', e.message);
  }

  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const response = await fetch(watchUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch YouTube page: status ${response.status}`);
  }

  const html = await response.text();

  // Search for playerResponse JSON containing captions
  const match = html.match(/ytInitialPlayerResponse\s*=\s*({.+?})\s*;\s*(?:var\s+(?:meta|head)|<\/script|\n)/) ||
                html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/) ||
                html.match(/ytInitialPlayerResponse\s*=\s*({.+?})\s*$/m);

  if (!match) {
    throw new Error('Captions unavailable or video is private/deleted.');
  }

  const playerResponse = JSON.parse(match[1]);
  const captions = playerResponse?.captions?.playerCaptionsTracklistRenderer;
  if (!captions || !captions.captionTracks || captions.captionTracks.length === 0) {
    throw new Error('Captions are disabled or unavailable for this video.');
  }

  // Find English track first, or fall back to first track
  const track = captions.captionTracks.find(t => t.languageCode === 'en') || captions.captionTracks[0];
  if (!track || !track.baseUrl) {
    throw new Error('No caption track URL found.');
  }

  // Fetch the json3 format captions
  const captionResponse = await fetch(`${track.baseUrl}&fmt=json3`);
  if (!captionResponse.ok) {
    throw new Error('Failed to retrieve captions from YouTube.');
  }

  const captionData = await captionResponse.json();
  if (!captionData || !captionData.events) {
    throw new Error('Caption data format is unsupported.');
  }

  const transcript = [];
  for (const event of captionData.events) {
    if (!event.segs) continue;
    const text = event.segs.map(s => s.utf8).join('').trim();
    if (!text) continue;

    transcript.push({
      start: Math.round((event.tStartMs || 0) / 1000),
      duration: Math.round((event.dDurationMs || 0) / 1000),
      text
    });
  }

  return transcript;
}

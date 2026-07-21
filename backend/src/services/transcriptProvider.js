export class TranscriptProvider {
  async getTranscript(source) {
    throw new Error('getTranscript must be implemented');
  }
}

export class YouTubeTranscriptProvider extends TranscriptProvider {
  async getTranscript(url) {
    const { fetchYoutubeTranscript } = await import('./youtubeTranscriptService.js');
    return fetchYoutubeTranscript(url);
  }
}

const providers = {
  youtube: new YouTubeTranscriptProvider()
};

export function getTranscriptProvider(name) {
  const provider = providers[name];
  if (!provider) {
    throw new Error(`Transcript provider not supported: ${name}`);
  }
  return provider;
}

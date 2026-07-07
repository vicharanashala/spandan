let mediaRecorder;
let recordedChunks = [];
const CHUNK_INTERVAL_MS = 5000; // 5 seconds per chunk
const BACKEND_UPLOAD_URL = 'http://localhost:3001/api/transcripts/chunk'; // Assuming this endpoint for the Whisper transcription pipeline

chrome.runtime.onMessage.addListener(async (message) => {
  if (message.target !== 'offscreen') return;

  if (message.type === 'START_RECORDING') {
    startRecording(message.streamId);
  } else if (message.type === 'STOP_RECORDING') {
    stopRecording();
  }
});

async function startRecording(streamId) {
  if (mediaRecorder && mediaRecorder.state === 'recording') return;

  try {
    // In MV3, we get the stream using getUserMedia with chromeMediaSource
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: streamId
        }
      },
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: streamId
        }
      }
    });

    mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });

    mediaRecorder.ondataavailable = async (event) => {
      if (event.data && event.data.size > 0) {
        console.log(`Captured chunk of size: ${event.data.size}`);
        await uploadChunk(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      console.log('Recording stopped. Tracks closed.');
      stream.getTracks().forEach(track => track.stop());
    };

    // Start recording, firing ondataavailable every CHUNK_INTERVAL_MS
    mediaRecorder.start(CHUNK_INTERVAL_MS);
    console.log('Recording started in offscreen document.');
  } catch (error) {
    console.error('Error starting screen recording:', error);
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
}

async function uploadChunk(blobChunk) {
  try {
    const formData = new FormData();
    formData.append('file', blobChunk, `chunk-${Date.now()}.webm`);
    formData.append('timestamp', Date.now().toString());

    // Send chunk to backend
    const response = await fetch(BACKEND_UPLOAD_URL, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      console.error('Failed to upload chunk:', await response.text());
    } else {
      console.log('Successfully uploaded media chunk.');
    }
  } catch (error) {
    console.error('Network error uploading chunk:', error);
  }
}

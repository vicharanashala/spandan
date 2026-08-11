#!/usr/bin/env python3
"""
Faster Whisper Transcription Server
Runs as a SEPARATE process from the Node API so heavy speech-to-text inference
never blocks the Node event loop. The Node backend proxies /api/transcription/*
requests here. Loads the model once at startup.

Scalability notes:
- ThreadingHTTPServer accepts concurrent connections (requests are not dropped
  while one is in flight).
- A single WhisperModel instance is not safe for concurrent transcribe() calls,
  so a lock serializes the actual inference. To scale further, run multiple
  instances of this server (different PORT) behind the Node proxy / a balancer,
  ideally on a GPU box.
"""

import os
import sys
import base64
import json
import threading
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from faster_whisper import WhisperModel

# Configuration (env-overridable)
HOST = os.environ.get("TRANSCRIPTION_HOST", "127.0.0.1")
PORT = int(os.environ.get("TRANSCRIPTION_PORT", "3003"))
MODEL_SIZE = os.environ.get("TRANSCRIPTION_MODEL", "base")
COMPUTE_TYPE = os.environ.get("TRANSCRIPTION_COMPUTE", "int8")  # int8 = CPU-efficient
DEVICE = os.environ.get("TRANSCRIPTION_DEVICE", "cpu")          # set "cuda" on a GPU box

# Model instance + lock (WhisperModel.transcribe is not concurrency-safe)
model = None
model_lock = threading.Lock()


def load_model():
    """Load Faster Whisper model once at startup."""
    global model
    print(f"Loading Faster Whisper model '{MODEL_SIZE}' ({DEVICE}/{COMPUTE_TYPE})...")
    model = WhisperModel(
        MODEL_SIZE,
        device=DEVICE,
        compute_type=COMPUTE_TYPE,
        download_root=os.path.expanduser("~/.cache/huggingface/hub"),
    )
    print(f"Faster Whisper model '{MODEL_SIZE}' loaded successfully!")
    sys.stdout.flush()


def transcribe_audio(audio_base64: str, sample_rate: int = 16000) -> dict:
    """Transcribe base64-encoded 16-bit PCM (optionally WAV-wrapped) audio."""
    if model is None:
        return {"error": "Model not loaded"}

    try:
        import numpy as np

        audio_bytes = base64.b64decode(audio_base64)

        # Skip a 44-byte WAV header if present ("RIFF"...."WAVE"), else treat as raw PCM.
        if len(audio_bytes) > 44 and audio_bytes[0:4] == b"RIFF" and audio_bytes[8:12] == b"WAVE":
            audio_bytes = audio_bytes[44:]

        audio_int16 = np.frombuffer(audio_bytes, dtype=np.int16)
        audio_float32 = audio_int16.astype(np.float32) / 32768.0

        # Serialize the actual inference (single model instance).
        with model_lock:
            segments, info = model.transcribe(
                audio_float32,
                language="en",
                beam_size=5,
                vad_filter=False,  # keep all audio, including pauses
            )
            # segments is a generator; materialize inside the lock.
            full_text = ""
            segment_list = []
            for segment in segments:
                full_text += segment.text + " "
                segment_list.append({"text": segment.text, "start": segment.start, "end": segment.end})

        return {
            "text": full_text.strip(),
            "segments": segment_list,
            "language": info.language,
            "language_probability": info.language_probability,
        }

    except Exception as e:
        print(f"Transcription error: {e}", file=sys.stderr)
        return {"error": str(e)}


class TranscriptionHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # suppress default per-request logging

    def _json(self, status, payload):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode())

    def do_GET(self):
        if self.path == "/health":
            self._json(200, {"status": "ok", "model": MODEL_SIZE, "loaded": model is not None})
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path != "/transcribe":
            self.send_response(404)
            self.end_headers()
            return
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode("utf-8"))
            audio = data.get("audio", "")
            sample_rate = data.get("sampleRate", 16000)
            if not audio:
                self._json(400, {"error": "No audio provided"})
                return
            result = transcribe_audio(audio, sample_rate)
            print(f"[TRANSCRIBE] bytes={len(audio)} text='{result.get('text', '')[:50]}' "
                  f"lang={result.get('language', '?')}")
            sys.stdout.flush()
            self._json(200, result)
        except Exception as e:
            print(f"Request error: {e}", file=sys.stderr)
            self._json(500, {"error": str(e)})


def run_server():
    load_model()
    server = ThreadingHTTPServer((HOST, PORT), TranscriptionHandler)
    print(f"Transcription server running on http://{HOST}:{PORT}")
    print(f"  POST http://{HOST}:{PORT}/transcribe")
    print(f"  GET  http://{HOST}:{PORT}/health")
    sys.stdout.flush()
    server.serve_forever()


if __name__ == "__main__":
    run_server()

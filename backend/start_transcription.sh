#!/bin/bash
# Start the Faster Whisper transcription server (separate process from the Node API).
# Runs on port 3003 by default; the Node backend proxies /api/transcription/* here so
# speech-to-text inference never blocks the Node event loop.
cd "$(dirname "$0")"
echo "Starting Faster Whisper Transcription Server..."
exec python3 transcription_server.py

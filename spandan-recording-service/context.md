# Recording Service (RS) — Context

## Role
Live audio streaming gateway. Receives audio from teacher clients via WebSocket, streams to AI transcription providers in real time, forwards transcript segments to Translation Service (TS) via gRPC streaming. Never stores audio. Never performs transcription. Never produces transcript-segment-events to Kafka.

## Architecture
- **Presentation**: WebSocket (`/ws/audio/stream`) for binary audio ingestion; REST (`/api/v1/streams`) for stream lifecycle commands
- **Application**: `StreamOrchestrator` — manages active stream registry (ConcurrentHashMap), coordinates provider connection, gRPC forwarding, lifecycle events
- **Domain**: `StreamSession` entity, `StreamStatus` enum (PENDING → STARTING → STREAMING → STOPPED/FAILED/INTERRUPTED), `AudioProvider` port, `TranscriptForwarder` port, `StreamLifecyclePublisher` port
- **Infrastructure**: Deepgram provider (WebSocket), AssemblyAI/Whisper stubs, gRPC client to TS (`TranscriptIngestion` service), Kafka producer for lifecycle events (typed DTOs), JPA/Flyway for stream metadata

## Lifecycle Flow
```
Teacher → POST /api/v1/streams/start
    ↓
orchestrator.startStream() → creates DB record (status=STARTING), emits StreamStarted (Kafka)
    ↓
webSocketHandler.initStreamingSession() → creates AudioProvider + TranscriptForwarder,
    calls forwarder.connect() (gRPC stream to TS), registers active stream,
    calls provider.connect() (WebSocket to AI provider), transitions to STREAMING
    ↓
Teacher WebSocket → /ws/audio/stream (binary audio, 500ms chunks)
    ↓
handleBinaryMessage() → AudioProvider.sendAudio() → AI provider
    ↓
Provider response (transcript segments) → forwardSegment() → GrpcTranscriptForwarder → TS
    ↓
Teacher → POST /api/v1/streams/{id}/stop
    ↓
orchestrator.stopStream() → removes active stream, emits StreamStopped (Kafka)
```

## Events (Produced to `audio-stream-events`)
| Event | DTO | Key Payload |
|-------|-----|-------------|
| `StreamStarted` | `StreamStartedEvent` | sessionId, teacherId, lectureId, audioFormat, provider, status, startedAt |
| `StreamStopped` | `StreamStoppedEvent` | sessionId, teacherId, durationMs, chunksSent, chunksDropped, stoppedAt |
| `StreamInterrupted` | `StreamInterruptedEvent` | sessionId, teacherId, reason |
| `StreamRecovered` | `StreamRecoveredEvent` | sessionId, teacherId |
| `StreamingFailed` | `StreamFailedEvent` | sessionId, teacherId, reason |

## Events (Consumed)
None in v1. RS is a pure producer.

## Key Design Decisions
- **gRPC streaming for transcript segments** — RS→TS bidirectional streaming, lower latency than Kafka for 1:1 producer-consumer pattern
- **REST for commands, Kafka for facts** — `POST /streams/start` and `POST /streams/{id}/stop` are synchronous commands; lifecycle events are async Kafka facts
- **In-memory active stream registry** — `ConcurrentHashMap<UUID, ActiveStream>` in StreamOrchestrator; no Redis, no distributed state
- **DB dedup** — `UNIQUE(session_id)` on `stream_sessions` table prevents duplicate streams
- **No audio storage** — RS is a pure gateway, never writes audio to disk or object store
- **gRPC connect() separated from constructor** — forwarder object created first, connect() called explicitly by factory; if TS is down, stream fails gracefully without crashing initialization
- **Typed Kafka DTOs** — 5 event-specific POJOs (`StreamStartedEvent`, `StreamStoppedEvent`, etc.) for versioning and schema enforcement
- **Security roles** — JWT `role` claim extracted and mapped to `ROLE_TEACHER`/`ROLE_STUDENT`/`ROLE_ADMIN` authority; `@PreAuthorize` checks work correctly
- **Stream status transitions**: PENDING → STARTING → STREAMING → STOPPED (normal), → INTERRUPTED (recoverable), → FAILED (terminal)
- **Provider buffer**: 500ms chunks, max 25s / 50 chunks buffer; backpressure applied when buffer full

## Endpoints
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/streams/start` | TEACHER/ADMIN | Start a new stream session, create provider + gRPC connections |
| POST | `/api/v1/streams/{sessionId}/stop` | TEACHER/ADMIN | Stop an active stream, clean up connections |
| GET | `/api/v1/streams/{sessionId}` | Any authenticated | Get stream status |
| GET | `/api/v1/streams/active` | Any authenticated | Count active streams |

## Tables
- `stream_sessions` — id (PK), session_id (UNIQUE), teacher_id, lecture_id, status, audio_format, provider, ws_endpoint, started_at, stopped_at, duration_ms, chunks_sent, chunks_dropped, error_message, created_at, updated_at

## Dependencies
- PostgreSQL (stream metadata)
- Kafka (lifecycle events via typed DTOs on `audio-stream-events` topic)
- TS gRPC endpoint (transcript segment forwarding via `TranscriptIngestion.StreamTranscript` RPC)
- Deepgram/AssemblyAI/Whisper WebSocket APIs (transcription provider)

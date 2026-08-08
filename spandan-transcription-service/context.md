# Spandan Transcription Service — Context File

## Project Identity
- **System:** Spandan — a classroom engagement platform
- **Service:** Transcription Service (bounded context: Transcript Assembly Context)
- **Architecture:** Clean Architecture layered inside a Spring Boot microservice
- **DB-per-service:** yes — owns `transcription_db` exclusively

## Core Responsibility
Receives real-time transcript segments from Recording Service (RS) via gRPC bidirectional streaming, assembles them into ordered transcripts, stores them (18h TTL), and signals readiness to downstream consumers (Analytics Service, Polling Service, Notification Service on failure). No longer orchestrates AI providers — RS handles that. No longer consumes Kafka from RS — that path is gRPC only.

## Key Architecture Decisions

### AP + Eventual Consistency
No non-reconcilable invariants — transcripts are immutable once written.

| Decision | Implementation |
|---|---|
| Segment ingestion via gRPC | RS pushes `TranscriptSegmentRequest` messages via bidirectional `StreamTranscript` RPC; TS acks with `TranscriptIngestionAck` |
| In-order segment assembly | `sequence_number` in each segment; TS tracks `last_received_sequence` per stream; gaps trigger `TranscriptGenerationFailed` |
| No Redis | Distributed locking was needed only for async provider orchestration — gRPC streaming is 1:1 with RS, no coordination needed |
| No AI provider abstraction | RS now owns the AI provider (Deepgram/AssemblyAI/Whisper); TS receives already-transcribed segments |
| Expiry sweep | `@Scheduled` job runs every 15 min: `DELETE FROM transcripts WHERE expiry_at <= now()` |
| Provider audit trail | `transcription_audit` table logs metadata from RS (actual provider, latency) — immutable, outlives 18h TTL |
| Kafka events fire after DB commit | `@TransactionalEventListener(phase = AFTER_COMMIT)` |

### Why No Redis This Time
- The old `RecordingCompleted` Kafka pattern required distributed locking to prevent redundant provider calls across TS pods
- With gRPC streaming, RS establishes exactly one gRPC stream per session — TS handles each stream on a single pod naturally
- If the TS pod handling a stream crashes, RS detects the gRPC disconnect and can re-establish; no lock needed

### Segment Assembly Strategy
- TS maintains an in-memory `ConcurrentHashMap<UUID, SessionBuffer>` per active stream
- `SessionBuffer` holds received segments, ordered by `sequence_number`, with a configurable max gap tolerance
- Gaps detected → emit `TranscriptGenerationFailed` after configurable timeout
- `is_final` flag from RS signals end-of-stream: flush remaining buffer, persist transcript, emit `TranscriptGenerated`

## Bounded Context: Transcript Assembly Context
**Inside:** Segment ingestion via gRPC, segment ordering and gap detection, transcript storage (18h TTL), expiry/deletion enforcement, provider audit trail
**Outside:** Raw audio/video ingestion and AI provider orchestration (Recording Service), using transcript content to generate questions (Question Generation Service), session/poll/response data (respective owners), identity (Auth Service)

### Anti-Corruption Boundary
- Never accesses another service's database directly
- No other service reads/writes `transcription_db`

## Technical Stack
- **Language:** Java 17
- **Framework:** Spring Boot 3.2.x (Spring Web, Security, Data JPA, Kafka, Scheduler, gRPC server)
- **Database:** PostgreSQL 16 (`transcription_db` schema via Flyway)
- **Messaging:** Kafka 3.6 (producer of `transcription-events`)
- **gRPC:** io.grpc 1.62.x (server for `TranscriptIngestion.StreamTranscript` bidirectional streaming)
- **Testing:** JUnit 5, Mockito, Testcontainers (PostgreSQL + Kafka + gRPC)
- **Build:** Maven 3.9+ (protobuf-maven-plugin for code generation)
- **Deploy:** Docker → Kubernetes (stateless, HPA-scaled)

## Processing Flow
```
RS gRPC stream (TranscriptSegmentRequest) → TS gRPC server
      ↓
Deserialize and validate segment
      ↓
Look up or create SessionBuffer for stream_id
      ↓
Insert segment ordered by sequence_number
      ↓
Detect gaps (missing sequence numbers above tolerance)
      ↓
If gap detected: emit TranscriptGenerationFailed, close stream
      ↓
If is_final: flush buffer, persist transcript (expiry = now + 18h)
      ↓
Send TranscriptIngestionAck (last_received_sequence, accepted)
      ↓
Publish TranscriptGenerated (Kafka → AS, PS)
      ↓
Log to transcription_audit
```

## API Surface
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/v1/transcripts/session/{sessionId}` | TEACHER/ADMIN | Get full transcript by session |
| GET | `/api/v1/transcripts/session/{sessionId}/status` | TEACHER/ADMIN | Get processing status |
| DELETE | `/api/v1/transcripts/{transcriptId}` | ADMIN | Manual early deletion |

## Domain Model
```
Transcript: id (UUID), sessionId (UUID), streamId (UUID), transcriptText (TEXT),
            processingStatus (PENDING|IN_PROGRESS|COMPLETED|FAILED),
            totalSegments (INT), totalDurationMs (BIGINT),
            failureReason (VARCHAR, nullable),
            createdAt (TIMESTAMPTZ), expiryAt (TIMESTAMPTZ)

SessionBuffer (in-memory, not persisted):
            streamId, segments[], lastReceivedSequence, gapDetected, createdAt

TranscriptionAudit: auditId (UUID), transcriptId (UUID), provider (VARCHAR),
                    totalSegments (INT), totalDurationMs (BIGINT),
                    timestamp (TIMESTAMPTZ)
```

## gRPC Contract
- **Service:** `TranscriptIngestion` (defined in shared proto)
- **RPC:** `StreamTranscript(stream TranscriptSegmentRequest) returns (stream TranscriptIngestionAck)`
- **Server:** TS implements the service; RS is the client
- **Proto location:** `spandan-recording-service/src/main/proto/transcript_ingestion.proto`
- **Code gen:** TS runs `protobuf-maven-plugin` targeting same proto (or shared proto artifact in future)

## Kafka Events Consumed
None via Kafka from RS. TS consumes only via gRPC streaming.

## Kafka Events Produced
| Event | Trigger | Consumers |
|---|---|---|
| `TranscriptGenerated` | All segments received and assembled | Analytics Service, Polling Service |
| `TranscriptGenerationFailed` | Gap detected or stream interrupted | Notification Service |

## DB Tables (Flyway)
```
V1__create_transcripts_table.sql
V2__create_transcription_audit_table.sql
```
- `transcripts`: `UNIQUE(session_id)` — one transcript per session
- `transcription_audit`: immutable append-only

## In-Memory Session State
- TS maintains `ConcurrentHashMap<UUID, SessionBuffer>` for active gRPC streams
- Each `SessionBuffer` holds received segments keyed by `sequence_number` (TreeMap or sorted list)
- Max gap tolerance: 5 consecutive missing sequences (configurable)
- Gap timeout: 30s without gap-filling (configurable) — triggers `TranscriptGenerationFailed`
- Buffer cleaned up on: COMPLETED (flush + persist), FAILED (emit event), or gRPC stream context cancellation

## Coupling (Minimal, Explicit)
| Dependency | Protocol | Why Necessary |
|---|---|---|
| Authentication Service | REST (sync) | JWT validation per request — role check (TEACHER/ADMIN only) |
| Recording Service | gRPC (bidirectional stream) | Ingest transcript segments; TS is the gRPC server |
| Question Generation Service | Kafka (async produce) + REST (QGS pulls transcript via GET) | Enforces "QGS never talks to transcription provider directly" rule |
| Notification Service | Kafka (async produce) | `TranscriptGenerationFailed` — teacher alert on transcription failure |
| Analytics Service | Kafka (async produce) | `TranscriptGenerated` — trigger analytics processing |
| Polling Service | Kafka (async produce) | `TranscriptGenerated` — trigger quiz generation |

## Environment Variables (Required)
| Variable | Description |
|---|---|
| `TRANSCRIPTION_DB_URL` | PostgreSQL JDBC URL |
| `TRANSCRIPTION_DB_USER` | DB user |
| `TRANSCRIPTION_DB_PASSWORD` | DB password |
| `KAFKA_BOOTSTRAP_SERVERS` | Kafka broker list |
| `AUTH_SERVICE_URL` | Auth service base URL |
| `JWT_SECRET` | Shared secret for JWT validation |
| `TS_GRPC_PORT` | gRPC server port (default 50052) |
| `MAX_GAP_TOLERANCE` | Max missing sequences before gap failure (default 5) |
| `GAP_TIMEOUT_MS` | Wait ms for gap to fill before failure (default 30000) |

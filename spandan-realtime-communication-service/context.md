# Spandan Realtime Communication Service — Context File

## Project Identity
- **System:** Spandan — a classroom engagement analytics platform
- **Service:** Realtime Communication Service (bounded context: Realtime Delivery & Interaction Timing)
- **Architecture:** STOMP-over-WebSocket Spring Boot service
- **DB-per-service:** No PostgreSQL — Redis only for TTL'd connection metadata + interaction timing state + cross-pod pub/sub

## Core Responsibility
Live classroom communication layer and the authoritative owner of the **student interaction lifecycle**. Accepts WebSocket connections, consumes Kafka events from upstream services, fans out to connected clients via STOMP channels. Tracks per-student question display time, detects timeouts, calculates response time, and publishes raw interaction events (`QuestionDisplayedEvent`, `QuestionAnsweredEvent`, `QuestionTimedOutEvent`) to the `interaction-events` topic for downstream consumption by Response Service.

RTC is the **single owner** of interaction timing. No other service calculates response time, detects display timeouts, or knows when a question appeared on a student's screen.

## Interaction Framework Role

RTC owns the **live interaction delivery & timing** stage of the pipeline:

```
Question Generation Service  ←── produces educational metadata
        ↓
  Polling Service  ←── opens/closes polls, sends PollOpenedEvent/PollClosedEvent
        ↓
  Realtime Communication Service  ←── YOU ARE HERE
  ┌─ Broadcasts question to connected students
  ├─ Tracks questionDisplayedAt per student
  ├─ Receives student answer submissions
  ├─ Calculates responseTimeMilliseconds
  ├─ Detects timeouts
  └─ Publishes QuestionDisplayedEvent, QuestionAnsweredEvent, QuestionTimedOutEvent
        ↓
  Response Service  ←── consumes interaction events, stores immutable history
        ↓
  Analytics Service  ←── derives engagement, mastery, knowledge tracing
        ↓
  Reporting Service  ←── generates dashboards, exports
```

RTC is **completely independent** from Question Generation Service, Analytics Service, and Reporting Service. It does not invoke them synchronously or asynchronously.

## Key Architecture Decisions

### AP + CP split for routing — Consistent Split
WebSocket delivery favors availability (AP); routing table and interaction timing must be CP.

| Decision | Implementation |
|---|---|
| Handshake authentication is synchronous REST to Auth Service | Fail closed — unverifiable JWT = 403 before upgrade |
| Cross-pod message relay via Redis Pub/Sub | All pods subscribe to Redis channels |
| Kafka consumer ordering per quiz | Partitioned by `quizId` |
| At-least-once Kafka consumption | Client-side idempotent rendering via `eventId` dedup |
| Connection metadata is TTL'd in Redis | Automatic expiration |
| No message replay on reconnect | Client resyncs via `GET /current` |
| **Interaction timing via Redis sorted sets** | Per-student question display timestamps stored with TTL |
| **Timeout detection via scheduled sweep** | `@Scheduled` every 5s checks Redis for expired questions |
| **Interaction events emitted after DB-independent check** | No DB dependency — pure Redis + Kafka produce |
| **QuestionAnsweredEvent published to interaction-events Kafka topic** | Event-driven — replaces legacy REST answer forwarding |
| **Active poll state in Redis** | `active_poll:{sessionId}` with TTL = poll duration + grace period |

### Interaction Timing Ownership
RTC owns the authoritative display-time clock per student because:
- Only RTC knows when a question actually appeared on a student's screen (WebSocket delivery acknowledgment)
- Only RTC can detect network-level timeouts that differ from server-side poll timeouts
- Offloading timing to Response Service would require round-trip per display event
- Response time formula: `responseTimeMilliseconds = questionAnsweredAt - questionDisplayedAt`
- RTC never calculates correctness — that belongs to Response Service

### CAP Theorem Analysis
| Aspect | Choice | Rationale |
|---|---|---|
| WebSocket delivery | **AP** — tolerate dropped messages; client resyncs on reconnect | Availability > consistency for live delivery |
| Connection metadata (Redis) | **CP** — single Redis node per shard | Lost connections cause zombie state |
| Interaction timing (Redis) | **CP** — single Redis node per question | Duplicate/forked timing corrupts analytics |
| Cross-pod routing (Redis Pub/Sub) | **AP** — fire-and-forget | Lost cross-pod message = one student misses one frame; acceptable |
| Kafka event publication | **AP** — fire-and-forget after timing calculation | DB is authoritative; Kafka loss is tolerable |
| Poll state tracking | **CP** — Redis key per session with TTL | Duplicate poll state would double-broadcast questions |

### Consistency Model
- **Strong consistency** for active poll state: single Redis key per session, TTL-based expiration
- **Eventual consistency** for interaction events: Kafka at-least-once delivery; consumers deduplicate by eventId
- **Read-your-writes**: student's `question-display-ack` → `QuestionDisplayedEvent` published within same request context

### Event Ordering Guarantees
- **Per-question ordering**: Kafka partition keyed by `questionId` ensures `QuestionDisplayedEvent` → `QuestionAnsweredEvent` / `QuestionTimedOutEvent` order
- **Per-student ordering**: `studentId` incorporated in event payload; consumers order by `eventTimestamp`
- **No ordering across different questions**: Independent — response time for question A is unaffected by question B

## Bounded Context: Realtime Delivery + Interaction Timing
**Inside:** Connection lifecycle, channel subscription routing, message fan-out, delivery acknowledgment, per-student question display timing, response time calculation, timeout detection, interaction event publication
**Outside:** Question/poll content, answer correctness, scoring, analytics, interaction history storage (Response Service), educational hierarchy management

## Technical Stack
- Java 17, Spring Boot 3.2.x (WebSocket, STOMP, Security, Kafka, Redis, Scheduler)
- Kafka 3.6 (consume: `polling-events`, `analytics-events`, `notification-events`; produce: `connection-events`, `interaction-events`)
- Redis 7 (connection metadata TTL, Pub/Sub for cross-pod relay, sorted sets for timing state, active poll state)
- Testing: JUnit 5, Mockito, Testcontainers (Kafka + Redis)

## WebSocket Channels

### Existing (unchanged)
| Channel | Direction | Purpose |
|---|---|---|
| `/topic/quiz/{quizId}` | Broadcast | Live poll events |
| `/topic/quiz/{quizId}/teacher` | Broadcast | Per-question teacher stats |
| `/user/{userId}/queue/result` | Unicast | Individual answer result |
| `/topic/quiz/{quizId}/leaderboard` | Broadcast | Live ranking updates |
| `/user/{userId}/queue/notifications` | Unicast | Personal notifications |
| `/topic/quiz/{quizId}/notifications` | Broadcast | Quiz-scoped notifications |
| `/app/submit-answer` | Inbound | Student answer submission |
| `/app/activity-ack` | Inbound | Client-side activity detection ack |

### New
| Channel | Direction | Purpose |
|---|---|---|
| `/topic/question/{questionId}` | Broadcast | Per-question delivery from PollOpenedEvent/PollClosedEvent |
| `/app/question-display-ack` | Inbound | Student acknowledges question displayed on screen |

## Kafka Topics Consumed
| Topic | Events | Producer | Purpose |
|---|---|---|---|
| `polling-events` | `PollOpenedEvent`, `PollClosedEvent`, `PollStarted` (legacy), `PollEnded` (legacy) | Polling Service | Question delivery trigger |
| `analytics-events` | `TeacherAnalyticsReady`, `LeaderboardGenerated`, etc. | Analytics Service | Broadcast analytics results |
| `notification-events` | `NotificationCreated` | Notification Service | Broadcast notifications |

### PollOpenedEvent Consumption
When RTC consumes `PollOpenedEvent`, it:
1. Stores active poll state in Redis (`active_poll:{sessionId}` with TTL = pollDuration + 30s grace)
2. Broadcasts question metadata to `/topic/question/{questionId}`
3. Broadcasts to `/topic/quiz/{quizId}` (legacy)

When RTC consumes `PollClosedEvent`, it:
1. Removes active poll state from Redis
2. Broadcasts to `/topic/question/{questionId}` (close signal)
3. Broadcasts to `/topic/quiz/{quizId}` (legacy)

## Kafka Topics Produced

### Connection events (existing — `connection-events` topic)
`StudentConnected`, `StudentDisconnected`, `TeacherConnected`, `TeacherDisconnected`, `SocketDeliveryFailed`, `StudentResponseReceived`

### Interaction events (new — `interaction-events` topic)
| Event | Trigger | Key | Consumers |
|---|---|---|---|
| `QuestionDisplayedEvent` | Student acknowledges via `/app/question-display-ack` | `questionId` | Response Service |
| `QuestionAnsweredEvent` | Student submits via `/app/submit-answer` | `questionId` | Response Service |
| `QuestionTimedOutEvent` | Timeout sweep detects unanswered question past poll duration | `questionId` | Response Service |

### QuestionDisplayedEvent
```json
{
  "eventId": "uuid",
  "eventTimestamp": "2026-07-03T10:30:02Z",
  "sessionId": "uuid",
  "lectureId": "uuid",
  "studentId": "uuid",
  "questionId": "uuid",
  "sectionId": "uuid",
  "subsectionId": "uuid",
  "topicId": "uuid",
  "conceptId": "uuid",
  "questionSequence": 1,
  "questionDisplayedAt": "2026-07-03T10:30:01Z"
}
```

### QuestionAnsweredEvent
```json
{
  "eventId": "uuid",
  "eventTimestamp": "2026-07-03T10:30:46Z",
  "sessionId": "uuid",
  "lectureId": "uuid",
  "studentId": "uuid",
  "questionId": "uuid",
  "selectedAnswer": "A",
  "questionDisplayedAt": "2026-07-03T10:30:01Z",
  "questionAnsweredAt": "2026-07-03T10:30:45Z",
  "responseTimeMilliseconds": 44000
}
```

### QuestionTimedOutEvent
```json
{
  "eventId": "uuid",
  "eventTimestamp": "2026-07-03T10:31:02Z",
  "sessionId": "uuid",
  "lectureId": "uuid",
  "studentId": "uuid",
  "questionId": "uuid",
  "questionDisplayedAt": "2026-07-03T10:30:01Z",
  "timeoutAt": "2026-07-03T10:31:01Z",
  "timeoutDurationMilliseconds": 60000
}
```

## Interaction Timing Flow (Detailed)

```
1. Polling Service → PollOpenedEvent
   ↓
2. RTC PollEventConsumer receives PollOpenedEvent
   ↓
3. Stores active_poll:{sessionId} in Redis { questionId, pollDurationMs, metadata }
   ↓
4. Broadcasts question to /topic/question/{questionId}
   Broadcasts to /topic/quiz/{quizId} (legacy)
   ↓
5. Student client receives question, renders on screen
   ↓
6. Student client sends /app/question-display-ack { questionId, clientDisplayedAt }
   ↓
7. QuestionDisplayAckController receives ack
   ↓
8. InteractionTimingService:
   a. Stores { studentId, questionId, questionDisplayedAt } in Redis sorted set question:{questionId}:displayed (TTL = pollDuration + 30s)
   b. Publishes QuestionDisplayedEvent to interaction-events topic
   ↓
9. Student submits answer via /app/submit-answer
   ↓
10. AnswerController receives submission
    ↓
11. InteractionTimingService:
    a. Retrieves questionDisplayedAt from Redis sorted set
    b. Calculates responseTimeMilliseconds = now - questionDisplayedAt
    c. Removes student from Redis sorted set (prevents duplicate)
    d. Publishes QuestionAnsweredEvent to interaction-events topic
    ↓
12. (Legacy) AnswerForwardingService forwards to Response Service via REST
    ↓
13. TimeoutSweepService (@Scheduled every 5s):
    a. ZRANGEBYSCORE question:{questionId}:displayed -inf {now - pollDurationMs}
    b. For each expired student entry:
       - Publishes QuestionTimedOutEvent
       - ZREM from sorted set
    ↓
14. Polling Service → PollClosedEvent
    ↓
15. RTC consumers → removes active_poll:{sessionId} from Redis
    → broadcast close to /topic/question/{questionId}
    → sweep marks all remaining as timed out
```

## Failure Handling

| Failure | Mechanism | Recovery |
|---|---|---|
| Student disconnects mid-question | Display state persists in Redis (TTL) | Student reconnects, resyncs via `GET /current` |
| Redis node failure | Redis Sentinel / Cluster failover | Sorted set + TTL handles failover; worst case: lost timing for current questions |
| Kafka broker failure | Retry with backoff; blocks until broker recovers | Events queued in memory; at-least-once delivery resumes |
| Duplicate submission | Idempotency key check on AnswerSubmission | QuestionAnsweredEvent published exactly once per student+question |
| Late submission after PollClosed | Accepted if within grace period; otherwise ignored | Client notified via ack |
| Cross-pod message lost | Tolerance — one student misses one broadcast | Student reconnects, resyncs |
| PollOpenedEvent consumed twice | Idempotent broadcast — duplicate question delivery is harmless; Redis `SET NX` on active_poll prevents double state creation | Students ignore duplicate frames |

### Retry Strategy
- **Kafka consumer**: Spring Kafka `DefaultErrorHandler` with 3 retries, then DLQ
- **Redis operations**: Lettuce retry with exponential backoff (max 3 attempts)
- **Interaction event publication**: Fire-and-forget with async callback logging; no blocking retry

### Idempotency Strategy
- **QuestionDisplayAck**: Redis sorted set `ZADD NX` — only first ack per student+question is recorded
- **AnswerSubmission**: Composite idempotency key `studentId:questionId` — downstream Response Service deduplicates
- **PollOpenedEvent**: Redis `SET active_poll:{sessionId} NX TTL` — only first consumer creates active poll state
- **Event publication**: Each interaction event carries `eventId` (UUID) for consumer-side deduplication

### Duplicate Event Prevention
- Display ack: `ZADD NX` ensures one entry per student+question
- Answer: Composite idempotency key checked before event publication
- Timeout: `ZREM` after publishing; sweep only processes entries still in sorted set
- All interaction events include `eventId` for downstream deduplication

## Database (Redis Only)
No PostgreSQL. RTC uses Redis exclusively for:
- **Connection metadata**: `session:{sessionId}` → TTL'd JSON (1h)
- **Quiz session membership**: `quiz_sessions:{quizId}` → set of sessionIds
- **User session membership**: `user_sessions:{userId}` → set of sessionIds
- **Active poll state**: `active_poll:{sessionId}` → JSON { questionId, pollDurationMs, lectureId, sectionId, subsectionId, topicId, conceptId, questionSequence } with TTL = pollDuration + 30s grace
- **Display timestamps**: `question:{questionId}:displayed` → sorted set of `{studentId}:{questionDisplayedAt}` with score = display epoch ms, TTL = pollDuration + 30s
- **Cross-pod pub/sub**: `quiz:*`, `notification:*` channels

## State Management (Transient Only)
RTC maintains only transient runtime state:
- Current active poll per session (Redis TTL)
- Current connected students (Redis TTL)
- Current question delivery status (Redis sorted set TTL)
- Current display timestamps (Redis sorted set TTL)
- Current answer timestamps (computed in-memory from Redis lookups)

When interaction completes (answer received or timeout detected), RTC publishes the event then immediately releases the transient state (`ZREM` from sorted set, `DEL` active poll key).

## Horizontal Scalability
- **Stateless WebSocket pods**: Any pod handles any connection; state lives in Redis
- **Session affinity**: WebSocket connections are sticky (same pod for session lifetime) via load balancer
- **Redis Pub/Sub**: Cross-pod message relay — all pods subscribe to same channels
- **Kafka consumer group**: Partitioned by `quizId` — each partition consumed by one pod
- **Broadcast scaling**: Broadcasting to `/topic/question/{questionId}` fans out to all connected pods
- **No pod-to-pod communication**: Only Redis Pub/Sub + Kafka for cross-pod coordination

## Performance
- **Redis sorted set operations**: O(log N) per student per question — handles thousands of concurrent students
- **WebSocket broadcast**: Spring's `SimpMessagingTemplate` with simple broker — efficient in-process fan-out
- **Kafka producer**: Async fire-and-forget for interaction events — non-blocking
- **Scheduled sweep**: Interval-configured (default 5000ms); scan operation is O(log N + M) where M = expired entries

## Security
- **JWT authentication**: Validated synchronously with Auth Service at WebSocket connect time
- **Role-based authorization**: TEACHER vs STUDENT role enforced at connection level
- **Secure WebSocket**: STOMP over WSS in production
- **Session validation**: Session attributes populated from JWT at connect time; used in all message handlers
- **Duplicate connection detection**: User's existing sessions are invalidated on new connect
- **Replay protection**: Each interaction event carries `eventId` (UUID) — downstream services deduplicate

## Monitoring and Observability
| Aspect | Implementation |
|---|---|
| Health check | `GET /api/v1/health` → status, service name |
| Connection metrics | Count of active sessions per quiz |
| Interaction metrics | QuestionDisplayedEvent count, QuestionAnsweredEvent count, QuestionTimedOutEvent count |
| Kafka lag | Prometheus + Grafana monitoring via Spring Kafka metrics |
| Redis latency | Lettuce command latency metrics |
| Logging | Structured JSON logging via Logback with MDC (sessionId, userId, quizId) |

### Key Metrics to Monitor
- `rtc.active.sessions` — gauge of total connected WebSocket sessions
- `rtc.questions.displayed` — counter of QuestionDisplayedEvents published
- `rtc.questions.answered` — counter of QuestionAnsweredEvents published
- `rtc.questions.timedout` — counter of QuestionTimedOutEvents published
- `rtc.response.time.avg` — histogram of response time per question
- `rtc.timeout.sweep.duration` — histogram of sweep execution time
- `rtc.kafka.consumer.lag` — per-partition consumer lag for polling-events

## Migration Strategy (Current → Updated)
1. **Phase 1 — Deploy new code**: Rolling update — old pods continue handling existing connections; new pods bring interaction event producers
2. **Phase 2 — Enable interaction events**: Once all pods updated, InteractionEventProducer publishes to `interaction-events` topic
3. **Phase 3 — Response Service update**: Response Service starts consuming `interaction-events` from new topic
4. **Phase 4 (future)**: Remove legacy REST answer forwarding to Response Service once all consumers are event-driven

## Production-Ready Implementation Plan
1. Add domain entities for active poll and timing state
2. Add application ports and Redis repository for active polls
3. Add InteractionTimingService for display tracking, response time calculation, timeout detection
4. Add InteractionEventProducer for publishing QuestionDisplayedEvent, QuestionAnsweredEvent, QuestionTimedOutEvent
5. Add QuestionDisplayAckController for `/app/question-display-ack`
6. Update PollEventConsumer for enriched PollOpenedEvent/PollClosedEvent with active poll tracking
7. Update AnswerController to emit QuestionAnsweredEvent with timing
8. Add TimeoutSweepService for scheduled timeout detection
9. Update MessageRoutingService with `/topic/question/{questionId}` broadcast
10. Update application.yml with new configuration
11. Update tests
12. Deploy as rolling update (backward-compatible)

## Service Ownership Matrix
| Capability | Owner |
|---|---|
| Live classroom communication (WebSocket/STOMP) | **RTC** |
| Connection lifecycle management | **RTC** |
| Question delivery to students | **RTC** |
| Interaction timing (display → answer) | **RTC** |
| Response time calculation | **RTC** |
| Timeout detection | **RTC** |
| Interaction event publication | **RTC** |
| Poll lifecycle (open, close) | Polling Service |
| Answer correctness | Response Service |
| Interaction history storage | Response Service |
| Educational metadata | Question Generation Service |
| Analytics (engagement, mastery) | Analytics Service |
| Reporting | Reporting Service |

## Environment Variables
| Variable | Description | Default |
|---|---|---|
| `KAFKA_BOOTSTRAP_SERVERS` | Kafka broker list | `localhost:9092` |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `AUTH_SERVICE_URL` | Auth service base URL | `http://localhost:8081` |
| `RESPONSE_SERVICE_URL` | Response service base URL | `http://localhost:8084` |
| `RTC_TIMEOUT_SWEEP_INTERVAL_MS` | Timeout sweep interval | `5000` |
| `RTC_POLL_GRACE_PERIOD_SECONDS` | Extra TTL for timing state after poll closes | `30` |
| `RTC_CONNECTION_TTL_SECONDS` | Redis connection TTL | `3600` |

## Future Extensibility
The architecture supports adding new realtime capabilities without redesign:
- **Multi-device participation**: Extend `ConnectionSession` with `deviceType`; allow multiple sessions per user
- **Connection quality monitoring**: Add client-side metrics channel `/app/connection-stats`
- **Live reactions**: New channel `/app/reaction` + broadcast to `/topic/quiz/{quizId}/reactions`
- **Hand raise**: New channel `/app/hand-raise` + broadcast to teacher topic
- **Breakout classrooms**: New `roomId` concept; scoped channels per room
- **Transport abstraction**: Interface for WebSocket/STOMP; future protocols implement same contract
- **Multiple concurrent polls**: ActivePoll state supports multiple questions per session

# Spandan Realtime Communication Service — Context File

## Project Identity
- **System:** Spandan — a classroom engagement analytics platform
- **Service:** Realtime Communication Service (bounded context: Realtime Delivery & Interaction Timing)
- **Architecture:** STOMP-over-WebSocket Spring Boot service
- **DB-per-service:** No PostgreSQL — Redis only for TTL'd connection metadata + interaction timing state + cross-pod pub/sub

## Core Responsibility
Live classroom communication layer and the authoritative owner of the **student interaction lifecycle**. Accepts WebSocket connections, consumes Kafka events from upstream services, fans out to connected clients via STOMP channels. Tracks per-student question display time, detects timeouts, calculates response time, and publishes raw interaction events (`QuestionDisplayedEvent`, `QuestionAnsweredEvent`, `QuestionTimedOutEvent`) to the `interaction-events` topic for downstream consumption by Response Service.

RTC is the **single owner** of interaction timing. No other service calculates response time, detects display timeouts, or knows when a question appeared on a student's screen.

RTC recognizes three platform roles — **ADMIN** (assessment controller), **TEACHER** (instructional monitor), and **STUDENT** (participant). Assessment execution commands are authorized exclusively for ADMIN; TEACHER retains read-only realtime monitoring.

## Role-Based Responsibility Model

### ADMIN (assessment controller)
- Publish questions
- Broadcast polls
- Advance quiz progression
- Pause quiz
- Resume quiz
- Cancel quiz
- End quiz
- View live classroom statistics

### TEACHER (instructional monitor — read-only)
- Observe live response statistics
- Monitor participation rates
- View realtime classroom progress
- View student engagement metrics
- Must NOT: publish questions, advance/pause/resume/cancel quizzes

### STUDENT (participant — unchanged)
- Receive questions on screen
- Submit answers
- Receive timer events
- Receive feedback
- Receive synchronization events

RTC does **NOT** enforce business rules about who may open/close polls — that belongs to Polling Service. RTC only enforces which WebSocket commands a given role may execute.

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
| **Role-based command authorization** | JWT `role` claim checked on every inbound command; assessment commands gated to ADMIN |

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
**Inside:** Connection lifecycle, channel subscription routing, message fan-out, delivery acknowledgment, per-student question display timing, response time calculation, timeout detection, interaction event publication, **role-based command authorization**
**Outside:** Question/poll content, answer correctness, scoring, analytics, interaction history storage (Response Service), educational hierarchy management

## Technical Stack
- Java 17, Spring Boot 3.2.x (WebSocket, STOMP, Security, Kafka, Redis, Scheduler)
- Kafka 3.6 (consume: `polling-events`, `analytics-events`, `notification-events`; produce: `connection-events`, `interaction-events`)
- Redis 7 (connection metadata TTL, Pub/Sub for cross-pod relay, sorted sets for timing state, active poll state)
- Testing: JUnit 5, Mockito, Testcontainers (Kafka + Redis)

## WebSocket Channels

### Existing (unchanged)
| Channel | Direction | Purpose | Authorized Roles |
|---|---|---|---|
| `/topic/quiz/{quizId}` | Broadcast | Live poll events | ADMIN, TEACHER, STUDENT |
| `/topic/quiz/{quizId}/teacher` | Broadcast | Per-question teacher stats | TEACHER, ADMIN |
| `/user/{userId}/queue/result` | Unicast | Individual answer result | STUDENT |
| `/topic/quiz/{quizId}/leaderboard` | Broadcast | Live ranking updates | STUDENT, TEACHER |
| `/user/{userId}/queue/notifications` | Unicast | Personal notifications | ADMIN, TEACHER, STUDENT |
| `/topic/quiz/{quizId}/notifications` | Broadcast | Quiz-scoped notifications | ADMIN, TEACHER, STUDENT |
| `/app/submit-answer` | Inbound | Student answer submission | STUDENT |
| `/app/activity-ack` | Inbound | Client-side activity detection ack | STUDENT |
| `/app/question-display-ack` | Inbound | Student acknowledges question displayed | STUDENT |
| `/topic/question/{questionId}` | Broadcast | Per-question delivery from PollOpenedEvent | ADMIN, TEACHER, STUDENT |

### New — Admin Channel
| Channel | Direction | Purpose | Authorized Roles |
|---|---|---|---|
| `/topic/quiz/{quizId}/admin` | Broadcast | Admin assessment control events (quiz started/paused/resumed/cancelled) | ADMIN |
| `/app/publish-question` | Inbound | Admin publishes question to live session | ADMIN |
| `/app/pause-quiz` | Inbound | Admin pauses live quiz | ADMIN |
| `/app/resume-quiz` | Inbound | Admin resumes paused quiz | ADMIN |
| `/app/cancel-quiz` | Inbound | Admin cancels live quiz | ADMIN |
| `/app/end-quiz` | Inbound | Admin ends live quiz | ADMIN |

The existing `/topic/quiz/{quizId}/teacher` channel continues to serve TEACHER monitoring use cases. ADMIN may subscribe to both `/topic/quiz/{quizId}/admin` and `/topic/quiz/{quizId}/teacher` channels for full visibility.

## WebSocket Command Authorization Matrix

| Command | Previous Owner | New Owner | Rationale |
|---|---|---|---|
| Publish Question | TEACHER | **ADMIN** | Assessment execution is ADMIN responsibility |
| Broadcast Poll | TEACHER | **ADMIN** | Poll progression is ADMIN responsibility |
| Pause Quiz | TEACHER | **ADMIN** | Assessment control is ADMIN-only |
| Resume Quiz | TEACHER | **ADMIN** | Assessment control is ADMIN-only |
| Cancel Quiz | TEACHER | **ADMIN** | Assessment control is ADMIN-only |
| End Quiz | TEACHER | **ADMIN** | Assessment lifecycle is ADMIN-owned |
| Submit Answer | STUDENT | STUDENT (unchanged) | Participation is student-owned |
| Question Display Ack | STUDENT | STUDENT (unchanged) | Participation is student-owned |
| Activity Ack | STUDENT | STUDENT (unchanged) | Participation is student-owned |
| View Live Stats | TEACHER | TEACHER, ADMIN | Read-only monitoring is shared |
| Join Session | STUDENT, TEACHER | STUDENT, TEACHER, ADMIN | All authenticated roles may join |

## Room Management

### Teacher Rooms — unchanged
- `/topic/quiz/{quizId}/teacher` — TEACHER and ADMIN subscribe
- Contains realtime stats, participation metrics, student progress
- No assessment control events flow through this channel

### Student Rooms — unchanged
- `/user/{userId}/queue/result` — per-student answer results
- `/topic/quiz/{quizId}` — broadcast quiz events
- `/topic/question/{questionId}` — per-question broadcast

### Admin Rooms — new
- `/topic/quiz/{quizId}/admin` — dedicated channel for assessment control events
- ADMIN subscribes at quiz start, unsubscribes at quiz end
- Contains: `QuizStarted`, `QuizPaused`, `QuizResumed`, `QuizCancelled`, `QuizEnded` events
- TEACHER and STUDENT are **not** subscribed to this channel
- No dedicated Redis keys required — channel subscription is managed by STOMP broker in-memory routing. Admin sessions maintain a subscription to this channel alongside existing teacher/student channels.

### Redis Room Membership
| Key | Purpose | Added By | TTL |
|---|---|---|---|
| `quiz_sessions:{quizId}` | Set of sessionIds in quiz | Session join | Quiz duration + 1h |
| `user_sessions:{userId}` | Set of sessionIds for user | Session join | 24h |
| `admin_sessions:{quizId}` | Set of admin sessionIds for quiz | Admin session join | Quiz duration + 1h |

`admin_sessions:{quizId}` is a new key used for targeted admin broadcast and to track which quizzes have an admin actively monitoring.

## Kafka Topics Consumed

| Topic | Events | Producer | Purpose | Admin Impact |
|---|---|---|---|---|
| `polling-events` | `PollOpenedEvent`, `PollClosedEvent`, `QuizStartingEvent`, `QuizCompleted`, `QuizCancelled` | Polling Service | Question delivery trigger | Event payloads now carry `adminId`; RTC includes it in broadcast payloads |
| `analytics-events` | `TeacherAnalyticsReady`, `LeaderboardGenerated`, etc. | Analytics Service | Broadcast analytics results | No change — analytics are role-agnostic at broadcast layer |
| `notification-events` | `NotificationCreated` | Notification Service | Broadcast notifications | No change |

### PollOpenedEvent Consumption — Updated
When RTC consumes `PollOpenedEvent`:
1. Stores active poll state in Redis (`active_poll:{sessionId}` with TTL = pollDuration + 30s grace)
2. Broadcasts question metadata to `/topic/question/{questionId}` (includes `adminId` in payload)
3. Broadcasts to `/topic/quiz/{quizId}` (legacy)
4. Broadcasts quiz progress to `/topic/quiz/{quizId}/admin`

When RTC consumes `PollClosedEvent`:
1. Removes active poll state from Redis
2. Broadcasts to `/topic/question/{questionId}` (close signal)
3. Broadcasts to `/topic/quiz/{quizId}` (legacy)
4. Broadcasts quiz progress to `/topic/quiz/{quizId}/admin`

## Event Broadcasting — Payload Updates

### Broadcast Event Payload Changes
| Event | New Fields | Rationale |
|---|---|---|
| `QuestionDisplayedEvent` | `adminId` (optional) | Trace origin of poll publication |
| `QuestionAnsweredEvent` | No change | Student action — no admin involvement |
| `QuestionTimedOutEvent` | No change | Clock-driven — no admin involvement |
| Connection events (`TeacherConnected`, `TeacherDisconnected`) | Split into `AdminConnected`, `AdminDisconnected` where applicable | Separate admin connections from teacher connections |
| `StudentConnected`, `StudentDisconnected` | No change | Student role unchanged |

Existing `teacherId` fields preserved in all interaction events for backward compatibility. `adminId` added as an optional field populated when available from the upstream event.

### Admin Control Events (new broadcasts on `/topic/quiz/{quizId}/admin`)
| Event | Payload |
|---|---|
| `QuizStarted` | `{ eventId, quizId, sessionId, adminId, startedAt }` |
| `QuizPaused` | `{ eventId, quizId, sessionId, adminId, pausedAt }` |
| `QuizResumed` | `{ eventId, quizId, sessionId, adminId, resumedAt }` |
| `QuizCancelled` | `{ eventId, quizId, sessionId, adminId, cancelledAt, reason }` |
| `QuizEnded` | `{ eventId, quizId, sessionId, adminId, endedAt }` |

These events are broadcast in response to inbound WebSocket commands from ADMIN roles and also relayed when RTC consumes the corresponding Kafka events from Polling Service. This ensures consistency between direct WebSocket command paths and Kafka-driven state changes.

## Kafka Topics Produced

### Connection events (existing — `connection-events` topic)
`StudentConnected`, `StudentDisconnected`, `TeacherConnected`, `TeacherDisconnected`, `AdminConnected`, `AdminDisconnected`, `SocketDeliveryFailed`, `StudentResponseReceived`

`AdminConnected` and `AdminDisconnected` are new event types added to distinguish admin connections from teacher connections. Downstream consumers (Analytics Service) can use this for role-segmented connection metrics.

### Interaction events (new — `interaction-events` topic)
| Event | Trigger | Key | Consumers |
|---|---|---|---|
| `QuestionDisplayedEvent` | Student acknowledges via `/app/question-display-ack` | `questionId` | Response Service |
| `QuestionAnsweredEvent` | Student submits via `/app/submit-answer` | `questionId` | Response Service |
| `QuestionTimedOutEvent` | Timeout sweep detects unanswered question past poll duration | `questionId` | Response Service |

### QuestionDisplayedEvent — Updated
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
  "questionDisplayedAt": "2026-07-03T10:30:01Z",
  "adminId": "uuid"
}
```

`adminId` is populated from the upstream `PollOpenedEvent` payload when available. It is optional — events from legacy poll flows (pre-ADMIN) will omit it.

### QuestionAnsweredEvent — unchanged
### QuestionTimedOutEvent — unchanged

## Authorization Enforcement

### WebSocket Connection Time
1. Client presents JWT during STOMP CONNECT frame
2. RTC validates JWT synchronously with Auth Service (existing flow — unchanged)
3. Session attributes populated: `userId`, `role`, `sessionId`
4. Role stored in `SimpSession` attributes for downstream command handlers

### Command Authorization (per-message)
Every inbound WebSocket command handler checks the role from session attributes before processing:

| Handler | Required Role |
|---|---|
| `PublishQuestionHandler` | ADMIN |
| `PauseQuizHandler` | ADMIN |
| `ResumeQuizHandler` | ADMIN |
| `CancelQuizHandler` | ADMIN |
| `EndQuizHandler` | ADMIN |
| `AnswerSubmissionHandler` | STUDENT |
| `QuestionDisplayAckHandler` | STUDENT |
| `ActivityAckHandler` | STUDENT |
| `JoinSessionHandler` | ADMIN, TEACHER, STUDENT |
| `CurrentStateHandler` (REST) | ADMIN, TEACHER, STUDENT |

### Channel Subscription Authorization (per-subscribe)
STOMP subscription requests to `/topic/quiz/{quizId}/admin` are validated at subscribe time — only ADMIN role may subscribe. Other channels remain unchanged. This is enforced via a custom `ChannelInterceptor` that checks `SimpSession` role attribute against the destination pattern.

### REST Endpoint Authorization
| Endpoint | Required Role | Change |
|---|---|---|
| `GET /api/v1/sessions/current` | ADMIN, TEACHER, STUDENT | No change |
| `POST /api/v1/sessions/join` | ADMIN, TEACHER, STUDENT | No change (ADMIN now allowed) |
| `POST /api/v1/sessions/leave` | ADMIN, TEACHER, STUDENT | No change |
| `GET /api/v1/health` | Unauthenticated | No change |

## Interaction Timing Flow (Detailed) — Unchanged

Flow remains identical. The ADMIN role affects who can trigger poll-related Kafka events (via Polling Service), not the timing or delivery mechanics within RTC.

```
1. Polling Service → PollOpenedEvent
   ↓
2. RTC PollEventConsumer receives PollOpenedEvent
   ↓
3. Stores active_poll:{sessionId} in Redis { questionId, pollDurationMs, metadata, adminId }
   ↓
4. Broadcasts question to /topic/question/{questionId}
   Broadcasts to /topic/quiz/{quizId} (legacy)
   Broadcasts quiz progress to /topic/quiz/{quizId}/admin
   ↓
5. Student client receives question, renders on screen
   ↓
6. Student client sends /app/question-display-ack { questionId, clientDisplayedAt }
   ↓
7. QuestionDisplayAckController receives ack
   ↓
8. InteractionTimingService:
   a. Stores { studentId, questionId, questionDisplayedAt, adminId } in Redis sorted set
   b. Publishes QuestionDisplayedEvent to interaction-events topic (with adminId)
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
13. TimeoutSweepService (@Scheduled every 5s): unchanged
```

## Failure Handling — Unchanged

The introduction of ADMIN does not affect failure handling. Rationale:
- Redis failover, Kafka retry, duplicate detection, idempotency, and reconnection logic are role-agnostic
- Admin connections use the same WebSocket infrastructure as teacher/student connections
- Admin-specific Redis key `admin_sessions:{quizId}` is TTL'd and non-critical — loss only affects admin-targeted broadcast tracking, which is a convenience, not a correctness requirement

### Retry Strategy — unchanged
### Idempotency Strategy — unchanged
### Duplicate Event Prevention — unchanged

## Database (Redis Only) — Updated

No PostgreSQL. RTC uses Redis exclusively for:
- **Connection metadata**: `session:{sessionId}` → TTL'd JSON (1h) — **added `role` field**
- **Quiz session membership**: `quiz_sessions:{quizId}` → set of sessionIds
- **User session membership**: `user_sessions:{userId}` → set of sessionIds
- **Admin session membership**: `admin_sessions:{quizId}` → set of admin sessionIds (new)
- **Active poll state**: `active_poll:{sessionId}` → JSON { questionId, pollDurationMs, lectureId, sectionId, subsectionId, topicId, conceptId, questionSequence, **adminId** } with TTL = pollDuration + 30s grace
- **Display timestamps**: `question:{questionId}:displayed` → sorted set of `{studentId}:{questionDisplayedAt}` with score = display epoch ms, TTL = pollDuration + 30s
- **Cross-pod pub/sub**: `quiz:*`, `notification:*` channels

## State Management (Transient Only) — Unchanged

RTC maintains only transient runtime state. Admin role does not introduce new durable state.

## Horizontal Scalability — Unchanged

Admin connections follow the same scaling model as teacher and student connections. Rationale:
- Admin connections are WebSocket connections like any other — stateless, sticky-session, Redis-backed
- `admin_sessions:{quizId}` is a lightweight Redis set — negligible overhead
- Admin broadcast channels use the same STOMP fan-out mechanism
- No additional pod-to-pod coordination required

## Performance — Unchanged

Admin channels add one additional STOMP destination per quiz (`/topic/quiz/{quizId}/admin`). The subscription check (role-based) adds a single attribute lookup per subscribe/message — negligible overhead.

## Security

- **JWT authentication**: Validated synchronously with Auth Service at WebSocket connect time — unchanged
- **Role-based authorization**: Updated to recognize ADMIN alongside TEACHER and STUDENT
  - ADMIN: full assessment control commands + read-only monitoring
  - TEACHER: read-only monitoring only
  - STUDENT: participation only
- **Command authorization**: Per-message role check on all inbound WebSocket commands
- **Channel authorization**: Subscription validation for `/topic/quiz/{quizId}/admin` — only ADMIN may subscribe
- **Secure WebSocket**: STOMP over WSS in production — unchanged
- **Session validation**: Session attributes populated from JWT at connect time; include `role` — unchanged
- **Duplicate connection detection**: User's existing sessions are invalidated on new connect — unchanged (applies equally to ADMIN)
- **Replay protection**: Each interaction event carries `eventId` (UUID) — unchanged

## Monitoring and Observability

### Updated Key Metrics
| Metric | Labels Added | Rationale |
|---|---|---|
| `rtc.active.sessions` | `role` | Distinguish ADMIN, TEACHER, STUDENT connection counts |
| `rtc.questions.displayed` | None | Interaction event — role doesn't apply |
| `rtc.questions.answered` | None | Interaction event — role doesn't apply |
| `rtc.questions.timedout` | None | Interaction event — role doesn't apply |
| `rtc.response.time.avg` | None | Interaction timing — role doesn't apply |
| `rtc.timeout.sweep.duration` | None | Infrastructure timing — role doesn't apply |
| `rtc.kafka.consumer.lag` | None | Infrastructure metric — role doesn't apply |

Role-segmented connection metrics are useful for operational insight:
- ADMIN connections are typically few (1 per quiz) but critical — a drop may indicate an admin lost assessment control
- TEACHER connections indicate active classroom monitoring
- STUDENT connections indicate participation volume
- An admin disconnecting mid-quiz should trigger an alert (no ADMIN connected to active quiz)

### Logging — Enhanced
All log entries now include `role` in MDC context alongside existing `sessionId`, `userId`, `quizId`. ADMIN operations are distinguishable in logs without exposing sensitive information. Audit-relevant commands (publish, pause, resume, cancel, end) produce an INFO-level log entry with the admin's `userId` for traceability.

## Coupling

| Service | Protocol | Notes |
|---|---|---|
| Auth Service | REST (sync) | JWT validation — unchanged; `role` claim already includes ADMIN |
| Polling Service | Kafka (consume) | PollOpenedEvent/PollClosedEvent payloads now include `adminId`; RTC propagates to broadcast payloads |
| Response Service | Kafka (produce), REST (legacy) | Interaction events carry optional `adminId` — Response Service ignores if not needed |
| Notification Service | Kafka (consume) | NotificationCreated — unchanged |
| Analytics Service | Kafka (produce + consume) | Connection events now include `AdminConnected`/`AdminDisconnected`; analytics layer can segment by role |

No new service couplings introduced. No REST dependencies added.

## Components Requiring Modification
1. Core Responsibility — documentation updated with ADMIN role
2. WebSocket channels — added `/topic/quiz/{quizId}/admin` + admin inbound command channels
3. Command authorization — per-handler role checks for assessment control commands
4. Channel subscription authorization — subscribe validation for admin channel
5. Room management — added `admin_sessions:{quizId}` Redis key
6. Event payloads — `adminId` added to broadcast events where available
7. Connection events — `AdminConnected`, `AdminDisconnected` event types
8. Security — role validation includes ADMIN; TEACHER downgraded to read-only for assessment commands
9. Metrics — `rtc.active.sessions` split by `role` label
10. Logging — `role` added to MDC context; audit logging for admin commands
11. Testing — admin WebSocket auth, command authorization, channel subscription, broadcast payloads

## Components Remaining Unchanged
1. Interaction timing flow (display → answer → timeout → publish)
2. Redis sorted set structure for display timestamps
3. Timeout sweep service
4. Answer submission handling (STUDENT role unchanged)
5. Kafka topic structure (no new topics)
6. Idempotency and dedup mechanisms
7. Retry strategy and dead-letter queue handling
8. Horizontal scalability model (stateless pods, Redis-backed)
9. Performance characteristics (sorted set O(log N), in-process broadcast)
10. Environment variables (no new configuration required)
11. Deployment infrastructure (rolling update, sticky sessions, Redis Sentinel/Cluster)

## Testing — Enhanced

### New Tests (Admin Role)
| Test | Scope |
|---|---|
| Admin WebSocket authentication succeeds with valid ADMIN JWT | WebSocket connect → CONNECT frame |
| Teacher WebSocket authentication succeeds (read-only) | WebSocket connect with TEACHER JWT |
| Admin can publish question via `/app/publish-question` | Inbound command → handler → broadcast |
| Teacher cannot publish question — 403 FORBIDDEN | Inbound command → authorization check → error frame |
| Student cannot publish question — 403 FORBIDDEN | Inbound command → authorization check → error frame |
| Admin can pause/resume/cancel/end quiz | Inbound command → handler → broadcast to `/topic/quiz/{quizId}/admin` |
| Teacher cannot pause quiz — 403 FORBIDDEN | Authorization check |
| Only ADMIN can subscribe to `/topic/quiz/{quizId}/admin` | STOMP SUBSCRIBE validation |
| Student can still submit answers | Existing test — unchanged behavior |
| `AdminConnected` event published on admin connect | Connection lifecycle → Kafka produce |
| `AdminDisconnected` event published on admin disconnect | Disconnection lifecycle → Kafka produce |
| Broadcast poll event includes `adminId` in `/topic/question/{questionId}` payload | PollOpenedEvent consumption → broadcast |
| Admin session tracked in `admin_sessions:{quizId}` Redis set | Session join → Redis write |
| Admin disconnected mid-quiz triggers log warning | Monitoring — no functional behavior change |
| Backward compatibility — teacher-only flow still works with legacy PollOpenedEvent (no adminId) | Event consumption → broadcast without `adminId` |

### Existing Tests — all preserved with no modification needed

## Deployment

| Change Type | Detail |
|---|---|
| WebSocket authorization config | Update role check to include ADMIN; add subscribe interceptor for admin channel |
| Command handler beans | New handler classes for admin commands (publish, pause, resume, cancel, end) |
| Connection event enum | Add `AdminConnected`, `AdminDisconnected` event types |
| Redis key pattern | Add `admin_sessions:{quizId}` — no migration needed (Redis is schema-less) |
| Logging config | Add `role` to MDC pattern; no infrastructure change |
| Metrics config | Add `role` label to session gauge; Prometheus picks up automatically |
| Environment variables | No new variables required |
| Kafka topic config | No new topics; `adminId` added to existing event payloads |

No infrastructure changes required. The deployment is a standard rolling update with backward-compatible event schemas.

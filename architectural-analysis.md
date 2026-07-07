# Architectural Analysis — Student Interaction Event Framework

## Deliverable 12: CAP Theorem Analysis per Service

| Service | Model | Invariant | Partition Behavior |
|---------|-------|-----------|-------------------|
| **Auth Service** | CP | "revoked token never accepted", "locked user never logs in" | Reject auth requests until partition heals |
| **API Gateway** | — | Stateless routing | No state to protect |
| **QGS** | CP (hierarchy) + AP (generation) | "no duplicate sections", "generation cost > consistency" | Hierarchy refuses writes; generation accepts and retries |
| **QRS** | CP | "review decisions must not conflict" | Reject review submissions until partition heals |
| **Polling Service** | CP | "one authoritative poll state" | Refuse poll state transitions |
| **RTC** | AP (delivery) + CP (routing) | "WebSocket delivery preferred over loss"; "no split-brain routing" | Drop or delay delivery; routing table refuses split |
| **Response Service** | CP | "exactly one interaction per event" | Reject writes; accept on recovery with dedup |
| **Analytics Service** | AP | "aggregation is idempotent" | Accept events; reprocess when partition heals |
| **Transcription Service** | CP | "ordered segments must be consistent" | Reject out-of-order segments |
| **Notification Service** | AP | "notification eventually delivered is acceptable" | Accept and queue; deliver on recovery |
| **Recording Service** | CP | "stream state must be deterministic" | Refuse stream state changes |
| **Reporting Service** | AP | "stale cached report > no report" | Serve cached reports; queue incoming data for refresh |
| **Grading Service** (planned) | CP | "scores must be deterministic" | Reject grading until partition heals |
| **Lecture Service** (planned) | CP | "lecture schedule must be consistent" | Reject schedule changes |
| **User Service** (planned) | CP | "profile data must be consistent" | Reject profile updates |

## Deliverable 13: Consistency Models by Service

### Strong Consistency (CP — Write Path)
- **Auth Service**: Login/validate/refresh — serializable isolation on credential state
- **Polling Service**: Poll state transitions — `SELECT FOR UPDATE` on quiz rows
- **Response Service**: Interaction recording — DB unique constraint + Kafka idempotent producer
- **Transcription Service**: Segment ordering — sequence-numbered ingestion
- **Recording Service**: Stream state — single authoritative stream FSM
- **QGS** (hierarchy only): Educational hierarchy CRUD — FK constraints + unique positions

### Eventual Consistency (AP)
- **Analytics Service**: Aggregation — upsert on `UNIQUE` constraints, recompute from scratch
- **Notification Service**: Delivery — DB-level dedup, retry queue
- **Reporting Service**: Cached reports — TTL-driven invalidation, stale-served on miss
- **RTC** (delivery): WebSocket fan-out — at-least-once, client-side dedup via `eventId`

### Consistency Split (CP + AP)
- **Response Service**: Write path is CP (interaction recording), read API is AP (cached tallies)
- **RTC**: Connection routing table is CP (no split-brain), message delivery is AP (at-least-once)
- **QGS**: Hierarchy CRUD is CP, generation jobs are AP

## Deliverable 14: Failure & Retry Strategy

| Service | Failure Mode | Retry Strategy | Circuit Breaker |
|---------|-------------|----------------|-----------------|
| Auth Service | DB unreachable | Connection pool retry (3x) | No — fail fast is preferred |
| QGS | AI provider timeout | Provider fallback chain; max 3 job-level retries | Yes — 50% failure → 30s open |
| QGS | Redis lock acquire fail | Exponential backoff (100ms, 500ms, 2s) | No |
| Polling Service | Kafka publish fail | `@RetryableTopic` — 3 retries → DLT | No |
| RTC | Redis unreachable | Fallback to local in-memory display tracking (degraded) | Yes — 3 failures → fallback mode |
| Response Service | Kafka consumer fail | `max.poll.interval.ms=300000` + `auto.offset.reset=earliest` | No |
| Analytics Service | RS2 REST call fail | Resilience4j retry (3x, 1s backoff) | Yes — 50% failures → 10s open |
| Notification Service | FCM push fail | DB retry queue (5 attempts, exponential 5s→80s) | Yes — 30% failures → 30s open |
| Reporting Service | Kafka consumer lag | No retry — eventual consistency by design | No |
| Transcription Service | RS gRPC fail | gRPC built-in retry (3x) | No |

### Dead Letter Queue Strategy
- All Kafka consumers have DLT (`.DLT` suffix) after 3 `@RetryableTopic` attempts
- DLT events manually replayable via admin script
- Notification Service has additional DB-level retry queue for channel delivery failures

## Deliverable 15: Idempotency Strategy

| Service | Idempotency Mechanism | Scope |
|---------|----------------------|-------|
| **Auth Service** | JWT `jti` blacklist (SET NX) | Logout — token already blacklisted is no-op |
| **QGS** | `UNIQUE(transcript_id, attempt_number)` | Generation — duplicate transcript + attempt is rejected |
| **Polling Service** | `UNIQUE(quiz_id, sequence_position)` | Question publish — duplicate is rejected |
| **Response Service** | `eventId` UNIQUE on AnswerRecord, TimeoutRecord; `displayId` UNIQUE on DisplayRecord | Interaction recording — exactly-once |
| **Analytics Service** | `UNIQUE` on all analytics tables + recompute-from-scratch | Aggregation — duplicate events produce same state |
| **Notification Service** | `UNIQUE(source_event_id, user_id, notification_type)` | Notification creation — no duplicate rows |
| **Reporting Service** | `UNIQUE(session_id, analytics_type)` + `generatedAt` versioning | Report caching — newer timestamp replaces older |
| **RTC** | Client-side dedup via `eventId` | WebSocket delivery — duplicate events ignored |
| **Recording Service** | Stream session UUID unique | Stream creation — duplicate session ID rejected |

## Deliverable 16: Event Ordering & Partitioning

| Topic | Partition Key | Ordering Guarantee | Rationale |
|-------|---------------|-------------------|-----------|
| `question-generation-events` | `setId` | Per-set FIFO | Generation lifecycle per set is sequential |
| `question-review-events` | `questionId` | Per-question FIFO | Review lifecycle per question is sequential |
| `polling-events` | `quizId` | Per-quiz FIFO | Poll state transitions per quiz are sequential |
| `interaction-events` | `questionId` | Per-question FIFO | Display→Answer/Timeout order per question preserved |
| `analytics-output-events` | `sessionId` | Per-session FIFO | Analytics generation per session is sequential |
| `session-analytics-events` | `sessionId` | Per-session FIFO | Completion signal follows analytics |
| `analytics-events` | `analyticsType` | No order guarantee | Independent events — ordering not required |
| `transcription-events` | `sessionId` | Per-session FIFO | Transcript segments ordered per session |
| `audio-stream-events` | `sessionId` | Per-session FIFO | Stream lifecycle per session is sequential |
| `notification-events` | `userId` | Per-user FIFO | Notification delivery order per user preserved |
| `connection-events` | `quizId` | No order guarantee | Connection/disconnection are independent |
| `user-events` | `userId` | Per-user FIFO | User lifecycle events per user are sequential |
| `lecture-events` | `lectureId` | Per-lecture FIFO | Lecture lifecycle per lecture is sequential |
| `grading-events` | `quizId` | No order guarantee | Independent grading results |

## Deliverable 17: Scalability Model

### Horizontal Scaling (All Services)
All services are stateless and HPA-scaled on CPU + Kafka consumer lag:

| Service | Scaling Trigger | Max Partitions | Bottleneck |
|---------|----------------|----------------|------------|
| API Gateway | CPU + connections | N/A | WebSocket connections per pod (~10K) |
| Auth Service | CPU + request rate | N/A | DB connection pool |
| QGS | CPU + active generation jobs | 10 (by transcriptId hash) | AI provider rate limits |
| QRS | CPU + review queue depth | 5 (by questionId hash) | Human review throughput |
| Polling Service | CPU + active quizzes | 10 (by quizId) | DB write throughput |
| RTC | CPU + connections | 10 (by quizId) | Redis Pub/Sub throughput |
| Response Service | Kafka consumer lag | 10 (by questionId — interaction-events) | DB write throughput |
| Analytics Service | CPU + session completion rate | 5 (by sessionId) | RS2 REST throughput |
| Transcription Service | CPU + active streams | 5 (by sessionId) | AI model throughput |
| Notification Service | Kafka consumer lag | 10 (by notification type hash) | FCM rate limits |
| Reporting Service | Request rate | 5 (by sessionId) | Cache hit ratio |
| Recording Service | CPU + active streams | 5 (by sessionId) | Network I/O |

### Data Sizing Estimates
- `interaction-events`: ~150 bytes/event. 500 students × 20 questions = 10K events/session. 100 sessions/day = 1M events/day ≈ 150MB/day raw + DB overhead
- `analytics-output-events`: ~5KB/report. 100 sessions/day × 5 report types = 500 reports/day ≈ 2.5MB/day
- Response DB: 1M rows/day ≈ 500MB/year (with cleanup)
- Reporting DB: 500 reports/day × 90 day retention = 45K reports ≈ 225MB

## Deliverable 18: Event-Driven Communication Flow (Complete)

```
1. TEACHER creates lecture via Lecture Service REST API
   → LS produces LectureCreatedEvent → lecture-events → NS

2. TEACHER starts lecture
   → LS produces LectureStartedEvent → lecture-events → NS, AS

3. TS consumes recording, produces TranscriptGenerated → transcription-events
   → QGS consumes → generates questions → QuestionGeneratedEvent → question-generation-events → PS, RS2
   → QGS produces QuestionsGenerated → question-generation-events → NS

4. TEACHER creates quiz via PS REST API
   → PS stores quiz DRAFT with hierarchy context

5. TEACHER starts quiz via PS REST API
   → PS: DRAFT→SCHEDULED → QuizStartingEvent → polling-events → NS
   → PS: SCHEDULED→RUNNING → per-question progression:
       → PollOpenedEvent → polling-events → RTC, RS2

6. RTC consumes PollOpenedEvent
   → Broadcasts to /topic/question/{questionId}
   → Student client acknowledges → /app/question-display-ack
   → RTC records display time in Redis sorted set
   → RTC produces QuestionDisplayedEvent → interaction-events → RS2

7. STUDENT submits answer via /app/submit-answer
   → RTC computes responseTimeMilliseconds
   → RTC produces QuestionAnsweredEvent → interaction-events → RS2
   (also produces StudentResponseReceived → connection-events → AS)

8. RTC timeout sweep detects unanswered question
   → RTC produces QuestionTimedOutEvent → interaction-events → RS2

9. PS closes poll (timer expiry or manual skip)
   → PollClosedEvent → polling-events → RTC, RS2

10. RS2 records all interaction events (append-only)
    → Maintains projection tables (tallies, grading info)

11. All questions complete → PS produces QuizCompleted → polling-events → AS

12. AS consumes QuizCompleted
    → Pulls /interactions/session/{sessionId}/analytics/raw from RS2
    → Computes session, question, student, learning-objective analytics
    → Persists to analytics_db
    → Produces AnalyticsGeneratedEvent → analytics-output-events → RepS
    → Produces SessionAnalyticsCompletedEvent → session-analytics-events → NS, RepS
    → Produces TeacherAnalyticsReady, StudentAnalyticsReady → analytics-events → NS

13. NS consumes SessionAnalyticsCompletedEvent
    → Creates notification → NotificationCreated → notification-events → RTC → STOMP

14. RepS consumes AnalyticsGeneratedEvent + SessionAnalyticsCompletedEvent
    → Upserts report cache → available via REST API
    → Pre-generates export (optional async)
```

## Deliverable 19: Security Model

| Concern | Mechanism |
|---------|-----------|
| Service-to-service auth | Internal JWT with `X-Internal-Call: true` header + shared service token per pair |
| User auth | JWT (HS256, 15min access + 7d refresh) — validated by Auth Service REST |
| Endpoint authorization | Role-based (`TEACHER`, `STUDENT`) via `@PreAuthorize` |
| Kafka producer auth | SSL client certificates per service |
| Kafka consumer auth | SSL client certificates + ACL on topic patterns |
| Event payload integrity | Events are self-contained — no cross-service references that could be tampered |
| RBAC enforcement | API Gateway validates JWT before routing; each service re-validates for own endpoints |
| Inter-service DB access | Strictly forbidden — all data sharing via Kafka or REST |
| Interaction immutability | Response Service does not expose DELETE or UPDATE endpoints for interaction records |
| Export authorization | Reporting Service verifies `teacherId` on report metadata before serving exports |
| Token blacklist | Redis `SET NX EX` on `jti:{tokenId}` — checked on every request |

## Deliverable 20: Data Migration Path

### Phase 1 — Response Service (Independent, New)
- Deploy RS2 as new microservice with empty `response_db`
- Create `interaction-events` Kafka topic
- RS2 begins consuming `interaction-events` (topic starts empty — no data loss)
- Existing Response Service (`response-events` topic) continues to function
- **Risk**: None — RS2 is a new service, no cutover required

### Phase 2 — Extend RTC (Backward-Compatible)
- Add `interaction-events` producer to RTC (alongside existing `connection-events`)
- RTC also continues to forward answers to legacy Response Service REST
- New `QuestionDisplayedEvent`/`QuestionAnsweredEvent`/`QuestionTimedOutEvent` are emitted in parallel
- **Risk**: None — new events alongside existing behavior

### Phase 3 — Extend Analytics Service (Dual Consumption)
- AS adds `interaction-events` consumer for `QuestionAnsweredEvent` (mid-quiz engagement tracking)
- AS also continues existing `QuizCompleted` → REST pull from legacy RS path for full analytics
- AS adds `analytics-output-events` and `session-analytics-events` producers
- **Risk**: None — new consumers alongside existing pipeline; idempotent output

### Phase 4 — Create Reporting Service (New, Consumption-Only)
- Deploy RepS consuming `analytics-output-events` and `session-analytics-events`
- Appears empty until Phase 3 produces events
- **Risk**: None — consume-only, no upstream dependency

### Phase 5 — Optional Deprecation (Backward-Compatible)
- Legacy analytics pipeline (`AnalyticsCompleted` → Gateway push, `StudentResultReady` etc.) remains active
- Old topics can be deprecated independently per service
- **No hard cutover required** — new and old pipelines coexist

## Deliverable 21: Implementation Roadmap

| Phase | Duration | Deliverables | Dependencies |
|-------|----------|-------------|--------------|
| **P1: Foundation** | 2 weeks | RS2 implementation (domain model, Kafka consumers, REST read API, DB schema, tests) | Kafka cluster |
| **P2: RTC Extension** | 1 week | Display tracking, timeout sweep, interaction event producer, new WebSocket channels | RS2 topic exists |
| **P3: Analytics Evolution** | 2 weeks | New AS consumers, engagement tracking, learning objective mastery, session analytics, new output events | RS2 REST API ready |
| **P4: Reporting Service** | 2 weeks | RepS implementation (Kafka consumers, caching, REST API, export generation) | AS output topics exist |
| **P5: Polling Service Evolution** | 1 week | PollOpenedEvent/PollClosedEvent, section/subsection progression | QGS hierarchy endpoints |
| **P6: QGS Hierarchy** | 1 week | Educational hierarchy CRUD, QuestionGeneratedEvent with hierarchy metadata | None |
| **P7: Testing & Verification** | 1 week | Integration tests across all changed services, end-to-end flow verification, load testing | All phases deployed |
| **P8: Documentation & Cutover** | 3 days | Update events.md, summary.md, all context.md, runbook, monitoring dashboards | All phases tested |

**Total estimated duration: 9 weeks**

## Deliverable 22: Service Ownership Matrix

| Capability | Owning Service | Protocol | Consumers |
|------------|---------------|----------|-----------|
| Educational hierarchy | QGS | REST + Kafka (`question-generation-events`) | PS, RS2 |
| Question generation | QGS | REST + Kafka | QRS |
| Review | QRS | REST + Kafka | PS, NS |
| Poll lifecycle | Polling Service | REST + Kafka (`polling-events`) | RTC, RS2, NS, AS |
| Real-time delivery | RTC | WebSocket + Kafka (`interaction-events`) | RS2 |
| Interaction history | Response Service | REST (read) + Kafka (consume) | AS |
| Analytics intelligence | Analytics Service | Kafka (`analytics-output-events`, `session-analytics-events`) | RepS, NS |
| Presentation | Reporting Service | REST (serve) + Kafka (consume) | Dashboards, exports |
| Notifications | Notification Service | Kafka | RTC |
| Auth & identity | Auth Service | REST | All services |
| Recording | Recording Service | gRPC + Kafka | TS |
| Transcription | Transcription Service | gRPC + Kafka | QGS, NS, AS, PS |
| Grading (planned) | Grading Service | REST + Kafka | NS, AS |
| Lectures (planned) | Lecture Service | REST + Kafka | NS, AS |
| Users (planned) | User Service | REST + Kafka | NS |

### Cross-Cutting Concerns
| Concern | Handled By |
|---------|-----------|
| Event ordering | Kafka partition key strategy (see Deliverable 16) |
| Idempotency | DB unique constraints + eventId dedup (see Deliverable 15) |
| Retry | Resilience4j + Kafka `@RetryableTopic` + DB retry queue (see Deliverable 14) |
| Monitoring | Prometheus metrics per service + Kafka consumer lag monitoring |
| Tracing | Distributed trace ID propagated via Kafka headers (`traceId`, `spanId`) |
| Rate limiting | Bucket4j per-user/submission endpoints; FCM rate limits per push channel |

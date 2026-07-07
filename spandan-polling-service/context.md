# Spandan Polling Service — Context File

## Project Identity
- **System:** Spandan — a classroom engagement analytics platform
- **Service:** Polling Service (bounded context: Question Lifecycle Orchestration)
- **Architecture:** Clean Architecture layered inside a Spring Boot microservice
- **DB-per-service:** yes — owns `polling_db` exclusively

## Core Responsibility
**Question Lifecycle** — from poll-ready to poll-closed. Controls exactly when each question's poll opens, how long it stays open, and when it closes — reliably, without duplication, in strict sequence. Understands the educational hierarchy (lecture → section → subsection) only for sequencing and navigation. Publishes poll lifecycle events for downstream services. Never computes analytics, never stores student responses, never generates reports, never performs knowledge tracing.

## Bounded Context: Question Lifecycle Orchestration
**Inside:** Quiz state, question state, timer state, poll sequencing, section/subsection progression, educational metadata propagation, poll lifecycle events (PollOpenedEvent, PollClosedEvent, QuizStartingEvent, QuizCompleted, QuizCancelled, TimerStarted, TimerExpired)

**Outside (explicitly NOT owned):**
- Question content, text, options, correct answers → QGS
- Student responses, interaction history → Response Service
- Display timing per student, response time computation → RTC (Gateway Service)
- Student answer events → RTC (QuestionAnsweredEvent, QuestionDisplayedEvent, QuestionTimedOutEvent)
- Analytics, engagement, mastery, leaderboard → Analytics Service
- Reports, exports, dashboards → Reporting Service
- Identity, authentication → Auth Service
- Notifications → Notification Service

## Interaction Framework Role

Polling Service participates only at the **beginning and end** of the interaction lifecycle:

```
Question Generation Service
        ↓
  Polling Service  ←── opens poll, closes poll
        ↓
  RTC / Gateway Service  ←── manages display timing, detects answer/timeout
        ↓
  Response Service  ←── stores immutable interaction history
        ↓
  Analytics Service  ←── derives engagement, mastery, knowledge tracing
        ↓
  Reporting Service  ←── generates dashboards, exports
```

Polling Service is **unaware of what happens after the poll is opened**. It does not consume:
- QuestionAnsweredEvent
- QuestionDisplayedEvent
- QuestionTimedOutEvent
- Any response, analytics, or reporting events

## Key Architecture Decisions

### CP + Strong Consistency (MANDATORY)
One authoritative poll state. No split-brain polls, no duplicate opens, no conflicting closures.

| Decision | Implementation |
|---|---|
| All writes go to PostgreSQL primary | Single datasource, no read-replicas for write paths |
| State transitions use pessimistic row locking | `SELECT ... FOR UPDATE` on quiz row before advancing |
| "Advance to next question" is atomic | Single `@Transactional` with `PESSIMISTIC_WRITE` |
| Timer expiry detection uses distributed lock | `SELECT ... FOR UPDATE SKIP LOCKED` on timer rows in sweep query |
| Duplicate publish prevention | `UNIQUE(quiz_id, sequence_position)` DB constraint + app-level `StateTransitionGuard` |
| Kafka events are best-effort after DB commit | DB state is authoritative; Kafka publish is fire-and-forget with retry |
| Sweep derives expiry from persisted `timer_started_at + duration_seconds` | Restart-safe by design |
| Poll open/close per question | `PollOpenedEvent` when poll opens; `PollClosedEvent` when poll closes |

### Poll vs Quiz
- **Quiz**: container with a start and end — holds an ordered list of questions
- **Poll**: a single question's open-for-submission window — multiple polls per quiz
- `PollOpenedEvent`/`PollClosedEvent` emitted per poll (one per question)
- `QuizStartingEvent`/`QuizCompleted` emitted once per quiz

### Why CP over AP
- A poll must never open twice for the same question
- Two pods must never both fire `PollClosedEvent` for the same poll
- A paused quiz must resume with the exact remaining time
- Illegal state transitions (e.g., POLL_CLOSED → POLL_OPEN) must be impossible
- CP's availability cost during partitions (transient rejections retryable) is negligible compared to the cost of a corrupted poll state

### CAP Theorem Analysis
| Aspect | Choice | Rationale |
|---|---|---|
| Consistency | **CP** — all replicas see the same poll state | A split-brain poll (two pods think it's open) is unacceptable |
| Availability | Degraded during partition (writes rejected) | Transient errors are retryable; no data loss |
| Partition Tolerance | Required by distributed nature | Kafka topic, DB cluster, Redis |

### Consistency Model
- **Strong consistency within a single poll operation**: `REPEATABLE_READ` isolation + `SELECT FOR UPDATE` ensures each state transition is atomic
- **Eventual consistency across services**: RTC/Response Service may receive `PollOpenedEvent` after a slight delay, but DB is always authoritative
- **Read-your-writes**: Teacher's `GET /current` after `POST /start` reads from primary DB

### Event Ordering Guarantees
- **Per-quiz ordering**: events partitioned by `quizId` → all events for a quiz arrive in order at each consumer group
- **Per-question ordering**: `PollOpenedEvent` always precedes any downstream interaction events because RTC only opens display window after receiving it
- **At-least-once delivery**: Kafka producer has `enable.idempotence: true`, consumers should be idempotent

### Failure & Retry Strategy
| Failure | Mechanism | Recovery |
|---|---|---|
| DB write failure | `@Transactional` rolls back | Client retries the API call |
| Kafka publish failure | Circuit breaker (Resilience4j) | Logged and dropped — DB is authoritative |
| Timer expiry sweep failure | Per-timer exception handling | Next sweep cycle picks up |
| Lock timeout on concurrent access | PostgreSQL lock wait timeout | Client retries |
| Pod crash mid-transaction | DB rollback on connection drop | Next request re-evaluates state |

### Idempotency
- **CREATE quiz**: DB generates UUID, caller provides UUID — no accidental duplicates
- **START quiz**: idempotent via quiz status guard — calling again on RUNNING quiz fails deterministically
- **ADVANCE to next question**: `UNIQUE(quiz_id, sequence_position)` prevents duplicate sequencing
- **Kafka events**: `eventId` (UUID) in each event enables deduplication at consumers; PS does not deduplicate on send

## Technical Stack
- **Language:** Java 17
- **Framework:** Spring Boot 3.2.x (Spring Web, Security, Data JPA, Kafka, Scheduler)
- **Database:** PostgreSQL 16 (`polling_db` schema via Flyway)
- **State/Coordination:** Redis 7 (distributed locks for sweep, optional sorted-set timers at scale)
- **Messaging:** Kafka 3.6 (publisher of `polling-events`, consumer of `question-generation-events`)
- **Testing:** JUnit 5, Mockito, Testcontainers (PostgreSQL + Redis + Kafka)
- **Build:** Maven 3.9+
- **Deploy:** Docker → Kubernetes (stateless, HPA-scaled)

## Scalability Considerations
- **Stateless API layer**: any pod handles any request — scale horizontally behind a load balancer
- **Database pressure**: all write traffic hits a single PostgreSQL primary — scale vertically or use read replicas for `GET /current` (accepting slight staleness)
- **Kafka partitioning**: `polling-events` topic partitioned by `quizId` — consumer parallelism limited by partition count
- **Sweep contention**: `SELECT ... FOR UPDATE SKIP LOCKED` prevents pod contention on timer expiry; at scale, use Redis sorted sets for O(log n) expiry
- **Connection pooling**: HikariCP tuned to 10 connections minimum, each pod handles hundreds of concurrent polls

## Security Considerations
- **Authentication**: JWT-based, validated by shared secret with Auth Service
- **Authorization**: TEACHER role required for all mutation endpoints; `verifyOwnership()` ensures teacher can only act on their own quizzes
- **Input validation**: `@Valid` annotations on request bodies, timer bounds checked (5–600s), position uniqueness enforced
- **Kafka**: no authentication between brokers (internal network); topic-level ACLs if cross-namespace
- **SQL injection**: prevented by JPA parameterized queries
- **Secrets**: DB credentials, JWT secret, Kafka passwords injected via environment variables, not hardcoded

## Anti-Corruption Boundary
- Polling Service never stores question text, options, correct answers, or analytics — only `question_ref_id`, hierarchy IDs, and educational metadata for propagation
- No other service writes to `polling_db`
- Other services consume `polling-events` (Kafka) — never query polling DB directly

## API Surface
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/v1/polling/quizzes` | TEACHER | Create quiz draft with question list + hierarchy context |
| POST | `/api/v1/polling/quizzes/{quizId}/start` | TEACHER | Start quiz (DRAFT→SCHEDULED, emits `QuizStartingEvent`) |
| POST | `/api/v1/polling/quizzes/{quizId}/pause` | TEACHER | Pause active quiz |
| POST | `/api/v1/polling/quizzes/{quizId}/resume` | TEACHER | Resume paused quiz |
| POST | `/api/v1/polling/quizzes/{quizId}/end` | TEACHER | End quiz early |
| POST | `/api/v1/polling/quizzes/{quizId}/cancel` | TEACHER | Cancel quiz (no polls emitted) |
| POST | `/api/v1/polling/quizzes/{quizId}/questions/{questionId}/skip` | TEACHER | Skip to next question (closes current poll, opens next) |
| POST | `/api/v1/polling/quizzes/{quizId}/questions/{questionId}/cancel` | TEACHER | Cancel a SCHEDULED question |
| GET | `/api/v1/polling/quizzes/{quizId}` | TEACHER | Quiz detail with question states and metadata |
| GET | `/api/v1/polling/quizzes/{quizId}/current` | Any | Current active poll status (for client resync) |

### CreateQuizRequest Payload
```json
{
  "lectureId": "uuid",
  "sectionId": "uuid",
  "subsectionId": "uuid",
  "questions": [
    {
      "questionRefId": "uuid",
      "sequencePosition": 1,
      "timerDurationSeconds": 60,
      "topicId": "uuid",
      "conceptId": "uuid",
      "learningObjectiveId": "uuid",
      "difficulty": "MEDIUM",
      "questionType": "MCQ_SINGLE",
      "correctAnswer": "A"
    }
  ]
}
```

## Domain Model
```
Quiz: id, teacherId (UUID), quizStatus, currentQuestionNumber,
      totalQuestions, lectureId (UUID, nullable), sectionId (UUID, nullable),
      subsectionId (UUID, nullable), startedAt, endedAt, createdAt, updatedAt

QuizQuestion: id, quizId, questionRefId (UUID, cross-service), sequencePosition,
              questionStatus, timerDurationSeconds, lectureId, sectionId, subsectionId,
              topicId, conceptId, learningObjectiveId,
              difficulty (String), questionType (String), correctAnswer (String),
              pollOpenedAt, pollClosedAt, cancelledAt, createdAt, updatedAt
              UNIQUE(quiz_id, sequence_position)

QuizTimer: id, quizQuestionId, timerStatus, durationSeconds, remainingSeconds,
           timerStartedAt, timerPausedAt

QuizStatus: DRAFT, SCHEDULED, RUNNING, PAUSED, COMPLETED, CANCELLED
QuestionStatus: SCHEDULED, POLL_OPEN, RUNNING, TIMER_EXPIRED, POLL_CLOSED, CANCELLED
TimerStatus: NOT_STARTED, RUNNING, PAUSED, EXPIRED
```

### Question Metadata (Preserved, Never Used)
Polling Service **persists and propagates** the following metadata from QGS but **never reads or acts on it**:
- `topicId`, `conceptId`, `learningObjectiveId` — educational taxonomy
- `difficulty` — question difficulty level (EASY, MEDIUM, HARD)
- `questionType` — MCQ_SINGLE, MCQ_MULTI, TRUE_FALSE, SHORT_ANSWER, CODING
- `correctAnswer` — opaque string; PS stores it but never evaluates correctness

This metadata flows through to `PollOpenedEvent` for downstream services (RTC, Analytics, Reporting).

## State Machines

### Question Lifecycle
```
SCHEDULED → POLL_OPEN → RUNNING → TIMER_EXPIRED → POLL_CLOSED
               │                                      │
               └───→ TIMER_EXPIRED (skip/expiry)       │
               └───→ POLL_CLOSED (direct, edge case)   │
                                                  CANCELLED (only from SCHEDULED)
```
- `PollOpenedEvent` emitted on SCHEDULED → POLL_OPEN
- `PollClosedEvent` emitted on TIMER_EXPIRED → POLL_CLOSED or manual skip

### Quiz Lifecycle
```
DRAFT → SCHEDULED → RUNNING ⇄ PAUSED → COMPLETED
                        ↓
                   CANCELLED
```
- `QuizStartingEvent` emitted on DRAFT → SCHEDULED
- `QuizCompleted` emitted on last question POLL_CLOSED

## Section/Subsection Progression
- Quiz created with `lectureId`, `sectionId`, `subsectionId` scopes
- Questions ordered by `sequencePosition` — within-section sequencing is an external concern
- When advancing, PS emits full educational metadata in `PollOpenedEvent`
- Progression logic is entirely internal — PS just chooses which question is next
- Downstream services (RTC, AS) consume hierarchy metadata for display and analytics

## Timer Management
- Each question has `timerDurationSeconds` set at quiz creation
- Timer starts when question enters POLL_OPEN
- Timer expires based on persisted `timer_started_at + duration_seconds`
- Sweep runs every second, uses `SELECT ... FOR UPDATE SKIP LOCKED`
- Pause/resume persists `remaining_seconds` for exact resume
- **PS manages only the poll timer** — per-student display timing and per-student timeout detection are RTC's responsibility

## Kafka Events Consumed
| Event | Topic | Producer | Purpose |
|---|---|---|---|
| `QuestionGeneratedEvent` | `question-generation-events` | QGS | Learn question metadata (hierarchy IDs, difficulty, type) for sequencing |
| `QuestionsGenerated` | `question-generation-events` | QGS | Notification of set completion (read-model) |

PS consumes no events from RTC, Analytics, Response, or Reporting services.

## Kafka Events Produced
| Event | Topic | Trigger | Consumers |
|---|---|---|---|
| `PollOpenedEvent` | `polling-events` | Question enters POLL_OPEN | RTC (Gateway), Response Service |
| `PollClosedEvent` | `polling-events` | Question enters POLL_CLOSED | RTC (Gateway), Response Service |
| `QuizStartingEvent` | `polling-events` | Quiz transitions DRAFT → SCHEDULED | Notification Service |
| `QuizCompleted` | `polling-events` | All questions POLL_CLOSED | Analytics Service, Notification Service |
| `QuizCancelled` | `polling-events` | Teacher cancels quiz | Response Service, RTC |
| `TimerStarted` | `polling-events` | Timer starts per-question | Internal observability |
| `TimerExpired` | `polling-events` | Timer reaches 0 | Internal observability |

### Event Payloads

`PollOpenedEvent`:
```json
{
  "eventId": "uuid",
  "sessionId": "uuid",
  "lectureId": "uuid",
  "sectionId": "uuid",
  "subsectionId": "uuid",
  "topicId": "uuid",
  "conceptId": "uuid",
  "learningObjectiveId": "uuid",
  "difficulty": "MEDIUM",
  "questionType": "MCQ_SINGLE",
  "correctAnswer": "A",
  "questionId": "uuid",
  "questionRefId": "uuid",
  "questionSequence": 1,
  "pollStartTime": "2026-07-03T10:30:00Z",
  "pollDuration": 60,
  "quizId": "uuid"
}
```

`PollClosedEvent`:
```json
{
  "eventId": "uuid",
  "sessionId": "uuid",
  "lectureId": "uuid",
  "questionId": "uuid",
  "pollEndTime": "2026-07-03T10:31:00Z",
  "quizId": "uuid"
}
```

`QuizStartingEvent`:
```json
{
  "eventId": "uuid",
  "quizId": "uuid",
  "lectureId": "uuid",
  "teacherId": "uuid",
  "scheduledStart": "2026-07-03T10:29:00Z",
  "startsInMs": 60000
}
```

`QuizCompleted`:
```json
{
  "eventId": "uuid",
  "quizId": "uuid",
  "lectureId": "uuid",
  "teacherId": "uuid",
  "endedAt": "2026-07-03T10:35:00Z"
}
```

## Coupling (Minimal, Explicit)
| Dependency | Protocol | Why Necessary |
|---|---|---|
| Auth Service | REST (sync) | Identity + role verification per teacher action |
| QGS | Kafka (consume `QuestionGeneratedEvent`) | Question metadata for poll sequencing |
| RTC (Gateway) | Kafka (produce `PollOpenedEvent`/`PollClosedEvent`) | Signal poll state so RTC can manage per-student display timing |
| Response Service | Kafka (produce `PollOpenedEvent`/`PollClosedEvent`) | Signal poll state so RS validates interaction window |
| Notification Service | Kafka (produce `QuizStartingEvent`, `QuizCompleted`) | Teacher/student alerts |

No coupling to: Analytics Service, Reporting Service, Transcription Service, Recording Service, Lecture Service, User Service, Grading Service.

## Migration Strategy (V3 → V4+)
1. **Phase 1 — Schema**: Apply V4 migration (add hierarchy + metadata columns) — backward-compatible, existing rows get NULLs
2. **Phase 2 — Deploy new code**: Rolling update — old pods still work with old columns, new pods use new columns
3. **Phase 3 — Backfill**: Optional batch job to populate `lecture_id`, `section_id`, `subsection_id` on existing quizzes from QGS metadata
4. **Phase 4 — Old column removal** (future): Drop `published_at`/`closed_at` columns and old enum values once all consumers migrate

## Testing Strategy
| Layer | Tool | Scope |
|---|---|---|
| Unit (domain) | JUnit 5 | Entity state transitions, guard logic, timer math |
| Unit (service) | JUnit 5 + Mockito | QuizService orchestration, authorization, exception paths |
| Integration | Testcontainers | Full create → start → advance → complete lifecycle with Postgres + Kafka |
| Contract | Spring Cloud Contract (future) | PollOpenedEvent/PollClosedEvent schemas for downstream consumers |
| Performance | k6 / Gatling (future) | Timer sweep scalability under 1000 concurrent questions |

## Service Ownership Matrix
| Capability | Owner |
|---|---|
| Question content, options, correct answers, difficulty, type | QGS |
| Poll lifecycle (open, close, sequence, timing) | **Polling Service** |
| Per-student display timing, timeout detection | RTC (Gateway) |
| Immutable answer storage, interaction history | Response Service |
| Engagement analytics, mastery, knowledge tracing | Analytics Service |
| Dashboards, exports, reports | Reporting Service |
| Auth, identity, roles | Auth Service |
| Push/email/SMS notifications | Notification Service |

## Environment Variables
| Variable | Description |
|---|---|
| `POLLING_DB_URL` | PostgreSQL JDBC URL |
| `POLLING_DB_USER` | DB user |
| `POLLING_DB_PASSWORD` | DB password |
| `REDIS_HOST` | Redis host |
| `REDIS_PORT` | Redis port |
| `KAFKA_BOOTSTRAP_SERVERS` | Kafka broker list |
| `JWT_SECRET` | Shared secret for JWT validation |
| `AUTH_SERVICE_URL` | Auth service base URL |

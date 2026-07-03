# Spandan Polling Service — Context File

## Project Identity
- **System:** Spandan — a classroom engagement platform
- **Service:** Polling Service (bounded context: Quiz Orchestration)
- **Architecture:** Clean Architecture layered inside a Spring Boot microservice
- **DB-per-service:** yes — owns `polling_db` exclusively

## Core Responsibility
Orchestrator of quiz/question lifecycle timing. Given an approved, ordered set of questions, controls exactly when each goes live, how long it stays live, when it closes — reliably, without duplication, in strict sequence.

## Key Architecture Decisions

### CP + Strong Consistency (MANDATORY)
There must be **one authoritative poll state** — started, ended, timer expired. Multiple conflicting states are unacceptable.

| Decision | Implementation |
|---|---|
| All quiz/state writes go to PostgreSQL **primary** | Single datasource, no read-replicas for write paths |
| State transitions use **pessimistic row locking** | `SELECT ... FOR UPDATE` on quiz row before advancing |
| "Advance to next question" is **atomic** | Single `@Transactional` with `PESSIMISTIC_WRITE` on quiz + question rows |
| Timer expiry detection uses **distributed lock** | `SELECT ... FOR UPDATE SKIP LOCKED` on timer rows in the sweep query |
| Duplicate publish prevention | `UNIQUE(quiz_id, sequence_position)` DB constraint + app-level `StateTransitionGuard` |
| Kafka events are **best-effort after DB commit** | DB state is the authoritative source; Kafka publish is fire-and-forget with retry |
| Sweep derives expiry from persisted `timer_started_at + duration_seconds` | Never from in-memory state; restart-safe by design |

### Why CP over AP
- A question must never be published twice or in wrong order
- Two pods must never both fire `TimerExpired` for the same question
- A paused quiz must resume with the exact remaining time
- Illegal state transitions (e.g., CLOSED → RUNNING) must be impossible

## Bounded Context: Quiz Orchestration
**Inside:** Quiz run state, question run state, timer state, sequencing logic
**Outside:** Question content/options/answers (Question Service), student responses (Response Service), scores/analytics (Analytics Service), leaderboard (Leaderboard Service), real-time delivery (Realtime Communication Service), identity (Auth Service)

### Anti-Corruption Boundary
- Polling Service never stores question text, options, or correct answers — only `question_ref_id`
- No other service writes to `polling_db`
- Other services consume `polling-events` (Kafka) — never query polling DB directly

## Technical Stack
- **Language:** Java 17
- **Framework:** Spring Boot 3.2.x (Spring Web, Security, Data JPA, Kafka, Scheduler)
- **Database:** PostgreSQL 16 (`polling_db` schema via Flyway)
- **State/Coordination:** Redis 7 (distributed locks for sweep, optional sorted-set timers at scale)
- **Messaging:** Kafka 3.6 (publisher of `polling-events`, consumer of `question-review-events`/`auth-events`; new events: `ReadyForPolling` from QRS, `QuizStartingEvent` to NS)
- **Testing:** JUnit 5, Mockito, Testcontainers (PostgreSQL + Redis + Kafka)
- **Build:** Maven 3.9+
- **Deploy:** Docker → Kubernetes (stateless, HPA-scaled)

## API Surface
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/v1/polling/quizzes` | TEACHER | Create quiz draft |
| POST | `/api/v1/polling/quizzes/{quizId}/start` | TEACHER | Start quiz (DRAFT→SCHEDULED, emits `QuizStartingEvent`, 1min delay → RUNNING → `PollStarted`) |
| POST | `/api/v1/polling/quizzes/{quizId}/pause` | TEACHER | Pause quiz |
| POST | `/api/v1/polling/quizzes/{quizId}/resume` | TEACHER | Resume quiz |
| POST | `/api/v1/polling/quizzes/{quizId}/end` | TEACHER | End quiz |
| POST | `/api/v1/polling/quizzes/{quizId}/cancel` | TEACHER | Cancel quiz |
| POST | `/api/v1/polling/quizzes/{quizId}/questions/{questionId}/cancel` | TEACHER | Cancel scheduled question |
| GET | `/api/v1/polling/quizzes/{quizId}` | TEACHER | Quiz detail |
| GET | `/api/v1/polling/quizzes/{quizId}/current` | Any | Current poll status |

## Domain Model
```
Quiz: id, teacherId (UUID, cross-service), quizStatus, currentQuestionNumber,
      totalQuestions, startedAt, endedAt, createdAt, updatedAt

QuizQuestion: id, quizId, questionRefId (UUID, cross-service), sequencePosition,
              questionStatus, timerDurationSeconds, publishedAt, closedAt, cancelledAt,
              createdAt, updatedAt
              UNIQUE(quiz_id, sequence_position)

QuizTimer: id, quizQuestionId, timerStatus, durationSeconds, remainingSeconds,
           timerStartedAt, timerPausedAt

QuizStatus: DRAFT, SCHEDULED, RUNNING, PAUSED, COMPLETED, CANCELLED
QuestionStatus: SCHEDULED, PUBLISHED, RUNNING, TIMER_EXPIRED, CLOSED, CANCELLED
TimerStatus: NOT_STARTED, RUNNING, PAUSED, EXPIRED
```

## State Machines

### Question Lifecycle
```
SCHEDULED → PUBLISHED → RUNNING → TIMER_EXPIRED → CLOSED
                                                 ↘
                                            CANCELLED (only from SCHEDULED)
```

### Quiz Lifecycle
```
DRAFT → SCHEDULED → RUNNING ⇄ PAUSED → COMPLETED
                        ↓
                   CANCELLED (from DRAFT, SCHEDULED, RUNNING, or PAUSED)
```

## CP Consistency Points (Code-Level Verification Required)
- [ ] `startQuiz`: lock quiz row with `SELECT ... FOR UPDATE`; transition DRAFT → SCHEDULED → emit `QuizStartingEvent`; after 1-minute delay → SCHEDULED → RUNNING → emit `PollStarted`
- [ ] `quizStartingEvent`: produced only once per quiz lifecycle; `eventId` used as dedup key by Notification Service
- [ ] `advanceToNextQuestion`: atomic transaction — lock quiz, lock current question, transition, unlock
- [ ] `timerExpirySweep`: `SELECT ... FOR UPDATE SKIP LOCKED` on `RUNNING` timers past expiry; one pod wins
- [ ] `pause/resume`: lock quiz row; persist `remaining_seconds`; no lost time on resume
- [ ] `duplicatePublishPrevention`: DB `UNIQUE(quiz_id, sequence_position)` + `StateTransitionGuard` in service
- [ ] `questionCancel`: only legal from `SCHEDULED`; guarded at app layer + DB check
- [ ] All Kafka publishes happen **after** DB commit (use `@TransactionalEventListener(phase = AFTER_COMMIT)`)

## Environment Variables (Required)
| Variable | Description |
|---|---|
| `POLLING_DB_URL` | PostgreSQL JDBC URL |
| `POLLING_DB_USER` | DB user |
| `POLLING_DB_PASSWORD` | DB password |
| `REDIS_HOST` | Redis host |
| `REDIS_PORT` | Redis port |
| `KAFKA_BOOTSTRAP_SERVERS` | Kafka broker list |
| `JWT_SECRET` | Shared secret for JWT validation (HMAC-SHA256) |
| `AUTH_SERVICE_URL` | Auth service base URL for /validate calls |

## Coupling (Minimal, Explicit)
| Dependency | Protocol | Why Necessary |
|---|---|---|
| Authentication Service | REST (synchronous) | Identity + role verification every write — auth cannot be eventually consistent |
| Question Review Service | Kafka (async consume, `question-review-events`) | `QuestionApproved`/`QuestionRejected`/`QuestionEdited`/`QuestionSaved`/`ReadyForPolling` events for publish gating |
| Realtime Communication Service | Kafka (async produce) | Fan-out to thousands of WebSocket connections must not block orchestrator |
| Response Service | Kafka (async produce) | `PollStarted`/`TimerExpired`/`PollEnded` open/close answer windows |
| Notification Service | Kafka (async produce) | `QuizStartingEvent` — emitted when quiz transitions DRAFT → SCHEDULED, 1 min before `PollStarted` |
| Analytics/Leaderboard | Kafka (async produce) | Downstream, non-blocking consumers — never on critical path |

### Kafka Events Produced (Updated)

| Event | Trigger | Consumers |
|---|---|---|
| `QuizStartingEvent` | Teacher clicks Start (DRAFT → SCHEDULED) | Notification Service |
| `PollStarted` | Quiz transitions SCHEDULED → RUNNING (1 min after start) | Gateway, Response Service, Analytics Service |
| `TimerStarted` | Question published | Gateway, Response Service |
| `TimerExpired` | Timer reaches 0 | Gateway, Response Service |
| `PollEnded` | Question/quiz closed | Gateway, Response Service |
| `QuizCompleted` | All questions done | Analytics Service |
| `QuizCancelled` | Teacher cancels | Response Service |

### QuizStartingEvent Timing
```
Teacher clicks Start
  ↓
DRAFT → SCHEDULED → emit QuizStartingEvent (1-min countdown begins)
  ↓ (scheduled task after 1 minute)
SCHEDULED → RUNNING → emit PollStarted
  ↓
Question 1 appears on student screens
```

No direct coupling to: Student answers, question content, transcripts, recording.

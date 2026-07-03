# Spandan Response Service — Context File

## Project Identity
- **System:** Spandan — a classroom engagement platform
- **Service:** Response Service (bounded context: Response Collection Context)
- **Architecture:** Clean Architecture layered inside a Spring Boot microservice
- **DB-per-service:** yes — owns `response_db` exclusively

## Core Responsibility
System of record for what a student answered, when, and whether it was correct. Accepts submissions within open windows, rejects duplicates/lates, grades against the correct option, timestamps authoritatively, and signals finalization on poll close. Answers: **"What did this student submit, when, and was it correct?"**

## Key Architecture Decisions

### CP + Strong Consistency (MANDATORY — write path)
Exactly one accepted response per student per question. Multiple conflicting submissions are unacceptable.

| Decision | Implementation |
|---|---|
| Duplicate prevention enforced at DB level | `UNIQUE(student_id, question_id)` constraint on `responses` table — the authoritative backstop |
| Distributed lock as fast-path guard | Redis `SET student_id:question_id NX PX 5000` acquired before processing; short TTL (5s) so crashed pods don't hold locks |
| `studentId` never from request body | Derived exclusively from validated JWT principal — closes impersonation vector |
| Server-assigned timestamp | `response_timestamp` always `now()`, never client-supplied |
| Window-close check is local | `question_grading_info.accepting_submissions` + `now() > window_closes_at` — no synchronous call to Polling Service |
| Kafka events fire after DB commit | `@TransactionalEventListener(phase = AFTER_COMMIT)` — DB is authoritative, Kafka is best-effort |
| Atomic timestamp ordering for window-close races | Submission and `TimerExpired` both go through same transactional boundary; whichever commits first wins consistently |
| Poll finalization is a single aggregate query | `COUNT`, `SUM(is_correct)` via `idx_responses_question_id` — not row-by-row iteration |

### Why CP over AP
- A duplicate submission must never silently overwrite a first valid answer
- A late submission (window closed) must never be accepted
- A student's grade depends on the single authoritative response record — conflicting "merge" is not a safe recovery
- CP's availability cost during partitions (reject/retry) is acceptable: a rejected submission can be retried within the same open timer window

### Consistency Split
- **Write path (submission acceptance): strong consistency** — DB unique constraint + distributed lock
- **Downstream propagation (events to Analytics/Leaderboard/Teacher Stats): eventual consistency** — aggregations tolerate ms-level delay

## Bounded Context: Response Collection Context
**Inside:** Response records and lifecycle (submitted → validated → graded), duplicate/late rejection logic, per-question raw tallies for downstream handoff
**Outside:** Question content/correct-answer authorship (Question Service), poll/quiz timing state (Polling Service), trend analytics (Analytics Service), rankings (Leaderboard Service), delivery (Realtime Communication Service), identity (Auth Service)

### Anti-Corruption Boundary
- Response Service maintains only a minimal local projection of question data (`question_grading_info`) — just enough to grade (correct option, window timing), populated by Kafka events
- No other service reads/writes `response_db`
- Other services consume response-events (Kafka) or pull via REST — never query response DB directly

## Technical Stack
- **Language:** Java 17
- **Framework:** Spring Boot 3.2.x (Spring Web, Security, Data JPA, Data Redis, Kafka)
- **Database:** PostgreSQL 16 (`response_db` schema via Flyway)
- **State/Coordination:** Redis 7 (distributed locks for cross-pod duplicate prevention)
- **Messaging:** Kafka 3.6 (producer of `response-events`, consumer of `polling-events`)
- **Rate Limiting:** Bucket4j per-student on submit endpoint
- **Testing:** JUnit 5, Mockito, Testcontainers (PostgreSQL + Redis + Kafka)
- **Build:** Maven 3.9+
- **Deploy:** Docker → Kubernetes (stateless, HPA-scaled)

## API Surface
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/v1/responses` | STUDENT | Submit answer |
| GET | `/api/v1/responses/quiz/{quizId}/question/{questionId}/me` | Any | Get own response |
| GET | `/api/v1/responses/question/{questionId}` | TEACHER | All responses for a question (paginated) |
| GET | `/api/v1/responses/quiz/{quizId}/question/{questionId}/status` | Any | Submission status check |
| POST | `/api/v1/responses/validate` | Any | Pre-check convenience (non-authoritative) |

## Domain Model
```
Response: id (UUID), studentId (UUID, cross-service), quizId (UUID, cross-service),
          questionId (UUID, cross-service), selectedOption, correctOption (copied at grading time),
          isCorrect, submissionStatus (ACCEPTED|REJECTED_DUPLICATE|REJECTED_LATE|REJECTED_INVALID),
          responseTimestamp, createdAt
          UNIQUE(student_id, question_id)

QuestionGradingInfo: questionId (PK), quizId, correctOption,
                     windowOpenedAt, windowClosesAt, acceptingSubmissions
```

## Submission Flow
1. Gateway forwards answer to `POST /api/v1/responses` with `studentId` from JWT
2. Acquire Redis lock `studentId:questionId` (5s TTL)
3. Validate: question exists in `question_grading_info`, window is open, not duplicate
4. INSERT into `responses` — DB unique constraint is final arbiter
5. Release lock
6. On `ACCEPTED`: emit `ResponseSubmitted` to Kafka (→ Gateway → student's `/user/{userId}/queue/result`)
7. On rejection: emit `DuplicateSubmissionRejected`/`LateSubmissionRejected` to Kafka (observability)

## Kafka Events Produced
| Event | Trigger | Consumers |
|---|---|---|
| `ResponseSubmitted` | ACCEPTED submission | Gateway → student result relay, Analytics |
| `DuplicateSubmissionRejected` | Duplicate detected | Monitoring/observability |
| `LateSubmissionRejected` | Submission after window closed | Monitoring/observability |
| `PollResponsesFinalized` | TimerExpired/PollEnded consumed, final tallies computed | Teacher Statistics, Analytics, Leaderboard |
| `TeacherStatisticsReady` | Computed after finalization | Gateway → teacher channel |
| `QuestionResultsReady` | After finalization | Analytics, Leaderboard Service |

## Kafka Events Consumed
| Event | Producer | Purpose |
|---|---|---|
| `PollStarted` | Polling Service | Open submission window, populate grading info |
| `QuestionPublished` | Question Service / Polling | Learn `correctOption` for grading (pre-populate local projection) |
| `TimerExpired` | Polling Service | Close submission window (`accepting_submissions = false`) |
| `PollEnded` | Polling Service | Confirms close, triggers finalization sweep |
| `QuizCancelled` | Polling Service | Abort any open submissions for that quiz |

## DB Tables (Flyway)
```
V1__create_question_grading_info_table.sql
V2__create_responses_table.sql
```
- `question_grading_info`: PK `question_id`, no FK to `responses` (different lifecycle)
- `responses`: `UNIQUE(student_id, question_id)`, indexes on `question_id`, `quiz_id`, `student_id`

## Grace Period & Race Handling
- Window is closed by `TimerExpired` consumption — an absolute `window_closes_at` timestamp is a redundant safety net
- If a submission arrives *exactly* as `TimerExpired` is processed: whichever transaction commits first wins (submission accepted just before close, or rejected as late)
- If `question_grading_info` not yet populated (student beats event propagation): short bounded local retry (~200ms, 2-3 attempts) then `REJECTED_INVALID` — this narrow exception to "never block hot path" is justified because silently mis-grading is worse than ms-level latency in a rare race

## CP Consistency Points (Code-Level Verification Required)
- [ ] `submitResponse`: Redis lock acquire → validate window open → check duplicate (SELECT) → INSERT (DB unique constraint catches race) → release lock
- [ ] `duplicateSubmissionTest`: DB unique constraint must be sole authorititative source — prove with concurrent fire test
- [ ] `questionGradingInfoRace`: bounded local retry if grading info missing on first submission for a question
- [ ] `pollFinalization`: `TimerExpired`/`PollEnded` consumption triggers atomic aggregate query → emit `PollResponsesFinalized`
- [ ] All Kafka publishes happen **after** DB commit (`@TransactionalEventListener(phase = AFTER_COMMIT)`)
- [ ] Bucket4j rate limiting on submit endpoint per-student
- [ ] JWT-derived `studentId` only — never from request body

## Environment Variables (Required)
| Variable | Description |
|---|---|
| `RESPONSE_DB_URL` | PostgreSQL JDBC URL |
| `RESPONSE_DB_USER` | DB user |
| `RESPONSE_DB_PASSWORD` | DB password |
| `REDIS_HOST` | Redis host |
| `REDIS_PORT` | Redis port |
| `KAFKA_BOOTSTRAP_SERVERS` | Kafka broker list |
| `AUTH_SERVICE_URL` | Auth service base URL for /validate calls |
| `JWT_SECRET` | Shared secret for JWT validation (HMAC-SHA256) |

## Coupling (Minimal, Explicit)
| Dependency | Protocol | Why Necessary |
|---|---|---|
| Authentication Service | REST (synchronous) | JWT validation per request — identity cannot be eventually consistent |
| Polling Service | Kafka (async consume) | `PollStarted`/`TimerExpired`/`PollEnded`/`QuizCancelled` for window state |
| Question Service | Kafka (async consume) | `QuestionPublished` for correct-option projection |
| Realtime Communication Service | Kafka (async produce) | `ResponseSubmitted`/`TeacherStatisticsReady` for result delivery |
| Analytics Service | Kafka (async produce) | `QuestionResultsReady`/`PollResponsesFinalized` — async batch consumers |
| Leaderboard Service | Kafka (async produce) | `QuestionResultsReady`/`PollResponsesFinalized` — async batch consumers |

No direct coupling to: Notification Service, Question Generation Service, Recording Service, Transcription Service.

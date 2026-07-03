# Spandan Analytics Service — Context File

## Project Identity
- **System:** Spandan — a classroom engagement platform
- **Service:** Analytics Service (bounded context: Post-Session Insight Context)
- **Architecture:** Clean Architecture layered inside a Spring Boot microservice
- **DB-per-service:** yes — owns `analytics_db` exclusively

## Core Responsibility
Post-mortem reporting engine. Remains completely idle until a session ends — never computes anything during a live quiz. On `QuizCompleted`, pulls the full finalized response dataset from Response Service, derives aggregated insights (question, student, class, participation, difficulty, leaderboard), persists them, and signals readiness. Answers: **"What actually happened in this session, and what does it mean?"**

## Key Architecture Decisions

### AP + Eventual Consistency
No non-reconcilable invariants — aggregation is naturally idempotent and commutative.

| Decision | Implementation |
|---|---|
| Idle until `QuizCompleted` | No mid-quiz event consumption; all computation triggered by this single event |
| Response data pulled via REST | `GET /responses/session/{sessionId}` from Response Service after trigger |
| Set-based SQL aggregation | `GROUP BY`, `SUM`, `AVG` in PostgreSQL — not row-by-row iteration |
| Idempotent upserts | `UNIQUE` constraints on all tables act as natural upsert keys |
| Redis caching (optional perf) | Read-through cache for frequently-requested reports — not required for correctness |
| Distributed lock (optional efficiency) | `SETNX quizId` to avoid redundant duplicate computation — not a correctness lock |
| Kafka events fire after DB commit | `@TransactionalEventListener(phase = AFTER_COMMIT)` |

### Why AP over CP
- No "exactly one accepted X" invariant to protect — reprocessing identical input produces identical output
- Aggregation of immutable, finalized facts is naturally commutative
- Serving slightly-stale reports during a partition (AP) is better than refusing to serve (CP)
- A missed analytics push is recoverable via REST pull; a corrupted grade is not

## Bounded Context: Post-Session Insight Context
**Inside:** Session/question/student analytics, leaderboard computation and storage, difficulty estimation, report generation/export
**Outside:** Individual response records (Response Service — read via REST, never owned), poll timing (Polling Service), live in-quiz stats (Response Service), delivery (Realtime Communication Service), identity (Auth Service)

### Anti-Corruption Boundary
- Never accesses another service's database directly
- All input data retrieved via REST or consumed Kafka events
- No other service reads/writes `analytics_db`

## Technical Stack
- **Language:** Java 17
- **Framework:** Spring Boot 3.2.x (Spring Web, Security, Data JPA, Kafka)
- **Database:** PostgreSQL 16 (`analytics_db` schema via Flyway)
- **Cache:** Redis 7 (optional read-through cache for popular reports)
- **Messaging:** Kafka 3.6 (consumer of `polling-events`, producer of `analytics-events`)
- **Testing:** JUnit 5, Mockito, Testcontainers (PostgreSQL + Kafka)
- **Build:** Maven 3.9+
- **Deploy:** Docker → Kubernetes (stateless, HPA-scaled)

## Processing Flow
```
QuizCompleted (Kafka from Polling Service)
      ↓
Analytics Service wakes
      ↓
GET /responses/session/{sessionId} (REST to Response Service)
      ↓
Response Service returns finalized responses
      ↓
Analytics computes (single batched pass):
    • Question analytics
    • Student analytics
    • Class analytics
    • Participation metrics
    • Difficulty estimation
    • Leaderboard
      ↓
Persist results to analytics_db
      ↓
Publish AnalyticsCompleted, LeaderboardGenerated,
StudentAnalyticsReady, TeacherAnalyticsReady
```

## API Surface
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/v1/analytics/quiz/{quizId}/session` | TEACHER/STUDENT | Session-level summary |
| GET | `/api/v1/analytics/quiz/{quizId}/questions` | TEACHER | Question-wise analytics |
| GET | `/api/v1/analytics/quiz/{quizId}/students/me` | STUDENT | Own performance |
| GET | `/api/v1/analytics/quiz/{quizId}/students` | TEACHER | All students' performance |
| GET | `/api/v1/analytics/quiz/{quizId}/leaderboard` | TEACHER/STUDENT | Full leaderboard |
| GET | `/api/v1/analytics/quiz/{quizId}/export` | TEACHER | Export analytics (CSV/PDF) |
| GET | `/api/v1/analytics/quiz/{quizId}/leaderboard/export` | TEACHER | Export leaderboard (CSV/PDF) |

## Domain Model
```
SessionAnalytics: id (UUID), quizId (UUID, UNIQUE), totalQuestions, totalStudents,
                  overallClassAccuracy, overallParticipationRate,
                  averageResponseTimeSeconds, generatedAt

QuestionAnalytics: id (UUID), quizId, questionId, responsesReceived, correctCount,
                   incorrectCount, skippedCount, accuracyPct, averageResponseTimeSeconds,
                   difficultyScore
                   UNIQUE(quiz_id, question_id)

StudentPerformance: id (UUID), quizId, studentId (UUID), totalAnswered, correctCount,
                    incorrectCount, skippedCount, accuracyPct, totalScore,
                    averageResponseTimeSeconds
                    UNIQUE(quiz_id, student_id)

LeaderboardEntry: id (UUID), quizId, studentId, rank (INT), totalScore, accuracyPct
                  UNIQUE(quiz_id, student_id), UNIQUE(quiz_id, rank)
```

## Analytics Algorithms
All computed in a single batched pass from the complete finalized response snapshot:

- **Question accuracy:** `correct_count / responses_received`
- **Class accuracy:** `SUM(correct) / SUM(responses)` across all questions
- **Student accuracy:** `correct_count / total_answered` (skipped questions excluded from denominator)
- **Participation rate:** `total_answered / total_questions` per student; `AVG(...)` at class level
- **Difficulty estimation:** `w1 * (1 - accuracy_pct) + w2 * normalized_avg_response_time + w3 * skip_rate` (configurable weights)
- **Leaderboard scoring:** `total_score = SUM(points per correct answer)` — flat scoring baseline
- **Tie-breaking:** (1) higher accuracy, (2) lower avg response time, (3) equal rank on true dead heat

## Kafka Events Consumed
| Event | Producer | Purpose |
|---|---|---|
| `QuizCompleted` | Polling Service | **The sole trigger** — wakes the service, initiates analytics generation |

No other events consumed. No mid-quiz accumulation of per-question data.

## Kafka Events Produced
| Event | Trigger | Consumers |
|---|---|---|
| `AnalyticsCompleted` | Full aggregation finishes | Gateway (push-refresh signal) |
| `LeaderboardGenerated` | Leaderboard computed after analytics | Gateway (leaderboard channel), Notification Service |
| `StudentAnalyticsReady` | Per-student row committed | Notification Service ("your results are ready" push) |
| `TeacherAnalyticsReady` | Teacher aggregate committed | Notification Service |

## DB Tables (Flyway)
```
V1__create_session_analytics.sql
V2__create_question_analytics.sql
V3__create_student_performance.sql
V4__create_leaderboard_entries.sql
```

## Coupling (Minimal, Explicit)
| Dependency | Protocol | Why Necessary |
|---|---|---|
| Authentication Service | REST (sync) | JWT validation per read request |
| Polling Service | Kafka (async consume) | `QuizCompleted` — the single trigger for all work |
| Response Service | REST (sync fetch) | `GET /responses/session/{sessionId}` — pull full finalized dataset after trigger |
| Realtime Communication Service | Kafka (async produce) | `AnalyticsCompleted`/`LeaderboardGenerated` push-refresh signals |
| Notification Service | Kafka (async produce) | `TeacherAnalyticsReady`/`StudentAnalyticsReady`/`LeaderboardGenerated` notify signals |

No direct coupling to: Question Service, Question Generation Service, Recording Service, Transcription Service. Leaderboard is internal (not a separate service).

## AP Consistency Points (Code-Level Verification Required)
- [ ] `onQuizCompleted`: consume event → REST pull from Response Service → aggregate → persist → emit events — all in sequence
- [ ] `aggregationIdempotency`: recomputing same session produces identical state (upsert via UNIQUE constraints)
- [ ] `leaderboardRankUniqueness`: `UNIQUE(quiz_id, rank)` constraint prevents duplicate rank assignment
- [ ] `tieBreaking`: equal score → accuracy tiebreak → response time tiebreak → equal rank (next rank skipped)
- [ ] `exportAuthorization`: separate, stricter permission check than view access
- [ ] All Kafka publishes happen **after** DB commit (`@TransactionalEventListener(phase = AFTER_COMMIT)`)

## Environment Variables (Required)
| Variable | Description |
|---|---|
| `ANALYTICS_DB_URL` | PostgreSQL JDBC URL |
| `ANALYTICS_DB_USER` | DB user |
| `ANALYTICS_DB_PASSWORD` | DB password |
| `KAFKA_BOOTSTRAP_SERVERS` | Kafka broker list |
| `AUTH_SERVICE_URL` | Auth service base URL |
| `RESPONSE_SERVICE_URL` | Response service base URL |
| `JWT_SECRET` | Shared secret for JWT validation (HMAC-SHA256) |
| `REDIS_HOST` | Redis host (optional cache) |
| `REDIS_PORT` | Redis port (optional cache) |

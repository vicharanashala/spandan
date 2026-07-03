# Spandan Question Generation Service — Context File

## Project Identity
- **System:** Spandan — a classroom engagement platform
- **Service:** Question Generation Service (bounded context: Question Generation Context)
- **Architecture:** Clean Architecture layered inside a Spring Boot microservice
- **DB-per-service:** yes — owns `question_generation_db` exclusively

## Core Responsibility
Bridge between a completed lecture transcript and a candidate quiz question set. Orchestrates an external AI provider (never runs its own model) to generate MCQs, True/False, and Short Answer questions from transcript content. Never publishes directly — every generated question must pass through Question Review Service first.

## Key Architecture Decisions

### AP + Eventual Consistency
No non-reconcilable invariants — generated questions are immutable once stored.

| Decision | Implementation |
|---|---|
| AI provider abstraction layer | `QuestionGenerationProvider` interface — orchestration never depends on a concrete provider |
| Lease-based distributed locking | Redis `SET transcriptId NX PX 300000` (5 min) + heartbeat renewal every minute |
| Cost-avoidance lock (not correctness) | `UNIQUE(transcript_id, attempt_number)` is the authoritative backstop |
| Prompt versioning via resource files | `resources/prompts/{type}_v{version}.txt` — versioned, deployable, no DB table needed |
| 50-hour expiry sweep | `@Scheduled` every 15 min: `DELETE FROM question_sets WHERE expiry_at <= now() AND saved_flag = false` |
| Saved sets permanent | `expiry_at = NULL` when `saved_flag = true` |
| Review status is a read-model | QGS only writes `PENDING_REVIEW`; `APPROVED`/`REJECTED` set via consumed events from Question Review Service |
| Kafka events fire after DB commit | `@TransactionalEventListener(phase = AFTER_COMMIT)` |

### Why AP over CP
- No "exactly one accepted" invariant to protect — duplicate provider calls waste money, not corrupt data
- Immutable generated questions: eventual consistency between store and notification is acceptable
- Teachers want responsive generation requests, not a service that refuses due to partition concerns

## Bounded Context: Question Generation Context
**Inside:** Generation request lifecycle, generated question content (unapproved/provisional), 50-hour temporary retention, save-to-permanent transition
**Outside:** Transcript content ownership (Transcription Service — pulled via REST, never duplicated), approval/rejection/editing (Question Review Service), question delivery timing (Polling Service), identity (Auth Service)

### Anti-Corruption Boundary
- Never accesses another service's database directly
- Never writes `APPROVED`/`REJECTED` review status locally — only reflects Review Service's events
- Never publishes questions to any student-facing channel — QGS output goes only to Question Review Service

## Technical Stack
- **Language:** Java 17
- **Framework:** Spring Boot 3.2.x (Spring Web, Security, Data JPA, Data Redis, Kafka, Scheduler)
- **Database:** PostgreSQL 16 (`question_generation_db` schema via Flyway)
- **Coordination:** Redis 7 (distributed locks with lease renewal)
- **Messaging:** Kafka 3.6 (consumer of `transcription-events`/`question-review-events`, producer of `question-generation-events`)
- **Resilience:** Resilience4j (retry, circuit breaker, rate limiter)
- **AI Provider:** Abstracted via `QuestionGenerationProvider` interface (adapters for OpenAI, Anthropic, Gemini, etc.)
- **Prompts:** Versioned resource files (`resources/prompts/`)
- **Testing:** JUnit 5, Mockito, Testcontainers (PostgreSQL + Redis + Kafka + WireMock)
- **Build:** Maven 3.9+
- **Deploy:** Docker → Kubernetes (stateless, HPA-scaled on active generation job count)

## Processing Flow
```
TranscriptGenerated (Kafka from Transcription Service)
  ↓ (or teacher-initiated via REST POST /generate)
Acquire Redis lock (transcriptId, 5min TTL)
  ↓
Start heartbeat renewal (every 1min)
  ↓
Pull transcript text via GET /api/v1/transcripts/recording/{recordingId}
  ↓
Build prompt from versioned resource file + transcript content
  ↓
Submit to external AI provider via QuestionGenerationProvider adapter
  ↓
Validate response (correct shape, all types present, no empty text)
  ↓
Store question_set + generated_questions (status: GENERATED)
  ↓
Release lock
  ↓
Publish QuestionsGenerated, QuestionsReadyForReview
```

## API Surface
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/v1/question-generation/generate` | TEACHER | Generate questions from transcript (async, 202) |
| POST | `/api/v1/question-generation/{setId}/regenerate` | TEACHER | Regenerate (new attempt) |
| GET | `/api/v1/question-generation/{setId}` | TEACHER | Get full set with questions |
| GET | `/api/v1/question-generation/{setId}/status` | TEACHER | Get generation status |
| POST | `/api/v1/question-generation/{setId}/save` | TEACHER | Save permanently (sets expiry_at = NULL) |
| DELETE | `/api/v1/question-generation/{setId}` | TEACHER | Delete set manually |

## Domain Model
```
QuestionSet: id (UUID), sessionId, transcriptId, teacherId, attemptNumber (INT),
             aiProvider (VARCHAR), promptVersion (VARCHAR), generationStatus
             (PENDING|GENERATING|GENERATED|FAILED), savedFlag (BOOLEAN, default false),
             createdAt (TIMESTAMPTZ), expiryAt (TIMESTAMPTZ, nullable — NULL when saved)
             UNIQUE(transcript_id, attempt_number)

GeneratedQuestion: id (UUID), questionSetId (UUID, FK → question_sets.id, ON DELETE CASCADE),
                   questionType (MCQ|TRUE_FALSE|SHORT_ANSWER), questionText (TEXT),
                   options (JSONB, nullable), correctAnswer (TEXT),
                   reviewStatus (PENDING_REVIEW|APPROVED|REJECTED, default PENDING_REVIEW)
```

## Kafka Events Consumed
| Event | Topic | Producer | Purpose |
|---|---|---|---|
| `TranscriptGenerated` | `transcription-events` | Transcription Service | Primary trigger — signals a transcript is ready for question generation |
| `TranscriptDeleted` | `transcription-events` | Transcription Service | Abort in-progress generation if transcript deleted |
| `QuestionApproved` | `question-review-events` | Question Review Service | Read-model sync — updates local review_status |
| `QuestionRejected` | `question-review-events` | Question Review Service | Read-model sync — updates local review_status |
| `QuestionEdited` | `question-review-events` | Question Review Service | Read-model sync |
| `QuestionSaved` | `question-review-events` | Question Review Service | Read-model sync |

No `TeacherRequestedQuestionGeneration` — teacher triggers via REST, not a separate Kafka event.

## Kafka Events Produced
| Event | Topic | Trigger | Consumers |
|---|---|---|---|
| `QuestionsGenerated` | `question-generation-events` | AI provider succeeds | Notification Service |
| `QuestionGenerationFailed` | `question-generation-events` | Retry exhausted | Notification Service |
| `QuestionsStored` | `question-generation-events` | DB commit after generation | Audit/monitoring |
| `QuestionsReadyForReview` | `question-generation-events` | Same as QuestionsStored | Question Review Service (handoff signal) — **enriched with full question data** (id, questionType, questionText, options, correctAnswer) per review-service contract |
| `TemporaryQuestionsExpired` | `question-generation-events` | 50h sweep deletes unsaved set | Audit, Question Review Service |

## DB Tables (Flyway)
```
V1__create_question_sets_table.sql
V2__create_generated_questions_table.sql
```
- `question_sets`: `UNIQUE(transcript_id, attempt_number)`, indexes on `session_id`, `expiry_at`
- `generated_questions`: FK → `question_sets(id)` ON DELETE CASCADE

## Prompts
Versioned resource files at `resources/prompts/`:
- `mcq_prompt_v1.txt`
- `true_false_prompt_v1.txt`
- `short_answer_prompt_v1.txt`

`question_sets.prompt_version` references which file version was used. No `prompt_templates` DB table.

## Saved Flag & Expiry
- Unsaved sets: `expiry_at = created_at + 50h`, sweep deletes them
- Saved sets: `expiry_at = NULL` and `saved_flag = true`, sweep ignores them (permanent)
- Save/expiry race resolved deterministically: sweep's `WHERE saved_flag = false` filter ensures save always wins

## Lease-Based Locking
- **Acquire:** `SET transcriptId:<uuid> pod:<id> NX PX 300000` (5 min TTL)
- **Renewal:** Every 60 seconds via `LockRenewalService`
- **Release:** On completion, failure, or cancellation
- **Crash recovery:** No heartbeat → TTL expires in ≤5 min

## Coupling (Minimal, Explicit)
| Dependency | Protocol | Why Necessary |
|---|---|---|
| Authentication Service | REST (sync) | Teacher-only access gate |
| Transcription Service | Kafka (consume `TranscriptGenerated`) + REST (pull transcript text) | Never bypasses Transcription Service's AI integration |
| Question Review Service | Kafka (produce enriched `QuestionsReadyForReview` with full question data; consume `question-review-events` for read-model sync) | Governance boundary — only path for generated content toward classroom use |
| Notification Service | Kafka (produce `QuestionsGenerated`, `QuestionGenerationFailed`) | Teacher alerts |

No direct coupling to: Polling, Response, Gateway, Analytics, Recording.

## Environment Variables (Required)
| Variable | Description |
|---|---|
| `QG_DB_URL` | PostgreSQL JDBC URL |
| `QG_DB_USER` | DB user |
| `QG_DB_PASSWORD` | DB password |
| `REDIS_HOST` | Redis host |
| `REDIS_PORT` | Redis port |
| `KAFKA_BOOTSTRAP_SERVERS` | Kafka broker list |
| `AUTH_SERVICE_URL` | Auth service base URL |
| `TRANSCRIPTION_SERVICE_URL` | Transcription service base URL |
| `JWT_SECRET` | Shared secret for JWT validation |
| `QG_AI_PROVIDER_PRIMARY` | Primary AI provider (e.g., openai) |
| `QG_AI_PROVIDER_FALLBACK` | Optional fallback provider |
| `QG_MAX_ATTEMPTS` | Max job-level retry attempts (default 3) |
| `QG_GENERATION_TIMEOUT_MINUTES` | Max wait for AI result (default 10) |

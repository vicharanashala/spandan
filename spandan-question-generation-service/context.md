# Spandan Question Generation Service — Context File

## Project Identity
- **System:** Spandan — a classroom engagement analytics platform
- **Service:** Question Generation Service (bounded context: Question Generation & Educational Hierarchy)
- **Architecture:** Clean Architecture layered inside a Spring Boot microservice
- **DB-per-service:** yes — owns `question_generation_db` exclusively

## Core Responsibility
Bridge between a completed lecture transcript and a candidate quiz question set. Orchestrates an external AI provider (never runs its own model) to generate MCQs, True/False, and Short Answer questions from transcript content. **Single owner of the educational hierarchy and all question metadata** — Lecture→Section→Subsection→Topic→Concept→Learning Objective→Question. Every generated question carries immutable educational identity. Never publishes directly — every generated question must pass through Question Review Service first.

## Interaction Framework Role

QGS participates only at the **beginning** of the interaction pipeline:

```
Question Generation Service  ←── YOU ARE HERE
        ↓
  Polling Service  ←── consumes QuestionGeneratedEvent for poll sequencing
        ↓
  RTC / Gateway Service  ←── manages display timing per student
        ↓
  Response Service  ←── stores immutable interaction history
        ↓
  Analytics Service  ←── derives engagement, mastery, knowledge tracing
        ↓
  Reporting Service  ←── generates dashboards, exports
```

QGS is **completely independent** from everything after question publication. It does not consume any events from Polling, RTC, Response, Analytics, or Reporting.

## Key Architecture Decisions

### CP + Strong Consistency (educational hierarchy)
Educational hierarchy must be consistent — duplicate sections, overlapping learning objectives, or orphaned questions are unacceptable.

| Decision | Implementation |
|---|---|
| Hierarchy managed in DB with FK constraints | `UNIQUE(lecture_id, sequence_position)` per hierarchy level; cascading deletes |
| AI provider abstraction layer | `QuestionGenerationProvider` interface — orchestration never depends on a concrete provider |
| Lease-based distributed locking | Redis `SET transcriptId NX PX 300000` (5 min) + heartbeat renewal every minute |
| Cost-avoidance lock (not correctness) | `UNIQUE(transcript_id, attempt_number)` is the authoritative backstop |
| Prompt versioning via resource files | `resources/prompts/{type}_v{version}.txt` |
| 50-hour expiry sweep | `@Scheduled` every 15 min |
| Saved sets permanent | `expiry_at = NULL` when `saved_flag = true` |
| Review status is a read-model | QGS only writes `PENDING_REVIEW`; `APPROVED`/`REJECTED`/`CHANGES_REQUESTED` set via consumed events |
| Kafka events fire after DB commit | `@TransactionalEventListener(phase = AFTER_COMMIT)` |
| Question metadata populated at generation | Every `QuestionGeneratedEvent` carries full educational + generation metadata |
| Educational metadata is immutable after publication | Once a question is generated and stored, metadata is never modified by any downstream service |

### Why CP for hierarchy, AP for generation
- Hierarchy integrity (no duplicate sections, no orphaned questions) requires CP
- Generation itself (AI provider calls) is AP — duplicate calls waste money, not corrupt data; eventual consistency between store and notification is acceptable

### CAP Theorem Analysis
| Aspect | Choice | Rationale |
|---|---|---|
| Hierarchy CRUD | **CP** — strong consistency on FK constraints, unique positions | Duplicate sections / orphaned learning objectives unacceptable |
| AI generation | **AP** — accept duplicate or dropped transient generation results | Cost of duplicate generation call < cost of blocking a teacher |
| Event publishing | **AP** — fire-and-forget after DB commit | DB is authoritative; Kafka loss is tolerable (events can be re-derived) |

### Consistency Model
- **Strong consistency** for hierarchy: `REPEATABLE_READ` isolation, FK constraints, unique indexes
- **Eventual consistency** for review status: QRS events update read-model asynchronously
- **Read-your-writes**: Teacher's `GET /{setId}` after `POST /generate` reads from primary DB

### Event Ordering Guarantees
- Per-question: `QuestionGeneratedEvent` events are independent; ordering across questions within a set is not guaranteed
- Set-level events (`QuestionsGenerated`, `QuestionsStored`, `QuestionsReadyForReview`) fire after all per-question events

### Failure & Retry Strategy
| Failure | Mechanism | Recovery |
|---|---|---|
| AI provider timeout | Resilience4j circuit breaker + fallback provider | Automatic fallback within same generation attempt |
| AI provider returns empty | Fallback provider retry | Both must fail to mark generation as FAILED |
| DB write failure | `@Transactional` rolls back | Client retries generation request |
| Kafka publish failure | Logged and dropped — DB is authoritative | Events re-publishable via admin endpoint |
| Lock acquisition failure | Duplicate generation guard | `UNIQUE(transcript_id, attempt_number)` backstop |
| Redis lock renewal failure | Lock released early | Next generation attempt starts fresh (cost of duplicate is acceptable) |

### Idempotency
- **Generation request**: `UNIQUE(transcript_id, attempt_number)` prevents duplicate question sets
- **Hierarchy CRUD**: ID-based idempotency — creating a section with the same ID is a no-op or error (FK prevents duplicates)
- **Event publishing**: Each `QuestionGeneratedEvent` carries `eventId` (UUID) for consumer-side deduplication

## Bounded Context: Question Generation & Educational Hierarchy
**Inside:** Educational hierarchy CRUD, generation request lifecycle, generated question content (unapproved/provisional), educational metadata ownership, 50-hour temporary retention, save-to-permanent transition
**Outside:** Transcript content ownership (Transcription Service — pulled via REST), approval/rejection/editing (Question Review Service), question delivery timing (Polling Service), identity (Auth Service)

### Educational Hierarchy Ownership (EXCLUSIVE)
QGS is the **single source of truth** for:
- **Lecture** → collection of sections
- **Section** → major topic grouping within a lecture
- **Subsection** → sub-topic within a section
- **Topic** → specific subject matter
- **Concept** → individual concept within a topic
- **Learning Objective** → measurable student outcome
- **Question Metadata** → educational identity of every question

No other service creates or modifies this hierarchy. No downstream service infers topic, concept, learning objective, section, or subsection — these values **must** originate from QGS.

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

## Scalability Considerations
- **Stateless API layer**: any pod handles any request — scale horizontally behind a load balancer
- **Database pressure**: hierarchy reads dominate; generation writes are bursty — connection pool handles both
- **Lock contention**: Redis SET NX per transcript ID prevents duplicate generation; lock TTL chosen to cover longest AI call
- **Kafka partitioning**: `question-generation-events` partitioned by `setId` — consumer parallelism limited by partition count
- **AI provider rate limiting**: provider adapters should implement client-side rate limiting; Resilience4j rate limiter configured per provider

## Security Considerations
- **Authentication**: JWT-based, TEACHER role required for all endpoints (ADMIN is explicitly excluded — question generation is a TEACHER-only capability)
- **Authorization**: Teacher can only generate/access questions for their own lectures (via `teacherId`)
- **Input validation**: `@Valid` on request bodies; UUID format validation on IDs
- **Kafka**: internal network (no auth between brokers)
- **AI API keys**: `OPENAI_API_KEY` injected via environment variable; never logged or exposed in responses
- **Secrets**: DB credentials, JWT secret, API keys injected via environment variables
- **SQL injection**: prevented by JPA parameterized queries

## Educational Metadata Ownership

### Question Object (after update)
Every generated question contains:
```
Identity:
  questionId: UUID

Educational Metadata (immutable, owned by QGS):
  lectureId: UUID
  sectionId: UUID (nullable)
  subsectionId: UUID (nullable)
  topicId: UUID (nullable)
  conceptId: UUID (nullable)
  learningObjective: String (nullable)

Question Metadata:
  difficulty: EASY|MEDIUM|HARD
  questionType: MCQ|TRUE_FALSE|SHORT_ANSWER
  correctAnswer: String
  questionSequence: Integer

Generation Metadata:
  generatedAt: Instant
  generationModel: String (e.g., "gpt-4", "claude-3")
  generationVersion: String (e.g., "mcq_prompt_v1")

Content:
  questionText: String
  options: JSONB (nullable)
```

### Metadata Source
| Field | Source |
|---|---|
| `lectureId` | From `GenerateRequest.lectureId` (teacher provides) |
| `sectionId` | From `GenerateRequest.sectionId` or null |
| `subsectionId`, `topicId`, `conceptId`, `learningObjective` | From AI suggestion + hierarchy mapping, or null |
| `difficulty` | AI-assigned or defaults to MEDIUM |
| `questionSequence` | Auto-incremented per set |
| `generatedAt` | `Instant.now()` at generation time |
| `generationModel` | From active AI provider name (e.g., "gpt-4") |
| `generationVersion` | From prompt template version |

### Versioning Strategy for Educational Metadata
- **Metadata schema version**: implicit via DB migration version (Flyway)
- **Future extensibility**: new fields are additive — never remove or rename existing columns
- **Downstream compatibility**: consumers match on field name, ignore unknown fields
- **AI prompt version**: tracked in `generationVersion` field on each question
- **Migration of existing data**: new fields are NULLABLE — existing rows get NULL; backfill via batch job

## API Surface

### Generation
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/v1/question-generation/generate` | TEACHER | Generate questions from transcript + hierarchy context (async, 202) |
| POST | `/api/v1/question-generation/{setId}/regenerate` | TEACHER | Regenerate (new attempt) |
| GET | `/api/v1/question-generation/{setId}` | TEACHER | Get full set with enriched question metadata |
| GET | `/api/v1/question-generation/{setId}/status` | TEACHER | Get generation status |
| POST | `/api/v1/question-generation/{setId}/save` | TEACHER | Save permanently (sets expiry_at = NULL) |
| DELETE | `/api/v1/question-generation/{setId}` | TEACHER | Delete set manually |

### Educational Hierarchy (unchanged)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/v1/hierarchy/lectures` | TEACHER | Create lecture |
| GET | `/api/v1/hierarchy/lectures/{lectureId}` | TEACHER | Get lecture with full hierarchy |
| PUT | `/api/v1/hierarchy/lectures/{lectureId}` | TEACHER | Update lecture |
| DELETE | `/api/v1/hierarchy/lectures/{lectureId}` | TEACHER | Delete lecture and cascade |
| POST | `/api/v1/hierarchy/lectures/{lectureId}/sections` | TEACHER | Create section |
| POST | `/api/v1/hierarchy/sections/{sectionId}/subsections` | TEACHER | Create subsection |
| POST | `/api/v1/hierarchy/subsections/{subsectionId}/topics` | TEACHER | Create topic |
| POST | `/api/v1/hierarchy/topics/{topicId}/concepts` | TEACHER | Create concept |
| POST | `/api/v1/hierarchy/concepts/{conceptId}/learning-objectives` | TEACHER | Create learning objective |
| GET | `/api/v1/hierarchy/learning-objectives/{loId}` | TEACHER | Get learning objective with questions |
| GET | `/api/v1/hierarchy/lectures/{lectureId}/full` | TEACHER | Full hierarchy tree |

### GenerateRequest Payload
```json
{
  "sessionId": "uuid",
  "transcriptId": "uuid",
  "lectureId": "uuid",
  "sectionId": "uuid",
  "subsectionId": "uuid",
  "aiProvider": "openai"
}
```

## Domain Model

### Educational Hierarchy
```
Lecture: id, teacherId, title, description, sequencePosition, createdAt, updatedAt
Section: id, lectureId (FK), title, sequencePosition, createdAt, updatedAt
         UNIQUE(lecture_id, sequence_position)
Subsection: id, sectionId (FK), title, sequencePosition, createdAt, updatedAt
            UNIQUE(section_id, sequence_position)
Topic: id, subsectionId (FK), title, sequencePosition, createdAt, updatedAt
       UNIQUE(subsection_id, sequence_position)
Concept: id, topicId (FK), name, description, sequencePosition, createdAt, updatedAt
         UNIQUE(topic_id, sequence_position)
LearningObjective: id, conceptId (FK), code, description, bloomTaxonomyLevel, sequencePosition
                   UNIQUE(concept_id, code)
```

### Question Generation
```
QuestionSet: id (UUID), sessionId, transcriptId, teacherId, lectureId (UUID, FK, nullable),
             attemptNumber (INT), aiProvider (VARCHAR), promptVersion (VARCHAR),
             generationStatus (PENDING|GENERATING|GENERATED|FAILED), savedFlag (BOOLEAN, default false),
             createdAt (TIMESTAMPTZ), expiryAt (TIMESTAMPTZ, nullable)
             UNIQUE(transcript_id, attempt_number)

GeneratedQuestion: id (UUID), questionSetId (UUID, FK → question_sets.id, ON DELETE CASCADE),
                   questionType (MCQ|TRUE_FALSE|SHORT_ANSWER), questionText (TEXT),
                   options (JSONB, nullable), correctAnswer (TEXT),
                   lectureId (UUID, nullable), sectionId (UUID, nullable),
                   subsectionId (UUID, nullable), topicId (UUID, nullable),
                   conceptId (UUID, nullable), learningObjective (VARCHAR, nullable),
                   difficulty (VARCHAR(10), default 'MEDIUM'),
                   questionSequence (INT),
                   generatedAt (TIMESTAMPTZ),
                   generationModel (VARCHAR(50)),
                   generationVersion (VARCHAR(50)),
                   reviewStatus (PENDING_REVIEW|APPROVED|REJECTED|CHANGES_REQUESTED|ORPHANED)
```

## Database Schema (V3 Migration adds:)
```sql
-- question_sets
ALTER TABLE question_sets ADD COLUMN lecture_id UUID;

-- generated_questions
ALTER TABLE generated_questions
    ADD COLUMN lecture_id UUID,
    ADD COLUMN section_id UUID,
    ADD COLUMN subsection_id UUID,
    ADD COLUMN topic_id UUID,
    ADD COLUMN concept_id UUID,
    ADD COLUMN learning_objective VARCHAR(500),
    ADD COLUMN difficulty VARCHAR(10) DEFAULT 'MEDIUM',
    ADD COLUMN question_sequence INT,
    ADD COLUMN generated_at TIMESTAMPTZ,
    ADD COLUMN generation_model VARCHAR(50),
    ADD COLUMN generation_version VARCHAR(50);
```

## Kafka Events Consumed
| Event | Topic | Producer | Purpose |
|---|---|---|---|
| `TranscriptGenerated` | `transcription-events` | Transcription Service | Primary trigger |
| `TranscriptDeleted` | `transcription-events` | Transcription Service | Abort in-progress generation |
| `QuestionApproved` | `question-review-events` | Question Review Service | Read-model sync |
| `QuestionRejected` | `question-review-events` | Question Review Service | Read-model sync |
| `QuestionEdited` | `question-review-events` | Question Review Service | Read-model sync |
| `QuestionSaved` | `question-review-events` | Question Review Service | Read-model sync |

## Kafka Events Produced

### Legacy (backward-compatible, unchanged)
| Event | Topic | Trigger | Consumers |
|---|---|---|---|
| `QuestionsGenerated` | `question-generation-events` | AI provider succeeds | Notification Service |
| `QuestionGenerationFailed` | `question-generation-events` | Retry exhausted | Notification Service |
| `QuestionsStored` | `question-generation-events` | DB commit after generation | Audit/monitoring |
| `QuestionsReadyForReview` | `question-generation-events` | Same as QuestionsStored | Question Review Service |
| `TemporaryQuestionsExpired` | `question-generation-events` | 50h sweep | Audit, QRS |

### New (enriched)
| Event | Topic | Trigger | Consumers |
|---|---|---|---|
| `QuestionGeneratedEvent` | `question-generation-events` | Per-question after generation | Polling Service, Response Service |

`QuestionGeneratedEvent` payload (enriched):
```json
{
  "eventId": "uuid",
  "questionId": "uuid",
  "lectureId": "uuid",
  "sectionId": "uuid",
  "subsectionId": "uuid",
  "topicId": "uuid",
  "conceptId": "uuid",
  "learningObjective": "string",
  "difficulty": "EASY|MEDIUM|HARD",
  "questionType": "MCQ|TRUE_FALSE|SHORT_ANSWER",
  "correctAnswer": "string",
  "questionSequence": 1,
  "questionText": "What is inheritance?",
  "options": "{\"A\": \"...\", \"B\": \"...\"}",
  "generatedAt": "2026-07-03T10:30:00Z",
  "generationModel": "gpt-4",
  "generationVersion": "mcq_prompt_v1"
}
```

## Coupling (Minimal, Explicit)
| Dependency | Protocol | Why Necessary |
|---|---|---|
| Authentication Service | REST (sync) | Teacher-only access gate |
| Transcription Service | Kafka (consume `TranscriptGenerated`) + REST (pull transcript text) | Never bypasses Transcription Service |
| Question Review Service | Kafka (produce enriched `QuestionsReadyForReview`; consume `question-review-events`) | Governance boundary |
| Notification Service | Kafka (produce `QuestionsGenerated`, `QuestionGenerationFailed`) | Teacher alerts |
| Polling Service | Kafka (produce `QuestionGeneratedEvent`) | Question metadata for poll lifecycle |
| Response Service | Kafka (produce `QuestionGeneratedEvent`) | Question metadata for projection |

No direct coupling to: Recording Service, RTC (Gateway) Service, Analytics Service, Reporting Service.

## Service Ownership Matrix
| Capability | Owner |
|---|---|
| Educational hierarchy CRUD | **QGS** |
| Question content, options, correct answers | **QGS** |
| Educational metadata (lecture/section/subsection/topic/concept/LO) | **QGS** |
| Difficulty, question type assignment | **QGS** |
| AI generation orchestration | **QGS** |
| Poll lifecycle (open, close, sequence) | Polling Service |
| Per-student display timing, timeout detection | RTC (Gateway) |
| Immutable answer storage, interaction history | Response Service |
| Engagement analytics, mastery, knowledge tracing | Analytics Service |
| Dashboards, exports, reports | Reporting Service |
| Auth, identity, roles | Auth Service |

## Migration Strategy (V2 → V3)
1. **Phase 1 — Schema**: Apply V3 migration (add metadata columns) — backward-compatible, existing rows get NULLs
2. **Phase 2 — Deploy new code**: Rolling update — old pods still work (ignore new columns), new pods populate metadata
3. **Phase 3 — Optional backfill**: Batch job to populate `lecture_id`, `difficulty`, `generatedAt` on existing questions from available context
4. **Phase 4 (future)**: Make metadata columns NOT NULL once all existing data is backfilled

## Future Extensibility
New metadata fields can be added without downstream changes:

**Educational Taxonomy** (future):
- `bloomTaxonomyLevel` (String)
- `cognitiveComplexity` (Integer)
- `estimatedSolvingTime` (Integer)

**AI Metadata** (future):
- `aiConfidenceScore` (Double)
- `generationStrategy` (String)
- `promptVersion` (String) — already exists
- `validationScore` (Double)

**Pedagogical Metadata** (future):
- `prerequisiteConceptIds` (JSONB)
- `relatedQuestionIds` (JSONB)
- `revisionRecommendation` (String)

**Pattern**: additive columns with defaults/NULLs; consumers ignore unknown fields.

## Testing Strategy
| Layer | Tool | Scope |
|---|---|---|
| Unit (domain) | JUnit 5 | Entity metadata construction, hierarchy validation |
| Unit (service) | JUnit 5 + Mockito | Orchestrator metadata population, event emission |
| Integration | Testcontainers | Full generate → store → retrieve lifecycle with Postgres + Redis + Kafka |
| Contract | Spring Cloud Contract (future) | QuestionGeneratedEvent schema for downstream consumers |

## Production-Ready Implementation Plan
1. Add metadata fields to Java entities and JPA mappings
2. Add V3 Flyway migration
3. Update orchestrator to populate metadata during generation
4. Update event producer to emit enriched `QuestionGeneratedEvent`
5. Update DTOs for API responses
6. Update tests
7. Deploy as rolling update (backward-compatible schema)
8. Monitor: no regressions in existing generation flow
9. Backfill: optional batch job for existing questions

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
| `QG_AI_PROVIDER_PRIMARY` | Primary AI provider |
| `QG_AI_PROVIDER_FALLBACK` | Optional fallback provider |
| `QG_MAX_ATTEMPTS` | Max job-level retry attempts (default 3) |
| `QG_GENERATION_TIMEOUT_MINUTES` | Max wait for AI result (default 10) |
| `OPENAI_API_KEY` | OpenAI API key |
| `OPENAI_MODEL` | OpenAI model name (default gpt-4) |

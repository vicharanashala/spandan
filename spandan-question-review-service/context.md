# Spandan Question Review Service — Context File

## Project Identity
- **System:** Spandan — a classroom engagement platform
- **Service:** Question Review Service (bounded context: Human Review & Approval Context)
- **Architecture:** Clean Architecture layered inside a Spring Boot microservice
- **DB-per-service:** yes — owns `review_db` exclusively

## Core Responsibility
Human gate between AI-generated content and classroom use. Nothing AI-generated reaches a student without passing through a teacher's explicit judgment here. Receives generated question sets (via `QuestionsReadyForReview`—enriched with full question data), presents them for teacher review, and forwards only approved content onward. Maintains complete, immutable version history of every edit.

## Key Architecture Decisions

### CP + Strong Consistency (MANDATORY — write path)
A question's review status and content must have exactly one unambiguous correct value at any instant. "Approved" and "Rejected" cannot both be true. Two conflicting edits cannot both be "the current version."

| Decision | Implementation |
|---|---|
| Optimistic locking with JPA `@Version` | `reviews.version` column checked on every state-changing write — concurrent edits return 409, never silently overwrite |
| Terminal-state enforcement via transition-guard map | REJECTED and ORPHANED have zero outbound transitions; APPROVED only allows reorder/save |
| Duplicate review-row prevention | `UNIQUE(question_id)` on `reviews` — `QuestionsReadyForReview` redelivery is a safe no-op |
| Unique question ordering | `UNIQUE(question_set_id, question_order)` prevents duplicate positions |
| Downstream propagation is eventually consistent | Once a review decision is durably committed, publishing to Kafka is best-effort with retry |

### Why CP over AP
- A rejected question must never be silently un-rejected and slip through to Polling Service
- Two conflicting concurrent edits must never produce a corrupted merged version
- Review actions are low-frequency (teacher-paced, not machine-paced) — CP's availability cost is negligible

### Behavior During Partition
Minority partition refuses review-state-changing writes (approve/reject/edit) — returns clear 409. Read-only operations (viewing pending questions, review history) continue.

## Bounded Context: Human Review & Approval Context
**Inside:** Review lifecycle (pending → approved/rejected/edited/orphaned), version history of question content, review audit trail, question ordering
**Outside:** Original question generation (QGS — input via enriched event + read-model sync), poll timing (Polling Service — output only), identity (Auth Service), delivery (Gateway — no direct coupling)

### Anti-Corruption Boundary
- Never accesses another service's database directly
- Never talks to an AI provider
- No student-facing surface whatsoever
- Rows in `question_versions` and `review_audit_log` are **append-only** — application code never issues UPDATE/DELETE against them

## Technical Stack
- **Language:** Java 17
- **Framework:** Spring Boot 3.2.x (Spring Web, Security, Data JPA, Kafka)
- **Database:** PostgreSQL 16 (`review_db` schema via Flyway)
- **Messaging:** Kafka 3.6 (consumer of `question-generation-events`, producer of `question-review-events`)
- **Testing:** JUnit 5, Mockito, Testcontainers (PostgreSQL + Kafka)
- **Build:** Maven 3.9+
- **Deploy:** Docker → Kubernetes (stateless, HPA-scaled)

## Review Workflow

```
QuestionsReadyForReview (enriched with question data from QGS)
  ↓
Create reviews row per question (status: PENDING_REVIEW, version: 0,
  insert question_versions version 0 = original AI text)
  ↓
Teacher views pending reviews
  ↓
┌──────────────────────────────────────────────────────┐
│  ┌──────────┐   ┌──────────┐   ┌──────────────────┐  │
│  │ Approve  │   │  Reject  │   │  Edit (or edit+  │  │
│  │          │   │(terminal)│   │  approve atomic) │  │
│  └────┬─────┘   └──────────┘   └────────┬─────────┘  │
│       ↓                                  ↓            │
│  APPROVED (terminal)         New version appended     │
│                              to question_versions     │
│                              Status: PENDING_REVIEW   │
│                              (or APPROVED if combo)   │
└──────────────────────────────────────────────────────┘
  ↓
TemporaryQuestionsExpired → still-PENDING_REVIEW → ORPHANED (terminal)
  ↓
All questions in set terminal (APPROVED|REJECTED|ORPHANED)
  → ReviewCompleted emitted
  → ReadyForPolling emitted (for approved subset)
```

## State Machine

```
PENDING_REVIEW ──→ APPROVED  (terminal)
PENDING_REVIEW ──→ REJECTED  (terminal, transition guard: no outbound edges)
PENDING_REVIEW ──→ ORPHANED  (terminal, set by TemporaryQuestionsExpired handler)
PENDING_REVIEW ──→ PENDING_REVIEW (edit — status unchanged unless also approved)

No transitions: REJECTED → anything, ORPHANED → anything
Approved questions can be reordered/saved but not re-edited or re-rejected
```

## Database Design

### Table: `reviews`

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| question_id | UUID | NOT NULL — **logical reference** to QGS `generated_questions.id` (no DB FK — cross-service) |
| question_set_id | UUID | NOT NULL |
| session_id | UUID | NOT NULL |
| teacher_id | UUID | NOT NULL |
| original_ai_question | TEXT | NOT NULL (immutable, set once at creation from enriched event) |
| question_type | VARCHAR(20) | NOT NULL (MCQ\|TRUE_FALSE\|SHORT_ANSWER) |
| edited_question | TEXT | NULLABLE |
| edited_options | JSONB | NULLABLE |
| edited_correct_answer | TEXT | NULLABLE |
| review_status | VARCHAR(20) | NOT NULL, DEFAULT `PENDING_REVIEW`, CHECK IN (`PENDING_REVIEW, APPROVED, REJECTED, ORPHANED`) |
| review_comments | TEXT | NULLABLE |
| question_order | INT | NULLABLE |
| saved_flag | BOOLEAN | NOT NULL, DEFAULT false |
| version | INT | NOT NULL, DEFAULT 0 — **optimistic locking (JPA `@Version`)** for concurrent-edit protection. Distinct from `question_versions.version_number` which tracks content history only. |
| reviewed_at | TIMESTAMPTZ | NULLABLE |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

`UNIQUE (question_id)` — one review per generated question; prevents duplicate rows on event redelivery.
`UNIQUE (question_set_id, question_order)` — enforces unique ordering within a set.

### Table: `question_versions`

Append-only content history. Every edit creates a new row; existing rows never updated or deleted.

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| review_id | UUID | FK → `reviews(id)`, NOT NULL |
| version_number | INT | NOT NULL — content edit counter (independent of `reviews.version` which is the JPA optimistic-lock column) |
| question_text | TEXT | NOT NULL |
| options | JSONB | NULLABLE |
| correct_answer | TEXT | NOT NULL |
| edited_by_teacher_id | UUID | NULLABLE (NULL for version 0 = original AI) |
| edited_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

`UNIQUE (review_id, version_number)` — gapless version sequence per question; last-resort backstop for concurrent edits.

Version 0 is inserted at creation with `question_text = original_ai_question`, populating the original AI content as the first entry in the history — original and edits coexist in one table.

### Table: `review_audit_log`

Append-only, captures every action (including non-content actions like approve/reject/reorder).

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| review_id | UUID | NOT NULL |
| teacher_id | UUID | NOT NULL |
| action | VARCHAR(20) | NOT NULL, CHECK IN (`APPROVED, REJECTED, EDITED, REORDERED, SAVED, ORPHANED`) |
| action_timestamp | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| details | JSONB | NULLABLE (e.g., old/new order for REORDERED, comment for REJECTED) |

### Indexes
- `idx_reviews_question_set_id ON reviews(question_set_id)`
- `idx_reviews_teacher_id ON reviews(teacher_id)`
- `idx_reviews_status ON reviews(review_status)`
- `idx_question_versions_review_id ON question_versions(review_id)`
- `idx_review_audit_log_review_id ON review_audit_log(review_id)`

### Relationships
```
reviews (1) ──────< (many) question_versions   (no CASCADE delete — reviews are permanent)
reviews (1) ──────< (many) review_audit_log     (no CASCADE delete)
```

No TTL/expiry sweep — review records are permanent by design (contrast with Transcription's 18h and QGS's 50h).

## REST APIs

Base path: `/api/v1/reviews`. All require JWT with role `TEACHER` only.

### Get Pending Questions for a Set
**GET** `/api/v1/reviews/question-set/{questionSetId}`
- Ownership check: teacherId from JWT must match reviews.teacher_id
- Response: ordered list of review items with question content, status, version

### List Pending Sets
**GET** `/api/v1/reviews/pending`
- Returns all question sets with at least one `PENDING_REVIEW` question for this teacher
- Includes per-set metadata: set ID, total questions, pending count, approved count, rejected count, orphaned count

### Approve Question
**POST** `/api/v1/reviews/{reviewId}/approve`
- Request: `{ version: int @NotNull, comments: String (optional) }`
- 200 OK, 409 Conflict (stale version), 400 Bad Request (already terminal)

### Reject Question
**POST** `/api/v1/reviews/{reviewId}/reject`
- Request: `{ version: int @NotNull, comments: String @NotBlank }`
- 200 OK, 409 Conflict, 400 Bad Request (already terminal)

### Edit Question
**PUT** `/api/v1/reviews/{reviewId}/edit`
- Request: `{ version: int @NotNull, questionText: String @NotBlank, options: JSONB, correctAnswer: String @NotBlank }`
- Appends new row to `question_versions`, updates `edited_question`/`edited_options`/`edited_correct_answer` on `reviews`
- Review status stays `PENDING_REVIEW` unless also approved via edit-and-approve endpoint
- 200 OK, 409 Conflict, 400 Bad Request (REJECTED or ORPHANED)

### Edit and Approve (Atomic)
**POST** `/api/v1/reviews/{reviewId}/edit-and-approve`
- Request: `{ version: int @NotNull, questionText: String @NotBlank, options: JSONB, correctAnswer: String @NotBlank, comments: String (optional) }`
- Single transaction: appends question_versions row + transitions review to APPROVED
- Emits both `QuestionEdited` and `QuestionApproved` events
- 200 OK, 409 Conflict, 400 Bad Request (REJECTED or ORPHANED)

### Reorder Questions
**PUT** `/api/v1/reviews/question-set/{questionSetId}/reorder`
- Request: `{ orderedReviewIds: List<UUID> @NotEmpty }`
- Reassigns `question_order` sequentially based on list position
- 200 OK, 400 Bad Request (list mismatch), 409 Conflict (concurrent reorder)

### Save Question Set
**POST** `/api/v1/reviews/question-set/{questionSetId}/save`
- Sets `saved_flag = true` across all reviews in the set
- 200 OK

### Get Review History
**GET** `/api/v1/reviews/{reviewId}/history`
- Returns full `question_versions` list + `review_audit_log` entries, chronologically ordered
- 200 OK

### Validation
Every mutating request requires `version: @NotNull` — this is the load-bearing correctness invariant. Centralized `@RestControllerAdvice` with consistent error envelope.

## Kafka Events

### Consumed Topics

| Topic | Events Consumed | Purpose |
|---|---|---|
| `question-generation-events` | `QuestionsReadyForReview`, `TemporaryQuestionsExpired` | Entry point (new review work) + expiry awareness |

### Produced Topics

| Topic | Partition Key |
|---|---|
| `question-review-events` | `sessionId` |
| `question-review-events-dlq` | — |

### Events Consumed Detail

| Event | Producer | Payload | Purpose |
|---|---|---|---|
| `QuestionsReadyForReview` | QGS | `setId, transcriptId, sessionId, teacherId, attemptNumber, questions: [{id, questionType, questionText, options, correctAnswer}]` | Creates `reviews` + `question_versions` (version 0) for each question. Full question data is in the event — no REST call to QGS needed. |
| `TemporaryQuestionsExpired` | QGS | `setId, transcriptId, sessionId, attemptNumber` | Marks any still-`PENDING_REVIEW` reviews for this set as `ORPHANED` (terminal). Logs to `review_audit_log` with action `ORPHANED`. |

### Events Produced Detail

| Event | Trigger | Payload | Consumers |
|---|---|---|---|
| `QuestionApproved` | Teacher approves (or edit-and-approve) | `reviewId, questionId, questionSetId, sessionId, approvedQuestionText, questionType, approvedAt` | **Polling Service** (publish gating) + **QGS** (read-model sync) |
| `QuestionRejected` | Teacher rejects | `reviewId, questionId, questionSetId, rejectedAt, comments` | QGS (read-model sync) |
| `QuestionEdited` | Teacher edits (or edit-and-approve) | `reviewId, questionId, questionSetId, questionText, options, correctAnswer, newVersionNumber, editedAt` | **QGS** (updates read-model with edited content — `questionText`, `correctAnswer`, `options` are consumed by QGS's `ReviewStatusSyncService.updateQuestionFromEvent`) + Analytics (edit frequency) |
| `QuestionOrderChanged` | Teacher reorders | `questionSetId, orderedQuestionIds: [UUID], changedAt` | Polling Service (informational) |
| `QuestionSaved` | Teacher saves set | `questionSetId, savedAt` | QGS (read-model sync) |
| `ReviewCompleted` | Every question in set reaches terminal state | `questionSetId, sessionId, approvedCount, rejectedCount, orphanedCount, completedAt` | Notification Service + Analytics |
| `ReadyForPolling` | Same as ReviewCompleted, approved subset only | `questionSetId, sessionId, approvedQuestionIds: [UUID], readyAt` | Polling Service (aggregate "pool is ready" signal, complementing individual `QuestionApproved` events) |

### Terminal State Detection (Updated)
A set is "review completed" when every question has reached a terminal state: `APPROVED`, `REJECTED`, or `ORPHANED` — no `PENDING_REVIEW` remaining. `ORPHANED` counts as terminal because the underlying generated question is deleted by QGS's 50-hour sweep; the teacher can no longer act on it.

## Communication With Every Spandan Microservice

| Service | Protocol | Payload | Notes |
|---|---|---|---|
| **Auth Service** | REST (sync) | Token → identity/role | Teacher-only gate. Fail closed. |
| **QGS** | Kafka (consume `QuestionsReadyForReview` enriched, `TemporaryQuestionsExpired`; produce `QuestionApproved`, `QuestionRejected`, `QuestionEdited`, `QuestionSaved`) | Full event-driven loop | No REST coupling. `question_id` on `reviews` is a **logical cross-service reference** — no DB FK, owned by QGS. QGS never accesses `review_db`. |
| **Polling Service** | Kafka (produce `QuestionApproved`, `ReadyForPolling`) | Approved question IDs + set-level ready signal | Polling Service's own design already consumes `QuestionApproved` from `question-review-events`. `ReadyForPolling` is a new aggregate event Polling Service should add to its consumer (see Polling Service context.md). |
| **Notification Service** | Kafka (produce `ReviewCompleted`) | Review completion summary | Notification owns actual message content/timing. |
| **Analytics Service** | Kafka (produce `QuestionEdited`, `ReviewCompleted`) | Edit frequency, approval rate, rejection rate | New integration point — Analytics Service's context.md should be updated to consume these events. |
| **Gateway, Response, Recording, Transcription** | None | — | No direct coupling to any of these. |

## Coupled Service Updates Required

### QGS — Event Enrichment
`QuestionsReadyForReview` event must include full question data:
```json
{
  "setId": "uuid",
  "questions": [
    {
      "id": "uuid",
      "questionType": "MCQ",
      "questionText": "...",
      "options": "{\"A\": \"...\", ...}",
      "correctAnswer": "B"
    }
  ]
}
```
This replaces the set-only metadata payload in the current QGS codebase. No additional REST call needed.

## Version Protection
- `question_versions` is **append-only** — application code never issues UPDATE or DELETE against it
- `reviews.original_ai_question` is set once at creation and never modified
- Defense in depth: DB-level trigger or restricted table permissions can prevent UPDATE/DELETE grants on `question_versions` entirely

## Scalability
- Stateless pods behind HPA on standard CPU/latency — no custom metrics needed
- Every review row scoped to `teacherId`/`sessionId` — optimistic locking means concurrent activity from different teachers on different questions never contends
- `question_versions` pure INSERT workload — about as cheap as PostgreSQL writes get
- Redis is optional (soft "currently editing" presence indicator) — not a correctness mechanism

## Reliability
- Kafka consumer/producer retry with bounded exponential backoff
- DLQ: `question-review-events-dlq` — `ReadyForPolling`/`QuestionApproved` flagged for elevated monitoring
- Idempotency: `UNIQUE (question_id)` prevents duplicate review rows on event redelivery
- No distributed locks to leak/expire — pod crash just fails the in-flight HTTP call cleanly; client retries with current version

## Environment Variables (Required)
| Variable | Description |
|---|---|
| `REVIEW_DB_URL` | PostgreSQL JDBC URL |
| `REVIEW_DB_USER` | DB user |
| `REVIEW_DB_PASSWORD` | DB password |
| `KAFKA_BOOTSTRAP_SERVERS` | Kafka broker list |
| `AUTH_SERVICE_URL` | Auth service base URL |
| `JWT_SECRET` | Shared secret for JWT validation |

# Spandan Question Review Service — Context File

## Project Identity
- **System:** Spandan — a classroom engagement platform
- **Service:** Question Review Service (bounded context: Human Review & Approval Context)
- **Architecture:** Clean Architecture layered inside a Spring Boot microservice
- **DB-per-service:** yes — owns `review_db` exclusively

## Core Responsibility
Human gate between AI-generated content and classroom use. Nothing AI-generated reaches a student without passing through an admin's explicit judgment here. Receives generated question sets (via `QuestionsReadyForReview`—enriched with full question data), presents them for admin review, and forwards only approved content onward. Teachers view generated questions in read-only mode; admins own the entire review lifecycle. Maintains complete, immutable version history of every edit.

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
Teacher generates AI questions (via QGS)
  ↓
QuestionsReadyForReview (enriched with question data from QGS)
  ↓
Create reviews row per question (status: PENDING_REVIEW, version: 0,
  insert question_versions version 0 = original AI text)
  ↓
Admin views pending reviews
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

Teacher role in this workflow: generate questions, view pending reviews (read-only). Teacher cannot approve, reject, edit, reorder, or save reviews.

Admin role: owns the entire review lifecycle — approve, reject, edit, reorder, save question sets.

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
| admin_id | UUID | NOT NULL — the admin who owns/pursues this review (renamed from `teacher_id`; migration copies existing values) |
| teacher_id | UUID | NULLABLE — original teacher who generated the questions (deprecated, populated from `QuestionsReadyForReview.teacherId` for audit trail) |
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
| edited_by_admin_id | UUID | NULLABLE (NULL for version 0 = original AI); replaces `edited_by_teacher_id` |
| edited_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

`UNIQUE (review_id, version_number)` — gapless version sequence per question; last-resort backstop for concurrent edits.

Version 0 is inserted at creation with `question_text = original_ai_question`, populating the original AI content as the first entry in the history — original and edits coexist in one table.

### Table: `review_audit_log`

Append-only, captures every action (including non-content actions like approve/reject/reorder).

| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| review_id | UUID | NOT NULL |
| admin_id | UUID | NOT NULL — the admin who performed the action (renamed from `teacher_id`; migration copies existing values) |
| action | VARCHAR(20) | NOT NULL, CHECK IN (`APPROVED, REJECTED, EDITED, REORDERED, SAVED, ORPHANED`) |
| action_timestamp | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| details | JSONB | NULLABLE (e.g., old/new order for REORDERED, comment for REJECTED) |

### Indexes
- `idx_reviews_question_set_id ON reviews(question_set_id)`
- `idx_reviews_admin_id ON reviews(admin_id)`
- `idx_reviews_status ON reviews(review_status)`
- `idx_question_versions_review_id ON question_versions(review_id)`
- `idx_review_audit_log_review_id ON review_audit_log(review_id)`
- `idx_review_audit_log_admin_id ON review_audit_log(admin_id)`

### Relationships
```
reviews (1) ──────< (many) question_versions   (no CASCADE delete — reviews are permanent)
reviews (1) ──────< (many) review_audit_log     (no CASCADE delete)
```

No TTL/expiry sweep — review records are permanent by design (contrast with Transcription's 18h and QGS's 50h).

### Flyway Migration: V3__rename_teacher_to_admin.sql

Renames ownership columns to reflect the ADMIN role transfer. All existing data is preserved — column values remain unchanged, only names update.

```sql
-- reviews: teacher_id → admin_id, add nullable teacher_id for audit trace
ALTER TABLE reviews RENAME COLUMN teacher_id TO admin_id;
ALTER TABLE reviews ADD COLUMN teacher_id UUID NULL;

-- Populate teacher_id from the historical admin_id (previous teacher data becomes the teacher origin trace)
UPDATE reviews SET teacher_id = admin_id;

ALTER TABLE reviews ALTER COLUMN admin_id SET NOT NULL;

-- question_versions: edited_by_teacher_id → edited_by_admin_id
ALTER TABLE question_versions RENAME COLUMN edited_by_teacher_id TO edited_by_admin_id;

-- review_audit_log: teacher_id → admin_id
ALTER TABLE review_audit_log RENAME COLUMN teacher_id TO admin_id;

-- indexes
DROP INDEX IF EXISTS idx_reviews_teacher_id;
CREATE INDEX idx_reviews_admin_id ON reviews(admin_id);
CREATE INDEX idx_review_audit_log_admin_id ON review_audit_log(admin_id);
```

**Migration strategy:**
- `V3__rename_teacher_to_admin.sql` runs after existing `V1__initial_schema.sql` and `V2__add_question_versions.sql`
- Renames are O(1) metadata operations — no table rewrites
- The new `teacher_id` column preserves the origin teacher audit trail for backward compatibility queries
- Zero downtime: application code is deployed simultaneously with the migration (read old → write new column pattern not required since column rename is atomic)

## REST APIs

Base path: `/api/v1/reviews`. Authorization split by operation type — mutations require `ADMIN`, read-only endpoints accessible to `TEACHER` (view-only) and `ADMIN`.

### Authorization Matrix

| Endpoint | ADMIN | TEACHER | STUDENT |
|---|---|---|---|
| `GET /api/v1/reviews/question-set/{id}` | ✓ | ✓ (read-only) | |
| `GET /api/v1/reviews/pending` | ✓ | ✓ (read-only) | |
| `GET /api/v1/reviews/{id}/history` | ✓ | ✓ (read-only) | |
| `POST /api/v1/reviews/{id}/approve` | ✓ | | |
| `POST /api/v1/reviews/{id}/reject` | ✓ | | |
| `PUT /api/v1/reviews/{id}/edit` | ✓ | | |
| `POST /api/v1/reviews/{id}/edit-and-approve` | ✓ | | |
| `PUT /api/v1/reviews/question-set/{id}/reorder` | ✓ | | |
| `POST /api/v1/reviews/question-set/{id}/save` | ✓ | | |

### Get Pending Questions for a Set
**GET** `/api/v1/reviews/question-set/{questionSetId}`
- Ownership check: adminId from JWT must match reviews.admin_id
- Teacher access: allowed (read-only) — teacher can view their generated questions' review status
- Response: ordered list of review items with question content, status, version

### List Pending Sets
**GET** `/api/v1/reviews/pending`
- Returns all question sets with at least one `PENDING_REVIEW` question for this admin
- Teacher access: returns sets where `teacher_id` matches
- Includes per-set metadata: set ID, total questions, pending count, approved count, rejected count, orphaned count

### Approve Question
**POST** `/api/v1/reviews/{reviewId}/approve`
- Requires ADMIN
- Request: `{ version: int @NotNull, comments: String (optional) }`
- 200 OK, 409 Conflict (stale version), 400 Bad Request (already terminal)
- Audit: records `admin_id` in `review_audit_log`

### Reject Question
**POST** `/api/v1/reviews/{reviewId}/reject`
- Requires ADMIN
- Request: `{ version: int @NotNull, comments: String @NotBlank }`
- 200 OK, 409 Conflict, 400 Bad Request (already terminal)
- Audit: records `admin_id` in `review_audit_log`

### Edit Question
**PUT** `/api/v1/reviews/{reviewId}/edit`
- Requires ADMIN
- Request: `{ version: int @NotNull, questionText: String @NotBlank, options: JSONB, correctAnswer: String @NotBlank }`
- Appends new row to `question_versions`, updates `edited_question`/`edited_options`/`edited_correct_answer` on `reviews`
- Review status stays `PENDING_REVIEW` unless also approved via edit-and-approve endpoint
- `edited_by_admin_id` populated in `question_versions`
- 200 OK, 409 Conflict, 400 Bad Request (REJECTED or ORPHANED)

### Edit and Approve (Atomic)
**POST** `/api/v1/reviews/{reviewId}/edit-and-approve`
- Requires ADMIN
- Request: `{ version: int @NotNull, questionText: String @NotBlank, options: JSONB, correctAnswer: String @NotBlank, comments: String (optional) }`
- Single transaction: appends question_versions row + transitions review to APPROVED
- Emits both `QuestionEdited` and `QuestionApproved` events
- `edited_by_admin_id` populated in `question_versions`
- 200 OK, 409 Conflict, 400 Bad Request (REJECTED or ORPHANED)

### Reorder Questions
**PUT** `/api/v1/reviews/question-set/{questionSetId}/reorder`
- Requires ADMIN
- Request: `{ orderedReviewIds: List<UUID> @NotEmpty }`
- Reassigns `question_order` sequentially based on list position
- 200 OK, 400 Bad Request (list mismatch), 409 Conflict (concurrent reorder)

### Save Question Set
**POST** `/api/v1/reviews/question-set/{questionSetId}/save`
- Requires ADMIN
- Sets `saved_flag = true` across all reviews in the set
- 200 OK

### Get Review History
**GET** `/api/v1/reviews/{reviewId}/history`
- Accessible to ADMIN and TEACHER (read-only)
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
|---|---|---|---|---|
| `QuestionApproved` | Admin approves (or edit-and-approve) | `reviewId, questionId, questionSetId, sessionId, approvedQuestionText, questionType, approvedAt, approvedByAdminId` | **Polling Service** (publish gating) + **QGS** (read-model sync) |
| `QuestionRejected` | Admin rejects | `reviewId, questionId, questionSetId, rejectedAt, comments, rejectedByAdminId` | QGS (read-model sync) |
| `QuestionEdited` | Admin edits (or edit-and-approve) | `reviewId, questionId, questionSetId, questionText, options, correctAnswer, newVersionNumber, editedAt, editedByAdminId` | **QGS** (updates read-model with edited content — `questionText`, `correctAnswer`, `options` are consumed by QGS's `ReviewStatusSyncService.updateQuestionFromEvent`) + Analytics (edit frequency) |
| `QuestionOrderChanged` | Admin reorders | `questionSetId, orderedQuestionIds: [UUID], changedAt, reorderedByAdminId` | Polling Service (informational) |
| `QuestionSaved` | Admin saves set | `questionSetId, savedAt, savedByAdminId` | QGS (read-model sync) |

**Backward compatibility note on event payloads:** The `*ByAdminId` fields are additive — no existing field is removed or renamed. Consumers that do not need admin identity information can ignore these fields without code changes.

| Event | Trigger | Payload | Consumers |
|---|---|---|---|
| `ReviewCompleted` | Every question in set reaches terminal state | `questionSetId, sessionId, approvedCount, rejectedCount, orphanedCount, completedAt` | Notification Service + Analytics |
| `ReadyForPolling` | Same as ReviewCompleted, approved subset only | `questionSetId, sessionId, approvedQuestionIds: [UUID], readyAt` | Polling Service (aggregate "pool is ready" signal, complementing individual `QuestionApproved` events) |

### Terminal State Detection (Updated)
A set is "review completed" when every question has reached a terminal state: `APPROVED`, `REJECTED`, or `ORPHANED` — no `PENDING_REVIEW` remaining. `ORPHANED` counts as terminal because the underlying generated question is deleted by QGS's 50-hour sweep; the teacher can no longer act on it.

## Communication With Every Spandan Microservice

| Service | Protocol | Payload | Notes |
|---|---|---|---|
| **Auth Service** | REST (sync) | Token → identity/role | Admin gate for review mutations; Teacher read-only access for viewing. JWT claim `role` validated on every request. Fail closed. |
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
- Every review row scoped to `adminId`/`sessionId` — optimistic locking means concurrent activity from different admins on different questions never contends
- `question_versions` pure INSERT workload — about as cheap as PostgreSQL writes get
- Redis is optional (soft "currently editing" presence indicator) — not a correctness mechanism

## Reliability
- Kafka consumer/producer retry with bounded exponential backoff
- DLQ: `question-review-events-dlq` — `ReadyForPolling`/`QuestionApproved` flagged for elevated monitoring
- Idempotency: `UNIQUE (question_id)` prevents duplicate review rows on event redelivery
- No distributed locks to leak/expire — pod crash just fails the in-flight HTTP call cleanly; client retries with current version

## Security

### Authorization Enforcement

| Layer | Mechanism | Detail |
|---|---|---|
| Gateway | `RoleAuthorizationFilter` | Prefix `/api/v1/reviews/**` → ADMIN only. Teacher requests to mutating endpoints rejected at gateway with 403. |
| Service | Spring Security method-level `@PreAuthorize` | `hasRole('ADMIN')` on every mutating controller method. Read-only endpoints annotated `hasAnyRole('ADMIN', 'TEACHER')`. |
| Ownership | Manual check in service layer | `adminId` from JWT must match `reviews.admin_id` for ownership-scoped queries. Teacher view queries match `reviews.teacher_id`. |

### Privilege Escalation Prevention
- TEACHER JWT cannot call approve/reject/edit/reorder/save endpoints — 403 before any business logic executes
- STUDENT JWT is rejected at the gateway for any `/api/v1/reviews/**` path
- ADMIN JWT can perform all review operations but is subject to ownership checks (admin A cannot modify reviews belonging to admin B's session)
- JWT `role` claim is the sole source of truth — no local role override or default

### Ownership Verification
- Mutating operations: `adminId` from authenticated JWT must equal `reviews.admin_id`
- Read-only operations for ADMIN: `adminId` from JWT must equal `reviews.admin_id`
- Read-only operations for TEACHER: `teacherId` from JWT must equal `reviews.teacher_id`
- Cross-admin access is denied — each admin sees only their assigned reviews

### Fail Closed
- Missing or malformed JWT → 401 at gateway before reaching service
- Valid JWT with TEACHER role on mutating endpoint → 403 (gateway-level, no service call)
- Valid JWT with STUDENT role on any review endpoint → 403
- Unknown role claim → 401 (gateway `Role.fromClaim` returns null)

## Versioning

The ADMIN role transfer does **not** affect optimistic locking or version semantics.

| Concern | Impact |
|---|---|
| `reviews.version` (JPA `@Version`) | Unchanged — protects against concurrent admin edits the same way it protected against concurrent teacher edits |
| `question_versions.version_number` | Unchanged — gapless content edit counter per review |
| Historical edit history | Preserved — existing `question_versions` rows retain their `version_number` sequence; new admin edits increment from where the sequence left off |
| Audit log | Each `review_audit_log` row tracks `admin_id` going forward. Historical rows retain their original `teacher_id` (now migrated to `admin_id`). |

No version schema changes required. The optimistic locking contract is role-agnostic.

## Notifications

Notifications produced by the Question Review Service are **actor-agnostic** — they convey review completion status, not reviewer identity.

| Notification | Trigger | Content | Recipient Change |
|---|---|---|---|
| `ReviewCompleted` | Terminal state reached | Summary counts (approved/rejected/orphaned) | No change — recipients determined by Notification Service based on `sessionId` and `teacherId` in event metadata |
| (None produced per-edit) | — | — | No per-action notifications produced; audit log is the record of who did what |

Notifications remain unchanged. The `teacherId` in `ReviewCompleted` event metadata is preserved for Notification Service routing. No notification payload fields are removed or renamed.

## Testing

### Unit Tests (New / Updated)
- `AdminAuthorizationTest` — ADMIN JWT can approve, reject, edit, reorder, save; TEACHER JWT gets 403
- `TeacherViewOnlyTest` — TEACHER can GET review list, history, but cannot POST/PUT any mutating endpoint
- `StudentRejectionTest` — STUDENT gets 403 on all review endpoints
- `OwnershipEnforcementTest` — Admin A cannot modify reviews owned by Admin B (adminId mismatch → 403)
- `AuditLogAdminIdTest` — verify `review_audit_log.admin_id` is correctly recorded for each action
- `QuestionVersionsAdminIdTest` — verify `edited_by_admin_id` populated on edit
- `RoleMigrationTest` — verify `teacher_id` is populated from `QuestionsReadyForReview` event and preserved alongside `admin_id`

### Integration Tests (New / Updated)
- `ReviewAdminWorkflowIntegrationTest` — full flow: teacher generates → QGS emits event → admin reviews → approves → event emitted → consumed correctly
- `TeacherCannotMutateIntegrationTest` — TEACHER JWT on POST approve/reject/edit returns 403 at gateway
- `KafkaEventBackwardCompatibilityTest` — old consumers can still parse `QuestionApproved`/`QuestionRejected`/`QuestionEdited` events without `*ByAdminId` fields (verify additive schema)
- `FlywayMigrationV3Test` — verify `V3__rename_teacher_to_admin.sql` runs correctly, data preserved, indexes created
- `ConcurrentAdminEditTest` — two admins editing same question → 409 Conflict (optimistic locking)

### Existing Tests (Unchanged)
- `ReviewStateMachineTest` — state transitions, terminal guards, ORPHANED handling (role-agnostic)
- `ReviewOrchestratorTest` — event processing, DLQ behavior (role-agnostic)
- `ReviewEventHandlerTest` — consumed event idempotency, `UNIQUE(question_id)` enforcement

## Deployment

### Flyway Migration
- **New migration:** `V3__rename_teacher_to_admin.sql` (column renames + new teacher_id column)
- **Strategy:** Deploy migration alongside updated application code in the same release. Column renames are metadata-only — no table rewrite, no downtime.
- **Rollback:** `V3__rollback.sql` reverses renames if needed (should not be required in practice — additive change)

### Configuration Changes
| Setting | Change |
|---|---|
| `JWT_ROLE_CLAIM` | No change — role claim `role` already contains `ADMIN`, `TEACHER`, `STUDENT` |
| `GATEWAY_ROUTE_AUTH` | Gateway route for `/api/v1/reviews/**` updated from TEACHER to ADMIN (see API Gateway context.md) |

### Role Configuration
No new roles introduced. Existing `ADMIN` role from Auth Service is reused. No additional role hierarchy or mapping needed.

### Environment Variables
No new environment variables. Existing `AUTH_SERVICE_URL` and `JWT_SECRET` remain unchanged.

### Backward Compatibility Checklist
| Concern | Compatible? | Detail |
|---|---|---|
| API URLs | ✅ | No endpoint URL changed |
| Kafka topic names | ✅ | Unchanged |
| Kafka event schemas | ✅ | `*ByAdminId` fields are additive |
| Database schema (existing columns) | ✅ | Column renames preserve data; new `teacher_id` column is additive |
| Gateway routes | ✅ | Route prefix `/api/v1/reviews/**` unchanged; role requirement updated to ADMIN |
| Auth Service API | ✅ | JWT format, claims, validation unchanged |
| Existing review records | ✅ | Historical data migrated with correct ownership attribution |
| Notification routing | ✅ | `teacherId` preserved in `ReviewCompleted` metadata |
| Optimistic locking | ✅ | Version semantics role-agnostic |

## Environment Variables (Required)
| Variable | Description |
|---|---|
| `REVIEW_DB_URL` | PostgreSQL JDBC URL |
| `REVIEW_DB_USER` | DB user |
| `REVIEW_DB_PASSWORD` | DB password |
| `KAFKA_BOOTSTRAP_SERVERS` | Kafka broker list |
| `AUTH_SERVICE_URL` | Auth service base URL |
| `JWT_SECRET` | Shared secret for JWT validation |

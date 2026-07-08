# Spandan Polling Service — Context File

## Project Identity
- **System:** Spandan — a classroom engagement analytics platform
- **Service:** Polling Service (bounded context: Question Lifecycle Orchestration)
- **Architecture:** Clean Architecture layered inside a Spring Boot microservice
- **DB-per-service:** yes — owns `polling_db` exclusively

## Core Responsibility
**Question Lifecycle** — from poll-ready to poll-closed. Controls exactly when each question's poll opens, how long it stays open, and when it closes — reliably, without duplication, in strict sequence. Understands the educational hierarchy (lecture → section → subsection) only for sequencing and navigation. Publishes poll lifecycle events for downstream services. Never computes analytics, never stores student responses, never generates reports, never performs knowledge tracing.

**Admin-owned quiz lifecycle.** Quiz creation, starting, pausing, resuming, ending, canceling, question skipping, and timer configuration are now exclusively controlled by ADMIN role. TEACHER role retains read-only access to quiz state and history. STUDENT role unchanged.

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

## Responsibility Model (Updated)

### Teacher Responsibilities (Unchanged)
- Generate AI questions (via QGS)
- View transcripts
- View analytics
- View session insights

### Teacher Responsibilities (Removed)
- Create quizzes
- Start/pause/resume/end/cancel quizzes
- Skip questions
- Configure timers
- Publish questions
- Control poll progression

All of the above are now ADMIN-only.

### Admin Responsibilities (New)
- Create Quiz
- Publish Quiz
- Configure timers
- Start Quiz
- Pause Quiz
- Resume Quiz
- Skip Question
- End Quiz
- Cancel Quiz
- Control poll progression

### Student Responsibilities (Unchanged)
- Answer active polls
- View current poll status

## Ownership Model (New Section)

The Polling Service adopts a **dual ownership model** that separates academic ownership from assessment execution:

| Concern | Owner | Field |
|---|---|---|
| Academic ownership — who generated the questions, who taught the session | TEACHER | `quiz.teacher_id` |
| Assessment execution — who controls poll lifecycle | ADMIN | `quiz.admin_id` |

**Why dual ownership rather than full migration:**
- Teachers remain the academic owner of the session and question content. The `teacherId` field is the link to the session context and is consumed by downstream services (Notification Service routes alerts to the teacher, Analytics Service attributes quiz outcomes to the teacher's session).
- Admins perform the operational role of running assessments. The `adminId` field tracks who actually executed each lifecycle action.
- Both fields are preserved in Kafka event payloads for backward compatibility (downstream consumers reading `teacherId` continue to work).
- Quiz creation requires both a `teacherId` (from session context) and the authenticated ADMIN's identity.

**Ownership verification at runtime:**
- Mutating operations (start, pause, resume, end, cancel, skip, create quiz): `adminId` from JWT must match `quiz.admin_id`. ADMIN cannot act on quizzes they do not own.
- Read-only operations (GET quiz detail, GET current poll): ADMIN checks `quiz.admin_id`, TEACHER checks `quiz.teacher_id`.
- If a quiz has no `admin_id` assigned (legacy data before migration), mutating operations reject the request — the quiz must be reassigned or migrated.

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

### Admin Role Impact on Architecture
The introduction of the ADMIN role does **not** alter any of the above decisions. CP consistency, locking strategy, timer management, event ordering, failure handling, and idempotency guarantees are role-agnostic — they protect poll state integrity regardless of which role triggers the action. The role change only affects authorization gates and the identity recorded in audit logs and event payloads.

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
- **Read-your-writes**: Admin's `GET /current` after `POST /start` reads from primary DB

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
- **Admin impact**: ADMIN role does not affect scalability. Authorization checks are local JWT validation + in-memory role comparison — no additional infrastructure. Ownership verification adds a single column comparison per request. No new database access patterns introduced.

## Security Considerations (Updated)

### Authentication
- **Authentication**: JWT-based, validated by shared secret with Auth Service
- **Authorization**: ADMIN role required for all mutation endpoints. TEACHER role has read-only access (GET quiz detail, GET current poll).
- **Ownership verification**: Mutating operations verify `adminId` from JWT matches `quiz.admin_id`. Read-only operations verify by role (ADMIN checks `admin_id`, TEACHER checks `teacher_id`).
- **Fail-closed**: Missing or malformed JWT → 401 at gateway. Valid JWT with TEACHER on mutating endpoint → 403. STUDENT role on any quiz endpoint → 403.
- **Input validation**: `@Valid` annotations on request bodies, timer bounds checked (5–600s), position uniqueness enforced
- **Kafka**: no authentication between brokers (internal network); topic-level ACLs if cross-namespace
- **SQL injection**: prevented by JPA parameterized queries
- **Secrets**: DB credentials, JWT secret, Kafka passwords injected via environment variables, not hardcoded

### Authorization Enforcement Layers

| Layer | Mechanism | Detail |
|---|---|---|
| Gateway | `RoleAuthorizationFilter` | Prefix `/api/v1/polling/**` → mutating endpoints require ADMIN. See API Gateway context.md for per-route matrix. |
| Service | Spring Security method-level `@PreAuthorize` | `hasRole('ADMIN')` on every mutating controller method. Read-only endpoints annotated `hasAnyRole('ADMIN', 'TEACHER')`. |
| Ownership | Manual check in service layer | `adminId` from JWT must match `quiz.admin_id` for mutating operations. Read-only checks match by role. |

### Privilege Escalation Prevention
- TEACHER JWT cannot call start/pause/resume/end/cancel/skip/create — 403 before any business logic executes
- STUDENT JWT is rejected at the gateway for any `/api/v1/polling/**` mutating path
- ADMIN JWT can perform all quiz operations but is subject to ownership checks (admin A cannot modify quizzes belonging to admin B's session)
- JWT `role` claim is the sole source of truth — no local role override or default
- `verifyOwnership()` on mutating endpoints: extract `admin_id` from JWT `sub` (user UUID), compare against `quiz.admin_id`. Reject with 403 if mismatch.

## Anti-Corruption Boundary
- Polling Service never stores question text, options, correct answers, or analytics — only `question_ref_id`, hierarchy IDs, and educational metadata for propagation
- No other service writes to `polling_db`
- Other services consume `polling-events` (Kafka) — never query polling DB directly

## API Surface (Updated)

### Authorization Matrix

| Method | Path | ADMIN | TEACHER | STUDENT |
|---|---|---|---|---|
| POST | `/api/v1/polling/quizzes` | ✓ | | |
| POST | `/api/v1/polling/quizzes/{quizId}/start` | ✓ | | |
| POST | `/api/v1/polling/quizzes/{quizId}/pause` | ✓ | | |
| POST | `/api/v1/polling/quizzes/{quizId}/resume` | ✓ | | |
| POST | `/api/v1/polling/quizzes/{quizId}/end` | ✓ | | |
| POST | `/api/v1/polling/quizzes/{quizId}/cancel` | ✓ | | |
| POST | `/api/v1/polling/quizzes/{quizId}/questions/{questionId}/skip` | ✓ | | |
| POST | `/api/v1/polling/quizzes/{quizId}/questions/{questionId}/cancel` | ✓ | | |
| GET | `/api/v1/polling/quizzes/{quizId}` | ✓ | ✓ (read-only) | |
| GET | `/api/v1/polling/quizzes/{quizId}/current` | ✓ | ✓ | ✓ |

**Summary of changes from previous version:**
- `POST /api/v1/polling/quizzes`: TEACHER → ADMIN
- `POST .../start`: TEACHER → ADMIN
- `POST .../pause`: TEACHER → ADMIN
- `POST .../resume`: TEACHER → ADMIN
- `POST .../end`: TEACHER → ADMIN
- `POST .../cancel`: TEACHER → ADMIN
- `POST .../skip`: TEACHER → ADMIN
- `POST .../cancel question`: TEACHER → ADMIN
- `GET .../{quizId}`: TEACHER → ADMIN+TEACHER (TEACHER retains read-only access)
- `GET .../current`: Unchanged (Any)

### CreateQuizRequest Payload
```json
{
  "lectureId": "uuid",
  "sectionId": "uuid",
  "subsectionId": "uuid",
  "teacherId": "uuid",
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

**Note:** The `teacherId` field is added to the create request payload. The admin creates the quiz on behalf of a teacher's session. The admin's identity is extracted from the JWT and stored as `admin_id`; the `teacherId` from the payload is stored as `teacher_id`. This preserves the academic ownership link.

## Domain Model (Updated)

```
Quiz: id, teacherId (UUID, NOT NULL), adminId (UUID, NOT NULL), quizStatus,
      currentQuestionNumber, totalQuestions, lectureId (UUID, nullable),
      sectionId (UUID, nullable), subsectionId (UUID, nullable),
      startedAt, endedAt, createdAt, updatedAt

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

### Changes to Domain Model
- `Quiz.adminId` (UUID, NOT NULL) — **added**. The admin who owns/executes this quiz. This is the identity verified on every mutating action.
- `Quiz.teacherId` (UUID, NOT NULL) — **unchanged**. Preserved for academic ownership and downstream consumer compatibility.
- `QuizQuestion` — **unchanged**. No role-related fields needed; question content and sequencing are role-agnostic.
- `QuizTimer` — **unchanged**. Timer management is role-agnostic.
- All enums — **unchanged**. Role is orthogonal to state.

### Database Changes
- New column `admin_id` on `quizzes` table (UUID, NOT NULL)
- Index: `idx_quizzes_admin_id ON quizzes(admin_id)`
- `teacher_id` column remains unchanged (UUID, NOT NULL)

### Question Metadata (Preserved, Never Used)
Polling Service **persists and propagates** the following metadata from QGS but **never reads or acts on it**:
- `topicId`, `conceptId`, `learningObjectiveId` — educational taxonomy
- `difficulty` — question difficulty level (EASY, MEDIUM, HARD)
- `questionType` — MCQ_SINGLE, MCQ_MULTI, TRUE_FALSE, SHORT_ANSWER, CODING
- `correctAnswer` — opaque string; PS stores it but never evaluates correctness

This metadata flows through to `PollOpenedEvent` for downstream services (RTC, Analytics, Reporting).

### Admin Impact on Question Metadata
**None.** Question metadata is role-agnostic. The ADMIN role only affects who can trigger operations, not what data is stored or propagated.

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

### Admin Impact on State Machines
**None.** State transitions, transition guards, and concurrency control are role-agnostic. The ADMIN role replaces TEACHER at the authorization layer only — the same state machine logic executes regardless of who triggers the transition. All existing guards (cannot start an already-running quiz, cannot pause a non-running quiz, etc.) remain unchanged.

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

### Admin Impact on Timer Management
**None.** Timer creation, expiry, pause, and resume are mechanical operations triggered by state transitions. The ADMIN role determines who can initiate those transitions, but the timer logic itself is unchanged. Timer sweep, expiry derivation, pause/resume semantics, and sweep locking are role-agnostic.

## Kafka Events Consumed
| Event | Topic | Producer | Purpose |
|---|---|---|---|
| `QuestionGeneratedEvent` | `question-generation-events` | QGS | Learn question metadata (hierarchy IDs, difficulty, type) for sequencing |
| `QuestionsGenerated` | `question-generation-events` | QGS | Notification of set completion (read-model) |

### Admin Impact on Consumed Events
**None.** Consumed events carry question metadata only — no authorization or ownership information. The ADMIN role does not affect what PS consumes or how it processes consumed events. Event contracts remain unchanged.

PS consumes no events from RTC, Analytics, Response, or Reporting services.

## Kafka Events Produced (Updated)

| Event | Topic | Trigger | Consumers |
|---|---|---|---|
| `PollOpenedEvent` | `polling-events` | Question enters POLL_OPEN | RTC (Gateway), Response Service |
| `PollClosedEvent` | `polling-events` | Question enters POLL_CLOSED | RTC (Gateway), Response Service |
| `QuizStartingEvent` | `polling-events` | Quiz transitions DRAFT → SCHEDULED | Notification Service |
| `QuizCompleted` | `polling-events` | All questions POLL_CLOSED | Analytics Service, Notification Service |
| `QuizCancelled` | `polling-events` | Admin cancels quiz | Response Service, RTC |
| `TimerStarted` | `polling-events` | Timer starts per-question | Internal observability |
| `TimerExpired` | `polling-events` | Timer reaches 0 | Internal observability |

### Event Payloads (Updated)

**Changes to event payloads:**
- `QuizStartingEvent`: added `adminId` field (additive). `teacherId` preserved.
- `QuizCompleted`: added `adminId` field (additive). `teacherId` preserved.
- `QuizCancelled`: trigger description updated from "Teacher" to "Admin". Payload unchanged — `teacherId` is sufficient for routing.
- `PollOpenedEvent`, `PollClosedEvent`: unchanged — poll events carry quiz/session/question metadata only. No role identity needed.
- `TimerStarted`, `TimerExpired`: unchanged — internal observability.

**Backward compatibility note:** All `adminId` fields are additive. No existing field is removed or renamed. Consumers that do not need admin identity information can ignore these fields without code changes.

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
  "adminId": "uuid",
  "scheduledStart": "2026-07-03T10:29:00Z",
  "startsInMs": 60000
}
```
*`adminId` added — identifies which admin initiated the quiz start. Downstream consumers (Notification Service) can use `teacherId` unchanged for routing.*

`QuizCompleted`:
```json
{
  "eventId": "uuid",
  "quizId": "uuid",
  "lectureId": "uuid",
  "teacherId": "uuid",
  "adminId": "uuid",
  "endedAt": "2026-07-03T10:35:00Z"
}
```
*`adminId` added — identifies which admin's quiz reached completion.*

## Observability (Updated)

### Audit Trail for Admin Actions
The Polling Service does not maintain a dedicated audit-log table (unlike Question Review Service's `review_audit_log`). Admin identity is captured through:

| Mechanism | What is logged | Where |
|---|---|---|
| Application-level structured logs | `adminId`, `quizId`, `action` (e.g., "quiz_started", "quiz_paused") | `QuizService` log statements on every state mutation |
| Request logs (HTTP) | `X-User-Id` header / JWT subject, method, path, status | Spring Boot access log / Gateway |
| Kafka event payloads | `adminId` in `QuizStartingEvent`, `QuizCompleted` | `polling-events` topic |

No dedicated audit-log table is added. The Kafka event stream serves as the authoritative audit trail — every significant state transition produces an event containing both `teacherId` (academic owner) and `adminId` (executor).

### State Transition Logging
Every state mutation in `QuizService` logs at INFO level:
```
Admin [adminId] performed [action] on quiz [quizId] (teacher: [teacherId])
```

## Coupling (Minimal, Explicit)
| Dependency | Protocol | Why Necessary |
|---|---|---|
| Auth Service | REST (sync) | Identity + role verification per request. JWT validation returns user UUID and role. Admin ownership check compares JWT subject against `quiz.admin_id`. |
| QGS | Kafka (consume `QuestionGeneratedEvent`) | Question metadata for poll sequencing |
| RTC (Gateway) | Kafka (produce `PollOpenedEvent`/`PollClosedEvent`) | Signal poll state so RTC can manage per-student display timing |
| Response Service | Kafka (produce `PollOpenedEvent`/`PollClosedEvent`) | Signal poll state so RS validates interaction window |
| Notification Service | Kafka (produce `QuizStartingEvent`, `QuizCompleted`) | Teacher/student alerts. Events still carry `teacherId` for routing — Notification Service's logic unchanged. |

### Coupling Changes
- **Auth Service** — description updated to reflect ADMIN ownership check. No protocol or contract change.
- **All other couplings** — unchanged. No new dependencies introduced.

No coupling to: Analytics Service, Reporting Service, Transcription Service, Recording Service, Lecture Service, User Service, Grading Service.

## Migration Strategy (Updated)

### Phase 1 — Existing Schema (Unchanged)
Apply V4 migration (add hierarchy + metadata columns) — already deployed.

### Phase 2 — Admin Role Migration (New)
Apply V5 migration (`V5__add_admin_id_to_quizzes.sql`):

```sql
-- Add admin_id column (initially nullable during migration)
ALTER TABLE quizzes ADD COLUMN admin_id UUID;

-- Backfill: copy teacher_id into admin_id for existing quizzes
-- This preserves backward compatibility — existing quizzes automatically belong to the admin
-- who now holds the same UUID as the original teacher (identity merge at the platform level)
UPDATE quizzes SET admin_id = teacher_id WHERE admin_id IS NULL;

-- Make admin_id NOT NULL after backfill
ALTER TABLE quizzes ALTER COLUMN admin_id SET NOT NULL;

-- Index for ownership lookups
CREATE INDEX idx_quizzes_admin_id ON quizzes(admin_id);
```

**Migration strategy:**
- `V5__add_admin_id_to_quizzes.sql` runs after existing V4 migration
- `teacher_id` column remains unchanged — no rename, no data loss
- Backfill copies `teacher_id` into `admin_id` so existing quizzes have an admin owner without manual reassignment
- Index added for `admin_id` ownership verification queries

### Phase 3 — Deploy Updated Code
Rolling update — old pods still use TEACHER authorization (will reject requests with 403 for TEACHER on mutating endpoints after rollout). Deploy with zero downtime.

### Phase 4 — Gateway Route Update
Update API Gateway `RoleAuthorizationFilter` to require ADMIN for mutating `/api/v1/polling/**` endpoints. TEACHER is removed from mutating route auth. See API Gateway context.md for per-route matrix.

### Phase 5 — Old Column Removal (Future, if needed)
No column removal planned. `teacher_id` continues to serve academic ownership purpose.

## Backward Compatibility Checklist

| Concern | Compatible? | Detail |
|---|---|---|
| API URLs | ✅ | No endpoint URL changed |
| API payloads | ✅ | CreateQuizRequest gains optional `teacherId` — existing callers that omit it fail at validation. All other request payloads unchanged. |
| Kafka topic names | ✅ | Unchanged |
| Kafka event schemas | ✅ | `adminId` fields are additive; `teacherId` preserved in all events |
| Database schema (existing columns) | ✅ | `teacher_id` unchanged; `admin_id` is additive |
| Existing quiz records | ✅ | Backfilled: `admin_id = teacher_id` for all existing quizzes |
| Gateway routes | ✅ | Route prefix `/api/v1/polling/**` unchanged; mutating endpoints now require ADMIN |
| Auth Service API | ✅ | JWT format, claims, validation unchanged |
| State machines | ✅ | Role-agnostic — no transition logic changed |
| Timer management | ✅ | Role-agnostic — no timer logic changed |
| Downstream consumers | ✅ | Events still carry `teacherId`; `adminId` is optional additional field |
| Optimistic/pessimistic locking | ✅ | Locking strategy unchanged |

## Testing Strategy (Updated)

### Existing Tests (Unchanged)
| Test | Scope | Why Unchanged |
|---|---|---|
| Quiz state transitions | Domain — state machine guards, terminal detection | Role-agnostic |
| Timer math | Domain — expiry calculation, pause/resume remaining seconds | Role-agnostic |
| Question sequencing | Domain — advance, skip, cancel logic | Role-agnostic |
| Sweep execution | Integration — timer expiry via sweep | Role-agnostic |
| Idempotency | Integration — duplicate start/advance | Role-agnostic |
| Concurrency | Integration — pessimistic locking, SKIP LOCKED | Role-agnostic |

### Updated Tests
| Test | Scope | Update |
|---|---|---|
| QuizService ownership verification | Unit — `verifyAdminOwnership()` | Renamed from `verifyOwnership()`, now checks `adminId` |
| QuizService read-only access | Unit — TEACHER GET quiz detail | Updated to use `teacherId` ownership check |
| QuizService TEACHER rejection | Unit — TEACHER calls start/pause/end | Updated expectation: 403 instead of 200 |

### New Tests (Admin Role Coverage)
| Test | Scope | What It Verifies |
|---|---|---|
| AdminCreateQuizTest | Unit — service | ADMIN can create quiz with `teacherId` from payload |
| AdminStartQuizTest | Integration | ADMIN starts quiz → state transitions → event emitted with `adminId` |
| AdminPauseQuizTest | Integration | ADMIN pauses RUNNING quiz → timer persists remaining seconds |
| AdminResumeQuizTest | Integration | ADMIN resumes PAUSED quiz → timer restores remaining seconds |
| AdminEndQuizTest | Integration | ADMIN ends active quiz early → `QuizCompleted` emitted |
| AdminCancelQuizTest | Integration | ADMIN cancels DRAFT/SCHEDULED quiz → `QuizCancelled` emitted |
| AdminSkipQuestionTest | Integration | ADMIN skips question → current poll closes, next opens |
| TeacherCannotMutateTest | Integration | TEACHER JWT on POST start/pause/end → 403 |
| TeacherReadOnlyTest | Integration | TEACHER can GET quiz detail and current poll — 200 |
| StudentRejectionTest | Integration | STUDENT JWT on any mutating endpoint → 403 |
| AdminOwnershipEnforcementTest | Unit | Admin A cannot start/pause/end quiz owned by Admin B |
| KafkaEventAdminIdTest | Integration | `QuizStartingEvent` and `QuizCompleted` contain `adminId` field |
| KafkaEventBackwardCompatTest | Integration | Old consumer can parse events without `adminId` (additive schema) |
| FlywayMigrationV5Test | Integration | V5 migration runs cleanly, backfill populates `admin_id`, index created |
| RoleAuthorizationAtGatewayTest | Integration (via Gateway) | TEACHER request to mutating endpoint returns 403 at gateway |

## Reliability
**No change.** All existing reliability mechanisms (pessimistic locking, `SELECT FOR UPDATE SKIP LOCKED`, Kafka idempotent producer, circuit breaker, retry logic, transactional rollback) are role-agnostic. The ADMIN role changes only the authorization layer — CP consistency guarantees, distributed locking, timer expiry mechanisms, and idempotency enforcement remain identical regardless of which role triggers the operation.

## Service Ownership Matrix (Updated)
| Capability | Owner |
|---|---|
| Question content, options, correct answers, difficulty, type | QGS |
| Poll lifecycle (open, close, sequence, timing) — **execution** | **Polling Service (ADMIN)** |
| Poll lifecycle — **academic ownership** | **Teacher (via teacherId link)** |
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

### Changes
No new environment variables introduced. Existing `JWT_SECRET` and `AUTH_SERVICE_URL` continue to serve role validation.

## Deployment Updates Summary

| Component | Change Required |
|---|---|
| Flyway migration | New `V5__add_admin_id_to_quizzes.sql` |
| Application security config | Add `@EnableMethodSecurity` to `WebSecurityConfig`; configure `@PreAuthorize` on controller methods |
| Gateway route config | Update `RoleAuthorizationFilter`: mutating `/api/v1/polling/**` → ADMIN only |
| Environment variables | None |
| Kubernetes / HPA | None |
| Kafka topic configuration | None |
| Redis configuration | None |

## Deliverables Summary

### Components Requiring Modification
1. `QuizService.java` — rename `verifyOwnership()` → `verifyAdminOwnership()`; update to check `adminId`; add role-aware read-only overload for TEACHER
2. `QuizController.java` — update `@PreAuthorize` annotations: mutating endpoints → `hasRole('ADMIN')`, GET endpoints → `hasAnyRole('ADMIN', 'TEACHER')`
3. `Quiz.java` entity — add `adminId` field with `@Column(name = "admin_id")`
4. `QuizRepository.java` — add `findByAdminId()` and `findDistinctIdsByAdminId()` query methods; keep existing `teacherId` queries
5. `QuestionGeneratedEventConsumer.java` — **no change** (consumed events carry no role info)
6. `QuizEventProducer.java` — add `adminId` to `QuizStartingEvent` and `QuizCompleted` payloads
7. `WebSecurityConfig.java` — add `@EnableMethodSecurity`
8. Event record classes — add `adminId` field to `QuizStartingEvent`, `QuizCompleted`
9. API Gateway `RoleAuthorizationFilter` — update route auth for `/api/v1/polling/**`
10. Flyway migration — `V5__add_admin_id_to_quizzes.sql`

### Components Remaining Unchanged
1. `QuizStateMachine.java` — state transitions, guards — role-agnostic
2. `QuizTimerManager.java` — timer creation, expiry, pause, resume — role-agnostic
3. `TimerSweepService.java` — sweep query, expiry detection — role-agnostic
4. `PollOpenedEvent`, `PollClosedEvent`, `TimerStarted`, `TimerExpired` event records — no role fields needed
5. All domain enums (`QuizStatus`, `QuestionStatus`, `TimerStatus`) — role-agnostic
6. `QuizQuestion.java` entity — no role fields
7. `QuizTimer.java` entity — no role fields
8. Kafka consumer configuration — unchanged
9. Kafka producer configuration — unchanged (additive fields only)
10. Redis lock configuration — unchanged
11. HikariCP connection pool configuration — unchanged
12. HPA / scaling configuration — unchanged

# Spandan Notification Service — Context File

## Project Identity
- **System:** Spandan — a classroom engagement analytics platform
- **Service:** Notification Service (bounded context: Notification Delivery & History)
- **Architecture:** Clean Architecture layered inside a Spring Boot microservice
- **DB-per-service:** yes — owns `notification_db` exclusively

## Core Responsibility
Deliver system-generated notifications to **ADMIN**, **TEACHER**, and **STUDENT** roles. Never generates business data — only reacts to events from other services. Supports In-App, Push (FCM), and WebSocket (via Gateway → STOMP) channels with pluggable provider architecture. Maintains delivery history with retry and deduplication. Routing decisions are role-aware: assessment lifecycle notifications target ADMIN, instructional notifications target TEACHER, and session notifications target STUDENT.

## Role-Based Responsibility Model

### ADMIN Notifications (assessment lifecycle)
- Questions ready for review
- Review reminders
- Question set approved
- Review completed
- Quiz ready for publishing
- Quiz started
- Quiz paused
- Quiz resumed
- Quiz completed
- Quiz cancelled
- Poll lifecycle notifications (open, close)
- Grading completed
- Auto-grading failed

### TEACHER Notifications (instructional)
- AI question generation completed
- Question generation failed
- Transcript generation completed
- Transcript generation failed
- Analytics / teacher analytics ready
- Session analytics / summary available
- Student engagement insights
- Historical analytics available
- Lecture created / started / ended

### STUDENT Notifications (session participation)
- Quiz starting soon
- Quiz started
- Analytics ready
- Leaderboard available
- Session notifications

## Key Architecture Decisions

### AP + Eventual Consistency
A notification being momentarily invisible during a partition is acceptable; the business cost of staleness is zero.

| Decision | Implementation |
|---|---|
| Accept all incoming notification events; persist to DB immediately | DB persist is synchronous |
| Duplicate prevention via DB unique constraint | `UNIQUE(source_event_id, user_id, notification_type)` |
| In-App channel is immediate on persist | Notification rows served via REST; no external dependency |
| Push/WebSocket delivery is async with retry | Failed delivery → DB retry queue (5 attempts, exponential backoff) |
| Kafka events fire after DB commit | `@TransactionalEventListener(phase = AFTER_COMMIT)` |
| No Redis required | Dedup is DB-level; no shared mutable state across pods |

### Why AP over CP
- A notification being visible 2 seconds late is harmless; refusing to accept during a partition is harmful
- Retry mechanism recovers failed deliveries when partition heals

## Bounded Context: Notification Delivery & History
**Inside:** Notification records, delivery state, push tokens, channel routing, retry sweeper
**Outside:** Business entities (polls, questions, responses, analytics, transcripts, auth credentials)

## Kafka Events Consumed — Recipient Routing Matrix

| Event | Topic | Producer | Recipient | Notes |
|---|---|---|---|---|
| `QuestionsGenerated` | `question-generation-events` | QGS | **ADMIN** | Was TEACHER; assessment review is now ADMIN responsibility |
| `QuestionGenerationFailed` | `question-generation-events` | QGS | TEACHER | Generation is an instructional tool; teacher needs to retry |
| `ReviewCompleted` | `question-review-events` | QRS | **ADMIN** | Was TEACHER; review outcome belongs to assessment admin |
| `QuizStartingEvent` | `polling-events` | Polling Service | **ADMIN** | Was TEACHER; quiz lifecycle is ADMIN-owned |
| `QuizCompleted` | `polling-events` | Polling Service | **ADMIN** | Was TEACHER; quiz completion belongs to assessment admin |
| `TeacherAnalyticsReady` | `analytics-events` | Analytics Service | TEACHER | Instructional analytics remain teacher-owned |
| `StudentAnalyticsReady` | `analytics-events` | Analytics Service | STUDENT | Student results are personal |
| `LeaderboardGenerated` | `analytics-events` | Analytics Service | STUDENT, TEACHER | Leaderboard is visible to participants and instructors |
| `SessionAnalyticsCompletedEvent` | `session-analytics-events` | Analytics Service | TEACHER | Session insights are instructional |
| `TranscriptGenerationFailed` | `transcription-events` | Transcription Service | TEACHER | Transcription is an instructional concern |
| `LectureCreated` | `lecture-events` | Lecture Service | TEACHER | Lecture management is teacher-owned |
| `LectureStarted` | `lecture-events` | Lecture Service | STUDENT, TEACHER | Students need to know lecture started; teacher confirmation |
| `LectureEnded` | `lecture-events` | Lecture Service | TEACHER | Lecture wrap-up belongs to teacher |
| `GradingCompleted` | `grading-events` | Grading Service | **ADMIN** | Grading is assessment administration |
| `AutoGradingFailed` | `grading-events` | Grading Service | **ADMIN** | Grading failure is an assessment admin concern |
| `UserLoggedIn` | `user-events` | Auth Service | — | System event; no user-facing notification |
| `UserLoggedOut` | `user-events` | Auth Service | — | System event; no user-facing notification |
| `UserRegistered` | `user-events` | Auth Service | — | System event; no user-facing notification |
| `UserProfileUpdated` | `user-events` | User Service | — | System event; no user-facing notification |
| `UserDeactivated` | `user-events` | User Service | — | System event; no user-facing notification |

## Kafka Topics Consumed
- `question-generation-events`
- `question-review-events`
- `polling-events`
- `analytics-events`
- `session-analytics-events`
- `transcription-events`
- `user-events`
- `lecture-events`
- `grading-events`

No new topics required. Recipient resolution is handled in consumer logic, not topic routing.

## Notification Type Catalog

Extended with role suffix for clarity:

`QUESTIONS_GENERATED` → ADMIN
`QUESTION_GENERATION_FAILED` → TEACHER
`REVIEW_COMPLETED` → ADMIN
`QUIZ_STARTING` → ADMIN
`QUIZ_COMPLETED` → ADMIN
`TEACHER_ANALYTICS_READY` → TEACHER
`STUDENT_ANALYTICS_READY` → STUDENT
`LEADERBOARD_GENERATED` → STUDENT, TEACHER
`SESSION_ANALYTICS_COMPLETED` → TEACHER
`TRANSCRIPT_GENERATION_FAILED` → TEACHER
`LECTURE_CREATED` → TEACHER
`LECTURE_STARTED` → STUDENT, TEACHER
`LECTURE_ENDED` → TEACHER
`GRADING_COMPLETED` → ADMIN
`AUTO_GRADING_FAILED` → ADMIN
`USER_LOGGED_IN` — no notification
`USER_LOGGED_OUT` — no notification
`USER_REGISTERED` — no notification
`USER_PROFILE_UPDATED` — no notification
`USER_DEACTIVATED` — no notification

## Notification Template Updates

| Notification Type | Old Template (Teacher) | New Template (Admin/Teacher) |
|---|---|---|
| `QUESTIONS_GENERATED` | "Your questions are ready for review." | "Question set is ready for administrative review." |
| `REVIEW_COMPLETED` | "Review completed for your questions." | "Question review process has been completed." |
| `QUIZ_STARTING` | "Your quiz is starting soon." | "Quiz is starting soon." |
| `QUIZ_COMPLETED` | "Your quiz has ended." | "Quiz has ended." |
| `GRADING_COMPLETED` | (not previously routed) | "Grading completed for the assessment." |
| `AUTO_GRADING_FAILED` | (not previously routed) | "Auto-grading failed. Manual intervention required." |

All TEACHER and STUDENT templates remain unchanged.

## Kafka Events Produced
| Event | Topic | Trigger | Consumers |
|---|---|---|---|
| `NotificationCreated` | `notification-events` | Any notification persisted | Gateway → STOMP |

`NotificationCreated` payload — unchanged. The payload already includes `user_id` and `notification_type`; role context is derivable from `notification_type` on the consumer side.

## Domain Model

### `notifications` (extended with `recipient_role`)
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | NOT NULL, INDEX |
| recipient_role | VARCHAR(20) | NOT NULL — 'ADMIN', 'TEACHER', 'STUDENT' |
| notification_type | VARCHAR(50) | NOT NULL — see catalog above |
| title | VARCHAR(200) | NOT NULL |
| message | TEXT | NOT NULL |
| status | VARCHAR(20) | NOT NULL DEFAULT 'PENDING' — PENDING, DELIVERED, FAILED, READ |
| channel | VARCHAR(20) | NOT NULL |
| source_service | VARCHAR(50) | NOT NULL |
| source_event_id | UUID | NOT NULL |
| session_id | UUID | NULLABLE, INDEX |
| quiz_id | UUID | NULLABLE |
| lecture_id | UUID | NULLABLE |
| delivered_at | TIMESTAMPTZ | NULLABLE |
| read_at | TIMESTAMPTZ | NULLABLE |
| retry_count | INT | NOT NULL DEFAULT 0 |
| next_retry_at | TIMESTAMPTZ | NULLABLE |
| error_message | TEXT | NULLABLE |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

**Constraints:** `UNIQUE(source_event_id, user_id, notification_type)`
**Index:** `(recipient_role, status)` for role-scoped queries
**Migration:** V2 — ADD COLUMN `recipient_role` VARCHAR(20) NOT NULL DEFAULT 'TEACHER'; backfill existing rows as 'TEACHER'; remove default.

### `user_push_tokens` — unchanged
### `user_notification_preferences` — unchanged

Authorization for preference updates must check that the requesting user's role matches the notification type's intended recipient role.

## REST APIs

| Method | Endpoint | Change |
|---|---|---|
| GET | `/api/v1/notifications` | Add `?role=ADMIN|TEACHER|STUDENT` query filter; server validates against JWT `role` claim |
| GET | `/api/v1/notifications/unread-count` | Filter by JWT `role` — returns count only for user's role |
| PATCH | `/api/v1/notifications/{id}/read` | Verify `notification.recipient_role == JWT.role` before allowing |
| GET | `/api/v1/notifications/preferences` | Return preferences scoped by role |
| PUT | `/api/v1/notifications/preferences` | Validate that role-specific preferences are consistent with user's role |

Endpoint URLs unchanged. Only query/filter logic and authorization added.

## WebSocket Delivery

- `NotificationCreated` events are published to the existing `notification-events` topic
- Gateway STOMP handler filters delivery based on `recipient_role` in the notification payload — a user subscribed to `/user/queue/notifications` only receives notifications where `recipient_role` matches their own role
- No new routing keys or separate notification categories required; role filtering happens at the delivery layer
- Role is already available in the WebSocket session (established at JWT auth during connection handshake)

## Authorization

| Operation | Rule |
|---|---|
| Fetch notifications | Only notifications where `recipient_role` matches the requesting user's JWT `role` |
| Mark as read | Notification must belong to the user AND `recipient_role` must match user's JWT `role` |
| Update preferences | Notification type category must be compatible with the user's role |
| WebSocket delivery | Gateway drops notifications where `recipient_role != session.role` |

Cross-role notification access is prevented at both the REST layer (controller filter) and WebSocket layer (delivery filter).

## Security

- JWT `role` claim is the source of truth for authorization decisions
- All notification-fetching endpoints validate that the returned `recipient_role` matches the caller's role
- Direct ID enumeration (e.g., PATCH `/notifications/{id}/read`) checks both `user_id` ownership and `recipient_role` match
- The Notification Service never stores or manages roles; it only records the resolved `recipient_role` at notification-creation time based on the event type
- Role is extracted from the event context where available (event metadata header) or derived from `notification_type` mapping

## Retry and Reliability — Unchanged

The introduction of ADMIN role does not change retry mechanisms, dead-letter queues, idempotency, or duplicate prevention. Rationale:
- Retry is per-notification-row regardless of role; the same exponential backoff applies
- Dedup unique constraint `(source_event_id, user_id, notification_type)` already covers all roles
- DLQ handles unprocessable events irrespective of intended recipient

## Observability — Enhanced by Role

Metrics should be broken down by role to allow operational insight into delivery health per audience:

| Metric | Labels | Rationale |
|---|---|---|
| `notifications_created_total` | `role`, `notification_type`, `channel` | Understand volume per role |
| `notifications_delivered_total` | `role`, `channel` | Track delivery success per role |
| `notifications_failed_total` | `role`, `channel`, `error_code` | Identify which role experiences failures |
| `notifications_unread_count` | `role` | Monitor backlog per role |
| `notifications_delivery_latency_seconds` | `role`, `channel` | Ensure Admin notifications are not delayed |

Role-level breakdown is necessary because ADMIN, TEACHER, and STUDENT notifications have different SLAs:
- ADMIN notifications are assessment-critical and should have higher delivery priority
- TEACHER notifications are instructional and can tolerate slight delay
- STUDENT notifications are session-time-sensitive

## Coupling

| Service | Protocol | Notes |
|---|---|---|
| Auth Service | REST (sync) | JWT validation — unchanged |
| Gateway | Kafka (produce `NotificationCreated`) | STOMP fan-out — unchanged; role filtering added at delivery |
| Polling Service | Kafka (consume `QuizStartingEvent`, `QuizCompleted`) | Recipient changed to ADMIN |
| QGS | Kafka (consume `QuestionsGenerated`, `QuestionGenerationFailed`) | `QuestionsGenerated` recipient changed to ADMIN; `QuestionGenerationFailed` remains TEACHER |
| QRS | Kafka (consume `ReviewCompleted`) | Recipient changed to ADMIN |
| Analytics Service | Kafka (consume `TeacherAnalyticsReady`, `StudentAnalyticsReady`, `LeaderboardGenerated`) | `TeacherAnalyticsReady` remains TEACHER; `StudentAnalyticsReady` remains STUDENT; `LeaderboardGenerated` now also routed to TEACHER |
| Analytics Service | Kafka (consume `SessionAnalyticsCompletedEvent`) | Remains TEACHER |
| Transcription Service | Kafka (consume `TranscriptGenerationFailed`) | Remains TEACHER |
| Auth / User Service | Kafka (consume `user-events`) | Identity events — no user-facing notification; recipient is empty |
| Lecture Service | Kafka (consume `lecture-events`) | Remains TEACHER (broadcast events go to STUDENT too) |
| Grading Service | Kafka (consume `grading-events`) | Recipient changed to ADMIN |

No new service couplings introduced. No REST dependencies added.

## Flyway Migration

**V2__add_recipient_role_to_notifications.sql**
```sql
ALTER TABLE notifications ADD COLUMN recipient_role VARCHAR(20) NOT NULL DEFAULT 'TEACHER';
CREATE INDEX idx_notifications_recipient_role_status ON notifications(recipient_role, status);
-- Backfill: existing rows are TEACHER (pre-ADMIN baseline)
-- Future rows will be set by application code based on notification_type mapping
```

No other schema changes required. Template updates are data (seeded via application code or a one-off migration script), not schema.

## Components Requiring Modification
1. Core Responsibility — documentation updated
2. Kafka consumer handlers — recipient resolution logic updated to use new routing matrix
3. Notification service layer — `determineRecipient(notificationType)` method added
4. Notification templates — Admin-specific templates for assessment events
5. Database schema — added `recipient_role` column (V2 migration)
6. REST API controller filters — role-scoped queries
7. WebSocket delivery — Gateway-level role filtering
8. Authorization checks — cross-role prevention on all notification endpoints
9. Observability — metrics split by `role` label
10. Testing — Admin notification delivery, recipient resolution, role-based auth

## Components Remaining Unchanged
1. Clean Architecture layer boundaries (domain, application, infrastructure, presentation)
2. Channel abstraction (In-App, Push FCM, WebSocket)
3. Kafka topic structure (no new topics; routing is content-based, not topic-based)
4. Retry mechanism (exponential backoff, 5 attempts, DB retry queue)
5. Idempotency & dedup (unique constraint unchanged)
6. Scalability model (stateless consumers, horizontal pod scaling)
7. Environment variables (no new configuration required)
8. Kafka event payloads (existing events carry sufficient context)
9. `user_push_tokens` table (unchanged)
10. `user_notification_preferences` table (unchanged; authorization layer validates role compatibility)
11. `NotificationCreated` event payload (unchanged; role is derivable from `notification_type`)
12. Deployment infrastructure (Docker, Kubernetes manifests, CI/CD)

## Testing Strategy — Enhanced

### New Tests (Admin Role)
| Test | Scope |
|---|---|
| `Admin receives QuestionsGenerated notification` | Consumer → service → repository |
| `Admin receives ReviewCompleted notification` | Consumer → service → repository |
| `Admin receives QuizStartingEvent notification` | Consumer → service → repository |
| `Admin receives QuizCompleted notification` | Consumer → service → repository |
| `Admin receives GradingCompleted notification` | Consumer → service → repository |
| `Teacher does NOT receive QuestionsGenerated` | Consumer routing; verify recipient_role is ADMIN |
| `Teacher does NOT receive QuizStartingEvent` | Consumer routing; verify recipient_role is ADMIN |
| `Admin does NOT receive TeacherAnalyticsReady` | Consumer routing; verify recipient_role is TEACHER |
| `Student does NOT receive ADMIN or TEACHER notifications` | Consumer routing; verify recipient_role is STUDENT |
| `Recipient resolution maps all notification types correctly` | Unit test — every notification_type maps to correct role |
| `REST GET /notifications filters by role` | Controller test; JWT with ADMIN role sees only ADMIN notifications |
| `REST PATCH /notifications/{id}/read rejects cross-role access` | Controller test; ADMIN tries to mark TEACHER notification as read |
| `WebSocket delivery drops cross-role notifications` | Gateway filter test |
| `Notification template selection for Admin types` | Template engine test |
| `Preference update rejected for incompatible role` | Controller test; Teacher tries to disable an Admin-only notification type |
| `V2 migration adds recipient_role column` | Flyway migration test |
| `Backward compatibility — existing TEACHER rows readable after migration` | Integration test |
| `Duplicate prevention still works across roles` | Dedup test with same source_event_id, different user_ids |

### Existing Tests — all preserved with no modification needed

## Deployment

| Change Type | Detail |
|---|---|
| Flyway migration | V2 — add `recipient_role` column; existing rows backfilled as 'TEACHER' |
| Notification templates | Updated in codebase; deployed as part of application JAR — no external template store |
| Configuration | No new environment variables; no changes to existing ones |
| Kafka consumer group | Same consumer group; rebalance required on deploy (rolling update handles gracefully) |
| Metrics dashboards | Add `role` label filter to existing notification dashboards |

No infrastructure changes required. The deployment is a standard rolling update.

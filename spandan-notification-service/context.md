# Spandan Notification Service — Context File

## Project Identity
- **System:** Spandan — a classroom engagement analytics platform
- **Service:** Notification Service (bounded context: Notification Delivery & History)
- **Architecture:** Clean Architecture layered inside a Spring Boot microservice
- **DB-per-service:** yes — owns `notification_db` exclusively

## Core Responsibility
Deliver system-generated notifications to teachers and students. Never generates business data — only reacts to events from other services. Supports In-App, Push (FCM), and WebSocket (via Gateway → STOMP) channels with pluggable provider architecture. Maintains delivery history with retry and deduplication.

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

## Kafka Events Consumed

### Existing
| Event | Topic | Producer | Purpose |
|---|---|---|---|
| `QuestionsGenerated` | `question-generation-events` | QGS | Questions ready for review |
| `QuestionGenerationFailed` | `question-generation-events` | QGS | Generation failed |
| `ReviewCompleted` | `question-review-events` | QRS | Review completed |
| `QuizStartingEvent` | `polling-events` | Polling Service | Quiz starting in 1 min |
| `TeacherAnalyticsReady` | `analytics-events` | Analytics Service | Teacher analytics ready |
| `StudentAnalyticsReady` | `analytics-events` | Analytics Service | Student results ready |
| `LeaderboardGenerated` | `analytics-events` | Analytics Service | Leaderboard updated |
| `TranscriptGenerationFailed` | `transcription-events` | Transcription Service | Transcript failed |
| `UserLoggedIn` | `user-events` | Auth Service | User logged in |
| `UserLoggedOut` | `user-events` | Auth Service | User logged out |
| `UserRegistered` | `user-events` | User Service | User registered |
| `UserProfileUpdated` | `user-events` | User Service | Profile updated |
| `UserDeactivated` | `user-events` | User Service | User deactivated |

### New
| Event | Topic | Producer | Purpose |
|---|---|---|---|
| `SessionAnalyticsCompletedEvent` | `session-analytics-events` | Analytics Service | Session analytics available for reporting |
| `QuizCompleted` | `polling-events` | Polling Service | Quiz ended — for summary notifications |
| `LectureCreated` | `lecture-events` | Lecture Service | New lecture available |
| `LectureStarted` | `lecture-events` | Lecture Service | Lecture in progress |
| `LectureEnded` | `lecture-events` | Lecture Service | Lecture ended |
| `GradingCompleted` | `grading-events` | Grading Service | Auto-grading complete |
| `AutoGradingFailed` | `grading-events` | Grading Service | Auto-grading failed |

## Notification Type Catalog

Updated `notification_type` domain:

`QUESTIONS_GENERATED`, `QUESTION_GENERATION_FAILED`, `REVIEW_COMPLETED`, `QUIZ_STARTING`, `QUIZ_COMPLETED`, `TEACHER_ANALYTICS_READY`, `STUDENT_ANALYTICS_READY`, `LEADERBOARD_GENERATED`, `SESSION_ANALYTICS_COMPLETED`, `TRANSCRIPT_GENERATION_FAILED`, `USER_LOGGED_IN`, `USER_LOGGED_OUT`, `USER_REGISTERED`, `USER_PROFILE_UPDATED`, `USER_DEACTIVATED`, `LECTURE_CREATED`, `LECTURE_STARTED`, `LECTURE_ENDED`, `GRADING_COMPLETED`, `AUTO_GRADING_FAILED`

## Kafka Topics Consumed

Updated topic list:
- `question-generation-events`
- `question-review-events`
- `polling-events`
- `analytics-events`
- `session-analytics-events`
- `transcription-events`
- `user-events`
- `lecture-events`
- `grading-events`

## Domain Model

### `notifications` (extended notification_type column)
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | NOT NULL, INDEX |
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

### `user_push_tokens` — unchanged
### `user_notification_preferences` — unchanged

## Kafka Events Produced
| Event | Topic | Trigger | Consumers |
|---|---|---|---|
| `NotificationCreated` | `notification-events` | Any notification persisted | Gateway → STOMP |

`NotificationCreated` payload — unchanged.

## Coupling
| Service | Protocol | Notes |
|---|---|---|
| Auth Service | REST (sync) | JWT validation |
| Gateway | Kafka (produce `NotificationCreated`) | STOMP fan-out |
| Polling Service | Kafka (consume `QuizStartingEvent`, `QuizCompleted`) | Quiz lifecycle |
| QGS | Kafka (consume `QuestionsGenerated`, `QuestionGenerationFailed`) | Generation status |
| QRS | Kafka (consume `ReviewCompleted`) | Review status |
| Analytics Service | Kafka (consume `TeacherAnalyticsReady`, `StudentAnalyticsReady`, `LeaderboardGenerated`) | Analytics readiness |
| Analytics Service | Kafka (consume `SessionAnalyticsCompletedEvent`) | Session analytics completion |
| Transcription Service | Kafka (consume `TranscriptGenerationFailed`) | Transcript failures |
| Auth / User Service | Kafka (consume `user-events`) | Identity events |
| Lecture Service | Kafka (consume `lecture-events`) | Lecture lifecycle |
| Grading Service | Kafka (consume `grading-events`) | Grading completion |

## Retry Strategy — unchanged
## Idempotency & Dedup — unchanged
## Scalability — unchanged
## Security — unchanged

## Environment Variables (Required) — unchanged

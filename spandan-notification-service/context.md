# Spandan Notification Service — Context File

## Project Identity
- **System:** Spandan — a classroom engagement platform
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
| Accept all incoming notification events; persist to DB immediately | Rabbit hole of delivery is async; DB persist is synchronous |
| Duplicate prevention via DB unique constraint | `UNIQUE(source_event_id, user_id, notification_type)` — no distributed lock needed |
| In-App channel is immediate on persist | Notification rows served via REST; no external dependency |
| Push/WebSocket delivery is async with retry | Failed delivery → DB retry queue (5 attempts, exponential backoff) |
| Kafka events fire after DB commit | `@TransactionalEventListener(phase = AFTER_COMMIT)` |
| No Redis required | Dedup is DB-level; no shared mutable state across pods |

### Why AP over CP
- A notification being visible 2 seconds late is harmless; refusing to accept an event during a partition is harmful
- Better to accept and queue during a partition than reject and lose the event
- Retry mechanism recovers failed deliveries when partition heals

### Behaviour During Network Partition
- Accept and persist all incoming notification events in PostgreSQL
- Push and WebSocket channels may fail — retry in DB queue
- In-App notifications (REST fetch) are always available from DB
- No event loss; eventual delivery on partition recovery

## Bounded Context: Notification Delivery & History
**Inside:** Notification records, delivery state, push tokens, user notification preferences, channel routing, retry sweeper
**Outside:** Business entities (polls, questions, responses, analytics, transcripts, auth credentials)

### Anti-Corruption Boundary
- Never accesses another service's database directly
- No other service reads/writes `notification_db`
- Notification created only via Kafka events from trusted producers — no `POST /notifications` endpoint exists

## Technical Stack
- **Language:** Java 21
- **Framework:** Spring Boot 3.2.x (Spring Web, Security, Data JPA, Kafka, Scheduler)
- **Database:** PostgreSQL 16 (`notification_db` schema via Flyway)
- **Messaging:** Kafka 3.6 (consumer: `polling-events`, `question-generation-events`, `question-review-events`, `analytics-events`; producer: `notification-events`)
- **Resilience:** Resilience4j (retry, circuit breaker for push channel)
- **Push Provider:** Firebase Cloud Messaging (FCM) — abstracted via `NotificationChannel` interface
- **Testing:** JUnit 5, Mockito, Testcontainers (PostgreSQL + Kafka + WireMock for FCM)
- **Build:** Maven 3.9+
- **Deploy:** Docker → Kubernetes (stateless, HPA-scaled on consumer lag + CPU)

## Processing Flow
```
Producer Service (QGS/Polling/Analytics/QRS/Transcription)
      ↓ Kafka
NotificationEventConsumer
      ↓
Dedup check (UNIQUE constraint)
      ↓
Persist notification row (status: PENDING)
      ↓
Channel Router:
  ├── In-App → status = DELIVERED (immediate)
  ├── Push   → FCM attempt → success→DELIVERED / fail→retry queue
  └── WebSocket → produce NotificationCreated→Gateway→STOMP
      ↓
On failure → DB retry queue (exponential backoff, max 5)
      ↓
Retry sweeper (@Scheduled, every 30s)
```

## API Surface
All endpoints require valid JWT. User can only access their own notifications.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/v1/notifications` | Any | List notifications (pageable, filterable by status) |
| PATCH | `/api/v1/notifications/{id}/read` | Any | Mark single as read |
| PATCH | `/api/v1/notifications/read-all` | Any | Mark all as read |
| DELETE | `/api/v1/notifications/{id}` | Any | Delete notification |
| POST | `/api/v1/notifications/{id}/retry` | TEACHER/ADMIN | Manual retry of failed notification |
| GET | `/api/v1/notifications/stats` | Any | Unread/delivered/failed counts |
| POST | `/api/v1/push-tokens` | Any | Register/update FCM token |
| DELETE | `/api/v1/push-tokens/{deviceId}` | Any | Remove device token |

## Domain Model

### `notifications`
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | NOT NULL, INDEX |
| notification_type | VARCHAR(50) | NOT NULL — `QUESTIONS_GENERATED`, `QUESTION_GENERATION_FAILED`, `REVIEW_COMPLETED`, `QUIZ_STARTING`, `TEACHER_ANALYTICS_READY`, `STUDENT_ANALYTICS_READY`, `LEADERBOARD_GENERATED`, `TRANSCRIPT_GENERATION_FAILED` |
| title | VARCHAR(200) | NOT NULL |
| message | TEXT | NOT NULL |
| status | VARCHAR(20) | NOT NULL DEFAULT 'PENDING' — `PENDING`, `DELIVERED`, `FAILED`, `READ` |
| channel | VARCHAR(20) | NOT NULL — `IN_APP`, `PUSH`, `WEBSOCKET` |
| source_service | VARCHAR(50) | NOT NULL |
| source_event_id | UUID | NOT NULL — part of dedup key |
| session_id | UUID | NULLABLE, INDEX |
| quiz_id | UUID | NULLABLE |
| delivered_at | TIMESTAMPTZ | NULLABLE |
| read_at | TIMESTAMPTZ | NULLABLE |
| retry_count | INT | NOT NULL DEFAULT 0 |
| next_retry_at | TIMESTAMPTZ | NULLABLE |
| error_message | TEXT | NULLABLE |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT now() |

**Constraints:** `UNIQUE(source_event_id, user_id, notification_type)` — dedup
**Indexes:** `idx_user_status ON (user_id, status)`, `idx_retry ON (status, next_retry_at) WHERE status = 'FAILED' AND retry_count < 5`, `idx_created ON (created_at DESC)`

### `user_push_tokens`
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | NOT NULL |
| device_id | VARCHAR(100) | NOT NULL |
| platform | VARCHAR(20) | NOT NULL — `ANDROID`, `IOS`, `WEB` |
| push_token | TEXT | NOT NULL |
| is_active | BOOLEAN | NOT NULL DEFAULT TRUE |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

`UNIQUE(user_id, device_id)`

### `user_notification_preferences`
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | NOT NULL, UNIQUE |
| in_app_enabled | BOOLEAN | DEFAULT TRUE |
| push_enabled | BOOLEAN | DEFAULT TRUE |
| updated_at | TIMESTAMPTZ | NOT NULL |

## Kafka Events Consumed

| Event | Topic | Producer | Purpose |
|---|---|---|---|
| `QuestionsGenerated` | `question-generation-events` | QGS | Teacher: "Questions are ready for review" |
| `QuestionGenerationFailed` | `question-generation-events` | QGS | Teacher: "Question generation failed" |
| `ReviewCompleted` | `question-review-events` | QRS | Teacher: "Question review completed. X approved, Y rejected." |
| `QuizStartingEvent` | `polling-events` | Polling Service | Students: "Question 1 of N begins in one minute" |
| `TeacherAnalyticsReady` | `analytics-events` | Analytics Service | Teacher: "Session analytics ready" |
| `StudentAnalyticsReady` | `analytics-events` | Analytics Service | Student: "Your results are ready" |
| `LeaderboardGenerated` | `analytics-events` | Analytics Service | Relevant users: "Leaderboard updated" |
| `TranscriptGenerationFailed` | `transcription-events` | Transcription Service | Teacher: "Transcript generation failed" |

NS does NOT consume: `QuestionsReadyForReview` (→ QRS), `AnalyticsCompleted` (too generic — replaced by specific events), `TranscriptStored` (NS has no use for it).

## Kafka Events Produced

| Event | Topic | Trigger | Consumers |
|---|---|---|---|
| `NotificationCreated` | `notification-events` | Any notification persisted | Gateway (routes to WebSocket via STOMP) |

`NotificationCreated` payload:
```json
{
  "eventId": "uuid",
  "notificationId": "uuid",
  "userId": "uuid",
  "quizId": "uuid or null",
  "targetType": "USER or QUIZ",
  "targetId": "uuid (userId for USER, quizId for QUIZ)",
  "title": "string",
  "message": "string",
  "type": "QUESTIONS_GENERATED",
  "channel": "WEBSOCKET",
  "timestamp": "2026-07-02T10:30:00Z"
}
```

The Gateway routes:
- `targetType: USER` → `/user/{targetId}/queue/notifications`
- `targetType: QUIZ` → `/topic/quiz/{targetId}/notifications`

## Pluggable Notification Channel Architecture

```java
public interface NotificationChannel {
    String channelName();
    boolean supports(NotificationType type);
    ChannelDeliveryResult send(Notification notification, UserChannelPreferences prefs);
}
```

| Channel | Implementation | Behaviour |
|---|---|---|
| In-App | `InAppNotificationChannel` | No external call; notification already persisted; delivery is immediate upon INSERT |
| Push | `PushNotificationChannel` | FCM HTTP v1 API; token stored in `user_push_tokens`; failure → retry queue; invalid token → soft-delete token |
| WebSocket | `WebSocketNotificationChannel` | Produces `NotificationCreated` to `notification-events`; Gateway handles STOMP fan-out |
| Email (future) | Implements `NotificationChannel` | Spring Mail / SendGrid |
| SMS (future) | Implements `NotificationChannel` | Twilio |

## Retry Strategy

| Level | Mechanism | Max Attempts | Backoff |
|---|---|---|---|
| Kafka consumer | `@RetryableTopic` (Spring) | 3 | Exponential (1s, 2s, 4s) |
| Channel delivery | DB retry sweeper (`@Scheduled` 30s) | 5 | Exponential (5s, 10s, 20s, 40s, 80s) |
| Manual | `POST /notifications/{id}/retry` | Unlimited | — |

**Dead Letter Queue:** `notification-dlq` — messages land here after 3 consumer retries. Manual replay via admin script.

## Idempotency & Dedup

| Mechanism | Implementation |
|---|---|
| `UNIQUE(source_event_id, user_id, notification_type)` | Prevents duplicate rows on Kafka redelivery |
| Status guard | `UPDATE ... WHERE status != 'DELIVERED'` prevents double-send |
| `read_at IS NULL` check | Safe to apply `markAsRead` multiple times |

## Communication With Every Spandan Microservice

| Service | Protocol | Payload | Notes |
|---|---|---|---|
| **Auth Service** | REST (sync) | Token → identity/role | JWT validation per request; fail closed |
| **Polling Service** | Kafka (consume `QuizStartingEvent`) | `eventId, sessionId, quizId, questionCount, studentIds, startTime` | New event — Polling Service emits it 1 min before `PollStarted` |
| **Gateway** | Kafka (produce `NotificationCreated`) | Full notification payload + routing hint (`targetType`/`targetId`) | Gateway routes to correct STOMP destination |
| **QGS** | Kafka (consume `QuestionsGenerated`, `QuestionGenerationFailed`) | Generation result metadata | Consumes success and failure events |
| **QRS** | Kafka (consume `ReviewCompleted`) | `setId, sessionId, approvedCount, rejectedCount, orphanedCount` | Set completion summary |
| **Analytics Service** | Kafka (consume `TeacherAnalyticsReady`, `StudentAnalyticsReady`, `LeaderboardGenerated`) | Per-user analytics ready signals | Three specific events replace the generic `AnalyticsCompleted` |
| **Transcription Service** | Kafka (consume `TranscriptGenerationFailed`) | Transcript failure reason | Only failure events — `TranscriptStored` has no notification value |
| **Response Service** | None | — | No integration in v1 |
| **Recording Service** | None | — | No integration in v1 |

## Scalability
- **Stateless pods** behind HPA on CPU + Kafka consumer lag
- **No Redis** — dedup uses DB unique constraint (no distributed coordination)
- **Batched insert** for `QuizStartingEvent` (500+ student notifications in one batch)
- **Time-partitioned `notifications` table** by `created_at` (monthly) for efficient archival
- **Push channel** rate-limited via token bucket to avoid FCM 429

## Monitoring
| Metric | Type | Purpose |
|---|---|---|
| `notification.created.total` | Counter | Creation rate by type |
| `notification.delivered.total` | Counter | Delivery success rate |
| `notification.failed.total` | Counter | Failure tracking by channel |
| `notification.retry.count` | Gauge | Pending retries |
| `kafka.consumer.lag` | Gauge | Lag per topic |

## Security
- All REST endpoints require valid JWT validated by Auth Service
- Users can only access their own notifications (ownership check via JWT `userId`)
- No `POST /notifications` — notifications only created via Kafka events from trusted producers
- Kafka producers authenticated via SSL client certificates
- `@PreAuthorize("hasRole('TEACHER') or hasRole('ADMIN')")` for retry endpoint

## Environment Variables (Required)
| Variable | Description |
|---|---|
| `NOTIFICATION_DB_URL` | PostgreSQL JDBC URL |
| `NOTIFICATION_DB_USER` | DB user |
| `NOTIFICATION_DB_PASSWORD` | DB password |
| `KAFKA_BOOTSTRAP_SERVERS` | Kafka broker list |
| `AUTH_SERVICE_URL` | Auth service base URL |
| `JWT_SECRET` | Shared secret for JWT validation |
| `FCM_CREDENTIALS_PATH` | Firebase service account JSON path (push channel) |

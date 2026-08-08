# Spandan Microservices Architecture Summary

## Overview

Spandan evolves from a classroom polling platform to a research-grade educational analytics platform. The Student Interaction Event Framework introduces immutable interaction history, educational intelligence, and a dedicated Reporting layer, all while preserving backward compatibility.

## Service Inventory

| # | Service | Code | DB | Kafka Topics (produced → consumed) | Key Events |
|---|---------|------|----|-----------------------------------|------------|
| 1 | **API Gateway** (GW) | spandan-api-gateway | — | Produces: —. Consumes: — (pure infrastructure — no business logic, no Kafka). Routes HTTP/WSS. | — |
| 2 | **Auth Service** | spandan-auth-service | auth_db | Produces: user-events. Consumes: —. | UserLoggedIn, UserLoggedOut |
| 3 | **Realtime Communication** (RTC) | spandan-realtime-communication-service | Redis (ephemeral connections) | Produces: connection-events, **interaction-events**. Consumes: polling-events, analytics-events, notification-events. | StudentConnected/Disconnected, TeacherConnected/Disconnected, AdminConnected/Disconnected, SocketDeliveryFailed, StudentResponseReceived, **QuestionDisplayedEvent, QuestionAnsweredEvent, QuestionTimedOutEvent** |
| 4 | **User Service** (US) | spandan-user-service *(planned)* | user_db | Produces: user-events. Consumes: —. | UserRegistered, UserProfileUpdated, UserDeactivated |
| 5 | **Lecture Service** (LS) | spandan-lecture-service *(planned)* | lecture_db | Produces: lecture-events. Consumes: —. | LectureCreated, LectureStarted, LectureEnded |
| 6 | **Question Generation** (QGS) | spandan-question-generation-service | question_gen_db | Produces: question-generation-events. Consumes: transcription-events, question-review-events. **Owns educational hierarchy: Lecture→Section→Subsection→Topic→Concept→Learning Objective→Question.** | QuestionsGenerationRequested, QuestionsGenerated, QuestionGenerationFailed, **QuestionGeneratedEvent** |
| 7 | **Question Review** (QRS) | spandan-question-review-service | question_review_db | Produces: question-review-events. Consumes: question-generation-events. | ReviewCompleted, ReviewEscalated, QuestionsReadyForReview |
| 8 | **Polling Service** (PS) | spandan-polling-service | polling_db | Produces: polling-events. Consumes: question-generation-events. **Opens/closes polls per question.** | QuizStartingEvent, **PollOpenedEvent**, **PollClosedEvent**, QuizCompleted, AnswerSubmitted |
| 9 | **Response Service** (RS2) | spandan-response-service | response_db | Produces: — (pure consumer). Consumes: interaction-events, polling-events. **Owns immutable interaction history — single source of truth for all interactions.** | QuestionDisplayedEvent, QuestionAnsweredEvent, QuestionTimedOutEvent, PollOpenedEvent, PollClosedEvent |
| 10 | **Analytics Service** (AS) | spandan-analytics-service | analytics_db | Produces: analytics-events, **analytics-output-events, session-analytics-events**. Consumes: interaction-events, polling-events, transcription-events, lecture-events, grading-events. **Owns educational intelligence — derives analytics from interaction history via AS.** | TeacherAnalyticsReady, StudentAnalyticsReady, LeaderboardGeneratedEvent, EngagementDetected, **AnalyticsGeneratedEvent, SessionAnalyticsCompletedEvent** |
| 11 | **Transcription Service** (TS) | spandan-transcription-service | transcription_db | Produces: transcription-events. Consumes: — (ingests transcript via gRPC from RS). | TranscriptGenerated, TranscriptGenerationFailed, TranscriptDeleted |
| 12 | **Notification Service** (NS) | spandan-notification-service | notification_db | Produces: notification-events. Consumes: question-generation-events, question-review-events, polling-events, analytics-events, transcription-events, lecture-events, user-events, grading-events, **session-analytics-events**. | NotificationCreated |
| 13 | **Recording Service** (RS) | spandan-recording-service | recording_db | Produces: audio-stream-events (typed DTOs). Consumes: —. RS→TS via gRPC. | StreamStarted, StreamStopped, StreamInterrupted, StreamRecovered, StreamingFailed |
| 14 | **Reporting Service** (RepS) | spandan-reporting-service *(new)* | reporting_db | Produces: — (pure API). Consumes: analytics-output-events, session-analytics-events. **Owns presentation — never computes analytics, never reads interaction history directly.** | AnalyticsGeneratedEvent, SessionAnalyticsCompletedEvent |
| 15 | **Grading Service** (GS) | spandan-grading-service *(planned)* | grading_db | Produces: grading-events. Consumes: —. | GradingCompleted, AutoGradingFailed |

## Event Flow Diagram

```
US ──user-events──────────────────→ NS
LS ──lecture-events────────────────→ NS, AS
QGS ──question-generation-events──→ NS, PS, QRS, RS2
QRS ──question-review-events──────→ NS
PS  ──polling-events───────────────→ NS, AS, RTC, RS2
RTC ──connection-events────────────→ AS
RTC ──interaction-events───────────→ RS2  (QuestionDisplayedEvent, QuestionAnsweredEvent, QuestionTimedOutEvent)
RS2 ──(pure consumer, no produce)──→ —
AS  ──analytics-output-events──────→ RepS (AnalyticsGeneratedEvent)
AS  ──session-analytics-events─────→ NS, RepS (SessionAnalyticsCompletedEvent)
TS  ──transcription-events─────────→ NS, AS, PS, QGS
RS  ──audio-stream-events──────────→ (v1: none)
RS  ──gRPC (bi-directional)────────→ TS
NS  ──notification-events──────────→ RTC
GS  ──grading-events───────────────→ NS, AS (planned)
```

## Kafka Topics

| Topic | Producer | Consumers | Events |
|-------|----------|-----------|--------|
| `question-generation-events` | QGS | NS, PS, QRS, RS2 | QuestionsGenerationRequested, QuestionsGenerated, QuestionGenerationFailed, QuestionGeneratedEvent |
| `question-review-events` | QRS | NS | QuestionsReadyForReview, ReviewCompleted, ReviewEscalated |
| `polling-events` | PS | NS, AS, RTC, RS2 | QuizStartingEvent, PollStarted, QuizCompleted, AnswerSubmitted, AnswerSubmitted, PollOpenedEvent, PollClosedEvent |
| **`interaction-events`** | **RTC** | **RS2** | **QuestionDisplayedEvent, QuestionAnsweredEvent, QuestionTimedOutEvent** |
| `analytics-output-events` | AS | RepS | AnalyticsGeneratedEvent |
| `session-analytics-events` | AS | NS, RepS | SessionAnalyticsCompletedEvent |
| `transcription-events` | TS | NS, AS, PS, QGS | TranscriptGenerated, TranscriptGenerationFailed, TranscriptDeleted |
| `audio-stream-events` | RS | (v1: none) | StreamStarted, StreamStopped, StreamInterrupted, StreamRecovered, StreamingFailed |
| `notification-events` | NS | RTC | NotificationCreated |
| `connection-events` | RTC | AS | StudentConnected, StudentDisconnected, TeacherConnected, TeacherDisconnected, AdminConnected, AdminDisconnected, SocketDeliveryFailed, StudentResponseReceived |
| `user-events` | Auth, US(planned) | NS | UserLoggedIn, UserLoggedOut, UserRegistered, UserProfileUpdated, UserDeactivated |
| `lecture-events` | LS | NS, AS | LectureCreated, LectureStarted, LectureEnded |
| `grading-events` | GS | NS, AS | GradingCompleted, AutoGradingFailed |

## CAP Theorem Analysis

| Service | Model | Rationale |
|---------|-------|-----------|
| **API Gateway** | — | Stateless routing — no consistency model needed |
| **Auth Service** | CP | Auth decisions must be consistent; availability can wait for DB |
| **RTC** | **AP** (routing: CP) | WebSocket delivery favors availability; routing table must be CP (no split-brain) |
| **QGS** | CP | Educational hierarchy must be consistent; duplicate generation is expensive |
| **QRS** | CP | Review decisions must not conflict |
| **Polling Service** | **CP** | Poll state is authoritative — must prevent double-open, double-close |
| **Response Service** | **CP** | Exactly-one acceptance per interaction; no duplicates, no gaps |
| **Analytics Service** | **AP** | Idempotent aggregation — can accept duplicates, eventual consistency is safe |
| **Transcription Service** | CP | Ordered segments must be consistent |
| **Notification Service** | **AP** | Best-effort delivery; occasional duplicate is acceptable |
| **Recording Service** | CP | Stream state must be deterministic |
| **Reporting Service** | **AP** | Read-only, eventually consistent views |
| **Grading Service** | CP | Scores must be deterministic |

## Consistency & Idempotency

- **Response Service** uses Kafka consumer `idempotence=true` + DB upsert with unique constraint on `(sessionId, studentId, questionId)` to guarantee exactly-once interaction storage.
- **Analytics Service** treats all incoming events as idempotent — state is recomputed from scratch rather than incrementally updated. If `AnalyticsGeneratedEvent` is produced twice, downstream Reporting Service deduplicates on `generatedAt` timestamp.
- **Reporting Service** caches reports by `(sessionId, analyticsType, generatedAt)` — duplicate events produce same cached result.
- **RTC timeout detection** uses Redis sorted sets with automatic fallback — if Redis is unavailable, timeouts are logged and recovered on reconnection.

## Failure & Retry Strategy

- All Kafka consumers use `max.poll.interval.ms=300000` with `auto.offset.reset=earliest`.
- Dead letter topics (`.DLT` suffix) catch unprocessable events after 3 retries.
- RTC WebSocket disconnections are transient — `StudentConnected` on rejoin corrects any missed state.
- Analytics Service reruns on missing data — if `AnswerSubmitted` arrives without prior `QuestionDisplayedEvent`, the display time is inferred from poll start time.

## Migration Path

1. **Phase 1 — Add Response Service** (standalone, receiving new `interaction-events` topic)
2. **Phase 2 — Extend RTC** to emit `interaction-events` (alongside existing `connection-events`)
3. **Phase 3 — Extend AS** to consume `interaction-events` and produce `analytics-output-events`
4. **Phase 4 — Create Reporting Service** consuming `analytics-output-events`
5. **Phase 5 — Deprecation** old analytics pipeline (optional, backward-compatible)

## Event Count: 56 (12 topics, 15 services)

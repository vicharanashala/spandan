# Event Contracts — Central Registry

This file defines every event flowing between Spandan microservices. Each entry includes the producing service, the topic, the consumer(s), and the payload schema. This is the single source of truth — all service implementations must align to this contract.

## Topic: `question-generation-events`
**Producer**: Question Generation Service (QGS)

| Event | Payload | Consumers |
|-------|---------|-----------|
| `QuestionsGenerationRequested` | `{ lectureId, teacherId }` | QGS (internal trigger) |
| `QuestionsGenerated` | `{ lectureId, teacherId, questionIds[], generatedAt }` | **Notification Service**, Polling Service |
| `QuestionGenerationFailed` | `{ lectureId, teacherId, reason, failedAt }` | **Notification Service** |

## Topic: `question-review-events`
**Producer**: Question Review Service (QRS)

| Event | Payload | Consumers |
|-------|---------|-----------|
| `QuestionsReadyForReview` | `{ lectureId, teacherId, questionIds[], reviewDeadline }` | QRS (internal work queue) |
| `ReviewCompleted` | `{ questionId, reviewerId, decision (APPROVED/REJECTED/CHANGES_REQUESTED), comments[], completedAt }` | **Notification Service** |
| `ReviewEscalated` | `{ questionId, escalatedBy, reason, escalatedAt }` | Notification Service |

## Topic: `polling-events`
**Producer**: Polling Service (PS)

| Event | Payload | Consumers |
|-------|---------|-----------|
| `QuizStartingEvent` | `{ quizId, lectureId, teacherId, scheduledStart, startsInMs }` | **Notification Service** |
| `PollStarted` | `{ quizId, lectureId, teacherId, pollType, startedAt }` | Analytics Service, Notification Service |
| `QuizCompleted` | `{ quizId, lectureId, teacherId, endedAt }` | Analytics Service, Notification Service |
| `AnswerSubmitted` | `{ quizId, questionId, studentId, answer, submittedAt }` | Analytics Service |
| `PollClosed` | `{ quizId, lectureId, teacherId, closedAt }` | Polling Service (internal) |

## Topic: `analytics-events`
**Producer**: Analytics Service (AS)

| Event | Payload | Consumers |
|-------|---------|-----------|
| `TeacherAnalyticsReady` | `{ lectureId, teacherId, analyticsType, readyAt }` | **Notification Service**, Gateway |
| `StudentAnalyticsReady` | `{ lectureId, studentId, analyticsType, readyAt }` | **Notification Service**, Gateway |
| `LeaderboardGenerated` | `{ lectureId, teacherId, leaderboardType, generatedAt }` | **Notification Service**, Gateway |
| `EngagementDetected` | `{ lectureId, studentId, engagementLevel, detectedAt }` | Notification Service |
| `AnalyticsCompleted` | `{ lectureId, teacherId, analyticsType, completedAt }` | Gateway (mapped from old contract — pre-existing naming mismatch) |

## Topic: `transcription-events`
**Producer**: Transcription Service (TS)

| Event | Payload | Consumers |
|-------|---------|-----------|
| `TranscriptGenerated` | `{ transcriptId, sessionId, totalSegments, totalDurationMs, generatedAt }` | Analytics Service, Polling Service |
| `TranscriptGenerationFailed` | `{ sessionId, failureReason, failedAt }` | **Notification Service** |
| `TranscriptDeleted` | `{ transcriptId, sessionId, reason, deletedAt }` | Audit/compliance |

## Topic: `audio-stream-events`
**Producer**: Recording Service (RS) — typed DTOs: `StreamStartedEvent`, `StreamStoppedEvent`, `StreamInterruptedEvent`, `StreamRecoveredEvent`, `StreamFailedEvent`

| Event | Payload | Java DTO | Consumers |
|-------|---------|----------|-----------|
| `StreamStarted` | `{ sessionId, teacherId, lectureId (optional), audioFormat, provider, status, startedAt }` | `StreamStartedEvent` | — |
| `StreamStopped` | `{ sessionId, teacherId, durationMs, chunksSent, chunksDropped, stoppedAt }` | `StreamStoppedEvent` | — |
| `StreamInterrupted` | `{ sessionId, teacherId, reason, interruptedAt }` | `StreamInterruptedEvent` | — |
| `StreamRecovered` | `{ sessionId, teacherId, recoveredAt }` | `StreamRecoveredEvent` | — |
| `StreamingFailed` | `{ sessionId, teacherId, reason, failedAt }` | `StreamFailedEvent` | — |

Note: No services consume RS events in v1. Reserved for Gateway (teacher dashboard live status) and Analytics (engagement correlation) in future releases.

## Topic: `notification-events`
**Producer**: Notification Service (NS)

| Event | Payload | Consumers |
|-------|---------|-----------|
| `NotificationCreated` | `{ notificationId, userId, notificationType, title, body, targetType, targetId, createdAt }` | Gateway (WebSocket STOMP fan-out) |

## Topic: `user-events`
**Producer**: Auth Service, User Service (US — planned)

| Event | Payload | Consumers |
|-------|---------|-----------|
| `UserLoggedIn` | `{ userId, role, timestamp }` | Notification Service |
| `UserLoggedOut` | `{ userId, timestamp }` | Notification Service |
| `UserRegistered` | `{ userId, email, role, registeredAt }` | Notification Service |
| `UserProfileUpdated` | `{ userId, updatedFields[], updatedAt }` | Notification Service |
| `UserDeactivated` | `{ userId, reason, deactivatedAt }` | Notification Service |

## Topic: `lecture-events`
**Producer**: Lecture Service (LS)

| Event | Payload | Consumers |
|-------|---------|-----------|
| `LectureCreated` | `{ lectureId, teacherId, title, scheduledAt }` | Notification Service |
| `LectureStarted` | `{ lectureId, teacherId, startedAt }` | Notification Service, Analytics Service |
| `LectureEnded` | `{ lectureId, teacherId, endedAt }` | Notification Service, Analytics Service |

## Topic: `grading-events`
**Producer**: Grading Service (GS)

| Event | Payload | Consumers |
|-------|---------|-----------|
| `GradingCompleted` | `{ gradingId, studentId, quizId, score, gradedAt }` | Notification Service |
| `AutoGradingFailed` | `{ gradingId, quizId, reason, failedAt }` | Notification Service |

## Topic: `connection-events`
**Producer**: Realtime Communication Service

| Event | Payload | Consumers |
|-------|---------|-----------|
| `StudentConnected` | `{ eventId, userId, quizId, sessionId, timestamp }` | Analytics Service (presence/engagement tracking), Audit |
| `StudentDisconnected` | `{ eventId, userId, quizId, sessionId, timestamp }` | Analytics Service |
| `TeacherConnected` | `{ eventId, userId, quizId, sessionId, timestamp }` | Analytics Service |
| `TeacherDisconnected` | `{ eventId, userId, quizId, sessionId, timestamp }` | Analytics Service |
| `SocketDeliveryFailed` | `{ eventId, userId, quizId, destination, timestamp }` | Audit/logging |
| `StudentResponseReceived` | `{ eventId, userId, quizId, questionId, timestamp }` | Analytics Service |

## Summary Statistics
- Total topics: 10
- Total events: 44
- Total services: 10

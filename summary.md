# Spandan Microservices Summary

| # | Service | Code | DB | Kafka Topics (produced → consumed) | Key Events |
|---|---------|------|----|-----------------------------------|------------|
| 1 | **API Gateway** (GW) | spandan-api-gateway | — | Produces: —. Consumes: — (pure infrastructure — no business logic, no Kafka). Routes external HTTP/WSS to service backends. | — |
| 2 | **Auth Service** | spandan-auth-service | auth_db | Produces: user-events. Consumes: —. | UserLoggedIn, UserLoggedOut |
| 3 | **Realtime Communication Service** (RTC) | spandan-realtime-communication-service | Redis (ephemeral connection metadata) | Produces: connection-events. Consumes: polling-events, analytics-events, notification-events. | StudentConnected, StudentDisconnected, TeacherConnected, TeacherDisconnected, PollStarted, TimerStarted, TimerExpired, PollEnded, TeacherAnalyticsReady, StudentAnalyticsReady, LeaderboardGenerated, NotificationCreated |
| 3 | **User Service** (US) | spandan-user-service *(planned)* | user_db | Produces: user-events. Consumes: —. | UserRegistered, UserProfileUpdated, UserDeactivated |
| 4 | **Lecture Service** (LS) | spandan-lecture-service *(planned)* | lecture_db | Produces: lecture-events. Consumes: —. | LectureCreated, LectureStarted, LectureEnded |
| 5 | **Question Generation Service** (QGS) | spandan-question-generation-service | question_gen_db | Produces: question-generation-events. Consumes: transcription-events, question-review-events. | QuestionsGenerated, QuestionGenerationFailed, QuestionsGenerationRequested |
| 6 | **Question Review Service** (QRS) | spandan-question-review-service | question_review_db | Produces: question-review-events. Consumes: question-generation-events. | ReviewCompleted, ReviewEscalated, QuestionsReadyForReview |
| 7 | **Polling Service** (PS) | spandan-polling-service | polling_db | Produces: polling-events. Consumes: question-generation-events. | QuizStartingEvent, PollStarted, QuizCompleted, AnswerSubmitted, PollClosed |
| 8 | **Analytics Service** (AS) | spandan-analytics-service | analytics_db | Produces: analytics-events. Consumes: polling-events (QuizCompleted only). | TeacherAnalyticsReady, StudentAnalyticsReady, LeaderboardGenerated, EngagementDetected |
| 9 | **Transcription Service** (TS) | spandan-transcription-service | transcription_db | Produces: transcription-events. Consumes: — (ingests transcript segments via gRPC from RS). | TranscriptGenerated, TranscriptGenerationFailed |
| 10 | **Notification Service** (NS) | spandan-notification-service | notification_db | Produces: notification-events. Consumes: question-generation-events, question-review-events, polling-events, analytics-events, transcription-events. | NotificationCreated, QuestionsGenerated, QuestionGenerationFailed, ReviewCompleted, QuizStartingEvent, PollStarted, QuizCompleted, TeacherAnalyticsReady, StudentAnalyticsReady, LeaderboardGenerated, EngagementDetected, TranscriptGenerationFailed |
| 11 | **Recording Service** (RS) | spandan-recording-service | recording_db | Produces: audio-stream-events (typed DTOs). Consumes: —. RS→TS via gRPC (bi-directional transcript segments). | StreamStarted, StreamStopped, StreamInterrupted, StreamRecovered, StreamingFailed |

## Event Flow Diagram

```
US ──user-events──→ NS
LS ──lecture-events──→ NS, AS
QGS ──question-generation-events──→ NS, PS, QRS
QRS ──question-review-events──→ NS
PS  ──polling-events──→ NS, AS, RTC
AS  ──analytics-events──→ NS, RTC
TS  ──transcription-events──→ NS, AS, PS, QGS
RS  ──audio-stream-events──→ (v1: none)
RS  ──gRPC (bi-directional transcript segments)──→ TS
NS  ──notification-events──→ RTC
```

## Topics
- `question-generation-events` (QGS→NS, PS, QRS)
- `question-review-events` (QRS→NS)
- `polling-events` (PS→NS, AS, RTC)
- `analytics-events` (AS→NS, RTC)
- `transcription-events` (TS→NS, AS, PS, QGS)
- `audio-stream-events` (RS→v1:none; typed DTOs: StreamStartedEvent, StreamStoppedEvent, StreamInterruptedEvent, StreamRecoveredEvent, StreamFailedEvent)
- `notification-events` (NS→RTC)
- `connection-events` (RTC→Analytics)
- `user-events` (Auth→NS, US(planned)→NS)
- `lecture-events` (LS→NS, AS)
- `grading-events` (GS→NS)

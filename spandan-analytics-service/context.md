# Spandan Analytics Service — Architecture & Context File

## Project Identity
- **System:** Spandan — a classroom engagement analytics platform
- **Service:** Analytics Service (bounded context: Educational Intelligence)
- **Architecture:** Clean Architecture + Modular Layered Analytics inside a Spring Boot microservice
- **DB-per-service:** yes — owns `analytics_db` exclusively

## Core Responsibility
Educational intelligence engine. Consumes immutable interaction history from Response Service, applies a **modular layered analytics pipeline** (feature engineering → student analytics → classroom analytics → educational intelligence → leaderboard), and produces structured analytics for Reporting Service. Answers: **"What actually happened in this session, and what does it mean educationally?"**

## Platform Pipeline
```
Question Generation Service (owns educational hierarchy)
       ↓
Polling Service (owns poll lifecycle)
       ↓
Gateway/RTC Service (owns live communication, interaction timing)
       ↓
Response Service (owns immutable interaction history — single source of truth)
       ↓
Analytics Service (YOU ARE HERE — owns educational intelligence)
       ↓
Reporting Service (owns presentation — consumes analytics, never computes)
```

Analytics Service consumes immutable interactions. It NEVER generates analytics from live WebSocket messages. It NEVER modifies interaction history. No other service computes educational analytics.

---

## LAYERED INTERNAL ARCHITECTURE

### Layer 1: Feature Engineering (Foundation)
Consumes raw interaction records. Produces reusable engineered features. ALL higher layers consume features, NOT raw interactions.

**Student Features** (per session per student):
- accuracy, totalAnswered, totalCorrect, totalIncorrect, participationRate, timeoutCount, averageResponseTimeMs, responseTimeConsistency

**Educational Features** (per session per student per educational level):
- sectionAccuracy, subsectionAccuracy, topicAccuracy, conceptAccuracy, learningObjectiveAccuracy
- questionsAttempted per level, questionsCorrect per level

**Session Features** (per session):
- questionsAttempted, questionsSkipped, completionRate, totalStudents, totalInteractions

**Historical Features** (cross-session per student):
- previousLectureAccuracy, historicalParticipation, historicalResponseTime, historicalConceptPerformance, accuracyTrend, participationTrend

### Layer 2: Student Analytics
Consumes engineered features. Produces per-student insights.

- Student Performance (accuracy, score, response time)
- Student Progress (improvement/decline across session)
- Weak Concepts (lowest accuracy by concept)
- Strong Concepts (highest accuracy by concept)
- Concept Mastery (per-learning-objective mastery percentages)
- Learning Progression (trend across sequenced questions)
- Participation Analysis (response patterns, timeouts)
- Response Behaviour Analysis (speed vs accuracy trade-off)
- Historical Improvement/Decline (vs previous sessions)
- Session Performance (per-session summary for student)

### Layer 3: Classroom Analytics
Aggregates student features into classroom-level insights.

- Classroom Accuracy (overall and by educational level)
- Classroom Participation Rate
- Section-wise Performance
- Subsection-wise Performance
- Topic Performance
- Concept Performance
- Difficult Concepts (lowest classroom accuracy)
- Easy Concepts (highest classroom accuracy)
- Classroom Learning Trend (accuracy progression across questions)
- Students Requiring Attention (low engagement, low accuracy, high timeout)
- Classroom Engagement Summary (distribution of engagement levels)

### Layer 4: Educational Intelligence (Pluggable)
Designed for future extensibility. Every module:
1. Implements `EducationalIntelligenceModule` interface
2. Consumes engineered features (not raw interactions)
3. Can be added without modifying any other module

**Current modules:**
- **Engagement Estimation**: Estimates engagement from participation rate, response behaviour, timeout frequency, response time consistency, historical participation. Output: HIGH/MEDIUM/LOW per student.

**Future modules (pluggable without redesign):**
- Knowledge Tracing
- Forgetting Detection
- Personalized Recommendations
- Adaptive Learning Analytics
- Intervention Prediction
- Risk Prediction
- Learning Path Analytics
- Curriculum Analytics
- Cohort Analytics
- AI-powered Educational Insights

### Layer 5: Leaderboard
Consumes engineered student features (accuracy, totalScore). Never computes raw statistics independently.

- Session Leaderboard (within single session)
- Lecture Leaderboard (across sessions in same lecture)
- Course Leaderboard (across all sessions in course)

---

## KEY ARCHITECTURE DECISIONS

### AP + Eventual Consistency
No non-reconcilable invariants — aggregation is naturally idempotent and commutative.

| Decision | Implementation |
|---|---|
| Data consumed via Kafka events | `InteractionPersistedEvent` + `SessionInteractionCompletedEvent` from `response-events` topic |
| Data also pullable via REST (backup) | `GET /interactions/session/{sessionId}/analytics/raw` from Response Service |
| Set-based computation | Bulk processing per session — no incremental state machine |
| Idempotent upserts | `UNIQUE` constraints on all tables — recompute from scratch, overwrite |
| Feature-first architecture | All higher layers consume engineered features, never raw interactions |
| Pluggable intelligence | `EducationalIntelligenceModule` interface — new modules added as Spring beans |
| Kafka events fire after DB commit | `@TransactionalEventListener(phase = AFTER_COMMIT)` |
| Analytics output events per session | `AnalyticsGeneratedEvent` for each analytics type; `SessionAnalyticsCompletedEvent` for completion |

### Why AP over CP
- Reprocessing identical input produces identical output
- Aggregation of immutable facts is naturally commutative
- Serving slightly-stale reports during a partition (AP) is better than refusing to serve (CP)
- A missed analytics push is recoverable via REST pull; a corrupted grade is not

### Service Ownership
Analytics Service owns (no other service computes these):
- Feature Engineering
- Student Analytics
- Classroom Analytics
- Session Analytics
- Trend Analysis
- Knowledge Progression
- Engagement Estimation
- Concept Analytics
- Historical Analytics
- Leaderboards

Analytics Service does NOT own:
- Student interaction storage (→ Response Service)
- Question generation (→ QGS)
- Poll lifecycle (→ Polling Service)
- Gateway communication (→ RTC)
- Report generation/presentation (→ Reporting Service)
- WebSocket communication (→ RTC)

---

## Bounded Context: Educational Intelligence
**Inside:** Feature engineering, student analytics, classroom analytics, educational intelligence modules, leaderboard computation, session analytics, historical analytics, difficulty estimation, engagement metrics, learning objective mastery
**Outside:** Raw interaction records (Response Service — consumed via Kafka, pullable via REST), poll timing (Polling Service), educational hierarchy (QGS — referenced by ID), presentation (Reporting Service — consumers `analytics-output-events`)

### Anti-Corruption Boundary
- Never accesses another service's database directly
- Never duplicates raw interaction history (belongs to Response Service)
- Never computes analytics from live WebSocket messages
- No other service reads/writes `analytics_db`
- Reporting Service never accesses `analytics_db` — receives analytics via `analytics-output-events`

---

## Technical Stack
- **Language:** Java 17
- **Framework:** Spring Boot 3.2.x (Spring Web, Security, Data JPA, Kafka, Scheduler)
- **Database:** PostgreSQL 16 (`analytics_db` schema via Flyway)
- **Cache:** Redis 7 (optional read-through cache for popular analytics)
- **Messaging:** Kafka 3.6 (consumer of `polling-events`, `response-events`; producer of `analytics-events`, `analytics-output-events`, `session-analytics-events`)
- **Testing:** JUnit 5, Mockito, Testcontainers (PostgreSQL + Kafka)
- **Build:** Maven 3.9+
- **Deploy:** Docker → Kubernetes (stateless, HPA-scaled)

---

## Processing Flow
```
SessionInteractionCompletedEvent (Kafka from Response Service → response-events)
  OR
QuizCompleted (Kafka from Polling Service → polling-events)  [backward compat]
      ↓
AnalyticsOrchestrator triggers
      ↓
Layer 1: FeatureEngineeringService
  ├── Pull raw interactions from Response Service (REST, or from cached Kafka event)
  ├── Compute StudentFeatures (accuracy, participation, response time, etc.)
  ├── Compute EducationalFeatures (per section/subsection/topic/concept)
  ├── Compute SessionFeatures (completion rate, questions attempted)
  ├── Load/Compute HistoricalFeatures (cross-session aggregates)
  └── Persist all features to feature store
      ↓
Layer 2: StudentAnalyticsService
  ├── Consume StudentFeatures + EducationalFeatures + HistoricalFeatures
  ├── Compute per-student performance, progress, weak/strong concepts, mastery
  ├── Compute learning progression, participation analysis
  └── Persist StudentPerformance + LearningObjectiveMastery
      ↓
Layer 3: ClassroomAnalyticsService
  ├── Aggregate StudentFeatures across all students
  ├── Compute classroom accuracy, participation, section/topic/concept performance
  ├── Identify difficult/easy concepts, students requiring attention
  └── Persist SessionAnalytics + QuestionAnalytics
      ↓
Layer 4: EducationalIntelligenceOrchestrator
  ├── For each EducationalIntelligenceModule:
  │   └── module.analyze(sessionId, studentFeatures, educationalFeatures)
  ├── Current: EngagementEstimationImpl → persist EngagementMetrics
  └── Future: KnowledgeTracing, RiskPrediction, etc. (pluggable)
      ↓
Layer 5: LeaderboardService
  ├── Consume StudentFeatures (accuracy, totalScore)
  ├── Compute session/lecture/course leaderboard
  └── Persist LeaderboardEntry
      ↓
Publish events:
  ├── AnalyticsGeneratedEvent (5 types) → analytics-output-events → Reporting Service
  ├── SessionAnalyticsCompletedEvent → session-analytics-events → NS, RepS
  ├── TeacherAnalyticsReady/StudentAnalyticsReady/LeaderboardGenerated → analytics-events
  └── EngagementDetected → analytics-events → NS
```

---

## API Surface

### Existing Endpoints (backward compatible)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/v1/analytics/quiz/{quizId}/session` | TEACHER | Session-level analytics (legacy) |
| GET | `/api/v1/analytics/quiz/{quizId}/questions` | TEACHER | Question-wise analytics (legacy) |
| GET | `/api/v1/analytics/quiz/{quizId}/students/me` | STUDENT | Own performance (legacy) |
| GET | `/api/v1/analytics/quiz/{quizId}/students` | TEACHER | All student performance (legacy) |
| GET | `/api/v1/analytics/quiz/{quizId}/leaderboard` | ANY | Leaderboard (legacy) |

### Session-based Endpoints
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/v1/analytics/session/{sessionId}/session` | TEACHER | Session-level analytics |
| GET | `/api/v1/analytics/session/{sessionId}/questions` | TEACHER | Question-wise analytics |
| GET | `/api/v1/analytics/session/{sessionId}/students` | TEACHER | All student performance |
| GET | `/api/v1/analytics/session/{sessionId}/students/me` | STUDENT | Own performance |
| GET | `/api/v1/analytics/session/{sessionId}/leaderboard` | ANY | Leaderboard |
| GET | `/api/v1/analytics/session/{sessionId}/learning-objectives` | TEACHER | Per-learning-objective mastery |
| GET | `/api/v1/analytics/session/{sessionId}/engagement` | TEACHER | Engagement metrics |

### Feature Store Endpoints
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/v1/analytics/session/{sessionId}/features/students` | TEACHER | Engineered student features |
| GET | `/api/v1/analytics/session/{sessionId}/features/educational` | TEACHER | Engineered educational features |
| GET | `/api/v1/analytics/session/{sessionId}/features/session` | TEACHER | Engineered session features |

### Classroom Analytics Endpoints
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/v1/analytics/session/{sessionId}/classroom/accuracy` | TEACHER | Classroom accuracy summary |
| GET | `/api/v1/analytics/session/{sessionId}/classroom/concepts` | TEACHER | Concept performance overview |
| GET | `/api/v1/analytics/session/{sessionId}/classroom/learning-trend` | TEACHER | Learning trend across questions |
| GET | `/api/v1/analytics/session/{sessionId}/classroom/attention-required` | TEACHER | Students needing attention |

### Historical Endpoints
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/v1/analytics/student/{studentId}/history` | TEACHER/STUDENT | Historical performance |
| GET | `/api/v1/analytics/student/{studentId}/history/concepts` | TEACHER/STUDENT | Historical concept performance |

---

## Domain Model

### Existing Tables (backward compatible)
```
SessionAnalytics:       id, quiz_id, totalQuestions, totalStudents, overallClassAccuracy,
                        overallParticipationRate, averageResponseTimeSeconds, generatedAt

QuestionAnalytics:      id, quiz_id, question_id, responsesReceived, correctCount, incorrectCount,
                        skippedCount, accuracyPct, averageResponseTimeSeconds, difficultyScore
                        UNIQUE(quiz_id, question_id)

StudentPerformance:     id, quiz_id, student_id, totalAnswered, correctCount, incorrectCount,
                        skippedCount, accuracyPct, totalScore, averageResponseTimeSeconds
                        UNIQUE(quiz_id, student_id)

LeaderboardEntry:       id, quiz_id, student_id, rank, totalScore, accuracyPct
                        UNIQUE(quiz_id, student_id), UNIQUE(quiz_id, rank)

LearningObjectiveMastery: id, session_id, student_id, learning_objective, questionsAttempted,
                           questionsCorrect, masteryPct
                           UNIQUE(session_id, student_id, learning_objective)

EngagementMetrics:      id, session_id, student_id, responseTimeTrend, timeoutRate,
                        participationRate, engagementLevel, totalAnswered, totalDisplayed
                        UNIQUE(session_id, student_id)
```

### Feature Store Tables (NEW)
```
StudentFeatures:        id, session_id, student_id, totalQuestionsDisplayed, totalAnswered,
                        totalCorrect, totalIncorrect, totalTimedOut, participationRate,
                        accuracy, averageResponseTimeMs, responseTimeConsistency, timeoutPercentage,
                        generatedAt
                        UNIQUE(session_id, student_id)

EducationalFeatures:    id, session_id, student_id, educationalLevel (SECTION|SUBSECTION|TOPIC|CONCEPT|LEARNING_OBJECTIVE),
                        educationalId, educationalName, questionsAttempted, questionsCorrect, accuracy,
                        averageResponseTimeMs, generatedAt
                        UNIQUE(session_id, student_id, educational_level, educational_id)

SessionFeatures:        id, session_id, questionsAttempted, questionsSkipped, completionRate,
                        totalStudents, totalInteractions, generatedAt
                        UNIQUE(session_id)
```

### Historical Tables (NEW)
```
HistoricalStudentPerformance: id, student_id, totalSessions, averageAccuracy, averageParticipationRate,
                               accuracyTrend, participationTrend, averageResponseTimeMs,
                               lastSessionAccuracy, lastSessionResponseTimeMs, updatedAt
                               UNIQUE(student_id)

HistoricalConceptPerformance: id, student_id, conceptId, conceptName, totalAttempts, totalCorrect,
                                masteryPct, sessionsCovered, lastAccuracy, updatedAt
                                UNIQUE(student_id, concept_id)
```

### Repository Interfaces
```
StudentFeaturesRepository extends JpaRepository<StudentFeatures, UUID>
  └── findBySessionId(UUID) → List<StudentFeatures>
  └── findBySessionIdAndStudentId(UUID, UUID) → Optional<StudentFeatures>
  └── deleteBySessionId(UUID) → void

EducationalFeaturesRepository extends JpaRepository<EducationalFeatures, UUID>
  └── findBySessionId(UUID) → List<EducationalFeatures>
  └── findBySessionIdAndStudentId(UUID, UUID) → List<EducationalFeatures>
  └── findBySessionIdAndEducationalLevel(UUID, String) → List<EducationalFeatures>
  └── deleteBySessionId(UUID) → void

SessionFeaturesRepository extends JpaRepository<SessionFeatures, UUID>
  └── findBySessionId(UUID) → Optional<SessionFeatures>
  └── deleteBySessionId(UUID) → void

HistoricalStudentPerformanceRepository extends JpaRepository<HistoricalStudentPerformance, UUID>
  └── findByStudentId(UUID) → Optional<HistoricalStudentPerformance>

HistoricalConceptPerformanceRepository extends JpaRepository<HistoricalConceptPerformance, UUID>
  └── findByStudentId(UUID) → List<HistoricalConceptPerformance>
  └── findByStudentIdAndConceptId(UUID, String) → Optional<HistoricalConceptPerformance>
```

---

## Feature Engineering Design

Feature Engineering is Layer 1 — the foundation of all analytics.

**Principle:** Compute once, reuse everywhere. Every higher module reads from the feature store instead of re-querying raw interactions.

**StudentFeatures computation:**
- `accuracy` = totalCorrect / (totalCorrect + totalIncorrect)
- `participationRate` = totalAnswered / totalQuestionsDisplayed
- `averageResponseTimeMs` = mean of responseTimeMs across answered questions
- `responseTimeConsistency` = coefficient of variation (stdDev / mean) of responseTimeMs
- `timeoutPercentage` = totalTimedOut / totalQuestionsDisplayed

**EducationalFeatures computation:**
- Group interactions by educational level (section/subsection/topic/concept/LO)
- Per group: accuracy, averageResponseTimeMs, questionsAttempted

**SessionFeatures computation:**
- `completionRate` = questionsAttempted / totalQuestions
- Aggregate student counts, interaction counts

**HistoricalFeatures computation:**
- `accuracyTrend` = slope of accuracy across previous sessions (IMPROVING/DECLINING/STABLE)
- `participationTrend` = slope of participation across previous sessions

---

## Educational Intelligence Module Design

Every module implements:

```java
public interface EducationalIntelligenceModule {
    String getModuleName();
    IntelligenceResult analyze(UUID sessionId,
                                List<StudentFeatures> studentFeatures,
                                List<EducationalFeatures> educationalFeatures);
}
```

### Engagement Estimation (`EngagementEstimationImpl`)
**Location:** `com.spandan.analytics.application.service.intelligence.impl`
**Current implementation:** Rule-based composite scoring. Spring `@Component` implementing `EducationalIntelligenceModule`.
**Inputs:** participationRate, timeoutRate, responseTimeConsistency, historicalParticipation
**Logic:**
- HIGH engagement: participationRate >= 80% AND timeoutRate < 10% AND responseTimeTrend != DECLINING
- MEDIUM engagement: participationRate >= 50% AND timeoutRate < 25%
- LOW engagement: otherwise
**Output:** Per-student `IntelligenceResult` with `{ studentId, engagementLevel, participationRate, timeoutRate, responseTimeConsistency }`

**Future:** Replace with ML model — just implement the same interface.

### Future Modules (pluggable without redesign)
Each module is a Spring `@Component` implementing `EducationalIntelligenceModule`.
Add new module → create class → Spring auto-wires into `EducationalIntelligenceOrchestrator`.

---

## Kafka Events Consumed

| Event | Topic | Producer | Purpose |
|---|---|---|---|
| `InteractionPersistedEvent` | `response-events` | Response Service | New interaction persisted (trigger for mid-session analytics) |
| `SessionInteractionCompletedEvent` | `response-events` | Response Service | All interactions for session complete (primary trigger) |
| `QuizCompleted` | `polling-events` | Polling Service | Legacy trigger (backward compatible) |

## Kafka Events Produced

### Analytics events (backward compatible)
| Event | Topic | Trigger | Consumers |
|---|---|---|---|
| `TeacherAnalyticsReady` | `analytics-events` | Session analytics committed | Notification Service |
| `StudentAnalyticsReady` | `analytics-events` | Student rows committed | Notification Service |
| `LeaderboardGenerated` | `analytics-events` | Leaderboard computed | Notification Service |
| `EngagementDetected` | `analytics-events` | Engagement check completes | Notification Service |

### Output events (to Reporting Service and NS)
| Event | Topic | Trigger | Consumers |
|---|---|---|---|
| `AnalyticsGeneratedEvent` | `analytics-output-events` | Full session analytics committed | Reporting Service |
| `SessionAnalyticsCompletedEvent` | `session-analytics-events` | All layers complete | Reporting Service, Notification Service |

---

## Coupling (Minimal, Explicit)
| Dependency | Protocol | Why Necessary |
|---|---|---|
| Auth Service | REST (sync) | JWT validation per read request |
| Response Service | Kafka (consume `response-events`) + REST (backup fetch) | Primary data source — never reads RS database |
| Polling Service | Kafka (consume `QuizCompleted`) | Legacy trigger (backward compatible) |
| Reporting Service | Kafka (produce `analytics-output-events`) | Analytics delivery for presentation |
| Notification Service | Kafka (produce `TeacherAnalyticsReady`, `StudentAnalyticsReady`, `LeaderboardGenerated`, `SessionAnalyticsCompletedEvent`) | User alerts |

No coupling to: QGS, RTC, Transcription, Recording, Grading.

---

## CAP Theorem Analysis

| Aspect | Choice | Rationale |
|---|---|---|
| Consistency | **AP** — eventually consistent | Idempotent, commutative aggregation; stale data is acceptable |
| Availability | High — serve cached during partition | Serving 5-min-old analytics is better than refusing |
| Partition Tolerance | Required | Distributed Kafka + DB |

## Consistency Model
- **Eventual consistency** for analytics output: recompute-from-scratch produces identical state
- **Idempotent writes**: all tables have UNIQUE constraints; duplicate processing is safe
- **No incremental state**: always bulk-compute per session

## Event Ordering Guarantees
- **Per-session ordering**: `SessionInteractionCompletedEvent` processed after all `InteractionPersistedEvent`s for that session
- **At-least-once delivery**: Kafka consumers are idempotent; UNIQUE constraints prevent duplicates
- **Parallel sessions**: Independent — session A processing does not block session B

## Failure & Retry Strategy

| Failure | Mechanism | Recovery |
|---|---|---|
| DB write failure | `@Transactional` rolls back | Kafka consumer retries (up to 3 attempts) |
| Response Service unavailable | Fallback to last cached interactions | Retry on next event |
| Kafka consumer failure | `DefaultErrorHandler` with retry + DLQ | Poison messages routed to DLQ |
| Duplicate event | UNIQUE constraint violation → silent skip | No action needed |
| Missing educational metadata | Null-safe feature computation | Features computed with available data only |
| Feature computation error | Logged, partial results persisted | Session marked for recomputation |

## Idempotency Strategy
- **Feature store**: `UNIQUE(session_id, student_id)` per session — recompute overwrites existing
- **Kafka producer**: `enable.idempotence: true`
- **All analytics tables**: UNIQUE constraints on natural keys — duplicate events produce same state
- **Reporting Service dedup**: Compares `generatedAt` timestamp — newer replaces older

## Scalability
- **Stateless service**: All state in PostgreSQL + Kafka — scale horizontally behind load balancer
- **Session isolation**: Each session processed independently — no cross-session locking
- **Read replicas**: GET endpoints can scale with PostgreSQL read replicas
- **Kafka consumer concurrency**: Configurable (default 2) — partition by `sessionId`

## Caching Strategy
- **Feature store is the primary cache**: Engineered features are persisted — no need to recompute from raw interactions for every request
- **Redis (optional)**: Read-through cache for frequently-requested session analytics
- **TTL**: 1 hour for Redis cache; feature store is permanent until session recomputed

## Security
- All REST endpoints require valid JWT validated by Auth Service
- Students can only access their own data (checked via JWT `userId`)
- Teachers can access data for their sessions
- No write endpoints — all data arrives via Kafka

## Versioning Strategy for Analytics Models
- Feature computation version tracked in `generatedAt` timestamp
- New feature versions coexist with old until recomputation triggered
- EducationalIntelligenceModule implementations versioned by `getModuleName()`
- Breaking changes: increment session recomputation, old data stale-but-available

## Migration Strategy
1. **Phase 1 — Add feature store**: Create feature entities, migrations, FeatureEngineeringService (alongside existing code)
2. **Phase 2 — Add layered services**: Create StudentAnalyticsService, ClassroomAnalyticsService, EducationalIntelligence, LeaderboardService (behind orchestrator toggle)
3. **Phase 3 — Switch orchestrator**: Orchestrator uses layered pipeline by default; old path available as fallback
4. **Phase 4 — Add ResponseEventConsumer**: Consume from `response-events` topic alongside existing `QuizCompletedConsumer`
5. **Phase 5 — Enable pluggable intelligence**: Register EngagementEstimationImpl as first EducationalIntelligenceModule
6. **Phase 6 — Deprecation**: Old path (`AnalyticsComputationService`) marked deprecated but preserved

## Environment Variables (Required)
| Variable | Description |
|---|---|
| `ANALYTICS_DB_URL` | PostgreSQL JDBC URL |
| `ANALYTICS_DB_USER` | DB user |
| `ANALYTICS_DB_PASSWORD` | DB password |
| `KAFKA_BOOTSTRAP_SERVERS` | Kafka broker list |
| `AUTH_SERVICE_URL` | Auth service base URL |
| `RESPONSE_SERVICE_URL` | Response service base URL |
| `JWT_SECRET` | Shared secret for JWT validation |
| `REDIS_HOST` | Redis host (optional cache) |
| `REDIS_PORT` | Redis port (optional cache) |

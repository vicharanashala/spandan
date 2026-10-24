# Spandan Reporting Service — Architecture & Context File

## Project Identity
- **System:** Spandan — a classroom engagement analytics platform
- **Service:** Reporting Service (bounded context: Presentation & Reporting)
- **Architecture:** Clean Architecture + 4-Layer Report Pipeline inside a Spring Boot microservice
- **DB-per-service:** yes — owns `reporting_db` exclusively

## Core Responsibility
Presentation layer for all analytics outputs. **Transforms raw pre-computed analytics into structured, hierarchical reports** consumed by teachers, students, administrators, and future dashboard applications. Never computes analytics, never accesses raw interaction history, never duplicates educational intelligence. Answers: **"What happened?"** — never **"Why did it happen?"**

### Guiding Principles
- **Analytics computes. Reporting presents.** — Not a single calculation, aggregation, or educational metric derivation inside this service
- **Every business capability has exactly one owner.** — If Analytics Service already computes it, Reporting Service must not recompute it
- **Feature-agnostic storage** — Reports store analytics JSONB payloads verbatim; interpretation happens in builders
- **Pluggable report types** — New report types added by creating new builders; existing reports unchanged
- **Consume only from Analytics** — Never reads Response Service, Polling Service, QGS, or RTC

### Anti-Corruption Boundary
- Never reads from Analytics Service's database
- Never reads from Response Service's database
- Never computes accuracy, participation rate, response time, engagement, knowledge progression, weak/strong concepts, classroom statistics, or leaderboards
- Never generates questions, manages polls, communicates via WebSocket, or stores interaction history
- Only writes to `reporting_db`

---

## Platform Pipeline
```
Question Generation Service (owns educational hierarchy)
       ↓
Polling Service (owns poll lifecycle)
       ↓
Gateway/RTC Service (owns live communication, interaction timing)
       ↓
Response Service (owns immutable interaction history)
       ↓
Analytics Service (owns educational intelligence — computes everything)
       ↓
Reporting Service (YOU ARE HERE — owns presentation only)
```

---

## 4-Layer Internal Architecture

### Layer 1: Analytics Consumer
**Responsibility:** Consume events from Kafka. No business logic.
**Components:**
- `AnalyticsOutputEventConsumer` — consumes `AnalyticsGeneratedEvent` from `analytics-output-events`
- `SessionAnalyticsEventConsumer` — consumes `SessionAnalyticsCompletedEvent` from `session-analytics-events`
**Rules:**
- Each consumer deserializes and delegates immediately to `ReportService`
- No filtering, no transformation, no analytics logic
- Failure isolation: consumer errors do not affect other consumers

### Layer 2: Report Builder
**Responsibility:** Transform analytics JSON into typed domain report models. No educational calculations.
**Components:**
- `ReportService` — core persistence service (upsert, retrieve, cache)
- `SessionReportBuilder` — builds `SessionReport` from SESSION analytics type
- `StudentReportBuilder` — builds `StudentReport` from STUDENT + LEADERBOARD + LEARNING_OBJECTIVE types
- `TeacherReportBuilder` — builds `TeacherReport` from SESSION + STUDENT + QUESTION types
- `ClassroomReportBuilder` — builds `ClassroomReport` from SESSION + STUDENT types
- `LectureReportBuilder` — builds `LectureReport` from SESSION + QUESTION types
- `SectionReportBuilder` — builds `SectionReport` from educational features data
- `TopicReportBuilder` — builds `TopicReport` from educational features data
- `ConceptReportBuilder` — builds `ConceptReport` from educational features data
- `TrendReportBuilder` — builds `TrendReport` from historical analytics data
- `HistoricalReportBuilder` — builds `HistoricalReport` from historical analytics data
- `CourseReportBuilder` — builds `CourseReport` from course-level aggregated data
- `ReportAssemblyOrchestrator` — coordinates multiple builders for composite reports
**Rules:**
- Each builder parses JSON from `Report.getReportData()` into typed domain models
- Builders never query external services — they only transform already-stored data
- Builders are stateless and independently testable
- Adding a new report type = adding a new builder + registering it in the orchestrator

### Layer 3: Presentation Model Builder
**Responsibility:** Create API-friendly response objects from domain report models. Support multiple client applications.
**Components:**
- Controllers use DTOs constructed from domain models
- JSON serialization via Jackson (default Spring Boot configuration)
- DTOs are flat, client-optimized views of domain models
**Rules:**
- DTO fields are primitives/Strings only — no nested domain model references
- Each endpoint returns exactly the shape its consumers need
- Future dashboard clients get dedicated DTO variants without changing domain models

### Layer 4: Report Repository
**Responsibility:** Store and retrieve generated reports. Manage persistence, caching, and retention.
**Components:**
- `ReportRepository` (JPA) — PostgreSQL persistence with UNIQUE(session_id, analytics_type)
- `ExportJobRepository` (JPA) — export job tracking (preserved for backward compat)
- Redis cache — read-through with 1-hour TTL for hot reports
- `RetentionService` — scheduled daily sweep of reports older than configured retention period
**Rules:**
- Reports stored as JSONB in PostgreSQL — complete pre-computed analytics payloads
- Cache-first read pattern: Redis → DB → 404
- Newer `generatedAt` timestamp replaces cached/DB entry (idempotent upsert)
- No duplicated interaction history or analytics features

---

## Architecture Decisions & Justifications

### 1. Overall Architecture: Clean Architecture + Event-Driven
**Choice:** Clean Architecture layers (domain → application → infrastructure → presentation) with Kafka event sourcing
**Justification:**
- Domain layer contains pure report models with zero framework dependencies
- Application layer contains builders and services — all business logic is here
- Infrastructure layer contains Kafka, JPA, Redis, Security — swappable implementations
- Presentation layer contains controllers and DTOs — isolated from domain changes
- Event-driven: Analytics Service pushes data via Kafka; Reporting Service never polls or sync-calls upstream
- **Result:** Highly testable, swappable infrastructure, clear separation of concerns

### 2. Layered Architecture: 4-Layer Report Pipeline
**Choice:** Consumer → Builder → Presentation → Repository (distinct from Clean Architecture layers — these are pipeline stages)
**Justification:**
- Each layer has exactly one responsibility — no layer mixes concerns
- Layers communicate through well-defined interfaces (domain models, DTOs)
- Builders are independently unit-testable without Kafka or database
- A consumer failure does not cascade to builders or repositories
- **Result:** Each layer independently scalable and testable

### 3. Package Structure
```
com.spandan.reporting
├── ReportingApplication.java
├── application
│   └── service
│       ├── ReportService.java               — Core persistence service
│       ├── ExportService.java                — Export generation (preserved)
│       ├── RetentionService.java             — Scheduled retention sweep
│       └── report
│           ├── ReportAssemblyOrchestrator.java  — Coordinates builders
│           ├── SessionReportBuilder.java
│           ├── StudentReportBuilder.java
│           ├── TeacherReportBuilder.java
│           ├── ClassroomReportBuilder.java
│           ├── LectureReportBuilder.java
│           ├── CourseReportBuilder.java
│           ├── SectionReportBuilder.java
│           ├── TopicReportBuilder.java
│           ├── ConceptReportBuilder.java
│           ├── TrendReportBuilder.java
│           └── HistoricalReportBuilder.java
├── domain
│   ├── entity
│   │   ├── Report.java
│   │   └── ExportJob.java
│   ├── enums
│   │   ├── AnalyticsType.java
│   │   ├── ReportStatus.java
│   │   ├── ExportFormat.java
│   │   └── ExportJobStatus.java
│   └── report                                  — Domain report models (POJOs)
│       ├── SessionReport.java
│       ├── StudentReport.java
│       ├── TeacherReport.java
│       ├── ClassroomReport.java
│       ├── LectureReport.java
│       ├── CourseReport.java
│       ├── SectionReport.java
│       ├── SubsectionReport.java
│       ├── TopicReport.java
│       ├── ConceptReport.java
│       ├── TrendReport.java
│       ├── HistoricalReport.java
│       └── component                           — Reusable report components
│           ├── ParticipationSummary.java
│           ├── PerformanceSummary.java
│           ├── ConceptPerformance.java
│           ├── SectionPerformance.java
│           ├── TopicPerformance.java
│           ├── LearningProgression.java
│           ├── EngagementSummary.java
│           └── LeaderboardPosition.java
├── infrastructure
│   ├── config
│   │   ├── AppConfig.java
│   │   ├── KafkaConfig.java
│   │   ├── RedisConfig.java
│   │   └── SecurityConfig.java
│   ├── kafka
│   │   └── consumers
│   │       ├── AnalyticsOutputEventConsumer.java
│   │       └── SessionAnalyticsEventConsumer.java
│   └── persistence
│       ├── ReportRepository.java
│       └── ExportJobRepository.java
└── presentation
    ├── controller
    │   └── ReportController.java
    └── dto
        ├── ReportResponse.java
        ├── ReportMetadataResponse.java
        ├── ExportStatusResponse.java
        ├── SessionReportListResponse.java
        ├── StudentReportResponse.java
        ├── TeacherReportResponse.java
        ├── ClassroomReportResponse.java
        ├── SessionReportResponse.java
        ├── LectureReportResponse.java
        ├── CourseReportResponse.java
        ├── SectionReportResponse.java
        ├── TopicReportResponse.java
        ├── ConceptReportResponse.java
        ├── TrendReportResponse.java
        └── HistoricalReportResponse.java
```
**Justification:**
- Domain reports are separated from JPA entities — entities persist JSONB blobs, domain models provide typed access
- Report builders are in a dedicated package under application/service — one builder per report type, easy to find and extend
- DTOs are in presentation layer — clients get exactly what they need, domain models stay clean
- **Result:** Adding a new report type = new domain model + new builder + new DTO (if needed) — zero changes to existing files

### 4. Domain Model: Report Entity + Domain Report Models
**Two distinct model types:**

**JPA Entity (`Report`):**
- Persists raw analytics JSONB as received from Analytics Service
- Has UNIQUE(session_id, analytics_type) constraint for idempotent upserts
- Tracks version, status, timestamps, size

**Domain Report Models (POJOs):**
- Typed, structured Java objects with named fields (not raw Maps)
- Hierarchical: SessionReport contains ParticipationSummary, PerformanceSummary, etc.
- Reusable components via composition (PerformanceSummary used by StudentReport and TeacherReport)
- No JPA annotations, no framework dependencies — pure data carriers
**Justification:**
- Separation keeps persistence schema stable even as report models evolve
- Domain models provide compile-time safety and IDE autocompletion vs. raw Map access
- Components eliminate duplication — same PerformanceSummary reused across report types

### 5. Report Model Hierarchy
```
ReportModel (abstract concept)
├── SessionReport — sessionId, lectureId, teacherId, ParticipationSummary, PerformanceSummary, EngagementSummary, topicsCovered, conceptsCovered, sectionsCovered
├── StudentReport — studentId, PerformanceSummary, SectionPerformance[], TopicPerformance[], ConceptPerformance[], weakConcepts, strongConcepts, LearningProgression, EngagementSummary, LeaderboardPosition, HistoricalComparison
├── TeacherReport — sessionId, totalStudents, ClassParticipation, ClassPerformance, SectionPerformance[], TopicPerformance[], ConceptPerformance[], weakConcepts, strongConcepts, LearningTrend, StudentsRequiringAttention[]
├── ClassroomReport — totalStudents, participationRate, averageAccuracy, SectionAnalytics[], TopicAnalytics[], ConceptAnalytics[], mostDifficultConcept/topic, highest/lowestSection
├── LectureReport — lectureId, sessionIds[], sections/subsections/topics/concepts covered, Performance/ Participation/Engagement summaries
├── SectionReport — sectionId, PerformanceSummary, SubsectionReport[]
├── SubsectionReport — subsectionId, PerformanceSummary
├── TopicReport — topicId, PerformanceSummary, ConceptReport[]
├── ConceptReport — conceptId, masteryPct, totalAttempts, totalCorrect, sessionsCovered, trend
├── TrendReport — studentId, accuracyTrend/participationTrend/responseTimeTrend, SessionSnapshot[]
├── HistoricalReport — totalSessions, averageAccuracy, averageParticipation, trends, ConceptHistoryEntry[]
└── CourseReport — courseId, lectureIds[], overallPerformance/Participation
```
**Justification:**
- Each report model contains exactly the fields its consumers need — no `Map<String, Object>` guessing
- Reusable components eliminate duplication across report types
- Hierarchical structure mirrors the educational domain (Course → Lecture → Session → Section → Topic → Concept)
- Adding a new report type = adding one class + one builder — no changes to existing models

### 6. Database Schema
```sql
-- V1: Core report storage (already deployed)
CREATE TABLE reports (
    id UUID PRIMARY KEY,
    session_id UUID NOT NULL,
    teacher_id UUID,
    analytics_type VARCHAR(50) NOT NULL,
    report_data JSONB,
    summary JSONB,
    generated_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    version INT NOT NULL DEFAULT 1,
    size BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(session_id, analytics_type)
);
CREATE INDEX idx_reports_session_id ON reports(session_id);
CREATE INDEX idx_reports_teacher_id ON reports(teacher_id);
CREATE INDEX idx_reports_generated_at ON reports(generated_at);

-- V2: Export jobs (preserved for backward compatibility)
CREATE TABLE export_jobs (
    id UUID PRIMARY KEY,
    report_id UUID NOT NULL REFERENCES reports(id),
    session_id UUID NOT NULL,
    format VARCHAR(10) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    file_path VARCHAR(500),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    error_message TEXT
);
CREATE INDEX idx_export_jobs_session_id ON export_jobs(session_id);
CREATE INDEX idx_export_jobs_status ON export_jobs(status);
```
**Justification:**
- JSONB stores complete analytics payloads verbatim — no schema migration needed when analytics structure changes
- UNIQUE(session_id, analytics_type) enables idempotent upsert — duplicate Kafka events produce same state
- Indexes on session_id, teacher_id, generated_at cover all query patterns
- No interaction history, no features, no educational intelligence duplicated

### 7. DTOs
**Design pattern:** Flat DTOs per endpoint, constructed from domain models.

| DTO | Domain Model Source | Endpoint |
|---|---|---|
| `SessionReportResponse` | `SessionReport` | `GET /session/{sessionId}` |
| `StudentReportResponse` | `StudentReport` | `GET /session/{sessionId}/students/{studentId}` |
| `TeacherReportResponse` | `TeacherReport` | `GET /session/{sessionId}/teacher` |
| `ClassroomReportResponse` | `ClassroomReport` | `GET /session/{sessionId}/classroom` |
| `LectureReportResponse` | `LectureReport` | `GET /lecture/{lectureId}` |
| `CourseReportResponse` | `CourseReport` | `GET /course/{courseId}` |
| `SectionReportResponse` | `SectionReport` | `GET /session/{sessionId}/sections/{sectionId}` |
| `TopicReportResponse` | `TopicReport` | `GET /session/{sessionId}/topics/{topicId}` |
| `ConceptReportResponse` | `ConceptReport` | `GET /session/{sessionId}/concepts/{conceptId}` |
| `TrendReportResponse` | `TrendReport` | `GET /students/{studentId}/trends` |
| `HistoricalReportResponse` | `HistoricalReport` | `GET /students/{studentId}/history` |
| `ReportMetadataResponse` | `Report` entity | `GET /session/{sessionId}/metadata` |

**Justification:**
- DTOs are the API contract — decoupled from domain models so domain changes don't break API clients
- Each DTO maps 1:1 to a specific client need — no over-fetching or under-fetching
- Controllers map domain → DTO at the last moment; builders never know about DTOs

### 8. Event Contracts

#### AnalyticsGeneratedEvent (consumed)
```json
{
  "eventId": "uuid", "sessionId": "uuid",
  "analyticsType": "SESSION|QUESTION|STUDENT|LEADERBOARD|LEARNING_OBJECTIVE",
  "generatedAt": "2026-07-03T10:35:00Z",
  "summary": { "totalQuestions": 10, "totalStudents": 45, "overallAccuracy": 0.72, "averageResponseTimeMs": 28500 },
  "analyticsData": {}
}
```
- **Source:** Analytics Service → `analytics-output-events`
- **Consumer:** `AnalyticsOutputEventConsumer`

#### SessionAnalyticsCompletedEvent (consumed)
```json
{
  "eventId": "uuid", "sessionId": "uuid", "lectureId": "uuid", "completedAt": "2026-07-03T10:35:05Z"
}
```
- **Source:** Analytics Service → `session-analytics-events`
- **Consumer:** `SessionAnalyticsEventConsumer`

#### LeaderboardGeneratedEvent (consumed)
- Same as AnalyticsGeneratedEvent with analyticsType=LEADERBOARD

### 9. Kafka Topics
| Topic | Producer | Consumer | Partitions | Retention |
|---|---|---|---|---|
| `analytics-output-events` | Analytics Service | Reporting Service | 3 (by sessionId) | 7 days |
| `session-analytics-events` | Analytics Service | Reporting Service | 3 (by sessionId) | 7 days |

### 10. REST APIs
| Method | Path | Auth | Purpose |
|---|---|---|---|---|
| GET | `/api/v1/reports/health` | None | Health check |
| GET | `/api/v1/reports/session/{sessionId}` | TEACHER/ADMIN | Full session report |
| GET | `/api/v1/reports/session/{sessionId}/questions` | TEACHER/ADMIN | Question-wise report |
| GET | `/api/v1/reports/session/{sessionId}/students` | TEACHER/ADMIN | All student reports |
| GET | `/api/v1/reports/session/{sessionId}/students/{studentId}` | BOTH/ADMIN | Single student report |
| GET | `/api/v1/reports/session/{sessionId}/leaderboard` | ANY | Leaderboard report |
| GET | `/api/v1/reports/session/{sessionId}/learning-objectives` | TEACHER/ADMIN | LO mastery report |
| GET | `/api/v1/reports/session/{sessionId}/teacher` | TEACHER/ADMIN | Teacher report |
| GET | `/api/v1/reports/session/{sessionId}/classroom` | TEACHER/ADMIN | Classroom report |
| GET | `/api/v1/reports/session/{sessionId}/classroom/sections` | TEACHER/ADMIN | Section performance |
| GET | `/api/v1/reports/session/{sessionId}/classroom/topics` | TEACHER/ADMIN | Topic performance |
| GET | `/api/v1/reports/session/{sessionId}/classroom/concepts` | TEACHER/ADMIN | Concept overview |
| GET | `/api/v1/reports/session/{sessionId}/classroom/attention` | TEACHER/ADMIN | Attention students |
| GET | `/api/v1/reports/session/{sessionId}/sections/{sectionId}` | TEACHER/ADMIN | Section report |
| GET | `/api/v1/reports/session/{sessionId}/topics/{topicId}` | TEACHER/ADMIN | Topic report |
| GET | `/api/v1/reports/session/{sessionId}/concepts/{conceptId}` | TEACHER/ADMIN | Concept report |
| GET | `/api/v1/reports/session/{sessionId}/status` | TEACHER/ADMIN | Report status |
| GET | `/api/v1/reports/session/{sessionId}/metadata` | TEACHER/ADMIN | Report metadata |
| GET | `/api/v1/reports/session/{sessionId}/export` | TEACHER/ADMIN | Export (preserved) |
| GET | `/api/v1/reports/session/{sessionId}/export/status` | TEACHER/ADMIN | Export status |
| GET | `/api/v1/reports/lecture/{lectureId}` | TEACHER/ADMIN | Lecture report |
| GET | `/api/v1/reports/lecture/{lectureId}/sessions` | TEACHER/ADMIN | Lecture sessions |
| GET | `/api/v1/reports/course/{courseId}` | BOTH/ADMIN | Course report |
| GET | `/api/v1/reports/course/{courseId}/lectures` | BOTH/ADMIN | Course lectures |
| GET | `/api/v1/reports/students/{studentId}/history` | BOTH/ADMIN | Historical performance |
| GET | `/api/v1/reports/students/{studentId}/trends` | BOTH/ADMIN | Cross-session trends |
| GET | `/api/v1/reports/students/{studentId}/concepts` | BOTH/ADMIN | Long-term concept mastery |
| GET | `/api/v1/reports/teacher/{teacherId}/recent` | TEACHER/ADMIN | Recent session reports |

### 11-25. Architecture Decisions
*(See full implementation in code for all design considerations including CAP analysis, consistency model, scalability, caching, security, versioning, migration strategy, testing strategy, and production readiness.)*

---

## Processing Flow (Summary)
```
AnalyticsGeneratedEvent (Kafka) → AnalyticsOutputEventConsumer
  → ReportService.upsertReport() → JPA upsert → Redis cache

SessionAnalyticsCompletedEvent (Kafka) → SessionAnalyticsEventConsumer
  → ReportService.markSessionCompleted()

Client GET /session/{sessionId}/teacher
  → Orchestrator.buildTeacherReport(sessionId)
    → Fetch SESSION + STUDENT + QUESTION from ReportService (Redis/DB)
    → TeacherReportBuilder.build(sessionData, studentData, questionData)
      → Parse JSON → typed TeacherReport
    → Return TeacherReport as JSON
```

## Technical Stack
- **Language:** Java 17
- **Framework:** Spring Boot 3.2.x (Spring Web, Security, Data JPA, Data Redis, Kafka)
- **Database:** PostgreSQL 16 (`reporting_db` via Flyway)
- **Cache:** Redis 7 (read-through, 1hr TTL)
- **Messaging:** Kafka 3.6 (consumer of `analytics-output-events`, `session-analytics-events`)
- **Export (preserved):** iText, Apache Commons CSV, Thymeleaf
- **Build:** Maven 3.9+
- **Deploy:** Docker → Kubernetes (stateless, HPA-scaled)

## Kafka Events Consumed
| Event | Topic | Producer | Consumer Class |
|---|---|---|---|
| `AnalyticsGeneratedEvent` | `analytics-output-events` | Analytics Service | `AnalyticsOutputEventConsumer` |
| `SessionAnalyticsCompletedEvent` | `session-analytics-events` | Analytics Service | `SessionAnalyticsEventConsumer` |

No events produced — pure consumer.

## Environment Variables
| Variable | Default | Description |
|---|---|---|
| `REPORTING_DB_URL` | `jdbc:postgresql://localhost:5432/reporting_db` | PostgreSQL JDBC URL |
| `REPORTING_DB_USER` | `postgres` | DB user |
| `REPORTING_DB_PASSWORD` | `postgres` | DB password |
| `KAFKA_BOOTSTRAP_SERVERS` | `localhost:9092` | Kafka broker list |
| `AUTH_SERVICE_URL` | `http://localhost:8081` | Auth service base URL |
| `JWT_SECRET` | (required) | JWT secret |
| `REDIS_HOST` | `localhost` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `REPORTING_RETENTION_DAYS` | `90` | Report retention period |
| `REPORTING_EXPORT_STORAGE_PATH` | `exports` | Export file path |

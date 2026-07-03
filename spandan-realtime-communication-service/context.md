# Spandan Realtime Communication Service — Context File

## Project Identity
- **System:** Spandan — a classroom engagement platform
- **Service:** Realtime Communication Service (bounded context: Realtime Delivery)
- **Architecture:** STOMP-over-WebSocket Spring Boot service
- **DB-per-service:** No PostgreSQL — Redis only for TTL'd connection metadata

## Core Responsibility
Transport layer for all real-time communication. Accept WebSocket connections, consume Kafka events from other services, fan out to connected clients via STOMP channels. No business logic — pure plumbing.

## Key Architecture Decisions

### CP + Strong Consistency (MANDATORY)
Must never misroute or lose events in transit.

| Decision | Implementation |
|---|---|
| Handshake authentication is synchronous REST to Auth Service | Fail closed — unverifiable JWT = 403 before WebSocket upgrade |
| Cross-pod message relay via Redis Pub/Sub | All pods subscribe to Redis channels; event consumed on one pod reaches clients on any pod |
| Kafka consumer ordering per quiz | Partitioned by `quizId` — in-order delivery within a quiz guaranteed |
| At-least-once Kafka consumption | Client-side idempotent rendering via `eventId`/`questionId` dedup |
| Answer forwarding is synchronous REST to Response Service | Immediate ack/reject back to student; bounded retry with backoff |
| Connection metadata is TTL'd in Redis | Automatic expiration — no manual cleanup needed |
| No message replay on reconnect | Client resyncs via Polling Service `GET /current` — Gateway stays stateless |

### No Durable State
Never stores messages for replay, never tracks historical connection state, never owns business data. Connection records are ephemeral with Redis TTL.

## Bounded Context: Realtime Delivery
**Inside:** Connection lifecycle, channel subscription routing, message fan-out, delivery acknowledgment
**Outside:** Question/poll content, answer correctness, scoring, analytics, notification timing, student activity detection (client-side)

## Technical Stack
- Java 17, Spring Boot 3.2.x (WebSocket, STOMP, Security, Kafka, Redis)
- Kafka 3.6 (consume all service events, produce connection lifecycle events)
- Redis 7 (connection metadata TTL, Pub/Sub for cross-pod relay)
- Testing: JUnit 5, Mockito, Testcontainers (Kafka + Redis)

## WebSocket Channels
| Channel | Direction | Purpose |
|---|---|---|
| `/topic/quiz/{quizId}` | Broadcast (server→clients) | Live poll events |
| `/topic/quiz/{quizId}/teacher` | Broadcast (server→teacher) | Per-question teacher stats |
| `/user/{userId}/queue/result` | Unicast (server→student) | Individual answer result |
| `/topic/quiz/{quizId}/leaderboard` | Broadcast (server→all) | Live ranking updates |
| `/user/{userId}/queue/notifications` | Unicast (server→user) | Personal notifications |
| `/topic/quiz/{quizId}/notifications` | Broadcast (server→all) | Quiz-scoped notifications |
| `/app/submit-answer` | Inbound (client→server) | Student answer submission |
| `/app/activity-ack` | Inbound (client→server) | Client-side activity detection ack |

## Kafka Events Consumed
| Event | Producer | STOMP Destination |
|---|---|---|
| `PollStarted` | Polling Service | `/topic/quiz/{quizId}` |
| `TimerStarted` | Polling Service | `/topic/quiz/{quizId}` |
| `TimerExpired` | Polling Service | `/topic/quiz/{quizId}` |
| `PollEnded` | Polling Service | `/topic/quiz/{quizId}` |
| `StudentResultReady` | Response/Analytics | `/user/{userId}/queue/result` |
| `TeacherStatisticsReady` | Analytics | `/topic/quiz/{quizId}/teacher` |
| `NotificationCreated` | Notification | `/user/.../notifications` or `/topic/quiz/{quizId}/notifications` |
| `LeaderboardReady` | Leaderboard | `/topic/quiz/{quizId}/leaderboard` |

## Kafka Events Produced
`StudentConnected`, `StudentDisconnected`, `TeacherConnected`, `TeacherDisconnected`, `SocketDeliveryFailed`, `StudentResponseReceived`

## Cross-Pod Relay Flow
1. Pod consumes Kafka event
2. Routes locally via `SimpMessagingTemplate` to local STOMP sessions
3. Publishes to Redis Pub/Sub channel
4. All pods receive Redis message → deliver to their local sessions

## Environment Variables
`REDIS_HOST`, `REDIS_PORT`, `KAFKA_BOOTSTRAP_SERVERS`, `AUTH_SERVICE_URL`, `RESPONSE_SERVICE_URL`

## Coupling (Minimal)
- **Auth Service** — REST sync (handshake JWT validation — cannot be eventually consistent)
- **Response Service** — REST sync (answer forwarding — command, not event)
- **Polling, Analytics, Notification, Leaderboard** — Kafka async (consume only)
- No coupling to: question content, answer correctness, notification timing, activity detection

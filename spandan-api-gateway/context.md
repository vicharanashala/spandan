# Spandan API Gateway — Context File

## Project Identity
- **System:** Spandan — AI-powered classroom engagement platform
- **Component:** API Gateway (infrastructure, NOT a business microservice)
- **Framework:** Spring Cloud Gateway 4.x (Spring Boot 3.x)
- **Deployment:** Stateless, horizontally scalable, Kubernetes-native

## Purpose

The API Gateway is the **single public entry point** into the Spandan backend. Every client request — from web, mobile, or third-party integrations — passes through this gateway before reaching any business microservice. It enforces security, routing, rate limiting, and observability. It contains **zero business logic**.

### Why This Is Infrastructure, Not a Business Microservice

| Criterion | Business Microservice | API Gateway |
|---|---|---|
| Owns business data | Yes | **Never** |
| Contains business logic | Yes | **Never** |
| Accesses a database | Yes | **No** |
| Produces/consumes business events | Yes | **No** |
| Independently deployable business feature | Yes | No — pure plumbing |
| Can be replaced without affecting domain logic | No | **Yes** |

The gateway is a transparent proxy. If it disappeared, no business state is lost — clients simply cannot reach the backend. This is the defining characteristic of infrastructure.

## Architecture Overview

```
Client (Web/Mobile)
      │
      ▼
┌──────────────────────────────┐
│       API Gateway            │
│  (Spring Cloud Gateway)     │
│                              │
│  • JWT validation            │
│  • Rate limiting             │
│  • Routing                   │
│  • CORS                      │
│  • Request logging           │
│  • Correlation ID propagation│
│  • Circuit breaker           │
└──────┬───────────────────────┘
       │
       ├──► Auth Service              (:8081)  /api/v1/auth/**
       ├──► Polling Service           (:8081)  /api/v1/polling/**
       ├──► Analytics Service         (:8083)  /api/v1/analytics/**
       ├──► Response Service          (:8084)  /api/v1/interactions/**
       ├──► Transcription Service     (:8085)  /api/v1/transcripts/**
       ├──► QGS                       (:8086)  /api/v1/question-generation/**
       ├──► QRS                       (:8086)  /api/v1/reviews/**
       ├──► Notification Service      (:8087)  /api/v1/notifications/**
       ├──► Recording Service         (:8088)  /api/v1/streams/** + /api/v1/recordings/**
       ├──► Realtime Communication Service (:8090)  /ws (WebSocket passthrough)
       ├──► Admin Service             (:8092)  /api/v1/admin/**
       ├──► Users Service             (:8093)  /api/v1/users/**
       └──► Reporting Service         (:8093)  /api/v1/reports/**

> **Note:** Ports are K8s container ports. Some services share the same port (QGS+QRS on 8086, Users+Reporting on 8093) — harmless in K8s (separate pods, separate network namespaces). See [Port Layout](#port-layout) for details.
```

## CAP Theorem: AP (Availability + Partition Tolerance)

The API Gateway chooses **AP** over CP.

### Justification

| Scenario | AP Choice | CP Alternative |
|---|---|---|
| Auth service is unreachable during a partition | Gateway returns 503 with a clear message; the user can retry when the partition heals | Gateway could cache JWT validation results, risking stale auth decisions |
| Rate-limit Redis is down | Gateway falls back to local in-memory rate limiting (per-instance counters, looser bounds) | Gateway refuses all requests until Redis recovers |
| A downstream service is slow | Gateway applies circuit breaker, serves a fast fallback (no cached data — just 503) | Gateway waits indefinitely, accumulating threads |

### Consistency Considerations

- **JWT validation** is the only consistency-sensitive path. The gateway validates the JWT signature locally using the shared HMAC secret — no remote call needed. This is deterministic: same token, same result, every time, regardless of partition state.
- **Rate-limiting counters** can tolerate loose consistency. A momentary double-count during a Redis failover at worst throttles a user one request early — no data corruption.
- **No business state** is stored or cached. There is nothing to synchronize.

The gateway should **fail open for availability, fail closed for auth**. JWT verification is local and deterministic, so there is no tension between these goals.

## Kafka / Message Queues: Not Required

The API Gateway **must not** communicate with Kafka.

### Reasons

1. **Gateway is synchronous request-response only.** Kafka is for asynchronous event-driven communication between business services. The gateway does not produce or consume business events.

2. **Kafka would introduce business coupling.** If the gateway published events, it would need to know about business event schemas — exactly the boundary we are enforcing.

3. **Operational simplicity.** Removing Kafka from the gateway's critical path means one fewer stateful dependency to manage during gateway scaling and recovery.

4. **Existing real-time path is covered.** The Realtime Communication Service already consumes Kafka events and fans them out via WebSocket. The API Gateway does not need to duplicate this.

### What About Gateway-Generated Events?

The gateway emits **HTTP-level metrics** (latency, status codes, rate-limit counters) via Micrometer → Prometheus. These are metrics, not business events. Prometheus scraping is pull-based; the gateway does not push.

## State Synchronization: Not Required

The API Gateway is **fully stateless**.

| Concern | Approach |
|---|---|
| Session state | No sessions. Every request carries a JWT. |
| Rate-limit state | Redis-backed when available (shared across pods); per-instance fallback when Redis is down. No migration needed. |
| Circuit breaker state | Per-instance in-memory (Resilience4j). A breaker tripped on one pod does not propagate to others — acceptable because traffic is evenly distributed. |
| Sticky sessions | **Never.** Sticky sessions prevent graceful horizontal scaling and rolling deployments. |
| Horizontal scaling | Add or remove pods at will. No state to rebalance. |

### Rate-Limiting State: Redis + Local Fallback

```
Normal: Redis-backed counters → accurate per-user/per-IP limits across all pods
Redis down: Local ConcurrentHashMap counters → per-instance limits (looser, but safe)
Redis recovers: New writes go back to Redis; local counters are eventually consistent
```

This design ensures the gateway never depends on Redis availability for core request processing.

## Request Routing

### Routing Architecture

```
Client ──► Gateway ──► Service
              │
              ├── JWT validation (local, deterministic)
              ├── Rate limiting (Redis or local)
              ├── Header injection (X-User-Id, X-Role, X-Correlation-Id)
              ├── Circuit breaker (per-route)
              └── Metrics collection
```

### Service Discovery

**Kubernetes-native** DNS-based discovery. The gateway uses `http://<service-name>.<namespace>.svc.cluster.local` URLs configured per route. No Eureka, no Consul.

- Production: K8s service DNS
- Local dev: `localhost:<port>` via Docker Compose

### Static vs Dynamic Routing

**Static routing** via `application.yml` route definitions. Spandan has a fixed, known set of microservices — no need for dynamic route registration. If a new service is added, the gateway config is updated and the deployment is rolled.

### Route Definitions

| Prefix | Target Service | Port | Auth | Methods |
|---|---|---|---|---|
| `/api/v1/auth/**` | Auth Service | 8081 | Public (login/register); Protected (logout, refresh, me) | POST, GET |
| `/api/v1/polling/**` | Polling Service | 8081 | Protected; ADMIN for lifecycle writes, any for GET /current | POST, GET |
| `/api/v1/interactions/**` | Response Service | 8084 | Protected; STUDENT or TEACHER or ADMIN | POST, GET |
| `/api/v1/analytics/**` | Analytics Service | 8083 | Protected; TEACHER for most, STUDENT for /me, ADMIN for cross-class | GET |
| `/api/v1/question-generation/**` | QGS | 8086 | Protected; TEACHER (generation) | POST, GET, DELETE |
| `/api/v1/reviews/**` | QRS | 8086 | Protected; ADMIN (review lifecycle) | POST, GET |
| `/api/v1/transcripts/**` | TS | 8085 | Protected; TEACHER or ADMIN | GET, DELETE |
| `/api/v1/notifications/**` | NS | 8087 | Protected; any authenticated | GET, PATCH |
| `/api/v1/notification-preferences/**` | NS | 8087 | Protected; any authenticated | GET, PATCH |
| `/api/v1/streams/**` | RS | 8088 | Protected; TEACHER or ADMIN | POST, GET |
| `/api/v1/recordings/**` | RS | 8088 | Protected; TEACHER or ADMIN | GET, DELETE |
| `/api/v1/admin/**` | Admin Service | 8092 | Protected; ADMIN only | POST, GET, PATCH |
| `/api/v1/users/**` | Users Service | 8093 | Protected; ADMIN for write, any authenticated for /me | POST, GET, PATCH |
| `/api/v1/reports/**` | Reporting Service | 8093 | Protected; TEACHER or ADMIN | GET |

### WebSocket Passthrough

`/ws` → Realtime Communication Service (:8090). Spring Cloud Gateway supports WebSocket proxying natively. No special configuration needed beyond the route definition.

### Timeout Handling

| Parameter | Value | Rationale |
|---|---|---|
| Connect timeout | 2s | Services are on the same cluster; slow connect = unhealthy pod |
| Read timeout | 30s | Polling endpoints may block (e.g., long-poll for poll start); 30s covers typical quiz question windows |
| Response timeout | 60s | Analytics export can be slow for large datasets |
| WebSocket idle timeout | 5min | STOMP heartbeat covers short intervals; 5min catch-all |

### Retry Policy

| Condition | Action |
|---|---|
| 5xx (service error) | Retry once after 100ms. Idempotent GETs only — POST/PUT/DELETE are NOT retried automatically |
| Timeout | No retry. Return 504 Gateway Timeout |
| Connection refused | Retry once (pod may have restarted between DNS resolution and connect) |
| Circuit breaker open | No retry. Return 503 immediately |

Rationale: Retries on write operations risk duplication. Downstream services own idempotency (e.g., NS dedup via `UNIQUE(source_event_id, ...)`, Response Service via idempotency key). The gateway stays conservative.

### Circuit Breaker

Per-route circuit breakers via Spring Cloud Circuit Breaker (Resilience4j):

| Parameter | Value |
|---|---|
| Sliding window | Count-based, 10 calls |
| Failure threshold | 50% |
| Minimum calls | 5 (before circuit evaluates) |
| Wait duration (open → half-open) | 15s |
| Half-open calls | 3 |

When a circuit opens, the gateway returns **503 Service Unavailable** immediately — no fallback data (the gateway has no cached responses).

### Fallback Behavior

All routes have a generic fallback that returns:
```json
{
  "error": "service_unavailable",
  "message": "The requested service is temporarily unavailable. Please retry.",
  "status": 503,
  "timestamp": "2026-07-03T11:00:00Z",
  "path": "/api/v1/polls/..."
}
```

No route-specific fallbacks. The gateway does not know which business data to return.

## Request Aggregation: Not Required

### Why

1. **No client-facing composite views.** The frontend (React) calls multiple endpoints independently and composes data client-side. There is no mobile app that needs a single "dashboard" response aggregated from 5 services.

2. **Latency penalty.** Aggregation in the gateway means sequential calls to multiple services before responding. This turns the gateway into a bottleneck and increases p95 latency.

3. **Business coupling.** Aggregation logic is business logic. If a new analytics field needs to appear on the dashboard, the aggregation layer must change — violating the "zero business logic" rule.

4. **Future BFF pattern.** If aggregation becomes necessary, create a Backend-for-Frontend (BFF) service — a thin business service that calls downstream services via the gateway and composes responses. The gateway remains pure infrastructure.

### When Would Aggregation Be Appropriate?

If a mobile client needs a "quiz summary" response combining poll status, analytics, and leaderboard, this would be handled by a new `spandan-bff-service` that calls:
1. `GET /api/v1/polls/{quizId}/current` (via gateway)
2. `GET /api/v1/analytics/quiz/{quizId}/session` (via gateway)
3. `GET /api/v1/analytics/quiz/{quizId}/leaderboard` (via gateway)

The BFF composes them and returns to the client. The gateway never knows about this aggregation.

## Security

### JWT Validation

The gateway validates JWT tokens **locally** — no RPC to Auth Service on every request.

```
Request: Authorization: Bearer <token>
                │
                ▼
Gateway extracts JWT
                │
                ▼
Gateway verifies signature using shared HMAC secret
                │
                ▼
Gateway extracts claims: sub (userId), role (TEACHER/STUDENT/ADMIN)
                │
                ▼
Gateway sets headers:
  X-User-Id: <userId>
  X-Role: <role>
  X-Correlation-Id: <uuid>
                │
                ▼
Forward to downstream service
```

**Why local JWT validation is safe:**
- JWT signature is deterministic — same input, same output, every time
- The HMAC secret is shared via K8s Secret, mounted identically on all gateway pods and the Auth Service
- Token expiration is encoded in the JWT `exp` claim — no remote blacklist needed for expired tokens
- Token revocation (logout) is handled by short token lifetimes (15min access + 7d refresh). The Auth Service owns revocation. If a token must be force-expired, the Auth Service rotates the HMAC secret — old tokens become invalid instantly

### Endpoint Security Classification

| Class | Description | Routes |
|---|---|---|
| **Public** | No auth required | `POST /api/v1/auth/login`, `POST /api/v1/auth/register`, `GET /health`, `/actuator/health` |
| **Authenticated** | Valid JWT required | Default for all `/api/v1/**` routes |
| **Admin-only** | `role=ADMIN` required | Poll lifecycle write, review lifecycle, user management (write), admin endpoints, cross-class analytics |
| **Teacher-only** | `role=TEACHER` required | Question generation, analytics view-all, stream start/stop, transcripts view |
| **Teacher or Admin** | `role=TEACHER` or `ADMIN` | Transcript delete, stream lifecycle, reports view |

The gateway checks `role` claim from JWT and rejects unauthorized requests with **403 Forbidden** before they reach the downstream service.

### Token Expiration Handling

- Gateway checks `exp` claim on every request
- Expired token → **401 Unauthorized** with `WWW-Authenticate` header
- Client should use the refresh endpoint (`POST /api/v1/auth/refresh`) to obtain a new access token
- The refresh endpoint is authenticated (requires valid refresh token in body, not in Authorization header)

### Authentication Failure

```json
{
  "error": "unauthorized",
  "message": "Invalid or expired token",
  "status": 401,
  "timestamp": "2026-07-03T11:00:00Z",
  "path": "/api/v1/polls/..."
}
```

### Authorization Failure

```json
{
  "error": "forbidden",
  "message": "Insufficient permissions for this resource",
  "status": 403,
  "timestamp": "2026-07-03T11:00:00Z",
  "path": "/api/v1/polls/..."
}
```

### Authorization Matrix

Role enforcement operates at two levels:

**Gateway level (prefix)** — enforced by `RoleAuthorizationFilter`. Coarse, path-prefix only.

**Downstream level (endpoint)** — enforced by each microservice. Fine-grained, per-endpoint.

| Route | Gateway Enforced | Downstream Enforced | Notes |
|---|---|---|---|
| `POST /api/v1/auth/login` | Public | — | No auth required |
| `POST /api/v1/auth/register` | Public | — | No auth required |
| `/api/v1/auth/**` (other) | any authenticated | — | |
| `/api/v1/admin/**` | ADMIN | — | |
| `/api/v1/users/**` | ADMIN | — | `/users/me` overridden to any authenticated at gateway |
| `/api/v1/users/me` | any authenticated | — | Override to allow self-profile access |
| `/api/v1/polling/**` | ADMIN | ✓ | Downstream: `GET /current` any-auth; lifecycle writes ADMIN |
| `/api/v1/interactions/**` | any authenticated | — | |
| `/api/v1/analytics/**` | TEACHER, ADMIN | ✓ | Downstream: `GET /students/me` for STUDENT |
| `/api/v1/question-generation/**` | TEACHER | — | |
| `/api/v1/reviews/**` | ADMIN | — | |
| `/api/v1/transcripts/**` | TEACHER, ADMIN | ✓ | Downstream: `DELETE` → ADMIN only |
| `/api/v1/notifications/**` | any authenticated | ✓ | Filtered by userId downstream |
| `/api/v1/streams/**` | TEACHER, ADMIN | — | |
| `/api/v1/recordings/**` | TEACHER, ADMIN | — | |
| `/api/v1/reports/**` | TEACHER, ADMIN | — | |

### CORS

| Setting | Value |
|---|---|
| Allowed origins | Configurable via `${GATEWAY_CORS_ORIGINS:*}` |
| Allowed methods | GET, POST, PATCH, PUT, DELETE, OPTIONS |
| Allowed headers | Authorization, Content-Type, X-Correlation-Id, X-Idempotency-Key |
| Exposed headers | X-Request-Id, X-Rate-Limit-Remaining |
| Allow credentials | true |
| Max age | 3600s |

## Rate Limiting

### Why Rate Limiting Belongs in the Gateway

1. **Single enforcement point.** Every request passes through the gateway. Rate limits applied here cannot be bypassed by calling services directly.

2. **Offload business services.** Without gateway rate limiting, each service would need its own rate limiter — duplicated logic, different configurations, inconsistent user experience.

3. **DDoS mitigation.** The gateway can reject excessive requests before they consume resources on downstream services.

4. **Tenant isolation.** Per-user limits ensure one aggressive client cannot degrade the experience for others.

### Design

| Limit Type | Scope | Rate | Backend |
|---|---|---|---|---|
| Per-user (Student) | `X-User-Id` + role=STUDENT | 100 requests/min | Redis (primary), local (fallback) |
| Per-user (Teacher) | `X-User-Id` + role=TEACHER | 200 requests/min | Redis (primary), local (fallback) |
| Per-user (Admin) | `X-User-Id` + role=ADMIN | 500 requests/min | Redis (primary), local (fallback) |
| Per-IP | Client IP | 1000 requests/min | Redis (primary), local (fallback) |
| Burst | Per-user | 20 requests burst | Token bucket algorithm |

Rate limit exceeded → **429 Too Many Requests**:
```json
{
  "error": "rate_limit_exceeded",
  "message": "Too many requests. Please retry after 30 seconds.",
  "status": 429,
  "retry_after_seconds": 30,
  "timestamp": "2026-07-03T11:00:00Z"
}
```

### Redis Backing

- Token bucket state stored in Redis: `rate_limit:{userId}:{route}` with TTL equal to the window
- Redis is on the critical path for rate limiting only — if Redis is down, fall back to in-memory `ConcurrentHashMap` with per-instance counters
- In-memory fallback is looser (N pods × limit) but prevents a Redis outage from blocking all traffic

## Logging and Observability

### Request Logging

Every request is logged at the gateway with:

| Field | Source | Example |
|---|---|---|
| `correlation_id` | Generated at gateway, propagated downstream | `req-a1b2c3d4-...` |
| `method` | HTTP method | `POST` |
| `path` | Request path | `/api/v1/polls/.../start` |
| `status` | HTTP response status | `200` |
| `duration_ms` | Round-trip time | `45` |
| `user_id` | From JWT `sub` (or `-` for unauthenticated) | `user_abc123` |
| `role` | From JWT `role` (or `-`) | `TEACHER` |
| `target_service` | Routed service name | `polling-service` |
| `client_ip` | Request origin IP | `10.0.0.1` |
| `rate_limited` | Whether request was rate-limited | `false` |
| `error` | Error message (if any) | `-` |

### Correlation ID

- Generated once at the gateway for each incoming request
- Propagated to downstream services via `X-Correlation-Id` header
- Included in all log entries and error responses
- Enables end-to-end tracing across service boundaries

### Sensitive Data Masking

The gateway **never logs**:
- JWT tokens (Authorization header value is replaced with `Bearer ***`)
- Passwords (request body is not logged at the gateway level)
- Refresh tokens (body not logged)

### Metrics (Micrometer + Prometheus)

| Metric | Type | Tags |
|---|---|---|---|
| `gateway.requests.total` | Counter | `method`, `path`, `status`, `target_service`, `role` |
| `gateway.requests.duration` | Timer | `method`, `path`, `target_service`, `role` |
| `gateway.rate.limit.hits` | Counter | `user_id`, `limit_type`, `role` |
| `gateway.circuit.breaker.state` | Gauge | `route`, `state` |
| `gateway.errors.total` | Counter | `type` (auth, rate-limit, timeout, circuit-breaker), `role` |

### Health Endpoints

| Endpoint | Purpose | Visibility |
|---|---|---|
| `/health` | Liveness + readiness | Public (K8s probes) |
| `/actuator/health` | Detailed health | Internal |
| `/actuator/info` | Build info | Internal |
| `/actuator/metrics` | Prometheus scrape | Prometheus |
| `/actuator/prometheus` | Prometheus format | Prometheus |

## REST API Design

### External API Structure

All external API paths follow:
```
/api/v1/{resource}/...
```

### Versioning Strategy

**URL-path versioning** (`/api/v1/`, `/api/v2/`):
- Most visible and explicit for API consumers
- No header negotiation complexity
- Easy to route in the gateway: `/api/v1/**` → v1 services
- When v2 is needed, add new routes pointing to new service deployments

### Error Format

All errors return a consistent JSON envelope:
```json
{
  "error": "error_code",
  "message": "Human-readable description",
  "status": 400,
  "timestamp": "2026-07-03T11:00:00Z",
  "path": "/api/v1/polls/...",
  "correlation_id": "req-a1b2c3d4"
}
```

### HTTP Status Codes Used by Gateway

| Code | Meaning | When |
|---|---|---|
| 200 | Success | Request completed |
| 201 | Created | Resource created (POST) |
| 204 | No Content | DELETE success |
| 400 | Bad Request | Malformed request (rare at gateway level) |
| 401 | Unauthorized | Missing/invalid/expired JWT |
| 403 | Forbidden | Valid JWT but insufficient role |
| 404 | Not Found | Route not matched |
| 429 | Too Many Requests | Rate limit exceeded |
| 502 | Bad Gateway | Downstream service returns invalid response |
| 503 | Service Unavailable | Circuit breaker open or service unreachable |
| 504 | Gateway Timeout | Downstream service did not respond in time |

## Communication with Every Spandan Microservice

### 1. Auth Service (:8081)

| Aspect | Detail |
|---|---|
| Routes | `/api/v1/auth/**` |
| Auth | Public: `POST /login`, `POST /register`. Protected: all others |
| Authorization | Role-checked by Auth Service itself (not gateway) |
| Retry | No retry on POST (login/register are non-idempotent). 5xx GETs retried once |
| Failure handling | Auth down → 503 with "Authentication service unavailable". Token validation (JWT verify) is local and unaffected |

### 2. Polling Service (:8081)

| Aspect | Detail |
|---|---|
| Routes | `/api/v1/polling/**` |
| Auth | Protected |
| Authorization | ADMIN for lifecycle write endpoints (`/start`, `/pause`, `/resume`, `/end`, `/cancel`). Any authenticated role for `GET /current` |
| Retry | GET retried once on 5xx. POST never retried |
| Failure handling | Circuit breaker per route → 503 |

### 3. Realtime Communication Service (:8090)

| Aspect | Detail |
|---|---|
| Routes | `/ws` (WebSocket passthrough) |
| Auth | JWT in WebSocket handshake (validated by Realtime Communication Service's `WebSocketAuthInterceptor` — the API Gateway passes the Authorization header through) |
| Authorization | Handled by Realtime Communication Service |
| Retry | N/A (WebSocket upgrade is a single request) |
| Failure handling | WebSocket connection fails → client retries |

### 4. Response Service (:8084)

| Aspect | Detail |
|---|---|
| Routes | `/api/v1/interactions/**` |
| Auth | Protected |
| Authorization | Any authenticated role (students, teachers, admins submit/view responses) |
| Retry | No retry on POST (idempotency is handled by client-provided idempotency key). GET retried once |
| Failure handling | Response service down → students cannot submit answers → 503. This is a known degradation |

### 5. Analytics Service (:8083)

| Aspect | Detail |
|---|---|
| Routes | `/api/v1/analytics/**` |
| Auth | Protected |
| Authorization | TEACHER for `/quiz/{id}/students` and `/export`. STUDENT for `/students/me`. ADMIN for cross-class analytics. Both for `/session` and `/leaderboard` |
| Retry | Idempotent GETs retried once |
| Failure handling | Circuit breaker → 503. Analytics are post-session; temporary unavailability is acceptable |

### 6. Transcription Service (:8085)

| Aspect | Detail |
|---|---|
| Routes | `/api/v1/transcripts/**` |
| Auth | Protected |
| Authorization | TEACHER or ADMIN |
| Retry | GET retried once |
| Failure handling | 503 if TS is down |

### 7. Question Generation Service (QGS) (:8086)

| Aspect | Detail |
|---|---|
| Routes | `/api/v1/question-generation/**` |
| Auth | Protected |
| Authorization | TEACHER (question generation only — review/approve lifecycle is ADMIN via QRS) |
| Retry | No retry on POST (generation trigger). GET retried once |
| Failure handling | 503 if QGS is down |

### 8. Question Review Service (QRS) (:8086)

| Aspect | Detail |
|---|---|
| Routes | `/api/v1/reviews/**` |
| Auth | Protected |
| Authorization | ADMIN (review/approve/reject question lifecycle) |
| Retry | No retry on POST. GET retried once |
| Failure handling | 503 if QRS is down |

### 9. Notification Service (NS) (:8087)

| Aspect | Detail |
|---|---|
| Routes | `/api/v1/notifications/**`, `/api/v1/notification-preferences/**` |
| Auth | Protected |
| Authorization | Any authenticated role; filtered by userId in NS |
| Retry | GET retried once |
| Failure handling | 503 if NS is down. Notifications are non-critical; temporary unavailability is acceptable |

### 10. Recording Service (RS) (:8088)

| Aspect | Detail |
|---|---|
| Routes | `/api/v1/streams/**`, `/api/v1/recordings/**` |
| Auth | Protected |
| Authorization | TEACHER or ADMIN |
| Retry | No retry on POST (stream start/stop are state-changing commands). GET retried once |
| Failure handling | 503 if RS is down. Audio streaming is a real-time feature; disruption is immediately visible |

### 11. Admin Service (:8092)

| Aspect | Detail |
|---|---|
| Routes | `/api/v1/admin/**` |
| Auth | Protected |
| Authorization | ADMIN only (enforced by gateway `RoleAuthorizationFilter`) |
| Retry | No retry on POST/PATCH (user management commands are non-idempotent). GET retried once |
| Failure handling | 503 if Admin Service is down. Admin operations are not on the critical path for student/teacher flows |

### 12. Users Service (:8093)

| Aspect | Detail |
|---|---|
| Routes | `/api/v1/users/**` |
| Auth | Protected |
| Authorization | ADMIN for write (create/update/delete users). `/api/v1/users/me` is any authenticated (handled by `RoleAuthorizationFilter` override) |
| Retry | GET retried once. No retry on write |
| Failure handling | 503 if Users Service is down. User management is an admin-only flow |

### 13. Reporting Service (:8093)

| Aspect | Detail |
|---|---|
| Routes | `/api/v1/reports/**` |
| Auth | Protected |
| Authorization | TEACHER or ADMIN |
| Retry | GET retried once |
| Failure handling | Circuit breaker → 503. Reports are post-session; temporary unavailability is acceptable |

## Scalability

### Horizontal Scaling

The gateway scales horizontally with no coordination:
- **No session affinity.** Any pod can handle any request.
- **No shared state.** Rate limiting uses Redis for cross-pod accuracy but falls back to local counters.
- **Circuit breaker state is per-instance** — acceptable because load balancer distributes traffic evenly.
- **K8s HPA** scales based on CPU/memory and request latency:

```yaml
# Conceptual HPA config (not generated yet)
minReplicas: 2
maxReplicas: 10
metrics:
  - resource: { name: cpu, target: { type: Utilization, average: 70 } }
  - resource: { name: memory, target: { type: Utilization, average: 80 } }
```

### Handling Thousands of Concurrent Users

- Spring Cloud Gateway is Netty-based (non-blocking IO) — a single pod handles thousands of concurrent connections with minimal threads.
- Each request is a small proxy pass — no business computation, no DB queries.
- Rate limiting is the heaviest operation (Redis round-trip), typically <5ms.
- Bottleneck is downstream service capacity, not the gateway.

### Gateway Clustering

- All pods are identical. No leader election, no gossip protocol.
- Deployed as a Kubernetes `Deployment` with `Service` of type `ClusterIP` (internal) or `LoadBalancer` (external).
- An Ingress controller (NGINX or similar) terminates TLS and forwards to the gateway Service.

## Reliability

### Circuit Breakers

Resilience4j per-route circuit breakers with:
- **Sliding window:** 10 calls
- **Failure threshold:** 50%
- **Minimum calls:** 5
- **Wait:** 15s open → half-open
- **Half-open calls:** 3

When a circuit opens:
- Requests to that route receive **503** immediately (no downstream call)
- After 15s, the circuit allows 3 probe requests
- If ≥2 succeed, circuit closes; if ≥2 fail, circuit re-opens

### Retries

Conservative retry policy:
- **GET requests only** — idempotent by definition
- **Max 1 retry** — prevents request pile-up
- **Backoff: 100ms** — short enough to catch transient failures, long enough to let the downstream recover
- **No retry on POST/PUT/PATCH/DELETE** — idempotency is the service's responsibility

### Timeouts

Per-route timeouts (configured via `spring.cloud.gateway.routes[].metadata.response-timeout`):
- Default: 30s
- Analytics export: 60s
- All others: 10s (fast API endpoints should respond quickly)

### Bulkhead

Not required at the gateway level. Netty's event-loop model naturally isolates connections. If a downstream service hangs, only that request's thread is affected. The gateway does not use a thread-per-request model.

### Gateway Failure Recovery

- **Pod crash:** K8s `Deployment` with `recreate` or `rollingUpdate` strategy. New pod starts in <5s.
- **Full zone failure:** Multi-AZ deployment with pod anti-affinity.
- **Startup:** Gateway has no DB migrations, no cache warming, no dependency on Kafka — starts in <3s.
- **Graceful shutdown:** Spring Cloud Gateway handles in-flight requests before shutting down (preStop hook + `spring.lifecycle.timeout-per-shutdown-phase: 30s`).

## Monitoring

### Health Checks

| Probe | Endpoint | Frequency | Failure Action |
|---|---|---|---|
| Liveness | `/health` | 10s | Restart pod |
| Readiness | `/health` | 5s | Remove from Service endpoints |

### Key Dashboards (Prometheus + Grafana)

1. **Request Overview:** throughput, latency (p50/p95/p99), error rate by route
2. **Rate Limiting:** throttled requests per user, per route; rate-limit Redis health
3. **Circuit Breakers:** state changes, open duration, half-open probe results
4. **Resource Usage:** CPU, memory, Netty connection pool, thread pool
5. **Downstream Health:** error rate per target service, timeout rate, circuit-breaker events

### Alerts

| Alert | Condition | Severity |
|---|---|---|
| High error rate | >5% 5xx across all routes (5m window) | Pager |
| Circuit breaker open | Any circuit open for >5m | Pager |
| High latency | p99 > 5s for any route (1m window) | Warning |
| Rate limit threshold | >10% of requests rate-limited (5m window) | Warning |
| Pod crash loop | Pod restarts >3 in 5m | Pager |
| Redis unavailable | Rate-limit Redis connectivity lost | Warning |

## Testing

### Unit Tests

- `JwtValidationTest` — valid token, expired token, tampered token, missing token, wrong algorithm
- `RateLimiterTest` — within limit, exceeded limit, burst window, Redis fallback to local
- `RouteMatcherTest` — each route maps to correct target service
- `CorrelationIdTest` — header is generated when missing, propagated when present
- `ErrorResponseTest` — error format matches spec for 401, 403, 429, 503, 504

### Integration Tests

- `GatewayRoutingTest` — start Gateway with Testcontainers, send requests to each route, verify correct downstream
- `JwtAuthIntegrationTest` — full flow: Auth Service issues token, Gateway validates, request reaches downstream
- `AdminAuthIntegrationTest` — ADMIN token can access admin routes; TEACHER/STUDENT tokens get 403 on admin routes
- `RoleAuthorizationFilterTest` — verify filter allows TEACHER to QGS, blocks STUDENT from QRS, allows ADMIN to polls lifecycle
- `RateLimitingIntegrationTest` — Redis-backed rate limiter with Testcontainers Redis, verify per-role limits
- `CorsIntegrationTest` — preflight OPTIONS, allowed origins, disallowed origins
- `UsersServiceMeOverrideTest` — verify `/api/v1/users/me` bypasses ADMIN-only check for any authenticated role

### Load Tests (Gatling or k6)

- Sustained load: 1000 req/s for 5 minutes
- Burst test: 50 concurrent users sending requests simultaneously
- Rate limit test: verify 429 responses at correct threshold
- Circuit breaker test: point at a failing downstream, verify 503s after threshold
- Recovery test: downstream recovers, verify circuit closes and requests succeed

### Failure Recovery Tests

- Downstream service down → gateway returns 503
- Redis down → rate limiting falls back to local, requests succeed
- Pod terminates during request → graceful shutdown, in-flight requests complete

## Database: Not Required

The API Gateway **does not have a database**.

| Reason | Explanation |
|---|---|
| No business state | The gateway does not own any domain data |
| No sessions | JWT carries all authentication state |
| No caching | Gateway does not cache responses (caching would introduce business coupling and stale data risks) |
| Rate-limit state | Redis (external) or in-memory — not a gateway-owned database |
| Route config | Stored in `application.yml` / ConfigMap — not in a database |

## Caching: Not Appropriate

The gateway **does not cache responses**.

### Why

1. **Business coupling.** To know which responses are cacheable, the gateway would need to understand cache semantics (e.g., "quiz details are cacheable for 5s, leaderboard for 30s"). This is business knowledge.

2. **Staleness risk.** A cached poll state could show a question as "running" when it has already expired. The gateway cannot know when to invalidate.

3. **Downstream services own caching.** Services that benefit from caching (e.g., analytics reports) should implement it themselves (e.g., Redis read-through cache in the Analytics Service). The gateway should not introduce a second caching layer.

4. **Operational complexity.** Cache invalidation is hard. Adding it to the gateway means every service needs to notify the gateway when data changes — more coupling.

### Exception

If a future requirement demands response caching at the edge, this should be handled by a **reverse proxy layer** (e.g., NGINX, Varnish, or CDN) placed **in front of** the API Gateway — not inside it.

## Summary

| Concern | Decision |
|---|---|
| Architecture | Spring Cloud Gateway, reactive (Netty) |
| CAP | AP (availability + partition tolerance) |
| Kafka | Not used |
| State | Fully stateless |
| Database | None |
| Scaling | Horizontal via K8s HPA |
| JWT validation | Local (HMAC shared secret) |
| Roles | STUDENT, TEACHER, ADMIN (enum in `Role.java`) |
| Role enforcement | `RoleAuthorizationFilter` (global filter, route-based) |
| Rate limiting | Redis (primary) + local (fallback); per-role tiers |
| Circuit breaker | Resilience4j, per-route |
| Retry | Conservative (GETs only, max 1) |
| Caching | Not in gateway |
| Aggregation | Not in gateway (future BFF) |
| Logging | Structured JSON, correlation IDs |
| Metrics | Micrometer → Prometheus; role-tagged |
| WebSocket | Passthrough to Realtime Communication Service |

## Port Layout

All services are resolved via K8s DNS (`http://<service>:<container-port>`). Container ports can collide across pods without conflict in K8s. The table below shows actual container ports per service:

| Service | K8s Port | Dev Port (`application-dev.yml`) | Notes |
|---|---|---|---|
| Auth Service | 8081 | 8081 | |
| Polling Service | 8081 | 8082 | Same K8s port as Auth (different pod, no collision) |
| Analytics Service | 8083 | 8083 | |
| Response Service | 8084 | 8084 | |
| Transcription Service | 8085 | 8085 | |
| QGS | 8086 | 8086 | |
| QRS | 8086 | 8086 | Same K8s port as QGS (different pod, no collision) |
| Notification Service | 8087 | 8088 | Dev port shifted to avoid ambiguity |
| Recording Service | 8088 | 8089 | Dev port shifted |
| Realtime Communication Service | 8090 | 8090 | |
| Admin Service | 8092 | 8092 | |
| Users Service | 8093 | 8093 | |
| Reporting Service | 8093 | 8093 | Same K8s port as Users (different pod, no collision) |

The `application-k8s.yml` profile uses K8s service DNS names (`http://<service>:<container-port>`). The `application-dev.yml` profile resolves local port conflicts by shifting dev ports to avoid `localhost` collisions.

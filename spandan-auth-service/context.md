# Spandan Authentication Service — Context File

## Project Identity
- **System:** Spandan — a classroom engagement platform
- **Service:** Authentication Service (bounded context: Identity & Access)
- **Architecture:** Clean Architecture layered inside a Spring Boot microservice
- **DB-per-service:** yes — owns `auth_db` exclusively

## Core Responsibility
Single source of truth for identity: verify credentials, issue/validate/revoke tokens, enforce account status. Answers only: **"Who is this?"** and **"Are they allowed to act?"**

## Key Architecture Decisions

### CP + Strong Consistency (MANDATORY)
Login, roles, and JWT validation **must** use consistent user data. Never serve stale reads. This means:

| Decision | Implementation |
|---|---|
| DB writes go to PostgreSQL **primary** (synchronous commit) | `spring.datasource.hikari.data-source-properties.tcpKeepAlive=true`, `reWriteBatchedInserts=true` |
| DB reads for auth-critical paths (login, validate, me) **always hit the primary** | Never read replicas for credential verification |
| Redis is **CP-mode** via Redis Cluster with `WAIT` or use a single-node with AOF `always` for lock/blacklist counters | `spring.redis.cluster.*` — minimum 3 masters, `WAIT 1` on write operations |
| Kafka event publishing is **best-effort, outside the transaction** | Never allow a Kafka failure to roll back a login; fire-and-forget with circuit breaker |
| Token blacklist uses Redis `SET` with `NX` + TTL — consistency is ensured by single-threaded Redis processing | `SET jti:{tokenId} "revoked" EX {ttlSeconds} NX` |
| Account lock counter uses Redis `INCR` + atomic expire | Coordinated with DB `failed_login_attempts` — Redis is the real-time gate, DB is the persistent source of truth |
| Flyway migrations lock the schema_version table | Prevents concurrent migration races across pods |
| `@Transactional(ISOLATION_SERIALIZABLE)` on concurrent-sensitive write paths | Login (failed attempt increment), refresh token rotation chain |

### Why CP over AP
- A user who is locked out should **never** be able to log in due to stale data
- A revoked token should **never** be accepted
- A teacher's role promotion should propagate immediately
- The auth service is small, single-purpose, and low-traffic — CP's availability cost is negligible

## Technical Stack
- **Language:** Java 17
- **Framework:** Spring Boot 3.2.x (Spring Web, Security Data JPA)
- **Database:** PostgreSQL 16 (`auth_db` schema via Flyway)
- **Cache/State:** Redis 7 (token blacklist, rate-limit counters, lock counters)
- **Messaging:** Kafka 3.6 (auth event publisher only)
- **Auth:** JWT (HS256, 15min access + 7d rotating opaque refresh)
- **Password:** BCryptPasswordEncoder (strength 12)
- **Testing:** JUnit 5, Mockito, Testcontainers (PostgreSQL + Redis)
- **Build:** Maven 3.9+
- **Deploy:** Docker → Kubernetes (stateless, HPA-scaled)

## API Surface
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/v1/auth/login` | No | Authenticate, get tokens |
| POST | `/api/v1/auth/logout` | Yes | Revoke tokens |
| POST | `/api/v1/auth/validate` | No* | Internal token validation |
| POST | `/api/v1/auth/refresh` | No | Rotate refresh token |
| GET | `/api/v1/auth/me` | Yes | Current user profile |

*Validate uses `X-Internal-Call: true` header + fixed service token for inter-service auth.

## Domain Model
```
User: id, fullName, email, passwordHash, role, accountStatus,
      failedLoginAttempts, lastLoginAt, createdAt, updatedAt

RefreshToken: id, userId, tokenHash, issuedAt, expiresAt, revoked, replacedByTokenId

Role: TEACHER, STUDENT
AccountStatus: ACTIVE, LOCKED, DISABLED
```

## Anti-Corruption Boundary
- No other service reads/writes `auth_db`
- Other services validate via `POST /validate` or trust JWT claims from API Gateway
- Kafka events flow **outward only** from Auth (topics: `auth-events`)

## Token Flow
1. Login → validate BCrypt → issue access (15m JWT) + refresh (7d opaque, stored hashed)
2. Every request → `JwtAuthenticationFilter` extracts JWT → check Redis blacklist → set SecurityContext
3. Refresh → hash incoming refresh → match DB → rotate (new access + new refresh, old revoked)
4. Logout → add JWT `jti` to Redis blacklist → revoke refresh token in DB

## Testing Strategy
- **Unit:** AuthService, JwtService, UserDetailsServiceImpl, DTO validators
- **Integration:** Full lifecycle (login → validate → refresh → logout) against containerized PG + Redis
- **Security:** tampered/expired/blacklisted JWT, brute-force lockout, rate-limit 429, refresh rotation chain

## CP Consistency Points (Code-Level Verification Required)
- [ ] `Login`: read user from DB primary; `SELECT ... FOR UPDATE` on failed-attempt increment
- [ ] `Validate`: check Redis blacklist (single-threaded guarantee); JWT signature verification is deterministic
- [ ] `Refresh`: verify refresh token in DB with `@Lock(PESSIMISTIC_WRITE)` to prevent race conditions on rotation
- [ ] `Logout`: Redis blacklist write with `SET NX EX`; DB revoke in same transaction
- [ ] Account lock: Redis counter + DB `failed_login_attempts` — both must agree; scheduled reconciliation job
- [ ] Flyway: single migration running at a time via `spring.flyway.baseline-on-migrate=true` + DB schema lock

## Environment Variables (Required)
| Variable | Description |
|---|---|
| `AUTH_DB_URL` | PostgreSQL JDBC URL |
| `AUTH_DB_USER` | DB user |
| `AUTH_DB_PASSWORD` | DB password |
| `REDIS_HOST` | Redis host |
| `REDIS_PORT` | Redis port |
| `JWT_SECRET` | HMAC-SHA256 key (Base64, 256+ bits) |
| `KAFKA_BOOTSTRAP_SERVERS` | Kafka broker list |
| `AUTH_INTERNAL_TOKEN` | Shared secret for inter-service /validate calls |

# Spandan Authentication Service — Context File

> **Status:** Revised for **ADMIN** role support.
> This document is an **update** to the existing production-ready Authentication Service.
> The bounded context, clean-architecture layering, CP guarantees, JWT model, security model, and DB-per-service boundary are **preserved unchanged**.
> Only the deltas required to introduce `ADMIN` are documented below.

---

## 1. Project Identity

- **System:** Spandan — a classroom engagement platform
- **Service:** Authentication Service (bounded context: **Identity & Access**)
- **Architecture:** Clean Architecture layered inside a Spring Boot microservice
- **DB-per-service:** yes — owns `auth_db` exclusively

---

## 2. Core Responsibility

Single source of truth for identity: verify credentials, issue/validate/revoke tokens, enforce account status. Answers only:

- **"Who is this?"**
- **"Are they allowed to act?"**

The Authentication Service does **not** own authorization decisions for assessment-related business actions. It only **identifies** the caller's role; downstream services (question-review, polling, etc.) enforce what an `ADMIN` vs. a `TEACHER` vs. a `STUDENT` may do.

---

## 3. Role Hierarchy (Updated)

The platform now supports **exactly three** roles, in order of privilege separation:

| Role     | Owns                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------- |
| ADMIN    | Assessment lifecycle: review/edit/approve/reject AI questions, publish/start/end quizzes, manage question library |
| TEACHER  | Teaching surface: AI question generation, transcripts, classroom analytics, **no quiz lifecycle writes**     |
| STUDENT  | Quiz participation surface only                                                                               |

No additional roles are introduced. The existing `Role` enum is **extended**, not redesigned.

---

## 4. Key Architecture Decisions (Preserved + Updated)

### 4.1 Preserved from original design (unchanged)

| Decision                                                                                  | Implementation                                                                                              |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| DB writes go to PostgreSQL **primary** (synchronous commit)                                | `tcpKeepAlive=true`, `reWriteBatchedInserts=true`                                                           |
| Auth-critical reads (login, validate, me) **always hit primary**                          | Never read replicas for credential verification                                                            |
| Redis is **CP-mode** via Redis Cluster with `WAIT` or single-node AOF `always`            | `SET jti:{tokenId} "revoked" EX {ttlSeconds} NX`                                                            |
| Kafka publishing is **best-effort**, outside the transaction, fire-and-forget              | Never let a Kafka failure roll back a login                                                                 |
| Token blacklist uses Redis `SET NX EX`                                                    | Single-threaded Redis guarantees consistency                                                                |
| Account lock counter: Redis `INCR` + DB `failed_login_attempts`                           | Redis is the real-time gate, DB is the persistent source of truth                                            |
| Flyway migrations lock `schema_version`                                                   | Prevents concurrent migration races across pods                                                             |
| `@Transactional(ISOLATION_SERIALIZABLE)` on concurrent-sensitive write paths              | Login (failed-attempt increment), refresh rotation chain                                                    |

### 4.2 New decisions introduced for ADMIN

| Decision                                                                                                                | Justification                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`ADMIN` is added to the `Role` enum as a third constant; ordering and visibility are unchanged**                      | Roles are not hierarchical in the auth service — they are an **identity attribute**, like a name. Privilege decisions live in downstream services, so the auth service does not encode a hierarchy.                                                                      |
| **DB `users.role` CHECK constraint is extended (additive)** via a new migration, never rewritten                          | Additive migration (`DROP CONSTRAINT … + ADD CONSTRAINT …`) keeps existing rows valid and is reversible. No data backfill required because no existing role value changes.                                                                                              |
| **PUBLIC self-registration is not introduced for ADMIN**                                                               | Admin is a privileged identity. The smallest attack surface is "no public endpoint that creates one." Provisioning is exclusively an administrative action.                                                                                                                |
| **Admin provisioning is centralized and idempotent** — a single, internal-only endpoint guarded by an existing-ADMIN role | Eliminates "out-of-band DB writes" as a daily operation; keeps provisioning auditable; aligns with existing audit log (`auth-events` Kafka topic).                                                                                                                            |
| **JWT claims remain backward compatible**                                                                              | `sub`, `email`, `role`, `jti`, `iss`, `iat`, `exp` are unchanged in name and meaning. ADMIN simply appears as a valid `role` claim value. Downstream services that already branch on `role` continue to work; services that did not know about ADMIN will simply deny until updated. |

---

## 5. Technical Stack (Unchanged)

- **Language:** Java 17
- **Framework:** Spring Boot 3.2.x (Spring Web, Security Data JPA)
- **Database:** PostgreSQL 16 (`auth_db` via Flyway)
- **Cache/State:** Redis 7 (token blacklist, rate-limit counters, lock counters)
- **Messaging:** Kafka 3.6 (auth event publisher only)
- **Auth:** JWT (HS256, 15 min access + 7 day rotating opaque refresh)
- **Password:** BCryptPasswordEncoder (strength 12)
- **Testing:** JUnit 5, Mockito, Testcontainers (PostgreSQL + Redis)
- **Build:** Maven 3.9+
- **Deploy:** Docker → Kubernetes (stateless, HPA-scaled)

---

## 6. Domain Model (Updated)

### 6.1 Updated `Role` enum

```
Role: ADMIN, TEACHER, STUDENT
```

- The enum is **extended** by adding `ADMIN` at the top of the constant list.
- Existing `TEACHER` and `STUDENT` ordinals are **not relied on** anywhere in the codebase (only `.name()` strings are persisted in JWT and DB), so reordering is safe.
- The enum is the **single source of truth** for valid roles at the application layer; the DB CHECK constraint mirrors it.

### 6.2 User entity (mostly unchanged)

```
User: id, fullName, email, passwordHash, role, accountStatus,
      failedLoginAttempts, lastLoginAt, createdAt, updatedAt
```

- Field `role` continues to be a single `Role` value (the auth service does not support multi-role accounts).
- The static factory `User.create(...)` is preserved; it accepts any valid `Role`, including `ADMIN`.
- `validateCanLogin`, `recordFailedLogin`, `recordSuccessfulLogin` are all **role-agnostic** — they remain unchanged.

### 6.3 Account status (unchanged)

```
AccountStatus: ACTIVE, LOCKED, DISABLED
```

### 6.4 RefreshToken (unchanged)

```
RefreshToken: id, userId, tokenHash, issuedAt, expiresAt, revoked, replacedByTokenId
```

---

## 7. JWT (Updated)

### 7.1 Issued Claims (unchanged contract)

| Claim   | Type        | Source                                | Notes                                                          |
| ------- | ----------- | ------------------------------------- | -------------------------------------------------------------- |
| `sub`   | String (UUID) | `User.id`                           | Stable user identifier                                         |
| `email` | String      | `User.email`                          | Identity hint for downstream UI                                |
| `role`  | String      | `User.role.name()` → `ADMIN`/`TEACHER`/`STUDENT` | **The single authorization-relevant claim** |
| `jti`   | String (UUID) | Generated per issuance             | Used by Redis blacklist                                        |
| `iss`   | String      | `"spandan-auth-service"`              | Re-validated by parser                                         |
| `iat`   | epoch sec   | now                                   | Standard                                                       |
| `exp`   | epoch sec   | now + 15 min                          | Standard                                                       |

**Backward compatibility:** claim names, types, signing algorithm, signing key rotation, and parser invariants are **unchanged**. ADMIN JWTs are structurally identical to TEACHER/STUDENT JWTs — only the `role` value differs.

### 7.2 No new claims

We intentionally **do not** add an `roles` array, `scope`, `permissions`, or similar claim. Adding new claims would break downstream services that whitelist claim names. The existing single-string `role` claim is sufficient for current and planned downstream branching.

### 7.3 Validation

`JwtService.validateToken(...)` requires:

1. Signature verification with the existing HS256 key (deterministic).
2. Issuer = `spandan-auth-service`.
3. Expiration in the future.
4. `jti` not in Redis blacklist (CP path: single-threaded Redis).
5. `role` claim value is one of `ADMIN` / `TEACHER` / `STUDENT` — see §10 Role Validation.

---

## 8. Authorization Model (Updated)

### 8.1 Auth service responsibilities

The Authentication Service:

- Issues a JWT containing `role`.
- Sets Spring Security authority as `ROLE_<ROLE_VALUE>` (existing convention preserved).
- **Does not** decide whether an ADMIN can `approve` a question, whether a TEACHER can `publish` a quiz, or whether a STUDENT can do anything in the question-review service.

### 8.2 Downstream branching contract

Downstream services must branch on the JWT `role` claim using the **exact string values** `ADMIN`, `TEACHER`, `STUDENT`. The expected pattern across services:

```
switch (role) {
  case "ADMIN":   // owns assessment lifecycle
  case "TEACHER": // owns teaching surface
  case "STUDENT": // owns participation surface
  default:        // deny (forces fail-closed on unknown roles)
}
```

- The API Gateway may optionally pre-attach role information to upstream requests via trusted headers, but the **ground truth remains the JWT** — gateway-derived role is a hint, not the source of authority.
- A TEACHER that previously could `publish` a quiz **must now be denied** by the downstream service. The auth service does not block it; it simply re-tags the JWT as `TEACHER`. Migrating those deny-rules is **out of scope for the auth service** and is owned by each downstream service.

### 8.3 Spring Security authority (unchanged)

`UserDetailsServiceImpl` and `JwtAuthenticationFilter` continue to map `role` → `ROLE_<ROLE_VALUE>`. For ADMIN this becomes `ROLE_ADMIN`.

---

## 9. Login (Unchanged Behavior, New Role Path)

### 9.1 Flow (preserved)

```
POST /api/v1/auth/login
  → AuthService.login(request)
      → userRepository.findByEmailWithLock(email)
      → user.validateCanLogin()
      → passwordEncoder.matches(...)
      → jwtService.generateAccessToken(userId, email, role.name())
      → generateAndStoreRefreshToken(userId)
      → eventPublisher.publish(AuthEvent("user.login.success", userId, role, now))
      → return AuthResponse
```

This code path is **role-agnostic**. ADMIN users traverse it identically to TEACHER/STUDENT users.

### 9.2 No new authentication mechanism

- No separate `/admin/login` endpoint.
- No additional factor (MFA/TOTP) is introduced by the auth service in this update. If MFA is added later, it must be **per-role configurable**, not a separate endpoint.
- Rate-limiting and brute-force lockout (Redis counter + DB `failed_login_attempts`) apply equally to ADMIN accounts.

### 9.3 Admin lockout behavior

ADMIN accounts **can be** locked due to brute-force attempts. This is intentional: an attacker who guesses an admin password must face the same back-pressure as for any other role. Manual unlock by another ADMIN remains the recovery path.

---

## 10. Role Validation (New Rule)

### 10.1 Invalid roles are rejected at **three** layered points

1. **Domain layer (enum):** `Role` is a Java enum. Any value not present in `{ADMIN, TEACHER, STUDENT}` is a compile-time impossibility at the application boundary.
2. **Persistence layer (DB CHECK constraint):** Mirrors the enum. Any INSERT/UPDATE attempting an unknown role value fails with a SQL constraint violation, surfaced as a domain exception.
3. **JWT validation (runtime):** `JwtService.validateToken` rejects tokens whose `role` claim is **not** one of the three allowed values. This protects against the (currently impossible but defensive) case of a tampered token.

### 10.2 TEACHER/STUDENT behavior is unchanged

All existing behavior — login, refresh, validate, lockout, logout — for `TEACHER` and `STUDENT` users continues without modification. Tests covering these paths must pass unchanged.

---

## 11. Registration (Decision)

**Decision:** Public self-registration for the `ADMIN` role is **disabled**.

### 11.1 Chosen approach

| Mechanism                                              | Status            | Justification                                                                                                                                                                                                                              |
| ------------------------------------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public `POST /api/v1/auth/register` admin variant      | **Disabled**      | Admin is a privileged identity. Any public endpoint that creates one is the largest attack surface for privilege escalation. Self-service role escalation is forbidden by §15.                                                              |
| Internal-only `POST /api/v1/auth/admin/users` (guarded by an existing ADMIN JWT) | **Enabled**       | Makes provisioning auditable (`auth-events` already captures every event), idempotent, and reversible. Operationally aligned with existing rate-limited event publishing.                                                                |
| Seeded during deployment (DB migration inserts initial admin) | **Enabled as a one-time bootstrap** | Required to escape the chicken-and-egg problem: the first ADMIN must exist before the "create admin" endpoint has a caller. A single Flyway migration can insert a bootstrap admin only if `auth_db.users` has no existing ADMIN rows. |
| Manual SQL write by operations team                    | **Discouraged but allowed for emergencies** | Documented runbook step; must trigger a Kafka `auth-events` out-of-band note for audit parity.                                                                                                                                              |

### 11.2 Justification

- **Smallest attack surface** that still solves the chicken-and-egg bootstrap.
- Preserves **DB-per-service invariant**: no other microservice writes to `auth_db`.
- Single source of auditing — the Kafka `auth-events` topic continues to capture every relevant transition (login, logout, refresh). Provisioning events flow via the same topic.
- Fully **backward compatible**: TEACHER/STUDENT registration paths (whatever they are today) are untouched.

---

## 12. Refresh Tokens (Unchanged)

- Refresh tokens remain opaque, randomly generated, hashed in DB.
- The rotation chain (`replaced_by_token_id`, reuse detection, all-chains revoked on reuse) is **role-agnostic** and continues to apply.
- Access tokens issued on refresh continue to carry the user's current `role` from the DB authoritative source.
- No migration of stored hashes is needed because the payload does not encode role.

---

## 13. Password Reset (Unchanged Workflow)

- The "secure password reset workflow" already specified for TEACHER/STUDENT is reused for ADMIN verbatim.
- No architectural reason exists to special-case ADMIN.
- Future-work options (MFA, IP allowlisting, break-glass) are intentionally **not** introduced here to keep this update minimal.

---

## 14. Database (Migration Strategy)

### 14.1 Is a schema change required?

**Yes**, but it is **purely additive**.

### 14.2 Migration plan

A new Flyway migration, e.g. `V3__add_admin_role_to_users_check.sql`, applies the following:

1. Drop the existing `users.role` CHECK constraint.
2. Add a new CHECK constraint with the expanded set: `('ADMIN', 'TEACHER', 'STUDENT')`.
3. The index `idx_users_role` remains valid — it is a b-tree on a low-cardinality column and continues to work.
4. No data backfill is required: existing rows are valid under the expanded constraint.

### 14.3 Backward compatibility

- The constraint replacement is performed **in a single transaction** within Flyway.
- PostgreSQL takes a brief `ACCESS EXCLUSIVE` lock on `users` during the swap. In practice this is sub-second on a low-volume `auth_db`. Service replicas should be drained momentarily per standard rolling-deploy discipline.
- The application is **forward-compatible**: the new JAR accepts old data (constraint is a superset) and old JARs cannot exist on the cluster during the migration window because schema_version is locked by Flyway.

### 14.4 Default values

- `users.role` has no application-level default — it is supplied by registration/provisioning. This is unchanged.
- `account_status` default remains `ACTIVE`.

### 14.5 Constraints

- The CHECK constraint is the **only** schema-level role constraint.
- A unique constraint is **not** added across `(email, role)` because the same person must not be forced to register twice; identity is email-unique already.

### 14.6 Idempotency

Flyway's `out-of-order: false` plus the `schema_version` lock (per the existing CP guarantee) prevents concurrent or duplicate migrations. The new migration is idempotent in the sense that re-running it would fail predictably (`constraint already exists`), so production deployments roll forward only.

---

## 15. REST APIs (Updated Surface)

### 15.1 Existing public routes (unchanged)

| Method | Path                       | Auth | Purpose           | Change?                  |
| ------ | -------------------------- | ---- | ----------------- | ------------------------ |
| POST   | `/api/v1/auth/login`       | No   | Authenticate      | **Unchanged**            |
| POST   | `/api/v1/auth/logout`      | Yes  | Revoke tokens     | **Unchanged**            |
| POST   | `/api/v1/auth/validate`    | Internal | Token validation | **Unchanged**        |
| POST   | `/api/v1/auth/refresh`     | No   | Rotate refresh    | **Unchanged**            |
| GET    | `/api/v1/auth/me`          | Yes  | Current profile   | **Unchanged**            |

### 15.2 New routes (introduced)

| Method | Path                                  | Auth          | Purpose                                                                                              |
| ------ | ------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------- |
| POST   | `/api/v1/auth/admin/users`            | **ADMIN only** | Provision a new ADMIN account (or any account, role-scoped)                                          |
| GET    | `/api/v1/auth/admin/users`            | **ADMIN only** | List accounts (paginated)                                                                            |
| PATCH  | `/api/v1/auth/admin/users/{id}/role`  | **ADMIN only** | Change a user's role (with audit event)                                                              |
| PATCH  | `/api/v1/auth/admin/users/{id}/status`| **ADMIN only** | Unlock / disable an account (with audit event)                                                       |

These routes are guarded by Spring Security `@PreAuthorize("hasRole('ADMIN')")` and are mounted under the same controller pack.

### 15.3 Backward compatibility of API contracts

- `AuthResponse`, `UserProfileResponse`, `LoginRequest`, `RefreshTokenRequest`, `LogoutRequest`, `TokenValidationResponse` — **field set is unchanged**. Only the legal enum values for `role` expand.
- DTO field types remain primitives, records, or `String`; no serialization break for existing clients.

### 15.4 OpenAPI / docs

The OpenAPI document is regenerated. Spec consumers see:

- The `role` enum expanded to include `ADMIN`.
- The four new admin endpoints appearing with the `ADMIN` security scheme.

---

## 16. Security (Updated)

### 16.1 Authentication of ADMIN

- Identical to TEACHER/STUDENT: BCrypt-verified password + JWT.
- No second factor, no IP allowlist, no certificate — these are deliberate non-goals for this update.
- Brute-force protection applies equally (Redis counter, DB `failed_login_attempts`, lockout after 5).

### 16.2 Authorization of ADMIN

- Server-side, via JWT `role` claim.
- The auth service trusts only the JWT it issues; tokens are validated against the same signing key and the `iss` claim.
- `@PreAuthorize("hasRole('ADMIN')")` on new endpoints is the **defense-in-depth** layer; primary authorization is performed by downstream services branching on `role`.

### 16.3 Privilege separation

- ADMIN is an **identity role**, not a capability grant. Capabilities are owned by downstream services:
  - Question-review / polling / quiz-publishing services authorize write actions on the assessment lifecycle against `ADMIN`.
  - Question-generation / transcription / analytics services authorize their actions against `TEACHER`.
  - Quiz-taking / response services authorize against `STUDENT`.
- This separation ensures removing an admin (or rotating credentials) does not require coordinated changes in many services — each service independently checks the role claim.

### 16.4 Prevention of role escalation

The following properties hold by design:

| Threat                                                | Defense                                                                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| A TEACHER self-elevates to ADMIN                      | No public endpoint accepts a role change for the caller. The only role-mutating endpoint requires an existing-ADMIN JWT. |
| A downstream service trusts a forged `role` claim     | Services verify signature locally (HS256, same key) or call `POST /api/v1/auth/validate`; tokens are signed by auth only. |
| Replay of revoked tokens                              | Redis blacklist (`jti` key with `SET NX EX`) checked on every JWT validation.                                            |
| Refresh token reuse                                   | `@Lock(PESSIMISTIC_WRITE)` rotation chain detection; reuse revokes the entire chain for that user.                       |
| Brute-force on ADMIN password                         | Same Redis counter / DB lockout mechanism as every other role.                                                            |
| SQL injection via role                                | Parameterized queries + CHECK constraint + Java enum. Three layers.                                                       |

### 16.5 JWT verification (preserved)

- Signature verification with HS256 + the same base64 `JWT_SECRET`.
- Issuer check: `iss = "spandan-auth-service"`.
- Expiration check on `exp`.
- `jti` blacklist check in Redis (CP path).
- Optional `role` claim value guard (rejects unknown values).

---

## 17. Service Communication (Updated)

### 17.1 What downstream services must do

Downstream services must:

1. Accept the JWT in `Authorization: Bearer ...` (unchanged).
2. Verify the JWT using the shared `JWT_SECRET` (same key as auth service) **or** call `POST /api/v1/auth/validate` (inter-service call, `X-Internal-Call` + shared `AUTH_INTERNAL_TOKEN`).
3. Branch authorization on the `role` claim using exact string values `ADMIN` / `TEACHER` / `STUDENT`.
4. Default-deny on unrecognized role values (fail-closed).

### 17.2 What downstream services do **not** need

- No schema change, no DB migration.
- No new dependency on the auth service beyond the existing `/validate` endpoint or the existing JWT-secret contract.
- No re-implementation of credential storage or token issuance.

### 17.3 Kafka contract

The `auth-events` topic payload (`AuthEvent` record) gains new `eventType` values for admin lifecycle actions:

```
user.login.success
user.logout
user.refresh
admin.user.created
admin.user.role_changed
admin.user.status_changed
```

`role` field in the event remains a `String` (the role name). Existing consumers that ignore unknown event types continue to work; the new event types are **additive**.

---

## 18. Testing (Additions Required)

All existing tests for TEACHER and STUDENT must continue to pass **without modification**.

### 18.1 New unit tests

| Test                                                           | Purpose                                                                                       |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `RoleValidatorTest` (or equivalent)                            | Every persisted role value is mirrored at the enum layer; unknown values rejected.            |
| `JwtServiceTest#generatesAdminRoleClaim`                       | ADMIN JWT contains `role=ADMIN` and is otherwise identical to a TEACHER JWT except `sub`.    |
| `JwtServiceTest#rejectsUnknownRoleClaim`                       | Tokens claiming `role=GHOST` are rejected by the validator.                                   |
| `UserDetailsServiceImplTest#authorityForAdmin`                 | ADMIN users receive `ROLE_ADMIN` granted authority.                                           |
| `JwtAuthenticationFilterTest#setsAdminAuthority`               | Bearer extraction -> SecurityContext authority is `ROLE_ADMIN`.                              |

### 18.2 New integration tests (Testcontainers)

| Test                                                                       | Purpose                                                                                |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `AuthIT#adminLoginIssuesAdminJwt`                                          | Full happy-path login for an ADMIN seed user against containerized PG + Redis.         |
| `AuthIT#adminRefreshPreservesAdminRole`                                    | Refresh rotation chain continues to issue ADMIN JWTs.                                  |
| `AuthIT#adminLockoutAfterFiveFailures`                                     | Brute-force back-pressure is uniform across roles.                                     |
| `AuthIT#adminProvisioningByExistingAdmin`                                  | `POST /api/v1/auth/admin/users` succeeds with an ADMIN JWT and creates an ADMIN row.   |
| `AuthIT#nonAdminCannotCallAdminEndpoint`                                   | A TEACHER JWT calling an ADMIN-only endpoint receives 403.                             |
| `AuthIT#unknownRoleInDbIsRejected`                                         | Direct DB INSERT bypassing the app with `role='GHOST'` fails the CHECK constraint.     |

### 18.3 Backward compatibility tests (mandatory)

| Test                                              | Purpose                                                                       |
| ------------------------------------------------- | ----------------------------------------------------------------------------- |
| `AuthIT#teacherLoginStillIssuesTeacherJwt`        | Existing teacher test suite unmodified, passes against new build.            |
| `AuthIT#studentLoginStillIssuesStudentJwt`        | Existing student test suite unmodified, passes against new build.            |
| `AuthIT#legacyRefreshTokenIssuedBeforeUpdateStillValidates` | A JWT issued pre-update with `role=TEACHER` continues to validate after deploy (until natural expiry). |

### 18.4 Security tests

| Test                                                                  | Purpose                                                       |
| --------------------------------------------------------------------- | ------------------------------------------------------------- |
| `SecurityIT#tamperedRoleClaimIsRejected`                              | Flipping the `role` claim invalidates the signature.          |
| `SecurityIT#blacklistedAdminTokenIsRejected`                          | Redis blacklist applies uniformly across roles.               |
| `SecurityIT#nonAdminCannotPromoteSelf`                                | A TEACHER cannot call `PATCH /admin/users/{id}/role` for self.|

---

## 19. Deployment (Updated)

### 19.1 Database migrations

- Apply the new Flyway migration `V3__add_admin_role_to_users_check.sql` as part of the standard deploy step. No manual SQL is required.
- A one-time bootstrap admin user is inserted by the same migration, guarded by an "only-if-empty" condition on `auth_db.users WHERE role='ADMIN'`.

### 19.2 Environment variables

**No new environment variables are required** to support ADMIN.

The existing set remains sufficient:

| Variable                | Status   |
| ----------------------- | -------- |
| `AUTH_DB_URL`           | unchanged|
| `AUTH_DB_USER`          | unchanged|
| `AUTH_DB_PASSWORD`      | unchanged|
| `REDIS_HOST`            | unchanged|
| `REDIS_PORT`            | unchanged|
| `JWT_SECRET`            | unchanged|
| `KAFKA_BOOTSTRAP_SERVERS` | unchanged|
| `AUTH_INTERNAL_TOKEN`   | unchanged|

### 19.3 Configuration files

- `application.yml` is **unchanged**. No new keys added.
- Optional: a new config key `auth.bootstrap.admin.email` and `auth.bootstrap.admin.password` is introduced, sourced from a Kubernetes Secret. **Required only if** the bootstrap migration is conditional rather than hard-coded. Otherwise omitted.

### 19.4 Rolling deployment order

For minimal downtime and full CP guarantees:

1. Apply DB migration.
2. Roll new auth-service pods.
3. Roll API Gateway pods to recognize the new role in its routing.
4. Roll downstream services in dependency order (question-review, polling, etc.) once their role-aware code is deployed.

### 19.5 Rollback

- The new migration is **additive** and can be reverted by a follow-up migration that drops the `ADMIN` value from the CHECK constraint. The reverse migration MUST fail-safe: i.e., it must check that no rows with `role='ADMIN'` exist before removing the value from the constraint.

---

## 20. Summary of Changes vs. Preservation

### 20.1 Components requiring modification

| Component                          | Change                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `Role` enum                        | Add `ADMIN` constant.                                                                                   |
| Flyway migration                   | New `V3__add_admin_role_to_users_check.sql` (constraint swap + optional bootstrap row).                  |
| `AuthController`                   | Mount the four new admin endpoints under admin-only `@PreAuthorize`.                                   |
| `ApplicationService` (or new)      | Admin provisioning + role-change + status-change use cases. Publish new event types to Kafka.          |
| OpenAPI spec                       | Regenerate to advertise expanded role enum and new endpoints.                                           |
| Tests                              | New ADMIN-specific + security + backward-compat test classes.                                           |
| Runbook / Kafka consumer docs      | Document new event types `admin.user.created`, `admin.user.role_changed`, `admin.user.status_changed`. |

### 20.2 Components that remain unchanged

| Component                                  | Reason                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------- |
| `User` entity (other than `role` usage)    | Role is a single attribute; entity invariant logic is role-agnostic.                 |
| `AccountStatus` enum                       | Not affected by role addition.                                                        |
| `RefreshToken` entity                      | Refresh payload is opaque to role.                                                    |
| `JwtService.validateToken` signature       | Same key, same algorithm, same claims set.                                            |
| BCrypt password hashing                    | Same algorithm and cost factor.                                                       |
| Redis blacklist key format                 | `jti:{tokenId}` keys are not role-scoped; cross-role reuse is fine.                   |
| `UserDetailsServiceImpl` structure         | Authority mapping uses `ROLE_<NAME>`, so ADMIN works automatically.                    |
| `JwtAuthenticationFilter` structure        | Same parse → blacklist-check → authority-set logic.                                   |
| `SecurityConfig` security filter chain     | No new URL patterns; new endpoints inherit the same chain.                            |
| `application.yml` (excluding bootstrap)    | No new required keys.                                                                  |
| Login flow                                 | Role-agnostic; ADMIN reuses it as-is.                                                 |
| Refresh flow                               | Same rotation chain.                                                                  |
| Password reset flow                        | Same secure workflow.                                                                  |
| CP guarantees                              | Primary-only reads, Redis `SET NX EX`, Flyway-lock — all preserved.                   |

### 20.3 Database changes

- New migration `V3__add_admin_role_to_users_check.sql` swaps the CHECK constraint on `users.role`.
- Optional one-time bootstrap row inserted with `role='ADMIN'` under "only if no admin exists" guard.
- No new tables, no new columns, no new indexes required.

### 20.4 JWT changes

- The set of claim **names** is unchanged (`sub`, `email`, `role`, `jti`, `iss`, `iat`, `exp`).
- The **legal value** of the `role` claim expands from `{TEACHER, STUDENT}` to `{ADMIN, TEACHER, STUDENT}`.
- Signing, parsing, key rotation, and `iss` validation are identical.

### 20.5 Authorization changes (within the auth service)

- The auth service does not authorize business actions; it only **identifies** the caller.
- Spring Security authorities still derive from `role` → `ROLE_<NAME>`, which automatically yields `ROLE_ADMIN` for ADMIN users.
- The new admin-only endpoints use `@PreAuthorize("hasRole('ADMIN')")`.

### 20.6 API changes

- The five existing endpoints (`/login`, `/logout`, `/refresh`, `/validate`, `/me`) are **unchanged** in contract.
- Four new admin-only endpoints are added under `/api/v1/auth/admin/...`.

### 20.7 Security implications

- ADMIN is a privileged identity — same authentication strength, same brute-force back-pressure, same JWT signature guarantees.
- Privilege escalation is structurally impossible because no public endpoint accepts a role change for the caller.
- Defense-in-depth is preserved: `@PreAuthorize` on new admin endpoints + downstream service-side role checks.
- Audit trail is extended with new Kafka event types; consumers ignore unknown types harmlessly.

### 20.8 Testing updates

- New ADMIN-specific unit + integration + security tests.
- Backward-compatibility tests must pass without modification for TEACHER/STUDENT.
- Legacy-refresh-token test ensures in-flight tokens issued before the deploy still validate after.

### 20.9 Deployment updates

- One Flyway migration.
- No new required environment variables.
- Optional bootstrap admin config keys.
- Standard rolling deploy in dependency order: DB → auth → gateway → downstream services.
- Rollback path is a follow-up migration that fails safe if any ADMIN rows exist.

---

## 21. Out of Scope

To keep this update minimal and backward-compatible, the following are intentionally **not** introduced:

- Multi-role accounts (a user remains exactly one role).
- Hierarchy / inheritance between `ADMIN` and `TEACHER`.
- New claims (`scope`, `permissions`, `roles[]`).
- MFA / TOTP / IP allowlisting.
- Separate admin authentication flow.
- Public self-registration for ADMIN.
- New database columns.

These items would each require their own design pass; their omission is **deliberate**.

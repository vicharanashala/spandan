# v0.2.1 — Authentication Core

| Field | Value |
|---|---|
| Version | 0.2.1 |
| Group | 0.2 — Identity & Access |
| Status | Released |
| Goal | Let people create an account with an email and password and sign in, storing only hashed passwords, and give every later feature a dependable notion of "an authenticated request" carried by a signed, expiring session token. |

## References & prerequisites
Assumes this earlier chunk is already built:
- **0.1** — application skeleton, configuration loading, the document database connection, and the base-path–aware API surface.

External references the implementing agent should consult: a strong adaptive password-hashing function, a signed-token mechanism for stateless sessions, and its runtime's request-middleware pattern.

## Purpose
Establish who a request belongs to. A person registers with a name, email, and password; the password is stored only as a salted hash; signing in with the right credentials returns a signed token that stands in for the user on later requests. Every protected feature built afterward relies on the single contract defined here: a valid token identifies a real, current user, and everything else is refused.

## Functional requirements
1. **Self-registration** — a person registers with a name, a unique email, and a password. The email is normalized (case-insensitive, trimmed) and must be unique; the password must meet a minimum strength. A second registration with an already-used email is refused.
2. **Password hashing** — passwords are hashed with a salted, adaptive hash before storage. A plaintext password is never stored, logged, or returned. The hashing work must not block the server from handling other requests during a burst of sign-ins.
3. **Login** — signing in with an email and the correct password succeeds; a wrong password or an unknown email fails with a single, indistinguishable "invalid email or password" message so an attacker cannot tell which was wrong.
4. **Session token on success** — a successful login (and a self-registration that establishes a session) returns a signed token that encodes the user's identity and carries an expiry.
5. **Authenticated request contract** — a reusable check reads the token from the incoming request, verifies its signature and expiry, resolves it to a current user record, and attaches that user to the request. A missing, malformed, expired, or unverifiable token, or one that resolves to a user who no longer exists, is refused as unauthenticated.
6. **Current-user lookup** — an authenticated caller can retrieve their own account details (never including the password hash).
7. **No self-service identity escalation** — the account's core identity attributes set at registration cannot be changed by the account holder through this surface; a password change requires proving the current password.

## Data handled
- **Input:** on registration, a name, email, and password; on login, an email and password; on later requests, a bearer token.
- **Output:** the created or signed-in user's public profile (no password hash) and a signed session token; on an authenticated request, the resolved current user.
- **Stored:** the user record with the password only ever as a hash.

## Security requirements
- Passwords are stored only as salted adaptive hashes; the hash is stripped from every response and every serialized form of the user.
- Login failures are uniform so the endpoint cannot be used to discover which emails are registered.
- The session token is signed with a server-held secret and rejected if tampered with or expired; the secret comes from configuration.
- The authenticated-request check is the single gate later features stand behind; an unauthenticated caller reaches nothing protected.

## Performance & scaling requirements
- Password hashing must run off the main request-handling path so a login storm does not stall unrelated requests.
- Token verification must be stateless (no per-request database round trip inherent to the token itself), so any backend instance can validate a token; resolving the token to a user may be optimized with a short-lived cache without changing the contract.
- The design must hold across more than one backend instance: a token minted by one instance is honored by any instance sharing the signing secret.

## Configuration
- The signing secret for session tokens and the token lifetime.
- The password-hashing cost/strength.
- The minimum acceptable password length/strength.

## Acceptance criteria
1. A new person can register with a unique email and a sufficiently strong password; registering again with the same email is refused.
2. The stored account never exposes the password hash in any response.
3. Login with correct credentials returns a signed token; login with a wrong password or unknown email returns the same generic failure.
4. A request bearing a valid, unexpired token resolves to the current user and is treated as authenticated; a missing, tampered, or expired token is refused.
5. A token whose user no longer exists is refused.

## Out of scope (built elsewhere)
- Roles, role-based authorization, the admin teacher-approval gate, and the reusable approved-teacher and resource-owner guards — **0.2.2**.
- Auth pages, protected and role-aware routing, and the auth state store — **0.2.3**.
- Email-verified registration codes, password-reset emails, and Google sign-in — **0.9.x**.

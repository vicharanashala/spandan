# Phase 7 — Challenge Link Verification (DRAFT — UNCONFIRMED)

> **STATUS: DRAFT — UNCONFIRMED.** This document is co-authored as a design
> proposal. Nothing in here is implemented. Nothing in here is a contract
> until a human signs off on each `DRAFT-OPEN:` question. No Jest runs,
> no code, no green bar until that happens.

## 0. Threat model (the reason this spec exists)

A teacher or session host generates a **challenge link** that a student
clicks. The link grants the student access to a specific
peer-review / question session (Phase 6's `PeerReviewLayer`). The risks
we are designing against:

1. **Forgery** — a student edits a link to escalate privileges (join a
   different session, impersonate another user, bypass the rolling-
   accuracy floor).
2. **Replay** — a student shares a valid link publicly so 200 strangers
   join using the same token.
3. **Tampering** — a middlebox modifies the URL in transit.
4. **Stale use** — a link generated for a session that ended weeks ago
   is reused.
5. **Clock skew** — the student's device clock is wrong, so a perfectly
   legitimate link gets rejected.

Everything below is in service of these five risks.

---

## 1. Key distribution — the security-critical decision

### Recommendation: **asymmetric (Ed25519) verification on the client, signing on the server.**

| Option | Frontend embed | Forgery risk | Operational complexity |
|---|---|---|---|
| **A. Symmetric HMAC, secret in bundle** | secret | **Catastrophic** — anyone can read the bundle and forge | Low |
| **B. Symmetric HMAC, secret server-side, client calls `/verify`** | nothing secret | Low — server can rate-limit, log, revoke | Medium — extra round trip |
| **C. Asymmetric Ed25519, server signs, client verifies with public key** | **public key only** | Low — public key can't forge | Low — no round trip |
| **D. JWT (Ed25519 / RS256), same as C with standardized envelope** | public key only | Low | Low |

**Recommendation: Option D (JWT)**. We get a battle-tested envelope
format (header.payload.signature), well-known libraries
(`jose`, `jsonwebtoken`), and natural `exp` / `nbf` / `aud` claims that
solve risks #2 (we can bind to a single `jti`) and #4 (built-in expiry).

**DRAFT-OPEN Q1:** Confirm Option D (JWT Ed25519) vs. B (server-side
HMAC verify endpoint). The rest of this draft assumes D.

### Public key embedding

- Key is generated once at deploy time, committed to the server env.
- **Public key (32-byte Ed25519 raw, base64url-encoded)** is embedded in
  the frontend bundle at build time via `VITE_CHALLENGE_PUBLIC_KEY`.
- Build step MUST fail if the env var is missing.
- Key rotation: server keeps a list of `kid` → public key. Frontend
  fetches a JWKS document at app boot from
  `/api/challenge/.well-known/jwks.json` and caches it. The build-time
  env var is a hard fallback for offline / first-load.
- **No private key ever enters the bundle. The verification key in the
  browser is public by definition; the design relies on that.**

**DRAFT-OPEN Q2:** Is a JWKS fetch on app boot acceptable, or must
verification work fully offline from the embedded key only?

---

## 2. URL envelope — `spandan:v1:c:<base64url>`

> **Naming conflict flagged:** The `spandan:` prefix looks like a custom
> URL scheme. Custom schemes are sometimes stripped by link-previewers
> (Slack, iMessage, Outlook) and rejected by some browsers. Three
> envelope shapes are proposed; we must pick exactly one.

### Shape 2.1 — JWT-as-base64url (preferred)

```
spandan:v1:c:<jwt>
```

Where `<jwt>` is a standard compact-serialization JWT
(`<b64u(header)>.<b64u(payload)>.<b64u(signature)>`). The `spandan:v1:c:`
prefix is a *marker*, not parsed as a real scheme — the link lives in a
normal `https://app.spandan.example/join?token=spandan:v1:c:<jwt>`
URL.

**Pros:** standards-compliant, every library handles it.
**Cons:** the marker is redundant once the JWT is there; we still need
the `spandan:v1:c:` prefix as a feature flag for forward compatibility.

### Shape 2.2 — Custom JSON envelope

```
spandan:v1:c:<b64u(json { v, qid, sid, uid, exp, sig })>
```

Where `sig` is Ed25519 signature of the canonical JSON
`{v, qid, sid, uid, exp}` (signature not over self).

**Pros:** explicit.
**Cons:** we own the canonicalisation rules; one missed
key-ordering rule and verification breaks.

### Shape 2.3 — Hybrid (frontend stores raw marker, server stores JWT)

URL parameter is the marker. Backend resolves marker → JWT and serves
the session bootstrap. Client never sees the JWT directly.

**Pros:** secret stays server-side, even the public verification key
isn't needed in the browser.
**Cons:** defeats the "verify on client" benefit, adds a round trip.

**DRAFT-OPEN Q3:** Which envelope shape? Draft proceeds assuming **2.1
(JWT)**.

---

## 3. JWT claims (assuming Shape 2.1)

```json
{
  "header": {
    "alg": "EdDSA",
    "typ": "JWT",
    "kid": "spandan-2026-07-key-01"
  },
  "payload": {
    "iss": "spandan.session-signer",
    "aud": "spandan.peer-review.v1",
    "sub": "<userId>",
    "qid": "<questionId>",
    "sid": "<sessionId>",
    "jti": "<uuid>",          // single-use binding — see §4
    "iat": 1720458000,
    "nbf": 1720458000,
    "exp": 1720461600,        // 1 hour default; see §5
    "scope": "join-peer-review"
  }
}
```

| Claim | Purpose |
|---|---|
| `iss`, `aud` | prevent cross-app token reuse |
| `sub` | the user this link is bound to |
| `qid`, `sid` | the question and session this link opens |
| `jti` | single-use token id (server-side replay block — see §4) |
| `iat`, `nbf`, `exp` | standard time bounds |
| `scope` | capability string, locked at sign time |

**DRAFT-OPEN Q4:** Confirm claim set. Is `sid` (session id) the right
grain, or do we want to allow the same user to join multiple sessions
with one token?

---

## 4. Single-use enforcement (replay protection, risk #2)

JWT verification on the client proves the token is *authentic*, not
that it has not been used before. Two options:

- **Server-side replay cache.** Client POSTs the JWT to
  `POST /api/challenge/redeem`, server checks `jti` against a
  short-lived Redis set with TTL ≥ token `exp`. On miss → reject.
  Server returns a short-lived session bootstrap token.
- **Stateless single-use via `jti` hashing.** Server hashes `jti` and
  stores the hash + expiry. Same logic, less readable in logs.

**Recommendation: server-side replay cache.** The client never decides
"is this token fresh" — it just verifies the signature and posts the
JWT to redeem. The redeem endpoint is the gate.

This means **the frontend's role is: signature-verify only.** Anything
that requires server state (replay check, user existence, session
still-active) lives on the server.

---

## 5. Lifetime (`exp`) and verification cadence

### Lifetime
- **Default `exp = iat + 3600s` (1 hour).**
- **Hard cap `exp ≤ iat + 86400` (24h).** Anything longer is rejected
  at sign time.
- Clock skew tolerance: ±30s. JWT `nbf` and `exp` are validated with
  a `clockTolerance` window.

### Client verification cadence

Verification runs at three deterministic points:

1. **On link open** — when the URL is parsed and the JWT extracted.
2. **On BroadcastChannel message** — when a `peer-review:broadcast`
   message arrives bearing the same `jti`.
3. **On session resume** — when the app restores from
   `sessionStorage` after a refresh.

It does **not** run on a `setInterval` timer — that wastes cycles and
adds nothing (the token cannot mutate while in memory; if the user
closes the tab, `exp` checks happen on resume).

**DRAFT-OPEN Q5:** Is the three-trigger cadence sufficient? Any other
UI event we should hook (visibility change, focus regain, route
change)?

---

## 6. Error fallback layer

Per the original ask: "if a token fails verification, is altered, or
contains an expired signature parameter, immediately catch the error,
suppress runtime crashes, drop state back down to standard mode, and
flag a localized validation alert state."

### Proposed error state machine

```
            ┌─────────────┐
            │   IDLE      │ (no token in URL)
            └──────┬──────┘
                   │ URL parsed
                   ▼
            ┌─────────────┐
            │  VERIFYING  │ (async sig verify)
            └──┬──────┬───┘
       ok     │      │  fail
               ▼      ▼
        ┌──────────┐  ┌──────────────┐
        │ VERIFIED │  │ ALERT_STATE  │
        └──┬───────┘  │  - kind:     │
           │          │    EXPIRED | │
           │          │    TAMPERED |│
           │          │    MALFORMED││
           │          │    UNKNOWN_KID│
           │          └──────┬───────┘
           │                 │
           ▼                 ▼
       redeem               toast + log
       (server)
```

### Localized alert UX

- **Alert state lives in a new Zustand slice:**
  `frontend/src/stores/challengeAlertStore.js`.
- **Shape:**
  ```js
  {
    active: false,
    kind: null,           // 'EXPIRED' | 'TAMPERED' | 'MALFORMED' | 'UNKNOWN_KID' | 'CLOCK_SKEW'
    message: null,        // i18n key, e.g. 'challenge.expired'
    recoverable: true,    // can the user retry / re-fetch a link?
    shownAt: null         // epoch ms; auto-dismiss after 8s
  }
  ```
- **UI hook:** `<ChallengeAlert />` component renders a top-of-page
  banner inside `PeerReviewLayer.jsx`, above `<PeerReviewPanel />`.
- **No crashes.** Every verifier call site wraps in try/catch; on
  thrown error, set `active=true, kind='MALFORMED'`, log to
  `frontend/src/utils/telemetry.js` (future work), never throw upward.
- **`PeerReviewLayer` "standard mode":** if a challenge-link token was
  the *only* path into the peer-review round, and verification fails,
  the layer renders the alert banner with `<PeerReviewPanel />` *hidden*
  (not mounted). If the user navigated to the peer-review round by some
  other path (e.g. teacher mode), the alert still fires but the panel
  stays mounted.

**DRAFT-OPEN Q6:** "Standard mode" is the term from the original ask.
I'm interpreting it as "PeerReviewLayer with the alert banner visible
and the join flow disabled." Is that the right read, or does
"standard mode" mean something else in this codebase that I've missed?

---

## 7. File / module layout (proposed)

```
frontend/src/challenge/
  index.js                       // public surface: parseChallengeLink(url)
  envelope.js                    // 'spandan:v1:c:' prefix strip, JWT unpack
  verify.js                      // verifyJwt(token, publicKey, opts) — pure, sync
  errors.js                      // ChallengeError, error kinds, i18n key map
  jwks.js                        // fetch / cache JWKS at boot

frontend/src/stores/
  challengeAlertStore.js         // zustand slice (see §6)

frontend/src/components/
  ChallengeAlert.jsx             // banner UI

frontend/src/__tests__/
  envelope.test.js               // URL parsing, malformed input
  verify.test.js                 // signature verify, expiry, clock skew, kid lookup
  challengeAlertStore.test.js    // state machine transitions
  ChallengeAlert.test.jsx        // rendering under each error kind
```

### Public API (proposed)

```js
// frontend/src/challenge/index.js
export function parseChallengeLink(href) {
  // returns { ok: true, jwt, claims } | { ok: false, kind: 'MALFORMED', reason }
}

export function verifyChallengeJwt(jwt, { publicKey, jwks, now = Date.now(), clockToleranceSec = 30 } = {}) {
  // throws ChallengeError on any failure
  // returns { header, payload, signature } on success
}
```

### Server endpoints (out of frontend scope, listed for contract)

- `GET  /api/challenge/.well-known/jwks.json` — JWKS document.
- `POST /api/challenge/redeem` — `{ jwt }` → `{ sessionBootstrap, expiresAt }`
  or `{ error: 'EXPIRED' | 'REPLAY' | 'NOT_FOUND' | 'REVOKED' }`.
- `POST /api/challenge/sign` (teacher-only) — issues a JWT.

---

## 8. Test plan (when we get there)

Not running Jest today. When we do:

1. **Pure-function tests** for `envelope.js` and `verify.js` — no React,
   no network. Use a fixed Ed25519 keypair generated in test setup.
   Cover: valid signature, tampered payload, wrong key, expired
   (`exp` in past), not-yet-valid (`nbf` in future), clock skew
   boundary, unknown `kid`, malformed base64url, missing prefix.
2. **Alert-store tests** — state machine transitions in
   `challengeAlertStore.test.js`.
3. **Component tests** — `<ChallengeAlert />` renders the right i18n
   key for each error kind, auto-dismisses after 8s, accessible
   (`role="alert"`).
4. **Integration test** — full happy path:
   `parseChallengeLink → verifyChallengeJwt → alert store stays silent → server redeem mocked → PeerReviewLayer mounts`.
5. **Integration test** — full sad path for each error kind:
   `parseChallengeLink → verifyChallengeJwt → ChallengeError → alert store active=true → banner renders → PeerReviewPanel hidden`.

---

## 9. Open questions (the things blocking implementation)

| # | Question | Default if no answer |
|---|---|---|
| Q1 | JWT Ed25519 (Option D) vs. server-side HMAC (Option B)? | **D** |
| Q2 | JWKS fetch at boot, or embedded-key-only? | **JWKS + fallback** |
| Q3 | Envelope shape: JWT vs. custom JSON vs. server-resolved? | **JWT (2.1)** |
| Q4 | Claim set OK? Is `sid` the right scope grain? | **as listed** |
| Q5 | Three verification triggers sufficient? | **yes** |
| Q6 | "Standard mode" = alert banner + disabled join flow? | **as in §6** |
| Q7 | Should `<ChallengeAlert />` be a full top banner or a toast? | **banner** |
| Q8 | Single-use enforcement server-side or hybrid? | **server-side replay cache** |
| Q9 | Telemetry on alert: which fields, where do they go? | **console-only this phase** |
| Q10 | Link lifetime defaults: 1h `exp`, 24h hard cap — confirm? | **as listed** |

---

## 10. What this draft explicitly does NOT do

- Does not pick a final envelope shape. (Q3)
- Does not pick a key distribution model. (Q1, Q2)
- Does not commit to a UI placement for the alert. (Q7)
- Does not assume any Phase 6 contract changes. Peer review layer is
  unchanged.
- Does not assume server-side endpoints exist. They are listed as
  contract requirements; if they don't exist, Phase 7 cannot ship
  end-to-end and we need to either build them or scope Phase 7 down
  to client-side verification only (which weakens replay protection).
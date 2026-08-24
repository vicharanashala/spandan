# v0.9.1 — Email-OTP Verified Self-Registration

| Field | Value |
|---|---|
| Version | 0.9.1 |
| Group | 0.9 — Additional Sign-In Methods |
| Status | Released |
| Goal | Prove that a sign-up email really belongs to the registrant by emailing a one-time code and creating the account only after that code is verified. |

## References & prerequisites
Assumes these earlier chunks are already built:
- **0.1** — application skeleton and configuration loading.
- **0.2** — identity & access foundation: Teacher/Student/Admin roles, role-based authorization, the admin teacher-approval gate, account creation with a role chosen once at registration, and the login flow that issues a session. This chunk changes only *how* an email/password account is created; everything 0.2 established about roles, approval, and login stays exactly as-is.

External references the implementing agent should consult: a transactional email delivery mechanism of its choice.

## Purpose
Registration is turned into a two-step, email-verified flow. Instead of creating an account directly from a submitted form, the application first emails a short numeric code to the address given, and creates the account only after that same code is entered back. This proves the email is real and belongs to the person signing up, which blocks typo, fake, and bot signups from ever becoming accounts.

## Functional requirements
1. **Request a code (step one)** — a visitor submits the name and email they want to register with. If that email already belongs to an account, the request is refused with a clear "already registered" message. Otherwise a fresh code is generated and emailed to that address, and the response tells the client how long the code stays valid.
2. **Verify and create (step two)** — the visitor submits the emailed code together with the full registration details (name, email, password, chosen Learn/Teach role). The code is checked; on success the account is created as an email-verified account, exactly as a 0.2 account would be, honoring the chosen role.
3. **No single-step registration** — there is no path that creates an account without a verified code. Verifying the code is the only way an email/password account comes into existence.
4. **Teacher approval still applies** — a registrant who chose Teach has their account created but is not signed in; they are told the account is pending admin approval and sent back to sign in later, using the same approval gate from 0.2. A registrant who chose Learn is signed in immediately once the code is verified.
5. **Resend** — the visitor can ask for a new code, subject to the cooldown and cap below. A newly issued code supersedes any earlier one for that email.
6. **Single use and expiry** — a code works once and only within its validity window; a correct code that has expired, or has already been used, is refused with a message telling the visitor to request a new one.
7. **Attempt limiting** — after a small number of wrong entries for a given code, that code is invalidated and the visitor must request a new one.

## Data handled
- **Input at step one:** the intended name and email.
- **Input at step two:** the emailed code plus the full registration details (name, email, password, role).
- **In-flight verification state (per email):** a non-reversible form of the code, its expiry time, a count of failed entry attempts, the time the last code was sent, and how many codes have been sent. The plain code is never stored, and the name/password are not held here between steps — they are re-submitted at verification.
- This in-flight state is short-lived and removed automatically once it expires, once the code is used, or once attempts are exhausted.

## Security requirements
- The code must be unpredictable and stored only in a non-reversible form, so a leak of stored state cannot reveal a working code.
- Codes expire after a short window and are single-use.
- Wrong entries are capped per code; exceeding the cap invalidates the code.
- Requesting codes is rate-limited per email in two ways: a short cooldown between consecutive sends, and an overall cap on how many codes may be sent for one email within the window. Hitting either returns a clear, client-actionable message rather than a silent failure.
- Genuine email-delivery or server faults are reported generically, without leaking internal detail.
- The chosen role is applied exactly as in 0.2; this flow never lets a registrant bypass or alter the role/approval rules.

## Performance & scaling requirements
- Requesting a code returns as soon as the email is accepted for delivery; the visitor is not made to wait on anything heavier.
- In-flight verification state lives in the shared datastore so any application instance can handle step one and step two of the same registration, and expired entries are reclaimed automatically without a manual sweep.
- The rate limits protect the email channel from being used to bombard an address or to brute-force a code.

## Configuration
- The code's validity window, the cooldown between resends, the maximum sends per email in the window, and the maximum wrong entries per code — all with sensible defaults and overridable per deployment.
- The email delivery settings needed to actually send the code (shared with the rest of the application's outbound email).

## Acceptance criteria
1. Submitting a new email at step one sends a code and reports how long it is valid; submitting an already-registered email is refused.
2. Entering the correct code within the window creates the account; a Learn registrant is signed in, a Teach registrant is told their account is pending admin approval and is not signed in.
3. A wrong code is refused and, after the attempt cap is reached, the code is invalidated and a new one must be requested.
4. An expired or already-used code is refused with guidance to request a new one.
5. Requesting codes too quickly is blocked by the cooldown, and too many requests for one email are blocked by the send cap, each with a clear message.

## Out of scope (built elsewhere)
- Recovering access to an existing account by email — **0.9.2**.
- Signing in with Google — **0.9.3**.

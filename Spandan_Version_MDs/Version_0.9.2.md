# v0.9.2 — Password Reset by Email

| Field | Value |
|---|---|
| Version | 0.9.2 |
| Group | 0.9 — Additional Sign-In Methods |
| Status | Released |
| Goal | Let someone who has forgotten their password regain access by emailing them a single-use, time-limited reset link that lets them set a new password. |

## References & prerequisites
Assumes these earlier chunks are already built:
- **0.1** — application skeleton and configuration loading.
- **0.2** — identity & access foundation: accounts with email/password credentials, and the login flow that verifies a password. This chunk adds a way to set a new password without knowing the old one; it does not change how login itself works.

External references the implementing agent should consult: a transactional email delivery mechanism of its choice.

## Purpose
People forget passwords. This chunk gives an account holder a safe way back in: they ask for a reset by email, receive a link that works once and only for a short time, and use it to choose a new password. Knowing the old password is not required, so the flow is designed so that only the true owner of the email can complete it.

## Functional requirements
1. **Request a reset** — a user submits the email of their account. The application always responds the same way — "if an account exists, a reset link has been sent" — whether or not that email is registered, so the request cannot be used to discover which emails have accounts.
2. **Send a link (only for real accounts)** — when the email does belong to an account, a fresh single-use reset link is generated and emailed to that address. The link carries an unguessable token and points at the application's reset page.
3. **One outstanding reset per account** — requesting a reset supersedes any earlier outstanding reset for that same email, so only the most recent link is usable.
4. **Set a new password** — following the link, the user chooses a new password. The application checks the token, then checks the new password meets the strength rules established for the platform, and on success updates the account's password.
5. **Single use** — once a link has been used to set a new password it cannot be used again.
6. **Expiry** — a link is valid only for a short window; after that it is refused, and an expired or unknown token yields a clear "invalid or expired" message.
7. **Sign in with the new password** — after a successful reset the user is directed back to sign in and can log in with the new password immediately.

## Data handled
- **Input at request time:** the account email.
- **Input at reset time:** the reset token (carried by the link) and the chosen new password.
- **Reset state (per outstanding request):** the account's email, the unguessable token, an expiry time, and a used/not-used marker.
- Reset state is short-lived and removed automatically once it expires; used or expired entries are also cleaned up.

## Security requirements
- The reset token must be unguessable and long enough that it cannot be brute-forced within its short lifetime.
- Each link is single-use and time-limited; the two together bound how long any leaked link is dangerous.
- The request step must not reveal whether an email is registered — the same response is returned in both cases, so it is not an account-enumeration oracle.
- A new password must satisfy the platform's strength rules before it is accepted.
- Email-delivery or server faults are reported generically without leaking internal detail.

## Performance & scaling requirements
- Requesting a reset returns as soon as the email is accepted for delivery; the user is not made to wait on anything heavier.
- Reset state lives in the shared datastore so any application instance can issue a link and any instance can honor it, and expired entries are reclaimed automatically without a manual sweep.

## Configuration
- The reset link's validity window, with a sensible default and overridable per deployment.
- The public address of the application's reset page, so the emailed link points at the right place.
- The email delivery settings needed to actually send the link (shared with the rest of the application's outbound email).

## Acceptance criteria
1. Requesting a reset for any email returns the same neutral "if an account exists…" message; a real account additionally receives a reset link by email.
2. Following a valid link and submitting a strong new password updates the password and directs the user back to sign in.
3. The user can then sign in with the new password.
4. Reusing a link that has already reset a password is refused.
5. An expired or unknown token is refused with an "invalid or expired" message, and a new password that fails the strength rules is rejected.

## Out of scope (built elsewhere)
- Email-verified new-account registration — **0.9.1**.
- Signing in with Google — **0.9.3**.
- Changing your own password while signed in (which requires the current password) — established with the identity foundation.

# v0.9.3 — Google OAuth Sign-In

| Field | Value |
|---|---|
| Version | 0.9.3 |
| Group | 0.9 — Additional Sign-In Methods |
| Status | Released |
| Goal | Let people register or sign in with their Google account alongside email/password, while honoring the same roles and admin teacher-approval already in place. |

## References & prerequisites
Assumes these earlier chunks are already built:
- **0.1** — application skeleton and configuration loading.
- **0.2** — identity & access foundation: Teacher/Student/Admin roles, role-based authorization, the admin teacher-approval gate, account creation with a role chosen once, and the login flow that issues a session. This chunk adds Google as an additional way to reach that same identity; roles, approval, and sessions behave exactly as 0.2 defined them.
- **0.9.1** — email-verified registration, which established the Learn/Teach choice and the "teacher created but pending approval" outcome that this flow reuses.

External references the implementing agent should consult: Google's OAuth authorization-code sign-in.

## Purpose
Add "Continue with Google" as a second door into the same accounts. A returning user signs straight in; a brand-new user is asked whether they want to Learn or Teach and then gets an account; and someone who already has an email/password account with the same address has Google linked to that existing account so either method works. Throughout, the platform's own rules — roles set once, teachers needing admin approval — are the source of truth; nothing the browser claims is trusted.

## Functional requirements
1. **Begin sign-in** — from the sign-in page the user starts the Google flow, carrying along the Learn/Teach role they picked (defaulting to Learn). The application sends them to Google to sign in and consent, and remembers the picked role safely across the round trip.
2. **Return and verify** — Google sends the user back to the application, which completes the exchange on the server side and obtains a Google-verified identity (at least a stable Google account id and a verified email). Only this server-verified identity is trusted; anything the browser supplied is ignored. A Google account whose email is not verified is refused.
3. **Returning user** — if the identity matches an account already linked to that Google account, the user is signed in.
4. **Link to an existing same-email account** — if there is no linked account but an email/password account exists with the same verified email, Google is linked to that existing account (its role is unchanged) and the user is signed in. The user may then use either method.
5. **Brand-new user picks a role** — if no account exists, the application does not guess a role. It carries the verified identity back to the client, asks the user to choose Learn or Teach, and only then creates the account with that role. The role picked when starting the flow is used merely as a pre-selection.
6. **Teacher approval still applies** — a brand-new user who chooses Teach has their account created but is not signed in; they are told it is pending admin approval, exactly as in the email/password flow. Likewise, a returning or newly-linked teacher who is not yet approved is not signed in and is shown the pending-approval message.
7. **Feature can be absent** — where Google sign-in is not configured for a deployment, starting the flow reports clearly that it is unavailable, and the rest of the application is unaffected.
8. **Clean outcomes** — every return path lands the user on a single result page that either signs them in, asks for a role, shows a pending-approval message, or shows a clear error (including if the user cancelled at Google).

## Data handled
- **Input:** the role pre-selection when starting; from Google, on return, the server-verified identity (stable account id, verified email, display name, optional picture).
- **Carried across the round trip:** the picked role, held in a short-lived tamper-proof form that needs no server-side storage so it works across instances and cannot be forged by the browser.
- **Carried back for a first-time sign-up:** the verified identity, held in a short-lived tamper-proof form, so the account is created from the server-verified identity and only the freshly chosen role is taken from the user.
- **Stored on the account:** a link to the Google identity and which sign-in method provisioned the account, alongside the existing identity fields; role and approval status follow the platform's normal rules.
- The session issued on success is the same kind the platform already uses; it is handed back to the client in a way that keeps it out of server logs and out of browser history.

## Security requirements
- The code-for-identity exchange happens on the server using the application's own Google credentials; the client is never trusted to assert who it is.
- The email must be reported by Google as verified before it is used to sign in or to link to an existing account.
- The value carried across the round trip, and the value carrying a first-time identity back, are each short-lived and tamper-proof, and are each pinned to their specific purpose so neither can be replayed as the other or as an ordinary session.
- Linking to an existing same-email account is only ever done with a Google-verified email, so it cannot be used to hijack someone else's account.
- A new teacher provisioned through Google is created pending approval and granted no teacher privileges until an administrator approves — the same gate as every other path. Existing users never have their role changed by signing in with Google.
- Optionally, sign-in can be restricted to accounts from a specific Google-hosted domain, refusing others.

## Performance & scaling requirements
- Because the round-trip and first-time-identity values are self-contained and tamper-proof rather than server-stored, any application instance can start the flow and any instance can complete it.
- The server-side exchange with Google is bounded so a slow response from Google cannot tie up the application indefinitely.
- A best-effort welcome email on a brand-new sign-up never blocks or fails the sign-in.

## Configuration
- The Google client credentials and the return address Google should send users back to; when these are absent the feature is treated as unavailable.
- The lifetimes of the short-lived round-trip and first-time-identity values.
- Optionally, a single Google-hosted domain to which sign-in is restricted.

## Acceptance criteria
1. A returning user linked to Google signs in directly.
2. A user whose email matches an existing email/password account has Google linked to it and signs in, with their original role unchanged, and can afterward use either method.
3. A brand-new user is asked to choose Learn or Teach before any account is created; choosing Learn signs them in, choosing Teach creates the account and shows the pending-approval message without signing them in.
4. A Google account with an unverified email is refused, and a cancelled or failed sign-in lands on a clear error.
5. With Google sign-in not configured, starting the flow reports it is unavailable while the rest of the application keeps working.

## Out of scope (built elsewhere)
- Email-verified email/password registration — **0.9.1**.
- Password reset by email — **0.9.2**.

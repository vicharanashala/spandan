# v0.2.3 — Authentication Frontend

| Field | Value |
|---|---|
| Version | 0.2.3 |
| Group | 0.2 — Identity & Access |
| Status | Released |
| Goal | Give the single-page app its authentication surface: register/login pages with a Learn-or-Teach choice, a persisted auth state store, protected and role-aware routing, and graceful handling of an expired session so an unusable stale login never lingers. |

## References & prerequisites
Assumes these earlier chunks are already built:
- **0.1** — application skeleton, base-path–aware SPA routing, and the auth landing page as the app root.
- **0.2.1** — authentication core: registration, login, signed expiring session tokens, and the current-user lookup.
- **0.2.2** — roles (Teacher/Student/Admin), the approval gate that refuses unapproved teachers a session, and the admin flag.

External references the implementing agent should consult: the chosen SPA's client-side router and a lightweight client state store with persistence.

## Purpose
Present authentication to the user and hold the session on the client. A visitor can create an account or sign in, choosing whether they want to Learn (student) or Teach (teacher); the resulting session is remembered across reloads; routes that require a session redirect anyone without one to the login screen; and each user lands in the workspace their role permits. When a session expires, the app drops it cleanly and explains why, rather than showing a logged-in-looking screen that fails on the next action.

## Functional requirements
1. **Register and login pages** — a combined auth surface lets a visitor switch between signing in and creating an account. Registration collects a name, email, password (with a confirmation and visible strength requirements), and a Learn-or-Teach role choice; login collects email and password.
2. **Learn or Teach choice** — at registration the visitor picks Student (Learn) or Teacher (Teach); the choice is sent as the requested role.
3. **Auth state store** — a client store holds the current user, the session token, and whether the user is authenticated; it persists across reloads so a returning visitor stays signed in until the session ends.
4. **Attach the session to requests** — the stored token is sent with requests to protected endpoints, and successful sign-in/registration updates the store to the authenticated state.
5. **Protected routing** — routes that require authentication redirect an unauthenticated visitor to the auth landing page; authenticated users are kept out of the auth page and sent to their workspace.
6. **Role-aware routing** — after signing in, a teacher lands in the teacher workspace and a student in the student workspace; admin-only screens are reachable only by an admin and redirect a non-admin away.
7. **Pending-teacher feedback** — when a teacher registers, the app shows that the account is awaiting admin approval and returns them to the login screen (no session is established); a login attempt by an unapproved teacher shows the same kind of clear message.
8. **Graceful expired-session handling** — if the stored token is already expired on load, or the server refuses a request as unauthenticated mid-session, the app drops the session and shows the login screen with a "your session expired, please sign in again" notice, distinct from a wrong-credentials error and not shown on a plain first visit.

## Data handled
- **Input:** the visitor's registration and login form entries and role choice; on load, any persisted session.
- **Output:** requests to the auth endpoints; the persisted current user and token; navigation to the correct workspace.
- **Stored on the client:** the current user, the token, and the authenticated flag; nothing secret beyond the session token the user already holds.

## Security requirements
- The client never trusts its own stored role for access to data — the server enforces every restriction; role here only drives which screen to show.
- An expired or server-rejected session is dropped immediately on the client so a stale token is not presented as a live login.
- The persisted authenticated flag is not trusted on its own: a restored-but-expired token drops the session on load rather than showing a logged-in UI.
- No password or password confirmation is persisted; only the session token is kept.

## Performance & scaling requirements
- Session persistence and routing decisions are client-side and add no server round trip beyond the auth calls themselves.
- Detecting an already-expired token on load happens on the client without a server call, so an expired session is caught before any protected request is attempted.
- The auth surface loads as part of the SPA served under the base path from **0.1**, with no extra origin.

## Configuration
- The API and realtime locations the client calls, derived from the base-path setting established in **0.1**.

## Acceptance criteria
1. A visitor can register (choosing Learn or Teach) and sign in; a successful sign-in lands them in the role-appropriate workspace.
2. Reloading the page keeps an authenticated user signed in; visiting the auth page while authenticated redirects to the workspace.
3. An unauthenticated visitor hitting a protected route is redirected to the auth landing page.
4. Registering as a teacher shows the "awaiting admin approval" message and returns to login without a session; an unapproved teacher's login shows the same kind of message.
5. A session that is expired on load, or refused mid-session, drops cleanly and shows the login screen with an "session expired" notice, distinct from a wrong-password error.
6. A non-admin who reaches an admin-only screen is redirected away.

## Out of scope (built elsewhere)
- The teacher, student, and admin workspaces themselves and their contents — **0.3.x onward**.
- Email-verified registration codes, password-reset flows, and the Google sign-in button behavior — **0.9.x**.
- Realtime session re-authentication behavior — **0.4.x** (it reuses the expired-session handling defined here).

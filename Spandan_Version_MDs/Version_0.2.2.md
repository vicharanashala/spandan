# v0.2.2 — Identity & Access Model

| Field | Value |
|---|---|
| Version | 0.2.2 |
| Group | 0.2 — Identity & Access |
| Status | Released |
| Goal | Define the Teacher, Student, and Admin roles, role-based authorization, and the admin **teacher-approval** workflow — a newly registered teacher cannot act until an admin approves them — and provide the reusable **approved-teacher** and **resource-owner** authorization guards that every later feature relies on. This is the one place roles and restrictions are defined. |

## References & prerequisites
Assumes these earlier chunks are already built:
- **0.1** — application skeleton and configuration.
- **0.2.1** — authentication core: registration, login, hashed passwords, signed session tokens, and the authenticated-request check that resolves a token to a current user.

External references the implementing agent should consult: the role-modeling and authorization-middleware conventions of the runtime chosen in **0.2.1**.

## Purpose
Turn "an authenticated user" into "a user permitted to do this." Each account carries exactly one role — Teacher, Student, or Admin — and an approval state that matters only for teachers. A newly registered teacher is inert until an admin approves them: they cannot sign into teacher features, and any token they hold is refused. This chunk defines those roles and states once, and exposes the two guards — **approved-teacher** and **resource-owner** — that later features (rooms, transcription, question generation, live polling, results) apply rather than re-implementing access rules.

## Functional requirements
1. **Three roles** — every account is a Teacher, a Student, or an Admin. Role is chosen at registration (teacher or student) and is not self-service changeable afterward. Admin is a separate, elevated capability granted only administratively, never by a client claim.
2. **Role-based authorization** — a reusable guard restricts an action to one or more named roles and refuses anyone else, on top of the authenticated-request check.
3. **Teacher starts pending** — a newly registered teacher is created in a **pending** approval state. Students are effectively approved by default (the approval state is consulted only for teachers).
4. **Approval gate at sign-in** — a teacher who is not approved (pending or rejected) is refused a session at login and told their account is awaiting approval or was not approved, rather than landing in a teacher workspace.
5. **Approval gate on every request** — the authenticated-request check refuses an unapproved teacher even if they still hold a previously issued token, so revoking or delaying approval takes effect on their next request, not only at login.
6. **Admin approval workflow** — an admin can list teacher accounts by approval state, approve a pending teacher (recording who approved and when), or reject one (optionally with a reason). Approval immediately lets that teacher sign in and use teacher features; rejection keeps them out.
7. **Approved-teacher guard** — a reusable guard that permits an action only for a teacher whose account is approved, refusing students and unapproved teachers. Later teacher-only features apply this guard.
8. **Resource-owner guard** — a reusable guard that permits an action on a specific resource only to the user who owns it (for example, the teacher who owns a room), refusing other users even if they hold the right role. Later features that scope data to its owner apply this guard.
9. **Admin guard** — a reusable guard that permits admin-only actions, recognizing admins by a persisted admin flag or a configured bootstrap allowlist so the first admin can act before any flag is set. A client-supplied admin claim is never trusted.

## Data handled
- **Input:** the authenticated user (from **0.2.1**); for admin actions, the target teacher and an optional rejection reason.
- **Output:** authorization allow/deny outcomes; for the workflow, lists of teacher accounts by state with approval counts, and the updated approval state of a teacher.
- **Stored:** each user's role, admin flag, teacher approval state, and approval metadata (who approved/rejected, when, and any reason).

## Security requirements
- Role is fixed at registration and cannot be raised by the account holder through any self-service path; escalation attempts are refused.
- An unapproved teacher can neither obtain a session nor use an existing one for any protected action.
- The admin surface is reachable only by an admin, identified server-side; approval and rejection are admin-only.
- Approving or rejecting a teacher takes effect promptly on that teacher's subsequent requests, not only after a cache or token window elapses.
- The approved-teacher, resource-owner, and admin guards are the single, shared expression of these restrictions; later features apply them rather than inventing their own checks.

## Performance & scaling requirements
- The guards must be cheap, per-request checks over the already-resolved user, adding no extra database round trip beyond resolving the resource owner where ownership is checked.
- The approval state consulted per request must stay consistent across multiple backend instances, so a teacher approved on one instance is treated as approved everywhere; any per-instance caching of the resolved user must be invalidated when approval changes so the change is not masked.
- Listing teacher accounts for the admin view must scale to many accounts (filtered by state, ordered, counted) without loading unrelated data.

## Configuration
- The bootstrap admin allowlist that recognizes the first admin(s) before any persisted admin flag exists.

## Acceptance criteria
1. A newly registered teacher is created pending and cannot sign in or reach teacher features until approved.
2. An admin can list pending teachers, approve one, and that teacher can then sign in and use teacher features; a rejected teacher stays locked out with a clear message.
3. A student, or an unapproved teacher, is refused by the approved-teacher guard.
4. A user is refused an action on a resource they do not own, even with the correct role, by the resource-owner guard.
5. Only an admin can reach the approval workflow; a non-admin is refused.
6. A teacher approved (or rejected) mid-session sees the change take effect on their next request.

## Out of scope (built elsewhere)
- Auth pages, protected and role-aware routing, expired-session handling, and the auth state store — **0.2.3**.
- Rooms and the resources the resource-owner guard protects — **0.3.x**.
- The admin approval page's front-end presentation — **0.2.3** provides the role-aware routing that reaches it; its screen is part of the admin experience layered on the dashboards.

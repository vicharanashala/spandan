# v0.4.1 — Real-Time Foundation: Authorized Live Connections

| Field | Value |
|---|---|
| Version | 0.4.1 |
| Group | 0.4 — Real-Time Foundation |
| Status | Released |
| Goal | Give the application a live, event-driven channel that authenticated users can open to a room only after being authorized for it, and on which every later live feature is carried. |

## References & prerequisites
Assumes these earlier chunks are already built:
- **0.1** — application skeleton and configuration loading.
- **0.2** — identity & access foundation: Teacher/Student/Admin roles, role-based authorization, and the session token issued at login that proves who a caller is. These mechanisms already exist; this feature reuses them over the live channel.
- **0.3.x** — rooms owned by teachers, each reachable by a short join code, with a notion of membership and of a room having ended.

External references the implementing agent should consult: a bidirectional real-time messaging library of its choice and its runtime's authentication patterns.

## Purpose
Regular request/response is enough for setup, but a live classroom needs the server to push events (a question appearing, counts updating, a leaderboard folding) to many clients at once. This chunk establishes the persistent live channel, decides at connection and at join time who is allowed on it, and defines the event plumbing later features attach to — without leaking one user's identity to another.

## Functional requirements
1. **Authenticated live connection** — a client opens a persistent live connection and presents its login token as part of the handshake. The server resolves the caller's identity and role from that token and remembers them for the life of the connection, so no later live message has to be trusted on the client's word for who is sending it.
2. **Connections may stay anonymous** — a connection with no valid token is still allowed to exist, but it may take no privileged action; any attempt to subscribe to a room or drive a room event is refused until it authenticates.
3. **Re-authentication on demand** — a client may present a fresh token over the live connection at any time (for example after logging in), and the server updates the remembered identity accordingly.
4. **Token freshness on the live channel** — because a live connection can outlive the token that opened it, the server treats an expired token as no longer authenticated: it refuses privileged actions on an expired connection and proactively drops that connection's privileges at the moment the token lapses, telling the client to re-authenticate rather than trusting a stale identity.
5. **Authorized subscribe to a room** — a client asks to subscribe to a room by its join code. Before it is placed on the room's live channel, the server resolves the room and checks the caller is allowed in: a teacher may subscribe only to a room they own; a student may subscribe to a room that exists and has not ended; a request for an unknown or ended room is refused with a clear reason. Only after this check does the client begin receiving the room's live events.
6. **Membership on student join** — when an authorized student subscribes, they are recorded as a member of that room; teachers are not recorded as members.
7. **Identity-safe join announcement** — after a successful subscribe, the room is told that participation changed, but the announcement carries only the aggregate participant count, never the joining user's identity, so no peer on the channel can harvest who else is present.
8. **Private per-user delivery** — alongside the shared room channel, each authenticated user gets a private channel of their own, so a later feature can deliver something to exactly one user without exposing it to the rest of the room.
9. **Leave** — a client may unsubscribe from a room; a leaving student is removed from membership, and the room is again told the new aggregate participant count.
10. **Room-event plumbing** — the channel carries named live events for a room (a question appearing and ending, counts and results updating, and later transcript, video, and leaderboard events). Events that change what a room is doing may be driven only by that room's owner (verified server-side); students receive these events but cannot originate them.
11. **Content shown to students is minimal** — when a room event carries question content to students, it excludes anything that would reveal the answer; only what a student needs to respond is sent.

## Data handled
- **Input:** a login token at handshake or on demand; a room join code; leave requests; owner-driven room events.
- **Held per connection:** the server-resolved user identity, role, and token expiry, plus which rooms the connection is subscribed to.
- **Emitted:** aggregate participant counts and named room events; no message reveals another user's identity.

## Security requirements
- Identity and role on the live channel are always taken from the verified login token, never from fields the client supplies in an event.
- Subscribing to a room is gated by the room-authorization rule (owner-only for teachers; existing-and-active for students); an unauthorized or expired caller is refused.
- Room-driving events are owner-only and verified against the room's real owner on every event, so a student cannot forge a question, its start/end, or any room state change.
- Join and participation announcements never include a user identity — only aggregate counts — preventing participant-list harvesting by peers.
- Anything pushed to a single user goes over that user's private channel, not the shared room channel.

## Performance & scaling requirements
- Authorization is decided as a fast, self-contained check on the server-held identity, so it can run on every subscribe without cost to the live path.
- The live channel must comfortably carry a large classroom of simultaneous connections, with room events fanned out to all subscribers of a room at once.
- Per-connection bookkeeping (identity, expiry timer, subscriptions) must be cleaned up when a connection closes so nothing accumulates across a long-running session.

## Configuration
- The live channel shares the same identity/token settings as the rest of the application; no separate credentials are introduced here.

## Acceptance criteria
1. A client that presents a valid token at handshake is treated as that authenticated user on the live channel without any extra step.
2. A student holding a room's code can subscribe to that room and immediately begins receiving its live events; a teacher can subscribe only to a room they own.
3. Subscribing to an unknown room, or a student subscribing to an ended room, is refused with a clear reason and no events are received.
4. When a user joins, other subscribers see the participant count change but never see who joined.
5. A student cannot originate a room-driving event; when they attempt one, it is ignored and the room state is unaffected.
6. When a connection's token expires, its privileges are dropped and further privileged actions are refused until it re-authenticates.

## Out of scope (built elsewhere)
- Making live events, shared counters, and coordination work across more than one application instance — **0.4.2**.
- Live transcript delivery — **0.5**; question generation — **0.6**; polling and the live answer flow — **0.7**; results and the leaderboard computation — **0.8**.

# v0.4.2 — Multi-Instance Readiness: Shared Coordination Layer

| Field | Value |
|---|---|
| Version | 0.4.2 |
| Group | 0.4 — Real-Time Foundation |
| Status | Released |
| Goal | Let the application run as several instances behind a load balancer without changing behavior — live events reach every subscriber, shared counters stay global, and coordinated work happens once — while a single instance keeps working with no shared store at all. |

## References & prerequisites
Assumes these earlier chunks are already built:
- **0.1** — application skeleton and configuration loading.
- **0.2** — identity & access foundation and per-caller rate limiting.
- **0.4.1** — the authorized live channel: authenticated connections, room subscription, private per-user delivery, and named room events.

External references the implementing agent should consult: a shared in-memory datastore of its choice that supports pub/sub and atomic single-key operations, and the real-time library's cross-instance adapter.

## Purpose
Once traffic outgrows one process, the application must run as several instances behind a balancer. But subscribers to the same room can land on different instances, per-caller limits would otherwise be counted separately per instance, and some work (a coalesced broadcast, a cached piece of live state) must happen once rather than once per instance. This chunk introduces an optional shared coordination store that solves all three, and — crucially — is not required: with no shared store present the application runs correctly as a single instance, with identical behavior for users.

## Functional requirements
1. **Optional shared store** — on startup the application looks for a shared coordination store. If one is configured and reachable, it runs in multi-instance mode; if it is absent, unreachable, or fails to connect, the application logs the fact and runs in single-instance mode instead of failing.
2. **Cross-instance live delivery** — in multi-instance mode, a room event emitted on one instance reaches every subscriber of that room no matter which instance they are connected to, and a message sent to a user's private channel reaches them wherever they are connected. In single-instance mode the same emits reach every locally connected subscriber directly.
3. **Shared rate-limit counters** — in multi-instance mode the per-caller limits from earlier chunks count against a shared tally, so a limit means the same thing no matter which instance served the request; without the store, each instance keeps its own in-memory tally, which is correct for a single instance.
4. **Coordinated single-run work** — where a piece of repeated live work should happen once per time window rather than once per instance (for example a debounced broadcast that would otherwise be duplicated by every instance), the shared store is used to elect a single runner for that window; without the store, one instance is the only runner and no election is needed.
5. **Shared live-state cache** — a small, frequently-read piece of per-room live state may be cached in the shared store so any instance reads a consistent value without a database round-trip; the value has a single defined writer and is cleared when it no longer applies, so no instance can resurrect a stale value.
6. **Pure optimization, never a dependency** — every use of the shared store degrades cleanly to the underlying source of truth when the store is absent or momentarily unavailable, so the store's presence changes performance and reach, never correctness. A failed store operation is non-fatal and falls through to the direct path.
7. **No user-visible difference** — a user cannot tell whether they are served by one instance or several; the live experience, the limits they hit, and the events they receive are the same either way.

## Data handled
- **Held in the shared store (multi-instance only):** transient live-event routing between instances, shared rate-limit tallies keyed per caller, single-runner election markers per work window, and a short-lived per-room live-state value.
- **Source of truth remains elsewhere:** the database stays authoritative for durable state; the shared store holds only transient coordination data, each entry expiring on its own so nothing accumulates.

## Security requirements
- The shared store carries only server-managed coordination data; no client ever reads or writes it directly, and it is reachable only by the application instances, not publicly.
- The authorization decisions from 0.4.1 are unchanged — the shared store affects reach and coordination, never who is allowed on a room channel or which events they may drive.
- Shared rate-limit counters must be attributed to the same caller identity used in single-instance mode, so moving to multiple instances does not loosen any limit.

## Performance & scaling requirements
- Adding instances behind the balancer must increase capacity without multiplying live traffic: an event is delivered once to each subscriber, and coordinated work runs once per window across the whole fleet.
- Shared-store operations on the hot live path must be lightweight (single-key reads, atomic set-if-absent, expiring keys) so coordination never becomes the bottleneck it was meant to relieve.
- If the shared store slows or drops briefly, the application must continue on its direct paths rather than stalling, and recover automatically when the store returns.

## Configuration
- Whether multi-instance mode is active is determined solely by whether a reachable shared store is configured; no separate flag is needed, and its absence is a supported configuration.
- Time-to-live spans for coordination entries (single-run windows and the live-state cache backstop) are tunable, sized to comfortably exceed a normal session so a cached value does not expire mid-use.

## Acceptance criteria
1. With no shared store configured, the application starts, logs single-instance mode, and behaves exactly as in 0.4.1 for every user-facing flow.
2. With a shared store configured and two instances running behind a balancer, a room event emitted on one instance reaches subscribers connected to the other instance.
3. A per-caller rate limit is enforced globally across both instances, not doubled.
4. A debounced broadcast that both instances would schedule fires only once per window.
5. If the shared store is stopped while running, live delivery and limits fall back to the direct path without crashing, and the application recovers when the store is restored.

## Out of scope (built elsewhere)
- The specific live features that ride on this layer — transcript (**0.5**), question generation jobs (**0.6**), polling (**0.7**), and the leaderboard/results computation (**0.8**) — which use the shared store as their backbone but define their own behavior.

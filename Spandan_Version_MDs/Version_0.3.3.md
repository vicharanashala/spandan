# v0.3.3 — Room Lifecycle & Settings

| Field | Value |
|---|---|
| Version | 0.3.3 |
| Group | 0.3 — Rooms & Membership |
| Status | Released |
| Goal | Give a room a lifecycle — active while a session runs, ended once it is over — and a set of per-room settings the owner controls, with the end transition decided by the server rather than trusted from the client. |

## References & prerequisites
Assumes these earlier chunks are already built:
- **0.1** — application skeleton and configuration loading.
- **0.2** — identity & access foundation: Teacher/Student/Admin roles, role-based authorization, the approved-teacher guard, and authenticated user context. These restrictions already exist, so this feature simply applies them.
- **0.3.1** — rooms owned by teachers, join-by-code membership, and the room-owner/member access checks.
- **0.3.2** — the dashboards that surface active vs. ended rooms.

External references the implementing agent should consult: its datastore's atomic-update patterns.

## Purpose
A room is not permanent-on. It runs a live session and then ends. This chunk defines that active/ended state, makes ending authoritative on the server side, and gives the owning teacher a place to tune how the room behaves during a session.

## Functional requirements
1. **Active vs. ended state** — a room is active from creation. It carries both a live/ended flag and the moment it ended; a fresh room is active with no end moment recorded.
2. **Ending a session** — the owning teacher ends the room. When they do, the server stamps the end moment itself; it does not accept an arbitrary "already ended at this time" from the client, and the client cannot mark a room ended without the server recording why.
3. **Ending is one-way** — once a room is ended it cannot be reactivated. An attempt to flip an ended room back to active is refused.
4. **Ended rooms reject new joins** — a student who submits the join code of an ended room is told it has ended and cannot be joined; membership in an ended room is not created.
5. **Per-room settings** — each room carries a settings group the owner can adjust: whether late joins are allowed, whether results show immediately, whether a correct answer is required, the room's capture mode (live audio or video with its source link), and the quiz timing/scoring defaults (time to answer, points, segment length, questions per segment, difficulty, provider, and the question-type mix).
6. **Settings are merged, not replaced** — updating settings changes only the keys the owner supplies and preserves the rest; a partial settings update never silently drops the other settings.
7. **Sensible defaults** — every setting has a default so a room is fully usable the moment it is created, before the owner touches anything.

## Data handled
- **Lifecycle:** the active/ended flag and the recorded end moment, held on the room.
- **Settings:** the per-room settings group described above, held on the room with defaults.
- No new collections are introduced; this chunk extends the room from 0.3.1.

## Security requirements
- Ending a room, and changing its settings, are restricted to the **owning teacher**, using the approved-teacher and room-owner guards from **0.2**/0.3.1.
- The end moment and the ended flag are **server-derived**; the server records the end itself and refuses reactivation, so a client cannot forge an end time or resurrect a closed room.
- Reading lifecycle state and settings follows the same owner-or-member access rule established in 0.3.1.

## Performance & scaling requirements
- The end transition must be a single atomic update so the room cannot be observed half-ended.
- On ending, any caches or derived views that decide whether the room still accepts activity must be invalidated promptly so the ended state takes effect at once, while an unavailable cache never blocks or fails the end itself.
- Lifecycle and settings reads reuse the room indexes from 0.3.1; no additional scans are introduced.

## Configuration
- The default values for each setting (late join, immediate results, required-correct, capture mode, and the quiz timing/scoring defaults) are fixed system defaults, applied at room creation and overridable per room by the owner.

## Acceptance criteria
1. A newly created room is active with no end moment; its settings carry system defaults.
2. Only the owning teacher can end the room; when they do, the server records the end moment and the room shows as ended.
3. An ended room cannot be reactivated, and a student submitting an ended room's code is refused with an "ended" message.
4. Changing one setting leaves the others untouched.
5. A client that supplies its own end time or tries to set the ended flag directly does not thereby control when or whether the room ends — the server decides.

## Out of scope (built elsewhere)
- The real-time notification broadcast to participants when a room ends — **0.4**.
- Recomputing and settling final results/leaderboard at end of session — **0.8**.
- The meaning of the quiz timing/scoring settings during live polling — **0.7**.

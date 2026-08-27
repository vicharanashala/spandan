# v0.3.1 — Rooms & Joining by Code

| Field | Value |
|---|---|
| Version | 0.3.1 |
| Group | 0.3 — Rooms & Membership |
| Status | Released |
| Goal | Let a teacher create a room that carries a short, shareable join code, and let a student turn that code into membership — with the room owned by, and manageable only by, the teacher who created it. |

## References & prerequisites
Assumes these earlier chunks are already built:
- **0.1** — application skeleton and configuration loading.
- **0.2** — identity & access foundation: Teacher/Student/Admin roles, role-based authorization, the admin teacher-approval gate (the reusable **approved-teacher** guard), and authenticated user context on every request. These restrictions already exist, so this feature simply applies them.

External references the implementing agent should consult: its datastore's uniqueness/indexing guarantees and its framework's request-authorization patterns.

## Purpose
A room is the container everything else in Spandan hangs off. This chunk establishes the room itself — created by a teacher, owned by that teacher, and reachable by students through a human-friendly join code rather than an internal identifier.

## Functional requirements
1. **Create a room** — an approved teacher creates a room by giving it a name. The system assigns the room a short, unambiguous join code automatically; the teacher never types the code.
2. **Unique, shareable code** — every room's code is unique across the system and drawn from characters that are easy to read aloud and type (no visually confusing characters). The code is what a teacher shares with a class.
3. **Ownership is recorded at creation** — the creating teacher is permanently recorded as the room's owner. Ownership is not something the client asserts on later requests; it is read from the stored room.
4. **Join by code** — a student submits a join code. If a room with that code exists and is still joinable, the student becomes a **member** of that room. Joining is idempotent: submitting the same code again simply reaffirms membership rather than creating duplicates or failing.
5. **View a single room** — a teacher who owns a room, or a student who is a member of it, may retrieve that room's details. Anyone else is refused.
6. **Manage-only-if-owner** — updating or deleting a room is allowed only for the teacher who owns it; no other teacher, and no student, may manage a room they do not own.
7. **Look up by code** — the system can resolve a code to its room case-insensitively, so a student typing lower- or mixed-case still reaches the right room.

## Data handled
- **Room:** a name, its owning teacher, its unique join code, and creation/update timestamps.
- **Membership:** a link between one student and one room, with the time they first joined; at most one such link per student per room.
- No poll, response, or transcript data is introduced here.

## Security requirements
- Creating a room requires an **approved teacher**, using the approved-teacher guard from **0.2** — no student, and no unapproved teacher, may create a room.
- Joining by code requires an authenticated **student**.
- Reading a room is restricted to its **owning teacher** or a **member student**; the room-owner guard from 0.2 supplies the ownership check.
- Updating or deleting a room is restricted to the **owning teacher**. A room's owner can never be reassigned by a request.
- A join code identifies a room but grants no authority on its own: possessing a code lets a student join, never manage.

## Performance & scaling requirements
- Code lookups and ownership checks must be served by indexes, not full scans, so joining and access checks stay fast as the number of rooms grows.
- Membership must be uniquely constrained per student-per-room so repeated joins cannot create duplicate records under concurrency.
- Teacher room-list queries (a teacher's own rooms, newest first) must be index-backed.

## Configuration
- The code length and its readable character set are fixed properties of the system; no per-request tuning is required.

## Acceptance criteria
1. An approved teacher creates a room by name and receives a room bearing an automatically assigned, unique code.
2. A student who submits that code becomes a member and can retrieve the room; submitting it a second time succeeds without creating a duplicate membership.
3. A student submitting a code that matches no room is told the room was not found.
4. A teacher who does not own a room, and any student who is not a member, is refused when trying to read or manage it.
5. Only the owning teacher can update or delete the room.

## Out of scope (built elsewhere)
- Teacher and student dashboards that list these rooms — **0.3.2**.
- Starting/ending a session, ended-state gating of joins, and per-room settings — **0.3.3**.
- Real-time presence and live participant counts — **0.4**.

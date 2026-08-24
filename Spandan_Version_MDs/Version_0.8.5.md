# v0.8.5 — Research Export API

| Field | Value |
|---|---|
| Version | 0.8.5 |
| Group | 0.8 — Scoring, Leaderboard & Results |
| Status | Released |
| Goal | Expose a read-only, key-gated endpoint that lets an authorised researcher pull ended-session results across all rooms for study analysis — refusing all access when its key is not configured, and never opening on a guessable default. |

## References & prerequisites
Assumes these earlier chunks are already built:
- **0.2** — identity & access: the teacher/student login lane, kept intentionally separate from this research lane.
- **0.3.x** — rooms owned by teachers, each recording when it ended.
- **0.8.1 / 0.8.2 / 0.8.3 / 0.8.4** — scoring, the ranked board, the single-pass results build shared by the results pages and the teacher CSV, and the export's cell conventions this API mirrors.

## Purpose
A collaborating researcher needs to pull session results on a schedule and join them against a separate dataset by student email. This chunk provides a dedicated, read-only export lane for that purpose: it reads across every teacher's ended sessions but exposes nothing except these export results, and it is locked behind a single shared secret so it is not reachable by ordinary users.

## Functional requirements
1. **Key-gated export** — a caller presents a shared research key on the request; only a request whose key matches exactly is served. This lane is separate from the teacher/student login and offers only read-only export routes.
2. **Sessions export** — return ended sessions, each carrying: a chronological question legend (first asked is the first column) with each question's text, type, response count, and correct-rate; and one row per student with points, rank, a correct tally, accuracy, and a per-question map of correct / incorrect / did-not-answer.
3. **Full population** — unlike the teacher CSV (which lists only students who answered), the research population is everyone who joined the room combined with anyone who answered: a joined-but-silent student appears as a no-show row (zero points, no rank, empty answers) so every student in the room is accounted for. Responders are ranked first, no-shows follow.
4. **Incremental pull** — the caller may pass a cursor so only sessions that ended after it are returned, oldest-first, along with the next cursor to store and pass on the following run. This gives gap-free, duplicate-free pulls that self-heal if a run is missed.
5. **Session filtering** — the caller may narrow to sessions by a name pattern or a named preset (for example an evening-session window), and cap how many sessions a single pull returns.
6. **Same-source guarantee** — each session is built from the same single-pass results computation that backs the teacher's download and the results page, so the exported numbers match them exactly.

## Data handled
- **Input:** the research key on the request; optional cursor, filters, and a per-pull limit.
- **Output:** per session — its identity and end date, a question legend, and a per-student result matrix; plus a count and the next cursor.
- **Personal data:** student identity is exported as the raw email so the researcher can join it against their own dataset. This shares personal data and must be covered by the study's consent / data-sharing agreement; the research key is what secures the lane.

## Security requirements
- Access is gated by a constant-time comparison of the presented key against the configured key, so the check does not leak the key through timing.
- The endpoint fails closed: if the research key is not configured, the lane is disabled entirely and every request is refused — it never falls back to a blank or default key, so a missing or empty setting can never leave it open.
- A request with a missing or wrong key is rejected; only an exact match proceeds.
- The lane is strictly read-only and exposes only these export routes; it grants no write access and no access to anything beyond ended-session results.
- Because it reads across all teachers' rooms and returns student emails, the key is the sole boundary protecting that personal data and must be held only by the authorised researcher.

## Performance & scaling requirements
- Each pull is bounded by a per-request session limit so one call cannot fan out over the entire history at once.
- The incremental cursor lets a scheduled caller pull only what is new each run, keeping steady-state pulls small.
- Sessions are built from the existing single-pass results computation, adding no new heavy per-question or per-student query loops.

## Configuration
- The shared research key. When unset, the export lane is entirely disabled (fail closed).
- Default per-pull session limit and its hard ceiling; the recognised session filters and presets.

## Acceptance criteria
1. A request carrying the correct research key returns ended sessions, each with a chronological question legend and one row per student including a per-question correct/incorrect/no-answer map.
2. Joined-but-silent students appear as no-show rows; responders are ranked first, no-shows after.
3. Passing a cursor returns only sessions ended after it, oldest-first, with a next cursor for the following run.
4. A request with a missing or wrong key is refused.
5. With the research key not configured, every request is refused and the lane is disabled — it never serves with a default or blank key.
6. The exported numbers for a session match that room's teacher download and results page.

## Out of scope (built elsewhere)
- Scoring, the board, the results snapshot, and the teacher CSV — **0.8.1 / 0.8.2 / 0.8.3 / 0.8.4**.
- Sign-in methods and production hardening — **0.9 / 1.0**.

# v0.8.1 — Time-Decay Scoring

| Field | Value |
|---|---|
| Version | 0.8.1 |
| Group | 0.8 — Scoring, Leaderboard & Results |
| Status | Released |
| Goal | Award points for each answer server-side, so that a faster correct answer earns more than a slower one, always within a fair capped range, and never trusts the client's arithmetic. |

## References & prerequisites
Assumes these earlier chunks are already built:
- **0.2** — identity & access foundation: Teacher/Student/Admin roles and role-based authorization. Only a student may submit an answer, and only for their own identity.
- **0.3.x** — rooms owned by teachers, with a live-room concept and a membership roster.
- **0.7** — answered polls and recorded responses: a student submitting an answer to a live poll, with the answer persisted exactly once per student-per-question.

## Purpose
Turn each recorded answer into a score. Correctness alone is not enough: to reward attentiveness, a correct answer given quickly is worth more than the same answer given slowly. All of this is decided by the server at the moment the answer is recorded, so the stored score can be trusted as the basis for the leaderboard, results, and exports built in later chunks.

## Functional requirements
1. **Correctness decision** — when an answer arrives, the server decides whether it is correct by comparing the student's selection against the question's own correct options. Single-answer questions are correct when the one chosen option is the correct one; multi-answer questions are correct only when every correct option is selected and no incorrect option is selected.
2. **Time-decay points** — a correct answer earns points scaled by how much of the allowed answering time was left when it was submitted: answering with more time remaining earns more. The scale runs from the question's configured maximum down to a small guaranteed floor, so even a correct answer given at the last moment still earns a modest share rather than nothing.
3. **Zero for wrong** — an incorrect answer earns no points.
4. **Server-computed timing** — the amount of time used is derived from the timing the student's answer reports, but the server decides the score. A reported timing that is impossible or out of the valid range (for example negative, or larger than the allowed window) is treated as the slowest possible answer, so it collapses to the floor rather than inflating the score.
5. **Hard cap** — regardless of any factor, the points stored for a single answer can never exceed the question's configured maximum nor drop below zero.
6. **Immediate acknowledgement, withheld correctness** — the student's submission is acknowledged at once, but while the session is live the acknowledgement does not reveal whether the answer was correct or how many points it earned; the score is still computed and stored. Correctness is surfaced only later, through the results path once the poll is no longer live.

## Data handled
- **Input:** the room, the question, the student's selected option(s), and the client-reported answering time.
- **Output / stored:** per answer — whether it was correct, the validated time used, and the earned points, alongside the recorded response from 0.7.
- Each question carries its own maximum points and its allowed answering time.

## Security requirements
- Only an authenticated student may submit an answer, and only as themselves; a student cannot submit on behalf of another.
- A student may submit only to a room they have joined.
- Scoring is performed entirely on the server. The client-reported timing is an untrusted hint, never the score; a forged or out-of-range timing can only reduce the award to the floor, never raise it.
- While a poll is live, the correctness and points of a just-submitted answer are withheld from the submitter, so no one can read the correct answer straight from the acknowledgement and relay it.

## Performance & scaling requirements
- Scoring must add no heavy work to the answer path: correctness and points are computed from the question and the submitted selection alone, with no extra room-wide scans.
- The answer path runs on every student answer and, during a synchronized burst, on hundreds of concurrent submissions; the question needed for scoring may be served from a short-lived cache since an approved, live question does not change while it is being answered.
- Recording remains exactly-once per student-per-question, so a duplicate submission is rejected and can never be double-scored.

## Configuration
- Each question's maximum points and allowed answering time (set when the question is authored/launched) drive the scale.
- The floor share that a correct-but-slow answer is guaranteed is a fixed fraction of the maximum.

## Acceptance criteria
1. A correct answer submitted with most of the time remaining earns close to the question's maximum; the same correct answer submitted near the deadline earns close to the floor, never zero.
2. An incorrect answer earns zero points.
3. An answer reporting an impossible timing (negative or beyond the window) is scored as if it were the slowest possible answer, not the fastest.
4. No stored answer is ever worth more than the question's maximum or less than zero.
5. While the session is live, the submitter's acknowledgement does not disclose correctness or points, yet the score is present in storage.

## Out of scope (built elsewhere)
- Ranking students by their accumulated points — **0.8.2**.
- End-of-session results and statistics pages — **0.8.3**.
- Teacher CSV export and the research export API — **0.8.4 / 0.8.5**.

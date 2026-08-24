# v0.8.3 — Results & Statistics Pages

| Field | Value |
|---|---|
| Version | 0.8.3 |
| Group | 0.8 — Scoring, Leaderboard & Results |
| Status | Released |
| Goal | After a session ends, show each student their own per-question results and the teacher the room-wide statistics, serving the whole room from one shared end-of-session snapshot so a stampede of results-page loads cannot overwhelm the server. |

## References & prerequisites
Assumes these earlier chunks are already built:
- **0.2** — identity & access: roles and role-based authorization; owner-only guards for a teacher's own room.
- **0.3.x** — rooms owned by teachers, with a roster and an ended-room concept (a room carries when it ended).
- **0.4.x** — a shared coordination layer available across instances.
- **0.7** — recorded responses per student per question.
- **0.8.1 / 0.8.2** — per-answer scoring and the ranked board (the board comes from the single shared implementation of 0.8.2).

## Purpose
When a room ends, everyone opens the results at once: each student wants their own answered/unanswered breakdown and score, and the teacher wants the class-wide picture. Computing all of that per request means the same expensive room-wide reads land many times in one narrow window and can spike the server. Because an ended room's data no longer changes, this chunk computes the whole room's results once and serves everyone from that shared snapshot.

## Functional requirements
1. **Per-student results** — a student sees, for the room, every launched question in a consistent newest-first order, each marked answered or missed; for an answered question, their selection, whether it was correct, and the points earned; plus their overall rank, totals, and average.
2. **Per-room statistics (teacher)** — the room owner sees, per question, the total responses, how many were correct, and the distribution of responses across options, together with room-wide totals: total responses, distinct responders, total joined, and total questions.
3. **End-of-session snapshot** — for an ended room, the entire room's results (the ranked board, every student's per-question breakdown, and the per-question statistics) are computed once, in a single pass, and cached so every subsequent reader is served from it rather than recomputing.
4. **Build-once coordination** — when the snapshot is missing, only one worker builds it while others briefly wait and then read the freshly built copy, rather than each building a duplicate. The snapshot can also be pre-warmed at room end so it is ready before students arrive.
5. **Transparent fallback** — a live room, or any case where the shared snapshot is unavailable, falls straight through to computing that one reader's slice directly; the direct result is identical to the cached one. A cache miss or error is never a broken or wrong result, only a "cache didn't help".
6. **Non-responders handled** — a student who joined but never answered still gets a correct all-unanswered breakdown, computed directly, without bloating the shared snapshot with an entry for every silent participant.
7. **Invalidation** — if an ended room's questions or responses are edited after the fact, its snapshot is dropped so the next read rebuilds from current data.

## Data handled
- **Input:** the room's questions, all recorded responses, the roster count, and the ranked board.
- **Output:** three artifacts per ended room — the ranked board, a per-student per-question breakdown, and per-question statistics with room-wide totals.
- The per-student breakdown and the teacher statistics are derived from a single scan of the room's responses, grouped both per student-and-question and per question.

## Security requirements
- A student may read only their own per-question breakdown for a room they joined; they may not read another student's breakdown.
- The room-wide statistics are restricted to the room's owning teacher.
- While a room is still live, a currently-active poll never reveals its correct answer through the results path — not even to a student who already answered: the correct option and the student's own correctness/points for that live poll are withheld until it is no longer the active poll.
- Serving from the snapshot changes only where the data comes from, never who is allowed to see it; every authorization check applies equally on the cached and direct paths.

## Performance & scaling requirements
- Only ended rooms are snapshotted; a single live viewer is served directly and never triggers a whole-room scan.
- The snapshot collapses roughly three full-room reads per student into one whole-room build shared by all readers, so an end-of-session rush of many simultaneous loads does not multiply into a proportional flood of heavy queries.
- The build is a single pass: one board computation, one questions read, one responses read, one roster count — no per-question or per-student query loops.
- The snapshot is gated on the shared coordination layer being present; without it, every reader simply computes directly (the smaller/single-instance behaviour), with no separate feature switch.
- The cached artifacts are byte-for-byte equivalent to what direct compute would return, so cached and direct readers are indistinguishable.

## Configuration
- Presence of the shared coordination layer decides whether snapshots are used at all.
- How long a built snapshot is retained before it is rebuilt on the next read (an ended room's results do not change, so the retention only bounds staleness of edited rooms and memory use).

## Acceptance criteria
1. A student opening an ended room's results sees every launched question marked answered or missed, with their selection, correctness, points, and rank.
2. The teacher opening the same room sees per-question response counts, correct counts, option distributions, and room-wide totals.
3. With the shared layer present, many simultaneous results-page loads for one ended room are served from a single built snapshot; only one build runs while others wait and read it.
4. With the shared layer absent, the same pages render correctly by direct compute.
5. A joined-but-silent student's results render as all-unanswered.
6. Editing an ended room's data and reloading yields updated results (snapshot rebuilt).

## Out of scope (built elsewhere)
- Per-answer scoring and the ranked board — **0.8.1 / 0.8.2**.
- Teacher CSV export of the complete results — **0.8.4**.
- The key-gated research export API — **0.8.5**.

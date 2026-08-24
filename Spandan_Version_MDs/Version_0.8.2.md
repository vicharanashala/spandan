# v0.8.2 — Live Leaderboard

| Field | Value |
|---|---|
| Version | 0.8.2 |
| Group | 0.8 — Scoring, Leaderboard & Results |
| Status | Released |
| Goal | Rank participants by their accumulated points during a live session and show the standings, updating once per question-segment rather than on every answer, correct across multiple backend instances, and never exposing a person's email as their name. |

## References & prerequisites
Assumes these earlier chunks are already built:
- **0.2** — identity & access foundation: roles and role-based authorization; a student's stored name is distinct from their email.
- **0.3.x** — rooms owned by teachers, with a membership roster and a live-room concept.
- **0.4.x** — authorized live channels: the real-time fan-out used to push updates to a room's participants, backed by a shared coordination layer so many backend instances share one live room.
- **0.8.1** — time-decay scoring: every recorded answer already carries its earned points, correctness, and validated timing.

## Purpose
During a session the class wants to see who is ahead. This chunk turns the per-answer scores from 0.8.1 into a single ranked board for the room and keeps it current as the session proceeds, while keeping the cost bounded and the display honest about who people are.

## Functional requirements
1. **Ranked board** — for a room, produce an ordered standings list of participants by total accumulated points, highest first, with a stable, deterministic tie-break so the same standings never reshuffle arbitrarily between recomputes. Each entry carries the participant's rank, display name, total points, number correct, and number answered.
2. **Per-segment update, not per-answer** — the board is recomputed once per question-segment, when the teacher's question pop-up closes for that segment, rather than on every individual answer. The teacher's side signals that a segment is complete; the server then folds that segment in and broadcasts the refreshed board once.
3. **Stable within a segment** — a request to read the board returns the standings as of the last completed segment fold; simply opening the board does not itself advance the tally, so the board stays steady within a segment and changes only when a fold runs.
4. **Rank on submit** — when a student submits an answer, they are told their current rank as of the most recent segment fold, so they get immediate positional feedback without forcing a full recompute on every answer.
5. **Audience-appropriate visibility** — the room owner sees the full board; a student sees only the leading entries plus their own row (shown after a gap when they fall below the leading group), never the entire board.
6. **Rebuild-safe tally** — the running tally is a cache over authoritative stored answers. Losing it (a restart, an eviction, the first fold, or a coordination-layer hiccup) costs at most one full recomputation from stored answers and never a wrong total. If answers behind an already-counted segment are later removed, the tally detects the inconsistency and rebuilds from scratch.

## Data handled
- **Input:** every room's recorded answers with their points and correctness (from 0.8.1); each participant's stored display name.
- **Output:** the ranked standings list, and a per-student rank lookup for the rank-on-submit feedback.
- A running per-room tally (points, correct count, answered count per student) plus the set of segments already folded in.

## Security requirements
- Only the room's owning teacher, or a student who has joined the room, may read that room's board; anyone else is refused.
- A student is never shown the full board — only the leading entries and their own row.
- The board never displays a person's email as their name: entries are resolved to the stored display name, and a participant without a resolvable name is shown a neutral placeholder, never their email or raw identifier.
- Broadcasts go only to the room's authorized live channel established in 0.4.x.

## Performance & scaling requirements
- The board must not be recomputed on every answer; the cost of a refresh is bounded to one segment's answers, no matter how long the session has run — segments already counted are not re-summed.
- A single shared implementation produces the board for the live broadcast, the on-demand read, and later the results snapshot, so these can never diverge in shape or ranking.
- The design must work correctly across multiple backend instances: the running tally lives in the shared coordination layer so every instance sees the same totals, and concurrent folds converge on the same next state (each fold works from a copy and the last write is harmless). Cross-instance coordination of a fold is a best-effort optimisation, never required for correctness.
- Name resolution is a single batched lookup for the whole board, never one lookup per participant.

## Configuration
- How many leading ranks are shown publicly to students (the rest see only their own row); this cutoff is a single knob shared by the live broadcast and the on-demand read.
- A short delay used to coalesce a segment's completion signal so a burst of near-simultaneous closes triggers a single fold and broadcast.
- A bound on how long the running tally is retained before it is considered stale (it is always rebuildable).

## Acceptance criteria
1. Answers accumulate into a ranked board ordered by total points, with a stable tie-break; two participants on equal points always order the same way.
2. The board refreshes once when a segment completes, not on each answer, and stays unchanged when merely read between folds.
3. A student sees only the leading ranks plus their own row; the teacher sees everyone.
4. No entry ever shows an email in place of a name; a participant with no stored name shows a neutral placeholder.
5. Running two backend instances, both serve the same standings; clearing or losing the tally yields the same board after one rebuild.
6. On submitting an answer, a student receives their current rank without triggering a full recompute.

## Out of scope (built elsewhere)
- The per-answer scoring that feeds the totals — **0.8.1**.
- End-of-session results and statistics pages served from a snapshot — **0.8.3**.
- Teacher CSV export and the research export API — **0.8.4 / 0.8.5**.

# v0.7.5 — Answer Integrity

| Field | Value |
|---|---|
| Version | 0.7.5 |
| Group | 0.7 — Live Polling |
| Status | Released |
| Goal | Keep live polling honest: withhold the correct answer from students until a poll is no longer live, refuse late back-fill answers once a poll has been superseded, and validate reported timing so points can never be inflated. |

## References & prerequisites
Assumes these earlier chunks are already built:
- **0.2** — identity & access and role-based authorization.
- **0.4.x** — the shared coordination layer used to hold a room's current live-poll state across instances.
- **0.7.1 / 0.7.2 / 0.7.3** — launching and marking the current live poll, recording answers, and type-aware scoring.

## Purpose
Close the ways a live poll could be gamed. A student must not be able to learn the correct answer while the poll is still live, must not be able to answer a poll that has already moved on, and must not be able to forge their timing to earn more points than they honestly could.

## Functional requirements
1. **Correct answer withheld while live.** For the room's current live poll, the correct-option marker is withheld from every student, including one who has already answered — nothing a student can fetch or inspect reveals which option is right while that poll is live. It is revealed only once the poll is no longer the live one (the next launch supersedes it, or the room ends).
2. **Own result withheld while live.** A student's own correctness and earned points for the live poll are also withheld until it is no longer live, so a student cannot deduce the answer from their own immediate result and relay it.
3. **The live poll is the answerable one.** The room's marked current live poll is the poll students may answer. This marker is the single authoritative "which poll is live" signal, independent of any per-student countdown.
4. **Superseded polls close to back-fill.** When a new poll is launched, the poll it replaces is closed to new answers after a short grace period that covers genuinely in-flight submissions. Once that grace passes, the server refuses any further answer to the superseded poll, so a late or automated client cannot back-fill answers to polls that have already moved on.
5. **Ended room refuses answers.** Once a room has ended, no poll in it accepts new answers.
6. **Reported timing is validated.** A student reports how long they took; a genuine value falls within the poll's allowed answering window. A value outside that range is treated as the slowest allowed answer rather than being trusted, so a forged short time can never earn a bonus and a forged negative time can never inflate the score.
7. **Points are capped to the allowed range.** A single answer's earned points are always confined between zero and the question's configured maximum, no matter what the timing factor or any upstream change would otherwise produce. A correct answer that runs the clock down still keeps a small floor of the maximum; an incorrect answer earns nothing.

## Data handled
- **Live-state signal:** the room's current live poll and whether the room has ended, held so the answer path can check answerability without a fresh database read per submit.
- **Per-poll close time:** the moment a superseded poll stops accepting answers.
- **Per-answer timing:** the student's reported answering time, validated against the poll's window before it affects points.

## Security requirements
- No path — the immediate submit acknowledgement, a student's own read-back, or the live poll's broadcast — exposes the correct answer or the student's own correctness/points while that poll is live.
- A poll that is not the room's current live poll, and is past its grace close time, is refused for all new answers; so is any poll once the room has ended.
- Reported timing is never trusted blindly: an out-of-range value is clamped to the least-rewarding case, and stored points are hard-bounded to the valid range regardless of the computed factor.
- One-answer-per-student-per-question (from 0.7.2) still holds, so closing back-fill and capping points compound with dedup rather than replacing it.

## Performance & scaling requirements
- The answerability check reads the shared live-state signal rather than the database on the common path, so it stays cheap under a synchronized answer burst.
- The extra freshness read used to confirm a superseded poll's close time is taken only on the uncommon path where the submitted poll is not the current live one, keeping the hot path a single small read.
- All withholding and clamping are simple server-side operations that add no material per-submit cost.

## Configuration
- The grace period a superseded poll stays open to in-flight answers is configurable.
- The shared live-state signal has a backstop lifetime that comfortably exceeds a session and is refreshed on each launch.

## Acceptance criteria
1. While a poll is the room's live poll, no student — including one who already answered — can obtain the correct option or their own correctness/points for it through any path; these appear only once it is superseded or the room ends.
2. After a new poll is launched and the grace period passes, an attempt to answer the previous poll is refused.
3. Once a room has ended, no answer to any of its polls is accepted.
4. A response reporting a time outside the poll's window is scored as the slowest allowed answer, and no stored answer's points ever exceed the question's maximum or fall below zero.

## Out of scope (built elsewhere)
- Revealing the answer and full results after a poll closes — **0.8**.
- The per-poll and per-segment countdowns themselves — **0.7.4**.
- A teacher composing a poll by hand — **0.7.6**.

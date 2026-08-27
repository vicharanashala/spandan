# v0.7.4 — Segment-Timer Automation

| Field | Value |
|---|---|
| Version | 0.7.4 |
| Group | 0.7 — Live Polling |
| Status | Released |
| Goal | Drive polling from the lecture's rhythm: divide a live session into timed segments, and give each launched poll its own answering window that opens and closes on its own, so the teacher does not have to hand-time every poll. |

## References & prerequisites
Assumes these earlier chunks are already built:
- **0.2** — identity & access and role-based authorization.
- **0.3.x** — rooms and their live sessions.
- **0.5.x / 0.6.x** — the recording-and-generation flow that produces questions from a segment of a lecture.
- **0.7.1 / 0.7.2 / 0.7.3** — launching a poll, recording answers, and single/multi-select scoring.

## Purpose
Pace a live session automatically. While a lecture is being captured, time runs in fixed-length segments; when a segment's time elapses, the session moves on to producing and reviewing that segment's questions. Separately, each poll a student receives carries a per-question answering countdown that closes their answering window on its own.

## Functional requirements
1. **Segmented session clock.** During a live capture the session is divided into segments of a configured length. A visible countdown tracks the time left in the current segment for the teacher.
2. **Automatic segment turnover.** When a segment's countdown reaches zero, the session automatically ends that segment's capture, hands its material off for question production and review, and prepares the next segment — without the teacher having to stop and start each one by hand.
3. **The clock yields to review.** While the teacher is reviewing a segment's questions, the segment countdown does not advance; it resumes for the next segment once review is done, so review time is never eaten by the clock.
4. **Pause and resume.** The teacher can pause and resume the segment clock, and it continues from where it was rather than restarting, so an interruption does not distort segment lengths.
5. **Per-poll answering window.** Each launched poll carries its own answering time budget. On the student's side a countdown for that poll runs down and, at zero, closes that student's answering window for it, so a poll self-closes without the teacher ending it manually.
6. **Answering time reflects only thinking time.** The time a student is credited with taking is measured from when they receive the poll to when they commit their choice, so it reflects how quickly they answered, independent of any later processing.
7. **Segment boundary drives results folding.** Completing a segment's questions is the natural point at which that segment's answers are folded into the running results, so results advance segment by segment rather than on every single answer.

## Data handled
- **Input:** the configured segment length and each poll's answering time budget.
- **Tracked live:** the remaining time in the current segment (teacher side) and the remaining time in each poll's answering window (student side).
- **Derived:** the per-poll thinking time credited to a student's response.

## Security requirements
- Only the room's owning teacher controls the segment clock and triggers segment turnover; a student cannot advance, pause, or skip segments.
- A poll's answering window closing on the student side is a convenience, not the security boundary: what a student is allowed to submit is still enforced on the server (see 0.7.5), so a manipulated client countdown cannot extend a student's real ability to answer.

## Performance & scaling requirements
- Each participant runs their own poll countdown locally, so the timed windows add no per-tick server work and scale with no server cost as the room grows.
- Folding results at segment boundaries, rather than on every answer, keeps result updates coalesced and avoids a burst of recomputation during a synchronized answer rush.

## Configuration
- The segment length and the default per-poll answering time budget are configurable per room; a poll may carry its own answering budget overriding the room default.

## Acceptance criteria
1. During a live capture, the segment countdown runs down and, at zero, the session automatically closes that segment and moves to producing/reviewing its questions.
2. While the teacher reviews a segment's questions, the segment clock holds and then resumes for the next segment.
3. Pausing and resuming the segment clock continues from the paused time rather than restarting.
4. A launched poll's answering countdown runs down on the student's side and closes their answering window at zero, and the credited answering time reflects the interval from receiving the poll to committing the answer.

## Out of scope (built elsewhere)
- Server-side enforcement that a closed or superseded poll refuses late answers — **0.7.5**.
- Producing the questions for a segment — **0.5.x / 0.6.x**.
- Computing and broadcasting the ranked results at each fold — **0.8**.

# v0.7.6 — Manual Teacher-Authored Polling

| Field | Value |
|---|---|
| Version | 0.7.6 |
| Group | 0.7 — Live Polling |
| Status | Released |
| Goal | Let a teacher write a poll by hand and launch it live, so polling does not depend on recording or generation. |

## References & prerequisites
Assumes these earlier chunks are already built:
- **0.2** — identity & access foundation, role-based authorization, and the approved-teacher guard.
- **0.3.x** — rooms owned by teachers.
- **0.6.5** — persisting an approved question with its type, options, and correct-option markers.
- **0.7.1 / 0.7.2 / 0.7.3 / 0.7.5** — launching a poll, recording answers, type-aware scoring, and answer integrity.

## Purpose
Give the teacher a direct authoring path: compose a question, its options, and its correct answer(s) themselves, then launch it to the live room exactly like a generated one — with no recording, transcript, or generation step involved.

## Functional requirements
1. **Compose a poll by hand.** The room's owning teacher can write a question directly: its text, its options, which option(s) are correct, its type (single- or multi-select), its answering time budget, and its point value.
2. **Same approved shape.** A manually authored poll is stored as an approved question of the room, identical in form to a generated-and-approved one, so everything downstream treats the two the same.
3. **Launch like any other poll.** Once composed, the poll launches to the live room through the same launch-and-broadcast path as a generated poll, becoming the room's current live poll, with answer-revealing content stripped from what students receive.
4. **No dependency on capture or generation.** Manual authoring works whether or not a lecture is being recorded and whether or not any generation has ever run in the room, so a teacher can run a session entirely by hand.
5. **Consistent answering and integrity.** Students answer, are scored by type, and are protected by the same answer-integrity rules as any other poll; nothing about the manual origin weakens dedup, withholding, back-fill closing, timing validation, or the points cap.

## Data handled
- **Input:** the teacher-authored question text, its options, its correct-option markers, its type, its answering time budget, and its point value; the room and the teacher's authenticated identity.
- **Stored:** an approved question of the room, in the same form as a generated-and-approved one.
- **Broadcast on launch:** the same answer-stripped question students receive for any launched poll.

## Security requirements
- Only the room's owning, approved teacher may author and launch a manual poll into it; a student, a non-owner teacher, or an unapproved teacher cannot.
- The correct-option markers the teacher supplies are stored server-side and stripped from the student broadcast, so a manually authored poll never leaks its answer any more than a generated one.
- Correctness and points for answers to a manual poll are decided server-side by the same type rules, never asserted by a client.

## Performance & scaling requirements
- A manual poll adds no new live-path cost: it reuses the existing launch, broadcast, answering, and scoring paths, so it scales exactly as a generated poll does.
- Authoring a poll is a one-off teacher action off the hot answer path and imposes no per-student cost.

## Configuration
- The manual poll's answering time budget and point value default to the room's settings when the teacher does not override them.

## Acceptance criteria
1. The owning teacher can compose a question with options and correct answer(s), and it is stored as an approved question of the room in the same form as a generated one.
2. Launching a manually authored poll makes it the room's current live poll and broadcasts it to students with the correct answer stripped, exactly like a generated poll.
3. A teacher can author and run a poll with no recording or generation having taken place in the room.
4. Students answering a manual poll are scored by type and protected by the same answer-integrity rules as any other poll.

## Out of scope (built elsewhere)
- Generating questions from a transcript or pasted text — **0.6.x**.
- The launch/broadcast, answering, scoring, and integrity mechanics themselves — **0.7.1–0.7.5**.
- Results, counts, and the ranked leaderboard — **0.8**.

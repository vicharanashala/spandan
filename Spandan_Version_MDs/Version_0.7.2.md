# v0.7.2 — Student Answering & Response Recording

| Field | Value |
|---|---|
| Version | 0.7.2 |
| Group | 0.7 — Live Polling |
| Status | Released |
| Goal | Let a joined student answer the live poll once, record that answer under their own identity, and let each student read back only their own responses. |

## References & prerequisites
Assumes these earlier chunks are already built:
- **0.2** — identity & access foundation: Teacher/Student/Admin roles and role-based authorization.
- **0.3.x** — rooms owned by teachers, with student membership recorded when a student joins by code.
- **0.7.1** — launching a poll into a room and marking it as the room's current live poll.

## Purpose
Capture a student's answer to the live poll: accept it once, store it against that student, that question, and that room, and give the student an immediate acknowledgement — while ensuring no student can see another student's answers.

## Functional requirements
1. **Answering is student-only and self-only.** A response is submitted by an authenticated student, and it is always recorded under that student's own identity taken from their session — never under an identity supplied in the request.
2. **Membership required.** A student may answer only in a room they have joined. A submission from a non-member is refused.
3. **One answer per student per question.** Each student may have at most one recorded response to a given question in a given room. A second submission to the same question is rejected as already answered; the earlier answer stands and is never overwritten or double-counted.
4. **What is recorded.** Each response stores the room, the question, the student, the option(s) they chose, whether it was correct, how long they took to answer, and the points earned. Correctness and points are decided by the server, never trusted from the client.
5. **Immediate, answer-safe acknowledgement.** On a successful submit the student receives confirmation and their standing (their current rank and the participant count), but not whether they were right or how many points they earned — those are withheld while the session is live so a student cannot learn the answer the instant they submit.
6. **Own-only read-back.** A student may read back the responses for a room, but only their own. Any attempt to read another student's responses, or to read a room's responses without narrowing to oneself, returns only that student's own data.
7. **Teacher read of the room.** The room's owning teacher may read the responses for their room, either across all students or narrowed to one student; a non-owner cannot.

## Data handled
- **Input:** the room, the question, the chosen option(s), and the student's reported answering time; the student's identity comes from their authenticated session.
- **Stored:** one response per student per question — the selection(s), server-decided correctness, answering time, and points.
- **Returned on submit:** confirmation plus the student's rank and participant count; correctness and points are withheld while live.
- **Returned on read-back:** for a student, only their own responses; for the owning teacher, the room's responses.

## Security requirements
- The stored student identity is always the authenticated submitter; a client cannot record an answer as someone else.
- A student may read only their own responses. A read that omits or spoofs the target student must never fall through to returning every student's data — a student is always confined to their own.
- Only the room's owning teacher may read across students; students and non-owner teachers cannot.
- Correctness and earned points are computed and stored server-side; the client cannot assert either.

## Performance & scaling requirements
- The answer path runs on every student submit, so under a synchronized burst it faces hundreds of near-simultaneous submissions; it must stay cheap per request.
- Uniqueness of one-answer-per-student-per-question is enforced by the datastore itself, so a duplicate is rejected without a separate check-then-write step that could race under load.
- Confirming room membership and reading the question for scoring should avoid a fresh database round-trip on every submit where the underlying facts are stable during a live poll, while never wrongly refusing a student who just joined.

## Configuration
- The bounds used to keep membership and question lookups fresh-enough while cached are tunable, defaulting to short windows that keep staleness benign.

## Acceptance criteria
1. A joined student submits an answer once and it is recorded under their own identity, with correctness and points decided by the server.
2. A second submission to the same question by the same student is refused as already answered, and the first answer is unchanged.
3. A student who has not joined the room cannot submit an answer to it.
4. A student reading responses for a room receives only their own; an attempt to read another student's responses is refused or confined to their own.
5. The owning teacher can read the room's responses across students; a non-owner cannot.

## Out of scope (built elsewhere)
- How single- versus multi-select answers are matched and scored — **0.7.3**.
- Closing a superseded poll to late/duplicate back-fill and validating reported answering time — **0.7.5**.
- Aggregated results, per-question counts, and the ranked leaderboard — **0.8**.

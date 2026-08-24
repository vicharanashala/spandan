# v0.7.1 — Launch & Broadcast a Poll to a Live Room

| Field | Value |
|---|---|
| Version | 0.7.1 |
| Group | 0.7 — Live Polling |
| Status | Released |
| Goal | Let a room-owning teacher push an approved question to everyone in a live room at once, so it appears instantly as the active poll — without ever exposing which answer is correct. |

## References & prerequisites
Assumes these earlier chunks are already built:
- **0.2** — identity & access foundation: Teacher/Student/Admin roles, role-based authorization, and the reusable **approved-teacher** guard.
- **0.3.x** — rooms owned by teachers, each with a shareable join code and a live/ended lifecycle.
- **0.4.x** — the realtime layer: authorized per-room live channels a teacher and their joined students share, with server-verified membership, and the shared coordination layer that lets the same channel span multiple application instances.
- **0.6.5** — teacher review and approval of questions, so a question reaches "approved" before it can be launched.

## Purpose
Turn an approved question into the room's live poll. When a teacher launches, every joined student sees the same question appear at the same moment through the room's live channel, while the teacher sees it too for their own timing view.

## Functional requirements
1. **Launch is owner-only.** Only the teacher who owns the room may launch a poll into it. The server confirms ownership from the requester's authenticated identity, never from anything the client claims, before the poll reaches any student.
2. **Broadcast to the room.** On launch, the question is pushed over the room's live channel to all joined participants at once, so no student has to poll or refresh to receive it.
3. **Mark the current poll.** Launching records which question is now the room's single live poll. This marker is the authoritative "this poll is live" signal for the whole room; it stays set to that question until the next launch replaces it or the room ends.
4. **Answer-revealing content is stripped before broadcast.** The copy of the question sent to students omits which option is correct and any explanation. The option set, their order, and their count are preserved so students can answer by position, but nothing a student receives tells them the answer.
5. **Relaunch is allowed.** A teacher may launch the same or a new approved question again; the newest launch becomes the current live poll for the room.
6. **The teacher's own view is unaffected by stripping.** The teacher shows the poll and its timing from their own local copy, so removing answer content from the student broadcast never hides anything from the teacher.

## Data handled
- **Input:** the identity of an approved question to launch and the room to launch it into; the teacher's authenticated identity and the room's join code identify the target channel.
- **Broadcast:** the question text, its options (order preserved), and its answering time budget — with the correct-answer marker and explanation removed.
- **Recorded:** the room's current-live-poll marker is updated to this question.

## Security requirements
- Every launch path is restricted to the room's owning teacher; a student, a non-owner teacher, or an unauthenticated caller cannot launch a poll or push a question onto a room's channel.
- The broadcast a student receives must never contain the correct-answer marker or explanation, so a student inspecting the live channel's traffic learns nothing about the answer.
- Only participants authorized onto the room's live channel receive the broadcast; the poll is not visible outside that room.

## Performance & scaling requirements
- A launch reaches all joined students in one broadcast, not one delivery request per student.
- The broadcast must span all application instances, so a student connected to a different instance than the teacher still receives the launched poll.
- Marking the current live poll must also refresh the shared live-state signal the answering path reads, so a student's submit can be validated without a fresh database read per answer.

## Configuration
- The answering time budget carried with a launched poll comes from the question's own setting, falling back to the room's default when unset.

## Acceptance criteria
1. When the owning teacher launches an approved question, every joined student receives it on the room's live channel at essentially the same moment, and it becomes the room's current live poll.
2. The question a student receives contains no indication of which option is correct and no explanation, while its options remain in the same order and count.
3. A student, or a teacher who does not own the room, cannot launch a poll into it or push a question onto its channel.
4. Launching a second question makes it the new current live poll for the room, replacing the previous one.

## Out of scope (built elsewhere)
- Student answering and recording a response — **0.7.2**.
- How different question types are answered and scored — **0.7.3**.
- Automatically launching/closing polls on a lecture-segment timer — **0.7.4**.
- Closing a superseded poll to late answers and other answer-integrity guards — **0.7.5**.
- A teacher composing a poll by hand rather than launching a generated one — **0.7.6**.

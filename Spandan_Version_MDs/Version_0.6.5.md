# v0.6.5 — Review, Edit & Approve Generated Questions

| Field | Value |
|---|---|
| Version | 0.6.5 |
| Group | 0.6 — AI Question Generation |
| Status | Released |
| Goal | Make generated questions start unapproved, and give the room-owning teacher a surface to review, edit, and approve or reject each one — so only vetted questions can ever reach students. |

## References & prerequisites
Assumes these earlier chunks are already built:
- **0.1** — application skeleton and configuration loading.
- **0.2** — identity & access foundation: Teacher/Student/Admin roles, role-based authorization, and the reusable **approved-teacher** guard.
- **0.3.x** — rooms owned by teachers, with the **room-owner** guard; students join rooms as members.
- **0.6.1 / 0.6.2 / 0.6.3 / 0.6.4** — generation of structured questions (options + marked correct answer + explanation), across providers, from a transcript or pasted text, run in the background or synchronously.

## Purpose
A generated question is a draft, not a verdict. Before any question is put in front of a class it must pass through a human check: the teacher who owns the room reads it, fixes any wording or wrong answer marking, and explicitly approves it — or rejects it. This chunk establishes the approval lifecycle and the guarantee that students never see an unapproved question, nor the correct-answer information, from the management surface.

## Functional requirements
1. **Draft by default** — a question carries an approval state of pending, approved, or rejected. Generated questions begin **pending** (unapproved); a manually approved-and-launched question may be created already approved.
2. **Review surface** — the room-owning teacher steps through the generated set one question at a time, seeing the question text, its options, which option(s) are marked correct, and the explanation.
3. **Edit before approving** — within review the teacher may edit the question text, edit each option's text, add or remove options (down to a minimum of two), and change which option(s) are correct. Single-correct and true/false questions keep exactly one correct option; multi-select questions may have several. Edits are what gets approved.
4. **Approve** — approving a question marks it approved and makes it eligible to be launched to the class. Approval is the room-owning teacher's action.
5. **Reject** — rejecting a question marks it rejected (or discards it) so it can never be launched.
6. **Only approved may launch** — a question can be launched to students only once it is approved; a pending or rejected question is never launchable.
7. **Ownership of edits** — a teacher may edit, approve, or reject only questions in a room they own; another teacher's questions are off-limits.

## Data handled
- **Input:** teacher edits to a draft question (text, options, correct-answer marking) and an approve/reject decision.
- **Persisted per question:** type, question text, options with their correct-answer flags, explanation, approval state, owning room, and creating teacher.
- **Output to teacher management views:** the full question set including pending/approved/rejected and the correct-answer information.

## Security requirements
- Review, edit, approve, and reject all require the **approved teacher** who **owns the room** (the 0.2 and room-owner guards together).
- **Students never receive unapproved questions**: any question listing served to a student member is restricted to approved questions only.
- **Students never receive the correct-answer information from the management surface**: the correct-answer flags and the explanation are stripped before any question is returned to a student, so a member cannot pull answers directly by bypassing the interface. (A student's own past results, after a poll has closed, come from the results surface, not from this listing.)

## Performance & scaling requirements
- Listing a room's questions for management or for a student is a routine, indexed read that stays responsive as a room accumulates questions.
- The answer-stripping for students is applied on the server for every student-facing listing, not left to the client.

## Configuration
- No new external configuration; approval state and its defaults live with the question record.

## Acceptance criteria
1. A freshly generated question is pending and cannot be launched until approved.
2. The room-owning teacher can edit a question's text, options, and correct-answer marking in review, and the edited version is what gets approved.
3. Approving makes a question launchable; rejecting makes it permanently non-launchable.
4. A teacher who does not own the room cannot edit, approve, or reject its questions.
5. A student listing a room's questions receives only approved questions, and each returned option carries no correct-answer flag and no explanation.

## Out of scope (built elsewhere)
- Generating the questions in the first place — **0.6.1–0.6.4**.
- Launching an approved question and collecting live responses — **0.7 (polling)**.
- Tallying and showing results — **0.8 (results)**.

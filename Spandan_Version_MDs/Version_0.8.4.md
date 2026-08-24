# v0.8.4 — Teacher CSV Export

| Field | Value |
|---|---|
| Version | 0.8.4 |
| Group | 0.8 — Scoring, Leaderboard & Results |
| Status | Released |
| Goal | Let a room's owning teacher download that room's complete results as a single spreadsheet-friendly file — one row per student, one column per question — built from the same source as the results page so the numbers always match. |

## References & prerequisites
Assumes these earlier chunks are already built:
- **0.2** — identity & access: roles and owner-only guards for a teacher's own room.
- **0.3.x** — rooms owned by teachers, with an ended-room concept and a roster.
- **0.8.1 / 0.8.2 / 0.8.3** — per-answer scoring, the ranked board, and the end-of-session snapshot whose single-pass build is the shared source of the exported numbers.

## Purpose
Teachers need the whole session as a portable gradebook they can open in a spreadsheet, keep as a record, or process further. This chunk turns the room's results into one downloadable file, reusing the same computation that backs the results page so the download can never disagree with what the teacher sees on screen.

## Functional requirements
1. **Owner-triggered download** — from the room-history view, the room's owning teacher triggers a download of that room's complete results as a spreadsheet-friendly file, named after the room and its end date.
2. **Gradebook matrix** — the file's main block is one row per student who answered, with the student's name, email, total points, rank, a correct-out-of-answered tally, accuracy, and then one cell per question showing whether that student got it right, got it wrong, or did not answer.
3. **Chronological question columns** — question columns run in the order the questions were asked (first asked is the first column), so the matrix reads left-to-right in session order.
4. **Question legend** — a second block lists each question column against its text, type, number of responses, and the class correct-rate, so the columns are identifiable.
5. **Same-source guarantee** — the exported figures are built from the same single-pass results computation that backs the results and statistics pages, adding no new heavy queries; a one-off download does not need the shared stampede cache.
6. **Robust file** — the file is emitted so a spreadsheet opens it correctly, including non-ASCII names and emails and the right/wrong marks, with values safely quoted so text containing separators or line breaks cannot corrupt the layout. Rows are streamed rather than assembled entirely in memory.

## Data handled
- **Input:** the room, the ranked board, each student's per-question breakdown, the per-question statistics, and the participants' emails.
- **Output:** a downloadable spreadsheet-friendly file — a per-student matrix block plus a question-legend block.

## Security requirements
- The export is restricted to the room's owning teacher; any other teacher, any student, and any unauthenticated caller is refused.
- Because the export includes student email addresses, only the owner may obtain it — the ownership check is the gate on that personal data.
- The download is served over the same authenticated path as the rest of the teacher's actions; it is not a public or shareable link.

## Performance & scaling requirements
- The export reuses the existing single-pass results build, so it introduces no new per-question or per-student query loops.
- A one-off download does not populate or depend on the results stampede cache; it computes its data directly and streams the rows out.
- The file is written incrementally so a large room does not require holding the entire output in memory at once.

## Configuration
- None beyond what the results computation already needs; the download derives its filename from the room name and end date.

## Acceptance criteria
1. The room owner can download a file whose main block has one row per answering student with name, email, points, rank, correct tally, accuracy, and a per-question right/wrong/blank cell.
2. Question columns appear in the order the questions were asked, and a legend block identifies each column with its text, type, response count, and correct-rate.
3. The exported totals and per-question figures match the room's results page exactly.
4. A teacher who does not own the room, a student, and an unauthenticated caller are all refused.
5. Names, emails, and marks containing separators or non-ASCII characters open correctly in a spreadsheet without breaking columns.

## Out of scope (built elsewhere)
- Per-answer scoring, the board, and the results snapshot — **0.8.1 / 0.8.2 / 0.8.3**.
- The key-gated, cross-room research export API — **0.8.5**.

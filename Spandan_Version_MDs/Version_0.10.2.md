# v0.10.2 — In-App Help / Manual

| Field | Value |
|---|---|
| Version | 0.10.2 |
| Group | 0.10 — Delivery modes & polish |
| Status | Released |
| Goal | Give teachers and students a built-in, role-aware manual inside the app so they can learn how to run or join a session without leaving it. |

## References & prerequisites
Assumes these earlier chunks are already built:
- **0.1** — application skeleton, navigation shell, and theming.
- **0.2** — identity & access foundation: Teacher/Student/Admin roles and the signed-in user's role, which this page reads to decide what to show.
- **0.3.x / 0.7** — the room, settings, and polling features the manual explains.
- **0.10.1** — Video mode, which the manual also explains for both roles.

## Purpose
Reduce confusion for first-time and returning users by putting a plain-language guide where the work happens. The manual is reachable from the app's navigation and shows content tailored to whether the reader is a teacher or a student, covering only the features that role actually uses.

## Functional requirements
1. **A manual page reachable from navigation.** A "Manual" (help) entry appears in the app's navigation for signed-in users and opens an in-app page; no external site or download is involved.
2. **Role-aware content.** The page reads the signed-in user's role and shows the teacher manual to teachers and the student manual to students. A reader never sees instructions for the other role.
3. **Teacher coverage.** The teacher manual walks through: creating a room and choosing Normal or Video mode; each room setting and what it does (segment length, questions per segment, difficulty, question-type mix, time-to-answer, points, and question provider); running a Normal (microphone) session; running a Video-mode session including the one-time tab-audio share prompt and the automatic pause-during-question behavior; generating questions from pasted text; writing a question by hand; and running a poll through to the final leaderboard.
4. **Student coverage.** The student manual walks through: joining a room by code; answering the different question types within the timer and how points reward speed and correctness; how Video-mode rooms behave (watch along, rewind-but-not-skip-ahead on recordings, live streams stay at the live edge, and the automatic pause while a poll is live); the full-screen caveat that answers must be marked outside full screen; and how the leaderboard accrues.
5. **Collapsible sections.** The content is organized into labeled sections that expand and collapse, starting collapsed, so the reader can scan headings and open only what they need. Sections read as a numbered sequence, and step-by-step topics present their steps as an ordered list.
6. **Consistent presentation.** The page uses the app's existing shell, theming, and responsive layout so it looks and behaves like the rest of the app on both desktop and mobile, and points the reader to their administrator for anything the manual does not cover.

## Data handled
- **Input:** the signed-in user's role, to select which manual to render.
- **Output:** static, human-written guidance text. No user data is created, stored, or transmitted by this feature.

## Security requirements
- The page is available to any signed-in user and simply mirrors the identity from **0.2**; it exposes no data beyond the fixed help text and grants no capability.
- Because the content is fixed guidance, there is nothing role-sensitive to leak; role only chooses which of two fixed manuals is shown.

## Performance & scaling requirements
- The manual is static content rendered on the client with no server calls, so it adds no request-path load and scales for free.
- Collapsing sections by default keeps the initial view light and quick to scan.

## Configuration
- None beyond the app's existing navigation and theme. The manual text is maintained in the app itself.

## Acceptance criteria
1. A signed-in teacher opening the manual sees teacher-specific sections (room creation, settings, Normal and Video modes, paste-and-generate, hand-written questions, running a poll); a student sees student-specific sections (joining, answering, Video-mode behavior, full-screen caveat, leaderboard).
2. Sections start collapsed, expand on click, and step-by-step topics show numbered steps.
3. The page renders correctly on desktop and mobile using the app's existing theme and navigation.
4. No network request or data write occurs when viewing the manual.

## Out of scope (built elsewhere)
- The features the manual describes (rooms, settings, polling, Video mode) — their own chunks.
- Any admin-facing documentation or operational runbooks — not part of the in-app manual.

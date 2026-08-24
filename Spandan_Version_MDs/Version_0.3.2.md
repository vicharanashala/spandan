# v0.3.2 — Teacher & Student Dashboards

| Field | Value |
|---|---|
| Version | 0.3.2 |
| Group | 0.3 — Rooms & Membership |
| Status | Released |
| Goal | Give each role a home screen: a teacher sees the rooms they own with at-a-glance summary counts; a student sees the rooms they have joined plus their own participation history — each showing only data appropriate to that role. |

## References & prerequisites
Assumes these earlier chunks are already built:
- **0.1** — application skeleton and configuration loading.
- **0.2** — identity & access foundation: Teacher/Student/Admin roles, role-based authorization, the approved-teacher guard, and authenticated user context. These restrictions already exist, so this feature simply applies them.
- **0.3.1** — rooms owned by teachers, student membership by join code, and the room-owner/member access checks.

External references the implementing agent should consult: its framework's list-pagination conventions and its datastore's grouped-count/aggregation patterns.

## Purpose
Once rooms and memberships exist, each role needs a landing view scoped to what belongs to them. The teacher dashboard is about the rooms they run; the student dashboard is about the rooms they participate in — neither ever surfaces another user's rooms.

## Functional requirements
1. **Teacher room list** — a teacher sees the rooms they own, most recent first, returned in pages so a teacher with many rooms is not sent the whole set at once. Each room shows its name, its join code, and a count of its questions.
2. **Teacher summary cards** — the teacher dashboard shows headline totals: how many rooms they own, how many are currently active, and roll-ups of their polls and responses. These totals cover all of the teacher's rooms, paging through the full list rather than only the first page.
3. **Student joined-rooms list** — a student sees the rooms they have joined. The dashboard distinguishes rooms that are still active (and therefore rejoinable) from the student's broader history of rooms they have taken part in.
4. **Student history** — a student's history includes rooms they joined as a member and rooms they participated in even if they later left, combined without duplicates and ordered most-recent-first. Records whose underlying room has since been removed are skipped, never shown as broken entries.
5. **Student summary cards** — the student dashboard shows the student's own headline figures: rooms taken part in, polls answered, polls missed, and an earned-points percentage.
6. **Quick join / quick create** — the teacher dashboard offers an inline way to create a new room; the student dashboard offers an inline way to enter a join code — both reusing the create/join behavior from 0.3.1.

## Data handled
- **Teacher view:** the teacher's own rooms with derived per-room question counts and cross-room totals.
- **Student view:** the student's own memberships and participation, with derived counts and personal performance figures.
- All figures are derived for display; this chunk stores no new persistent data.

## Security requirements
- Every dashboard request runs under the authenticated user, and each view returns **only that user's own data** — a teacher's list is filtered to rooms they own, a student's list to rooms they belong to or participated in.
- The teacher room-list view is refused to non-teachers; the student history/active-rooms views are refused to non-students, using role-based authorization from **0.2**.
- No dashboard exposes another user's rooms, memberships, or personal figures.

## Performance & scaling requirements
- Room lists must be **paginated** with a bounded maximum page size so a large account cannot request an unbounded result set.
- Per-room counts (questions per room, and similar roll-ups) must be computed with grouped aggregation over the relevant rooms, not one query per room where avoidable, and must lean on the teacher- and student-scoped indexes from 0.3.1.
- The dashboards must degrade gracefully: a missing derived figure renders as zero rather than failing the whole view.

## Configuration
- The default and maximum page sizes for room lists are fixed system properties.

## Acceptance criteria
1. A teacher opening their dashboard sees only rooms they own, newest first, each with its code and question count, plus summary cards totalling across all their rooms.
2. A teacher with more rooms than one page still gets correct totals, because the summary pages through every room.
3. A student opening their dashboard sees only rooms they joined or participated in, with active (rejoinable) rooms distinguished from history, and no duplicates.
4. A student's summary cards reflect that student's own participation only.
5. A room deleted out from under a student's history is silently omitted rather than breaking the list.

## Out of scope (built elsewhere)
- Room creation and join-by-code themselves — **0.3.1**.
- Room lifecycle (start/end), ended-state, and per-room settings — **0.3.3**.
- Profile viewing/editing and the theme toggle shown in the dashboard header — **0.3.4**.

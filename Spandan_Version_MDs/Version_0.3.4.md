# v0.3.4 — Profile & Theming

| Field | Value |
|---|---|
| Version | 0.3.4 |
| Group | 0.3 — Rooms & Membership |
| Status | Released |
| Goal | Let every signed-in user view and edit their own profile and change their password, and let anyone switch the interface between a light and a dark theme that persists across visits. |

## References & prerequisites
Assumes these earlier chunks are already built:
- **0.1** — application skeleton, configuration loading, and the shared page shell (sidebar/header) the profile and theme controls live in.
- **0.2** — identity & access foundation: Teacher/Student/Admin roles, authenticated user context, and password/credential handling. These restrictions already exist, so this feature simply applies them.

External references the implementing agent should consult: its framework's form-handling patterns and the browser's persistent client-side storage for the theme choice.

## Purpose
Two small but universal touches: a self-service profile so users keep their own details current, and a light/dark theme toggle so the interface suits the user's preference and environment.

## Functional requirements
1. **View own profile** — a signed-in user sees their own account details: name, email, role, and any optional details they have added (contact, bio, date of birth, gender, address, social links, and role-specific fields such as a student's enrollment/class or a teacher's employee ID/department/qualifications).
2. **Edit own profile** — the user switches into an edit view, changes their editable details, and saves. Their email and role are shown but are identity fields the user does not casually rewrite here. On save, the view returns to read mode showing the updated values; cancelling discards unsaved edits and restores the stored values.
3. **Profile image** — the user may attach a personal image, shown wherever their avatar appears; with none set, a generated initial stands in.
4. **Role-appropriate fields** — the profile shows the student-specific section only to students and the teacher-specific section only to teachers.
5. **Change password** — from a separate tab the user changes their password by supplying the current one plus a new one confirmed twice. The new password must meet the strength rules from 0.2. On success the user is signed out and must sign in again with the new password.
6. **Theme toggle** — a control anywhere in the app switches the whole interface between light and dark. The choice takes effect immediately, applies app-wide through shared theme variables, and is remembered so the next visit opens in the same theme.

## Data handled
- **Profile:** the user's own editable detail fields plus an optional embedded image, and the read-only identity fields (email, role).
- **Password change:** the current and new passwords, used transiently and never stored in the clear.
- **Theme:** a single light/dark preference kept in the browser; not part of the account record.

## Security requirements
- A user may view and edit **only their own** profile — the operation always targets the authenticated user, never an arbitrary account.
- Changing a password requires proving the **current** password; a new password must satisfy the strength rules from **0.2**, and a successful change invalidates the current session so the user re-authenticates.
- Identity-defining fields (email, role) are not user-rewritable through the profile edit flow.
- The theme preference carries no authority and holds no personal data, so it may live purely client-side.

## Performance & scaling requirements
- Profile view and edit act on the single authenticated user's record; no cross-user scans are involved.
- The theme switch is a purely client-side change applied through shared style variables, so it repaints instantly without a server round-trip.
- An attached profile image must be bounded in size so it neither bloats the account record nor slows page loads.

## Configuration
- The available themes are light and dark, with light as the default when no preference has been stored.
- The password strength rules are the fixed rules established in 0.2.

## Acceptance criteria
1. A signed-in user sees their own profile with role-appropriate sections and can edit and save their editable details; cancelling restores the prior values.
2. A user cannot view or edit another user's profile.
3. Changing the password requires the correct current password and a confirmed, strong new password; on success the user is signed out and must sign in again.
4. Toggling the theme changes the whole interface immediately and the choice persists across a reload and a new visit.
5. A user with no profile image is shown a generated initial in place of an avatar.

## Out of scope (built elsewhere)
- The sign-up/sign-in flows and password strength rules themselves — **0.2** (additional sign-in methods — **0.9**).
- Admin management or approval of other users' accounts — **0.2**.

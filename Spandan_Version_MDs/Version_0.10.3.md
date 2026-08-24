# v0.10.3 — Testing & Continuous-Integration Foundation

| Field | Value |
|---|---|
| Version | 0.10.3 |
| Group | 0.10 — Delivery modes & polish |
| Status | Released |
| Goal | Establish automated backend and frontend test suites and a continuous-integration check that runs them on every change, so regressions in core behavior are caught before they ship. |

## References & prerequisites
Assumes these earlier chunks are already built:
- **0.1** — application skeleton and configuration.
- **0.2** — identity & access foundation: roles, role-based authorization, and the approved-teacher and room-owner guards, which are the highest-value behaviors to protect with tests.
- **0.3.x / 0.5 / 0.7** — rooms, transcription authorization, and the polling/scoring logic whose correctness the suites assert.

## Purpose
Give the codebase a safety net. Add automated tests that pin down the security guards and the scoring/correctness logic, and wire a continuous-integration check that runs those tests automatically on changes, so a future agent building further chunks gets immediate feedback when something breaks.

## Functional requirements
1. **Backend test suite.** An automated test suite covers the security-critical and correctness-critical backend behaviors, including: authentication middleware; the authentication and account routes; room routes; the room-ownership guard; the room-join authorization; the transcription authorization guard; password handling; one-time-code handling; the question-generation service; and the multiple-select answer-correctness rule.
2. **Frontend test suite.** An automated test suite covers key client behaviors, including: the auth store; token handling; the leaderboard rendering and its resilience to malformed or partial data; the question editor; and the error boundary.
3. **Isolated, self-contained runs.** The backend suite runs against an in-memory database so it needs no external database or live secrets; only a test signing secret is supplied. The frontend suite runs against a simulated browser environment with static assets stubbed. Neither suite depends on a running server, the transcription service, or the coordination datastore.
4. **A single command per side.** Each side (backend, frontend) exposes one command that runs its whole suite, plus a watch and a coverage variant, so tests are easy to run locally and identically in automation.
5. **Continuous-integration check.** A CI workflow runs both suites automatically on every change proposal against the main line and on updates to the main line. On a change proposal it acts as the merge gate; on a direct update to the main line it is informational and never blocks.
6. **Fast, cached setup.** The CI installs dependencies reproducibly and caches them so runs stay quick; the backend and frontend jobs run independently so a failure in one is clearly attributable.

## Data handled
- **Input:** the code under test and fixture/mock data created within the tests themselves.
- **Output:** pass/fail results and optional coverage figures. No production or user data is involved.

## Security requirements
- Tests must use throwaway secrets and in-memory data only; no real credentials, production database, or live keys are used or committed.
- The suites explicitly assert the access-control behavior from **0.2** (unauthenticated and wrong-role requests are refused; a non-owner cannot act on another's room; only an approved teacher may transcribe), so these guards cannot silently regress.

## Performance & scaling requirements
- The suites must run quickly and deterministically without external services, so they are cheap to run on every change.
- CI jobs run in parallel and cache dependencies to keep feedback fast as the codebase grows.

## Configuration
- The continuous-integration check needs only a test signing secret; it requires no database connection string or other live secret because the backend tests are self-contained.
- Optional branch protection can require the CI check to pass before a change is merged, turning the informational check into an enforced gate.

## Acceptance criteria
1. Running the backend suite passes against an in-memory database with only a test secret set, and includes tests that refuse unauthenticated, wrong-role, and non-owner actions.
2. Running the frontend suite passes in a simulated browser with assets stubbed, including leaderboard-resilience and error-boundary cases.
3. Opening a change proposal against the main line triggers the CI check, which runs both suites and reports a clear pass/fail for each.
4. A failing test in either suite fails the corresponding CI job without affecting the other.

## Out of scope (built elsewhere)
- End-to-end or load testing of a full running deployment — not part of this foundation.
- The deployment automation itself — **1.0**.
- The application features under test — their own chunks.

# v1.0 — Stable Production Release

| Field | Value |
|---|---|
| Version | 1.0 |
| Group | 1.0 — Production release |
| Status | Released |
| Goal | Run the whole Spandan system as a production deployment — multiple application instances behind a reverse proxy under a sub-path, a shared coordination datastore, a background generation worker, and a separate transcription service — with the full feature set and a verification checklist confirming it works. |

## References & prerequisites
Assumes the entire feature set from all earlier chunks is built, in particular:
- **0.2** — identity & access: roles, authorization, and the approved-teacher and room-owner guards.
- **0.4** — the realtime layer and its shared coordination datastore, which lets multiple application instances share live state.
- **0.5** — the separate transcription service the application relays to.
- **0.6.3 / 0.7** — asynchronous question generation via a background worker, and the live polling loop.
- **0.10.1 / 0.10.2 / 0.10.3** — Video mode, the in-app manual, and the test/CI foundation.

## Purpose
Bring everything together as a stable, deployable whole. This chunk does not add product features; it defines the deployment **model** the system runs under in production and the checks that confirm the assembled system behaves correctly end to end. The description here is deliberately generic: it names the components and how they relate, not any particular host, address, or domain.

## Functional requirements
1. **Multiple application instances behind a reverse proxy.** Several identical instances of the application run in parallel, fronted by a reverse proxy that terminates client connections and distributes traffic across them. The system is reachable through the proxy, not directly.
2. **Served under a sub-path.** The application is served beneath a path prefix rather than at a domain root, so it can co-exist with other applications on the same front door; all of its links, assets, interface calls, and live connections work correctly under that prefix.
3. **Shared coordination datastore.** A shared datastore backs cross-instance state so that live rooms, generation jobs, and rate limiting behave consistently no matter which instance a given client lands on; live connections are routed so a client keeps talking to a consistent instance where required.
4. **Background generation worker.** Question generation runs in one or more background worker processes draining a shared backlog, separate from the request-serving instances, so a slow model call never ties up a request.
5. **Separate transcription service.** Speech-to-text runs as its own process that the application relays to; it is not publicly reachable and only the co-located application may call it. Recognition never blocks request handling.
6. **Process management and restart.** Every long-running component (the application instances, the worker, and the transcription service) runs under a process manager that keeps them alive, restarts them on failure, and lets an operator restart them on deploy.
7. **Repeatable deploy.** Deploying is a repeatable operation: fetch the latest code, install dependencies reproducibly, build the client, and restart the managed processes — so a release is predictable and reversible.
8. **Full feature set enabled.** The whole product is available in production: identity and approval, rooms and settings, live transcription, asynchronous and synchronous generation, the full polling loop and leaderboard, Video mode, and the in-app manual.
9. **Verification checklist.** A release is accompanied by a checklist that verifies the assembled system: the proxy serves the app under its sub-path; instances share state through the datastore; live sessions and leaderboards work across instances; generation runs on the worker; transcription is reachable only internally and fails fast when down; and the automated suites pass.

## Data handled
- **Input:** all data the feature set already handles — accounts, rooms, transcripts, generation jobs, questions, answers, and scores.
- **Output:** the running production system and a completed verification record. No new data category is introduced here.

## Security requirements
- All authorization from **0.2** remains in force in production: role checks, the approved-teacher gate, and the room-owner guard apply exactly as in every lower chunk.
- Client connections terminate at the reverse proxy over a secured channel; the transcription service and the coordination datastore are reachable only internally, never exposed publicly.
- Secrets and connection details are supplied to each component through the deployment's configuration mechanism and are never embedded in the code or the client bundle.

## Performance & scaling requirements
- Horizontal scale comes from running more application instances behind the proxy and, if needed, more worker or transcription instances; the shared datastore keeps them consistent, so scaling out requires no code change.
- The reverse proxy handles compression and static-asset serving so that work stays off the application's event loop.
- Heavy work (generation and recognition) runs off the request path in the worker and the transcription service respectively, so request latency is unaffected by their load.

## Configuration
- The deployment model requires, per environment: the reverse proxy's routing rules for the sub-path (including the live-connection upgrade path), the location of the shared coordination datastore, the location and timeout for the transcription service, the number of application instances and worker concurrency, and the signing and provider secrets — all supplied as configuration, not code.
- A flag or the presence of the shared datastore determines whether generation runs asynchronously on the worker or synchronously in-request for smaller setups.

## Acceptance criteria
1. Reaching the system through the reverse proxy under its sub-path serves the full application, with all assets, interface calls, and live connections working under the prefix.
2. With multiple instances running, a teacher and students on different instances share the same live room, and the leaderboard stays consistent across them.
3. A teacher's generation request is handled by the background worker and returns questions by polling; where the worker is not configured, generation falls back to synchronous and still returns questions.
4. The transcription service is reachable only internally; with it down, transcription fails fast while the rest of the system stays responsive.
5. All managed processes survive a restart and a redeploy, and the release's verification checklist passes end to end.

## Out of scope (built elsewhere)
- The individual product features — their own lower-numbered chunks.
- Any specific hosting provider, host address, or domain — this chunk describes only the generic deployment model.
- Post-release feature work beyond the 1.0 feature set.

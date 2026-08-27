# v0.5.2 — Server-Side Whisper Transcription Service

| Field | Value |
|---|---|
| Version | 0.5.2 |
| Group | 0.5 — Audio & Transcription |
| Status | Released |
| Goal | Provide speech-to-text through a standalone service the API talks to, so heavy inference never blocks the main application. |

## References & prerequisites
Assumes these earlier chunks are already built:
- **0.1** — application skeleton and configuration loading.
- **0.2** — identity & access foundation: Teacher/Student/Admin roles, role-based authorization, and the admin teacher-approval gate (the reusable **approved-teacher** guard). These restrictions already exist, so this feature simply applies them.
- **0.3.x** — rooms owned by teachers.
- **0.5.1** — the teacher recording flow that captures lecture audio in short clips.

External references the implementing agent should consult: a Whisper-family speech-to-text engine of its choice, and its runtime's HTTP client and process-management docs.

## Purpose
Turn recorded lecture audio into text on the server side, in a way that keeps the main application responsive no matter how heavy or slow the recognition is.

## Functional requirements
1. A **dedicated transcription service**, running as its own process separate from the main application, exposes:
   - a **health/readiness** check that reports whether the model is loaded and ready, and
   - a **transcribe** operation that accepts one audio clip and returns the recognized text (optionally with per-segment timings and detected language).
2. The service loads its recognition model **once** at startup and reuses it for every request.
3. The main application exposes two endpoints that **relay** to the transcription service rather than doing recognition themselves:
   - a **status** endpoint reporting whether transcription is currently available, and
   - a **transcribe** endpoint that accepts an audio clip from an authorised teacher and returns the recognized text.
4. If the transcription service is missing, slow, or unreachable, the relay must **give up quickly** and return a clear "unavailable" / "timed out" response, while every other part of the application keeps working normally.

## Data handled
- **Input:** a single short audio clip (captured in 0.5.1) plus its sample rate.
- **Output:** recognized text; optionally the segment timings and detected language.
- No audio is required to be persisted at this stage (persistence and segmentation are 0.5.3).

## Security requirements
- Both relay endpoints require an authenticated user.
- The transcribe endpoint is restricted to an **approved teacher**, using the approved-teacher guard established in **0.2** — no student, and no unapproved teacher, may transcribe.
- The transcription service must not be publicly reachable — only the main application (co-located) may call it.

## Performance & scaling requirements
- Recognition must run **outside** the main application process so it never blocks other requests.
- The service must accept concurrent requests without dropping them, even if the actual recognition is processed one clip at a time.
- It must be possible to scale recognition by running more than one instance of the service (including on more capable hardware) without changing the main application.
- The relay must fail fast on a slow or dead service so transcription problems never tie up the main application.

## Configuration
- The main application needs the location of the transcription service and a maximum wait time for a transcription before it gives up.
- The transcription service needs its own network binding and a selectable model size / compute profile so it can be tuned for CPU or GPU hosts.

## Acceptance criteria
1. With the transcription service running, its readiness check reports "ready" once the model has loaded.
2. An authenticated teacher can submit an audio clip and receive recognized text back.
3. An unauthenticated user, or a non-teacher, is refused.
4. With the transcription service stopped, the status endpoint reports "unavailable" and a transcribe attempt fails quickly — while the rest of the application stays fully responsive.

## Out of scope (built later)
- Transcript segmentation and persistence — **0.5.3**.
- The in-lecture live transcript panel.

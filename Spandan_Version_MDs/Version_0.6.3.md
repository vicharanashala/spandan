# v0.6.3 — Asynchronous Question Generation

| Field | Value |
|---|---|
| Version | 0.6.3 |
| Group | 0.6 — AI Question Generation |
| Status | Released |
| Goal | Run question generation in the background so a slow model call never ties up an application request; hand back a job to track and poll for the result. |

## References & prerequisites
Assumes these earlier chunks are already built:
- **0.1** — application skeleton and configuration.
- **0.2** — identity & access foundation: Teacher/Student/Admin roles, role-based authorization, and the admin teacher-approval gate (the reusable **approved-teacher** guard).
- **0.4.2** — a shared datastore/coordination layer available across instances (used here as the job backbone).
- **0.6.1 / 0.6.2** — the question-generation capability that turns a transcript into questions, across multiple model providers.

External references the implementing agent should consult: a background job/queue mechanism of its choice and its provider's async-processing patterns.

## Purpose
Generation can take several seconds. This chunk moves that work off the request path so the application stays responsive: submitting a transcript returns immediately with a **job to track**, and the result is fetched by polling that job.

## Functional requirements
1. **Submit generation** — an authorised teacher submits a transcript plus generation options (how many questions, difficulty, provider, question-type mix). The request returns **immediately** with a **job identifier**, without waiting for generation to finish.
2. **Background processing** — a **separate worker** performs the actual generation, independent of the application's request handling, so request handlers are never blocked by a model call.
3. **Poll the result** — given a job identifier, the teacher can check its state: still processing, completed (returns the generated questions), or failed (returns a reason).
4. **Automatic retry** — a generation that fails or comes back empty/malformed is retried a small number of times, with a spacing delay between attempts, before being marked failed.
5. **Result retention** — a completed or failed job's outcome remains available long enough for the teacher's client to poll and collect it, then is cleaned up.
6. **Graceful fallback** — where the background mechanism is not enabled, submitting a transcript instead generates **synchronously** in the request and returns the questions directly, so smaller/local setups work with no worker at all.

## Data handled
- **Input:** a transcript and generation options; the identity of the requesting teacher is recorded with the job.
- **Output:** a job identifier on submit; on completion, the generated questions.

## Security requirements
- Both submit and poll require an **approved teacher**, using the approved-teacher guard established in **0.2**.
- **Job ownership:** a teacher may poll only their **own** jobs — a request to read someone else's job is refused, so a job identifier alone never exposes another teacher's generated questions.

## Performance & scaling requirements
- The model call must run in the **worker**, not the request handler, so the submitting request is freed at once.
- The number of **simultaneous generations** must be bounded so many teachers generating at once cannot overwhelm the model provider or exhaust memory.
- The retry policy must space attempts out (not fire them back-to-back) so a transient failure has room to clear.
- The design must work across multiple application instances (any instance can submit; the worker(s) drain a shared backlog).

## Configuration
- Whether background processing is enabled (tied to the shared datastore from 0.4.2 being present).
- The maximum number of concurrent generations the worker will run.

## Acceptance criteria
1. With background processing enabled and a worker running, a teacher's submit returns a job identifier immediately; polling that job moves from "processing" to "completed" and yields the questions.
2. A different teacher attempting to poll that job is refused.
3. With background processing disabled, submit returns the questions directly (synchronous), and there is no job to poll.
4. A generation that fails every retry ends in a "failed" state with a reason.
5. Starting a worker when background processing is not configured fails clearly rather than running in a broken state.

## Out of scope (built elsewhere)
- The generation logic and multi-provider support — **0.6.1 / 0.6.2**.
- Generating questions from pasted text — **0.6.4**.
- Teacher review, edit, and approval of generated questions — **0.6.5**.

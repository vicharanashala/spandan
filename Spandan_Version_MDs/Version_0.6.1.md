# v0.6.1 — Question Generation From a Transcript

| Field | Value |
|---|---|
| Version | 0.6.1 |
| Group | 0.6 — AI Question Generation |
| Status | Released |
| Goal | Let an approved teacher turn a room's captured transcript into a set of ready-to-use poll questions, each with options and a marked correct answer. |

## References & prerequisites
Assumes these earlier chunks are already built:
- **0.1** — application skeleton and configuration loading.
- **0.2** — identity & access foundation: Teacher/Student/Admin roles, role-based authorization, and the admin teacher-approval gate (the reusable **approved-teacher** guard). These restrictions already exist, so this feature simply applies them.
- **0.3.x** — rooms owned by teachers, with the **room-owner** guard.
- **0.5.x** — server-side transcription that turns lecture audio into text the teacher can capture.

External references the implementing agent should consult: a large-language-model text-generation service of its choice (this chunk uses a single such provider) and its runtime's HTTP client docs.

## Purpose
Give a teacher a fast way to convert what was just said in class into assessment questions, without writing them by hand. The teacher supplies a body of transcript text and a few shaping choices; the feature returns a small set of well-formed questions ready to be reviewed and launched.

## Functional requirements
1. **Generate from transcript** — an approved teacher submits a block of transcript text plus generation options and receives back a set of generated questions.
2. **Configurable count** — the teacher chooses how many questions to produce.
3. **Configurable difficulty** — the teacher chooses an overall difficulty (easy / medium / hard) that steers how demanding the questions are; the questions must test understanding and inference, never rote recall, at every level.
4. **Configurable question-type mix** — the teacher chooses the blend of question types across the set: single-correct multiple choice, true/false, and multi-select (two or more correct). The requested proportions are honored as closely as the count allows, and the types are distributed across the set rather than clustered.
5. **Structured output** — each generated question comes back as a self-contained item carrying its type, the question text, a list of options, a clear marking of which option(s) are correct, and a short teaching explanation of why the answer is correct.
6. **Grounded content** — questions are drawn only from the supplied transcript, and are phrased as direct subject-knowledge questions that never point back at "the transcript", "the source", or "the speaker".
7. **Input floor** — an empty or too-short transcript is rejected with a clear message rather than producing filler.
8. **Robust result handling** — a response that is empty, malformed, or yields no usable questions is treated as a failure with a clear reason, not silently returned as an empty set.

## Data handled
- **Input:** a block of transcript text; the desired count, difficulty, and type mix; the identity of the requesting teacher.
- **Output:** a set of structured questions, each with type, text, options, correct-answer marking, and explanation.
- The correct-answer marking and explanation are internal generation output at this stage; they are not yet persisted as room questions here.

## Security requirements
- Generation requires an authenticated user who is an **approved teacher**, using the approved-teacher guard from **0.2** — no student and no unapproved teacher may generate.
- The provider credential lives only in server configuration and is never exposed to any client.

## Performance & scaling requirements
- A generation call may take several seconds; it must not corrupt or block other unrelated requests.
- The feature must fail fast and clearly on a provider error, timeout, or unusable response rather than hanging.

## Configuration
- The credential and endpoint for the single text-generation provider.
- Sensible defaults for count, difficulty, and type mix when the teacher does not specify them.

## Acceptance criteria
1. An approved teacher submits a sufficiently long transcript and receives the requested number of structured questions, each with options and a marked correct answer.
2. Requesting a particular difficulty and type mix produces a set whose composition reflects those choices.
3. An empty or too-short transcript is refused with a clear message.
4. A student, or an unapproved teacher, is refused.
5. A provider failure or an unparseable response ends as a clear failure, not an empty success.

## Out of scope (built elsewhere)
- Choosing among several interchangeable providers — **0.6.2**.
- Running generation in the background off the request path — **0.6.3**.
- Generating from arbitrary pasted text rather than the transcript — **0.6.4**.
- Teacher review, edit, and approval before launch — **0.6.5**.

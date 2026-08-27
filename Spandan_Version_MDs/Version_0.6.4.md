# v0.6.4 — Paste-and-Generate From Arbitrary Text

| Field | Value |
|---|---|
| Version | 0.6.4 |
| Group | 0.6 — AI Question Generation |
| Status | Released |
| Goal | Let a teacher generate questions from any pasted content — lecture notes, textbook passages, articles — not only from the live captured transcript. |

## References & prerequisites
Assumes these earlier chunks are already built:
- **0.1** — application skeleton and configuration loading.
- **0.2** — identity & access foundation: Teacher/Student/Admin roles, role-based authorization, and the reusable **approved-teacher** guard.
- **0.3.x** — rooms owned by teachers, with the **room-owner** guard.
- **0.6.1 / 0.6.2** — transcript-to-questions generation, across interchangeable providers, producing structured questions with options and a marked correct answer.
- **0.6.3** — background (or synchronous-fallback) generation submission and result collection.

## Purpose
Not every session produces a usable live transcript, and a teacher often already has good source material on hand. This chunk lets any block of text the teacher pastes serve as the source content for generation, reusing the same generation capability, shaping options, and structured output as the transcript path.

## Functional requirements
1. **Paste as source** — a teacher opens a paste surface, pastes arbitrary educational text, and generates questions from it, with no dependence on any recorded audio or captured transcript.
2. **Same shaping options** — the pasted text is generated with the same count, difficulty, provider, and question-type-mix choices used for transcript generation; the room's current defaults pre-fill these choices.
3. **Same structured output** — the result is the same set of structured questions (type, text, options, marked correct answer, explanation) as the transcript path, and flows into the same review step.
4. **Input floor** — the paste must meet a minimum length before generation is allowed; too-short input is refused with a clear message rather than producing filler.
5. **Preserve on failure** — if a generation from pasted text fails, the pasted content is preserved so the teacher can retry without re-pasting.
6. **Reuse the pipeline** — paste-and-generate goes through the same submission, background/synchronous handling, and failure/retry behavior as transcript generation; it is a new source of text, not a new generation mechanism.

## Data handled
- **Input:** an arbitrary block of pasted text; the count, difficulty, provider, and type-mix options; the identity of the requesting teacher.
- **Output:** the same structured questions as the transcript path.
- Pasted text is treated as transient source content for generation; it is not stored as a room transcript.

## Security requirements
- Paste-and-generate requires an authenticated **approved teacher** (the 0.2 guard), exactly as transcript generation does.
- Where questions are being generated for a specific room, only that room's owning teacher may do so (the room-owner guard).
- Pasted text is source-only content; any markup is neutralized so it cannot carry active content into later display surfaces.

## Performance & scaling requirements
- Paste-and-generate inherits the background/off-request-path behavior of 0.6.3, so a slow model call does not tie up the request.
- A large paste must be handled within the same provider limits as a transcript; the same fail-fast behavior applies.

## Configuration
- No new provider configuration beyond 0.6.1/0.6.2.
- The minimum acceptable paste length, and the room defaults used to pre-fill the shaping options.

## Acceptance criteria
1. A teacher pastes a sufficiently long block of text and receives the requested structured questions, ready for review, with no transcript involved.
2. The room's current count, difficulty, provider, and type-mix defaults pre-fill the paste surface and shape the result.
3. A paste shorter than the minimum is refused with a clear message.
4. A failed generation leaves the pasted text intact for an immediate retry.
5. A student, or an unapproved teacher, cannot paste-and-generate.

## Out of scope (built elsewhere)
- The generation capability and provider selection themselves — **0.6.1 / 0.6.2**.
- Background submission and result collection — **0.6.3**.
- Teacher review, edit, and approval before launch — **0.6.5**.

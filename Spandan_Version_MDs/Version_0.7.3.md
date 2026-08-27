# v0.7.3 — Single- and Multi-Select Question Types

| Field | Value |
|---|---|
| Version | 0.7.3 |
| Group | 0.7 — Live Polling |
| Status | Released |
| Goal | Support polls that accept exactly one answer and polls that accept several, scoring each correctly, and let students pick accordingly. |

## References & prerequisites
Assumes these earlier chunks are already built:
- **0.2** — identity & access foundation and role-based authorization.
- **0.6.5** — approved questions, each carrying its type and its option set with the correct option(s) marked.
- **0.7.1 / 0.7.2** — launching a poll and recording a student's answer.

## Purpose
Let a poll be either single-answer (one option is right, including a true/false form) or multi-answer (a set of options is right), and score each student's selection against the right rule for that type.

## Functional requirements
1. **Single-select polls.** A single-answer question (including a two-option true/false variant) expects the student to choose exactly one option. It is correct only when the chosen option is the marked-correct one.
2. **Multi-select polls.** A multi-answer question expects the student to choose a set of options. It is correct only when the student selected every option marked correct and selected none that is not — an all-or-nothing match, with no partial credit.
3. **Selection recorded uniformly.** Every response records the full set of chosen option positions, regardless of type, so both forms are stored and read back the same way; a single-select answer is simply a set of one.
4. **The student's interface matches the type.** For a single-select poll the student can have at most one option chosen at a time; for a multi-select poll the student can toggle several on and off before submitting. The submit control is available only once at least one option is chosen.
5. **Type travels with the poll.** Each launched poll carries its type to students and to the scoring path, so both the interface and the correctness rule follow the question, not a room-wide setting.
6. **Correctness is server-decided by type.** Whether an answer is correct is determined on the server using the type's rule and the stored correct-option markers, never asserted by the client.

## Data handled
- **Input:** the set of option positions a student selected, plus the poll's type.
- **Used for scoring:** the poll's correct-option markers and its type rule.
- **Stored:** the full selection set and the resulting correctness.

## Security requirements
- The correct-option markers are never sent to students with a live poll (they were stripped at launch in 0.7.1), so type-aware correctness is decided only on the server.
- The correctness rule runs server-side from the stored question; a client cannot influence which rule is applied or its outcome.

## Performance & scaling requirements
- Evaluating either rule is a simple comparison over the option set and adds no material cost to the per-submit path.
- The comparison relies only on the stored question already available to the answer path, so no additional lookup is introduced per submit.

## Configuration
- A poll's type and its mix within a generated batch come from the question set; there is no separate runtime toggle for this chunk.

## Acceptance criteria
1. On a single-select poll, choosing the marked-correct option scores as correct and choosing any other option scores as incorrect; the student can hold only one selection.
2. On a multi-select poll, selecting exactly the full set of correct options scores as correct.
3. On a multi-select poll, missing a correct option or including an incorrect one scores as incorrect — there is no partial credit.
4. Both single- and multi-select responses are stored and read back as a set of selected positions, a single-select answer being a set of one.

## Out of scope (built elsewhere)
- The time-decay points formula and its safe bounds — **0.7.5**.
- Timed opening/closing of polls on lecture segments — **0.7.4**.
- Aggregating per-option counts across the room for results — **0.8**.

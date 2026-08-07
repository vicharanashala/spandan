# Doubt-Anchored Polling — Design Document

> Real-time, anonymous confusion signaling from students to teachers, anchored
> to transcript segments so spikes map back to the exact moment a concept
> landed (or didn't).

**Status:** shipped (PR-ready)
**Scope:** backend service, REST + Socket.IO, 5 endpoints, 28 unit tests
**Out of scope (deferred):** per-question confusion badge on `RoomResultsPage`,
audio-level signal separation, teacher-side annotations.

---

## The problem

A teacher asks "everyone got that?" and gets silence. A handful of confused
students don't speak up; the teacher moves on; ten minutes later the quiz
shows 30% wrong answers. The feedback came too late and from the wrong
people.

Existing polls only show **what** students answered, not **where** they
got lost. We need a lightweight, anonymous, real-time signal that maps
back to the transcript so the teacher can re-explain that exact moment.

## The solution

A floating button on the student's screen that:

1. Records an anonymous "I'm lost" signal with `segmentIndex` and
   `transcriptOffsetMs` (the moment of confusion).
2. Aggregates counts per segment.
3. Surfaces **confusion spikes** on the teacher's dashboard — segments where
   mark-count crosses either a floor (`minMarkCount`) or the room's
   statistical threshold (`mean + 2σ`).
4. Each spike card carries the **transcript snippet** for that segment, so
   the teacher sees *"15 students were lost during your explanation of
   Glycolysis"* — not just a count.

## Privacy model

A student pressing the panic button must not be identifiable to the teacher
from the signal alone. We achieve this with:

| Concern                       | Mitigation                                            |
|-------------------------------|-------------------------------------------------------|
| Who pressed the button        | `studentHash = HMAC-SHA256(roomSalt, userId)`         |
| Cross-room correlation        | Salt is **per-room**, generated lazily on first signal |
| Cross-session correlation     | Salt is **rotated** when the room ends                |
| Spam (one student flooding)   | 30-second anti-spam window per (room, student)        |
| Accidental press              | 60-second retract window — student can undo           |
| Stored PII                    | Only `studentHash`, never raw `userId`                |

The teacher only ever sees:
- Counts per segment
- Aggregate spike list
- Transcript snippets they themselves produced

They cannot:
- Identify which student pressed the button
- Correlate signals across rooms or sessions
- Retrieve raw `userId` from the database (schema field is `studentHash` only)

**What we deliberately do NOT do** (deferred):
- Differential privacy noise injection on counts
- Per-student historical loss signal (would let teacher build a profile)
- Email/SMS alerts to teacher when a single segment spikes (>50% lost)

## Anti-spam design

| Window     | Behaviour                                              |
|------------|--------------------------------------------------------|
| 0–30s      | First signal accepted. Subsequent signals from same `(roomId, studentHash)` return `429 { reason: anti_spam, retryAfterMs: 30000 }`. |
| 30–60s     | Student can press again. Old signal becomes retractable. |
| 60s+       | Latest signal no longer retractable; older signals are too. |

Why 30 seconds? A confused student who figures it out 5 seconds later
shouldn't be punished; a confused student spamming the button every
second shouldn't get a vote per second. 30s is short enough that a
genuinely re-confused student can re-signal before the next quiz, but
long enough that 100 presses in 100 seconds isn't possible.

## Spike detection math

For each segment `i`, we compute `count_i` (distinct students who flagged
that segment). A segment is a **spike** if **either**:

1. `count_i >= minMarkCount` (default `3`), OR
2. `count_i >= mean(all counts) + spikeStdDevMultiplier * stddev(all counts)`
   (default `2.0σ`).

Output:

```js
{
  spikes:        [{ segmentIndex, count, transcriptSnippet }], // sorted desc by count
  allSegments:   [{ segmentIndex, count }],
  stats:         { mean, stddev, threshold }
}
```

### Why this formula

`minMarkCount=3` is the **floor** — three confused students is enough to
say "this segment is worth re-explaining" regardless of statistical
outliers in a quiet room.

`mean + 2σ` is the **ceiling** — for a room where segments naturally
fluctuate, segments that are 2 standard deviations above the mean are
suspicious even when absolute counts are low. In a quiet room, every
student matters more.

The **OR** is intentional: in a 6-student room, `2σ` may flag nothing
useful (σ is too small), but `minMarkCount=3` catches the basics. In a
30-student room, σ-based detection catches segments where ~6 students
flagged but the overall room has high noise.

### Known limitations

- For a single-segment room (only one count exists), σ=0, threshold=count.
  Every segment flags. We could short-circuit this but it costs a DB query.
- For a perfectly uniform distribution (all segments flagged equally),
  σ=0 again and we fall back to `minMarkCount`.
- These are **not data-driven thresholds**. A real benchmark with
  classroom data would tune them. We picked defaults that err on the
  side of surfacing more signals to teachers (false positives are
  cheap; missed confusion is not).

## Architecture

```
Student browser                     Teacher dashboard
     |                                       ^
     | socket.emit('doubt:signal')          | socket.on('doubt:new')
     v                                       |
+---------------------+              +------------------+
| Express + Socket.IO | --  io.to --> | ConfusionSpike   |
|                     |              | Panel            |
|   recordDoubt()  ---+--REST-->    |  (poll every 5s) |
|   (anti-spam)       |              +------------------+
|   (salt rotation)   |
+---------------------+
        |
        v
+---------------------+
| MongoDB             |
|   DoubtSignal       |  studentHash, segmentIndex, transcriptOffsetMs, retracted
|   Room.doubtSalt    |  lazy-generated, rotated on room end
+---------------------+
```

## Endpoint summary

| Method | Path                                         | Auth   | Purpose                                       |
|--------|----------------------------------------------|--------|-----------------------------------------------|
| POST   | `/api/doubts`                                | member | Record a doubt signal                         |
| POST   | `/api/doubts/retract`                        | member | Retract latest signal within 60s window       |
| GET    | `/api/doubts/room/:roomId`                   | teacher/admin | All segments + counts for a room      |
| GET    | `/api/doubts/room/:roomId/spikes`            | teacher/admin | Spike list with transcript snippets    |
| GET    | `/api/doubts/room/:roomId/question/:qid`     | member | Doubt count for a specific question (reserved) |

## File map

```
backend/src/
  models/
    DoubtSignal.js          # schema with studentHash, retracted, segmentIndex
    Room.js                 # adds doubtSalt field (select:false)
  services/
    doubtService.js         # hashStudent, recordDoubt, retract, getCounts, detectSpikes
  routes/
    doubts.js               # the 5 REST endpoints above
  __tests__/
    doubtService.test.js    # 28 unit tests (Jest + in-memory MongoDB)

frontend/src/
  components/
    ImLostButton.jsx        # squishy top-right floating flag with audio feedback
    ConfusionSpikePanel.jsx  # teacher live view (bar chart + spike cards)
  pages/
    StudentRoomPage.jsx     # mounts ImLostButton
    RoomDetailPage.jsx      # mounts ConfusionSpikePanel
  lib/
    api.js                  # appended `doubtApi` namespace
    sounds.js               # Web Audio API cues (tap / send / deny)
```

## Testing

```
$ cd backend && npx jest src/__tests__/doubtService.test.js

Tests: 28 passed, 28 total
```

Coverage areas:

- `hashStudent`: determinism, salt-rotation, format
- `recordDoubt`: anonymization, room lifecycle, anti-spam, clamping
- `retractLatestDoubt`: ownership, time-window, multi-student safety
- `getDoubtCountsBySegment`: aggregation, retraction exclusion
- `detectSpikes`: threshold math, snippet enrichment, sorting

## Audio feedback (UX detail)

The student button has three Web Audio API cues (`frontend/src/lib/sounds.js`):

- `tap()`: idle press — short sine ping (880Hz)
- `send()`: confirmed — ascending C-E-G chime
- `deny()`: cooldown / error — muted low thud

Browser audio policy requires a user gesture before AudioContext can play.
First click initializes the context; subsequent clicks play cues.

## What's deferred (explicit non-goals)

- **Audio-quality signal**: a "🔊 can't hear" button separate from "I'm
  confused". A classroom audio outage causes uniform confusion that
  shouldn't be treated as a concept spike. This requires mic-level
  detection (frontend) and a separate aggregation path (backend). Deferred.
- **Per-question spike badge**: a small "⚠ N students were lost during
  this question" badge on `RoomResultsPage`. Easy follow-up.
- **Teacher annotations**: let the teacher mark a spike as "explained"
  and dismiss it from the panel. Currently teacher ignores spikes by
  refreshing the page. Deferred.
- **Differential privacy**: epsilon-greedy noise on small counts. Out of
  scope for v1.

## Open questions for review

1. Is `minMarkCount=3` the right floor for small classrooms (≤10 students)?
2. Should the retract window be longer (e.g. 5 minutes) so a student who
   pressed "I'm lost" and then realized they were just momentarily
   distracted can undo?
3. Should `studentHash` be stored at all, or only an opaque bucket id
   (random UUID per signal)? The current design lets us distinguish
   "same student pressed twice" from "two students pressed once" — useful
   for anti-spam but arguably unnecessary. Bucket-id model would be
   stronger privacy.
# v0.5.3 — Transcript Segmentation & Persistence

| Field | Value |
|---|---|
| Version | 0.5.3 |
| Group | 0.5 — Audio & Transcription |
| Status | Released |
| Goal | Organize recognized speech into ordered, timestamped segments for a room and store them, so the transcript can drive question generation and be replayed later. |

## References & prerequisites
Assumes these earlier chunks are already built:
- **0.1** — application skeleton and configuration loading.
- **0.2** — identity & access foundation: Teacher/Student/Admin roles, role-based authorization, and the admin teacher-approval gate (the reusable **approved-teacher** guard). These restrictions already exist, so this feature simply applies them.
- **0.3.x** — rooms owned by teachers, with the room-owner guard, and room membership for students.
- **0.5.1** — lecture audio capture (short successive clips).
- **0.5.2** — server-side recognition that turns clips into recognized text.

External references the implementing agent should consult: its persistence layer's documentation for indexed storage and ordered retrieval.

## Purpose
Recognition (0.5.2) produces text a clip at a time. This chunk assembles that text into meaningful, ordered units for a room and stores them durably, turning fleeting recognition output into a persistent lecture transcript. The stored transcript becomes the single source that question generation reads and that supports replaying the lecture text.

## Functional requirements
1. **Assemble segments.** Recognized text is accumulated, in spoken order, into a **segment** — a unit of transcript corresponding to a stretch of the lecture. A lecture yields an ordered series of segments, numbered from the first.
2. **Persist a segment.** A completed segment is stored against its room with: the room it belongs to, its position in the ordered series, the accumulated text, how it was captured, the teacher who produced it, and timing/size information (segment duration and a word count). The time it was stored is recorded.
3. **Distinguish origin.** Each stored transcript records how it was captured — recognized lecture **audio**, or text the teacher **pasted** directly. Pasted text is not part of the spoken audio series and is stored with a reserved position that never collides with an audio segment's position.
4. **Read a room's transcript.** All stored segments for a room can be retrieved in order, and a single segment can be fetched by its position, so the transcript can be reviewed, fed to question generation, or replayed.
5. **Idempotent, ordered growth.** As the lecture proceeds, new segments are appended in order without disturbing earlier ones; retrieval always returns them in spoken order regardless of the order they were written.
6. **Required fields enforced.** A transcript cannot be stored without at least a room, a position, and non-empty text; incomplete writes are rejected with a clear error.

## Data handled
- **Stored per segment:** room reference, ordered position, capture origin (audio or pasted), producing teacher, the text, a duration, a word count, and a creation time.
- **Retrieved:** a room's segments in order, or one segment by position.
- The transcript is the input other features read; this chunk owns its storage and retrieval, not its consumption.

## Security requirements
- **Write is owner-only.** Only the **approved teacher who owns the room** may add or store a transcript segment for that room, using the approved-teacher and room-owner guards from **0.2** and **0.3**. Without this, any authenticated user who knew a room's identifier could inject transcript text into it; that is refused.
- **Read is scoped to the room.** A room's transcript may be read only by that room's owning teacher or by a student who is a member of the room; anyone else is refused. A room identifier alone never exposes another room's transcript.
- Every read and write requires an authenticated user.

## Performance & scaling requirements
- Storage is indexed by room and segment position so retrieving a room's transcript in order, or locating one segment, stays fast as the number of segments grows.
- Persisting a segment must not block the live lecture flow: a slow or failed store of one segment must not stop the teacher from continuing to record and generate for the next segment.
- The design works across multiple application instances, since transcripts live in shared storage rather than in any one instance's memory.

## Configuration
- No feature-specific configuration beyond the shared persistence layer already established. The reserved position used for pasted (non-audio) text is a fixed sentinel, not a tunable setting.

## Acceptance criteria
1. Recognized text from a recording is accumulated in spoken order and stored as an ordered segment for its room.
2. Retrieving a room's transcript returns its segments in the order they were spoken.
3. A single segment can be fetched by its position.
4. Pasted text is stored with the correct origin and its reserved position, never colliding with an audio segment.
5. A teacher who does not own the room, or a non-member student, cannot write or read that room's transcript.
6. A write missing a room, a position, or text is rejected.

## Out of scope (built elsewhere)
- Capturing the audio and recognizing it — **0.5.1 / 0.5.2**.
- Generating questions from the stored transcript — **0.6**.
- The in-lecture live transcript panel and lecture replay UI.

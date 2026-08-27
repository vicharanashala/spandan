# v0.5.1 — Lecture Audio Capture

| Field | Value |
|---|---|
| Version | 0.5.1 |
| Group | 0.5 — Audio & Transcription |
| Status | Released |
| Goal | Let the room-owning teacher record lecture audio inside the room, captured as short successive clips suitable for streaming speech recognition. |

## References & prerequisites
Assumes these earlier chunks are already built:
- **0.1** — application skeleton and configuration loading.
- **0.2** — identity & access foundation: Teacher/Student/Admin roles, role-based authorization, and the admin teacher-approval gate (the reusable **approved-teacher** guard). These restrictions already exist, so this feature simply applies them.
- **0.3.x** — rooms owned by teachers, with the room-owner guard.
- **0.4.x** — the realtime room experience the teacher and members share.

External references the implementing agent should consult: its front-end runtime's audio-capture and media-recording facilities.

## Purpose
Give the teacher a way to record a live lecture from inside the room, producing a stream of short audio clips that a recognition service can turn into text. Capture is designed so that speech becomes available continuously during the lecture rather than only at the end.

## Functional requirements
1. **Recording controls in the room.** The room screen offers the owning teacher a way to start, pause, resume, and stop recording. Recording state is clearly indicated so the teacher always knows whether audio is being captured.
2. **Audio source.** On start, the application obtains access to the teacher's live audio input (the microphone in the ordinary case, or shared presentation audio where the room is running a screen/video session). If access is denied, recording does not start and the teacher is told why.
3. **Capture in short successive clips.** While recording, audio is captured as a continuous sequence of short, self-contained clips (on the order of a few seconds each) rather than one long file. Each clip stands on its own and is ready to be recognized as soon as it closes; the next clip begins immediately so no speech is lost between clips.
4. **Ordering.** Every clip carries a monotonically increasing sequence number so that, however recognition returns, the recognized text can later be reassembled in the order it was spoken.
5. **Prepare each clip for recognition.** Before a clip leaves the client it is put into the form the recognition service expects (a mono, fixed-sample-rate representation). Empty or too-small clips are skipped rather than sent.
6. **Pause/resume without loss.** Pausing halts capture cleanly; resuming continues the same recording session and sequence without duplicating or dropping clips, even when a pause lands while a clip is still being handled.
7. **Stop cleanly.** Stopping ends capture, finishes handling the final clip, and releases the audio device.

## Data handled
- **Produced:** a stream of short audio clips, each with a sequence number and a known sample rate, handed onward for recognition.
- No audio file is persisted by this chunk; clips are transient. Recognition is **0.5.2** and persistence is **0.5.3**.

## Security requirements
- Only an authenticated, **approved teacher** who **owns the room** may start recording for that room, using the approved-teacher and room-owner guards established in **0.2** and **0.3**. Students and non-owning teachers have no recording controls and cannot capture audio for a room they do not own.
- Audio capture begins only after the teacher's browser grants explicit device permission; the application never captures silently.

## Performance & scaling requirements
- Capturing in short clips keeps each recognition request small and lets recognized text appear during the lecture instead of only after it ends.
- Clip capture must be resilient to a fast pause-then-resume: a superseded capture window must never disturb the active one, so recording cannot silently stall.
- Capture and the sending of clips run without freezing the room interface; the teacher can keep interacting while recording.

## Configuration
- The approximate length of each capture clip (short enough for responsiveness, long enough to carry usable speech).
- The preferred capture encoding, chosen from those the teacher's browser supports.

## Acceptance criteria
1. An approved owning teacher can start recording from the room screen and sees a clear "recording" indication.
2. While recording, audio is emitted as a series of short, sequence-numbered clips, each prepared for recognition.
3. Pausing then resuming continues the same session without duplicating or losing clips.
4. Stopping ends capture and releases the microphone.
5. A student, or a teacher who does not own the room, has no way to record it.

## Out of scope (built elsewhere)
- Turning clips into text (server-side recognition) — **0.5.2**.
- Grouping recognized text into stored, ordered segments — **0.5.3**.
- Generating questions from the transcript — **0.6**.

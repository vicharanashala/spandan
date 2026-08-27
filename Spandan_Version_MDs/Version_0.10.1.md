# v0.10.1 — YouTube Video Mode (with question-pause)

| Field | Value |
|---|---|
| Version | 0.10.1 |
| Group | 0.10 — Delivery modes & polish |
| Status | Released |
| Goal | Let a teacher run a session around a YouTube video (live or recorded) instead of a live lecture, feeding the video's own audio into transcription and pausing the video for the whole question window. |

## References & prerequisites
Assumes these earlier chunks are already built:
- **0.1** — application skeleton and configuration.
- **0.2** — identity & access foundation: Teacher/Student/Admin roles, role-based authorization, and the admin teacher-approval gate (the reusable **approved-teacher** guard), plus the **room-owner** guard used on live actions.
- **0.3.x** — rooms owned by teachers, with a room-settings sub-object.
- **0.4** — the realtime layer: authorized live channels per room where only the room's owner may emit control events and joiners are placed in the room's channel.
- **0.5** — the transcription pipeline that turns short audio clips into text.
- **0.7** — the polling loop: segment timer, question generation, teacher approval, launch, student answering, leaderboard, and the live "question started" / "question ended" signals.

## Purpose
Add a second way to run a room. Instead of speaking into a microphone, the teacher plays a YouTube video — recorded or live — and the same polling loop runs against the video's spoken content. The only differences from a normal room are the audio input source and a shared video surface on both teacher and student screens; everything downstream (segment timing, generation, approval, launch, answering) is reused unchanged.

## Functional requirements
1. **Mode choice at room creation.** A teacher creating a room chooses Normal mode (microphone, as today) or Video mode. In Video mode the teacher supplies a YouTube link, which may be a recorded video or a live stream; both are supported. The chosen mode and the link are stored with the room; existing rooms default to Normal.
2. **Shared video surface.** In a Video-mode room a video player appears on both the teacher's and every student's screen, playing the linked video.
3. **Video's audio drives transcription.** The teacher's browser captures the audio of the playing video (from the tab that is playing it) and feeds it into the existing transcription pipeline in place of the microphone. Capture starts and stops with playback so silence is not transcribed while the video is paused.
4. **Same polling loop.** Segment length is measured in video actually watched, not wall-clock: the segment countdown advances only while the teacher's video is playing and freezes when it is paused. When a segment completes, the existing generate → approve → launch flow runs against the accumulated transcript.
5. **Pause for the question window.** When a question goes live the video pauses for everyone for the whole question window, so no one is watching while answering; when the question ends the video resumes. This rides the existing "question started" / "question ended" live signals — no separate control is required for it.
6. **Independent student playback with a forward limit.** Each student plays at their own pace. Students may pause and seek backward to re-watch, but may not seek forward past the furthest point already reached — either their own furthest-watched point or the teacher's current position, whichever is further. On a live stream forward-seek past the live edge is inherently impossible, so the rule holds automatically; on resume after a question a live stream returns to the live edge.
7. **Teacher position broadcast.** The teacher's current playback position is broadcast to the room periodically so students (including late joiners and reloads) know the class's frontier, which becomes the ceiling for the forward-seek limit. A joiner receives the last known position on entering the room.
8. **Editable link and browser guidance.** The teacher can change the video link from the room page. Because reliable tab-audio capture depends on the browser, the teacher is guided to use a browser that supports it; students only watch and are unaffected.

## Data handled
- **Input:** the room's mode and YouTube link; the tab audio of the playing video (fed to transcription as short clips); the teacher's playback position.
- **Output:** the same transcript and generated questions as a normal room; a per-room "current teacher position" relayed to students.
- No new video content is stored — only the link. Audio persistence follows the transcription pipeline's existing behavior.

## Security requirements
- Creating or editing a Video-mode room is restricted to an **approved teacher** and to the **room owner**, using the guards from **0.2**.
- The teacher position and the pause/resume signals are **owner-only** control events on the room's authorized live channel from **0.4**: only the room's owner may emit them; students receive them and cannot forge them.
- The forward-seek limit is enforced on the student's own client and is honor-level, consistent with the trust model of the rest of the app; it is a classroom nicety, not a security boundary.

## Performance & scaling requirements
- A Video-mode room places the same transcription load as a normal room (the same short-clip pipeline), so it introduces no new server-side load category and no new service.
- Audio capture, the video surface, and the forward-seek limit are all handled on the client, adding nothing to the request path.
- The teacher-position broadcast is a small, infrequent message and must not compete with polling traffic.

## Configuration
- The per-room mode (Normal or Video) and the video link.
- Whichever domains the video player and its assets are served from must be permitted by any content-security policy the deployment applies, so the player is not blocked.

## Acceptance criteria
1. A teacher can create a room in Video mode with a YouTube link; the video player appears on both teacher and student screens, and existing Normal-mode rooms are unaffected.
2. Playing the video produces a transcript and generates questions per segment, exactly as the microphone does in Normal mode; the segment countdown freezes while the video is paused.
3. When a question goes live the video pauses for everyone and resumes when the question ends.
4. A student can pause and rewind but cannot seek forward past the class frontier; a live stream stays at the live edge and returns to it after a question.
5. Only the room owner can move the shared position or pause/resume the room; a student cannot.

## Out of scope (built elsewhere)
- The segment/generation/approval/answering loop itself — **0.7**.
- The transcription pipeline — **0.5**.
- The in-app help describing this mode — **0.10.2**.

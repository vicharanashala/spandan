# Spandan — Version Build Specs

A sequential set of **requirement/feature specs** that rebuild the Spandan platform from an empty repository up to the current production release. Each version is a small, self-contained chunk. Read one chunk and build it **on top of** everything the lower-numbered chunks already delivered; do all of them in order and you arrive at today's Spandan.

## How to use these specs
- **Execute in order.** Every chunk lists its prerequisites — the lower chunks that must already be built.
- **They describe the *what*, not the *how*.** These are code-free requirements. The implementing agent (or developer) writes its own code, chooses its own libraries, and brings its own references.
- **Foundations come first.** Identity, roles, and their restrictions are established up front (0.2) and simply *applied* by later features — there is no "build it loose now, secure it later." Security and scalability are stated as inherent requirements of each feature, never a later pass.
- **Each file is self-contained:** References & prerequisites → Purpose → Functional requirements → Data handled → Security requirements → Performance & scaling requirements → Configuration → Acceptance criteria → Out of scope.

## Roadmap

### 0.1 — Foundation
- [[v0.1 — Monorepo scaffold & deployment skeleton|Version_0.1]]

### 0.2 — Identity & Access *(the one place roles + restrictions are defined)*
- [[v0.2.1 — Authentication core|Version_0.2.1]]
- [[v0.2.2 — Identity & access model (roles, admin approval, guards)|Version_0.2.2]]
- [[v0.2.3 — Authentication frontend|Version_0.2.3]]

### 0.3 — Rooms & Dashboards
- [[v0.3.1 — Rooms & joining by code|Version_0.3.1]]
- [[v0.3.2 — Teacher & student dashboards|Version_0.3.2]]
- [[v0.3.3 — Room lifecycle & settings|Version_0.3.3]]
- [[v0.3.4 — Profile & theming|Version_0.3.4]]

### 0.4 — Real-time
- [[v0.4.1 — Real-time foundation|Version_0.4.1]]
- [[v0.4.2 — Multi-instance readiness|Version_0.4.2]]

### 0.5 — Audio & Transcription
- [[v0.5.1 — Lecture audio capture|Version_0.5.1]]
- [[v0.5.2 — Server-side transcription service|Version_0.5.2]]
- [[v0.5.3 — Transcript segmentation & persistence|Version_0.5.3]]

### 0.6 — AI Question Generation
- [[v0.6.1 — Question generation from transcript|Version_0.6.1]]
- [[v0.6.2 — Multiple model providers|Version_0.6.2]]
- [[v0.6.3 — Asynchronous question generation|Version_0.6.3]]
- [[v0.6.4 — Paste-and-generate|Version_0.6.4]]
- [[v0.6.5 — Review, edit & approve|Version_0.6.5]]

### 0.7 — Live Polling & Answering
- [[v0.7.1 — Launch & broadcast a poll|Version_0.7.1]]
- [[v0.7.2 — Student answering & response recording|Version_0.7.2]]
- [[v0.7.3 — Single- & multi-select types|Version_0.7.3]]
- [[v0.7.4 — Segment-timer automation|Version_0.7.4]]
- [[v0.7.5 — Answer integrity|Version_0.7.5]]
- [[v0.7.6 — Manual polling|Version_0.7.6]]

### 0.8 — Scoring, Leaderboard, Results & Exports
- [[v0.8.1 — Time-decay scoring|Version_0.8.1]]
- [[v0.8.2 — Live leaderboard|Version_0.8.2]]
- [[v0.8.3 — Results & statistics pages|Version_0.8.3]]
- [[v0.8.4 — Teacher CSV export|Version_0.8.4]]
- [[v0.8.5 — Research export API|Version_0.8.5]]

### 0.9 — Additional Sign-in Methods
- [[v0.9.1 — Email-OTP verified registration|Version_0.9.1]]
- [[v0.9.2 — Password reset by email|Version_0.9.2]]
- [[v0.9.3 — Google OAuth sign-in|Version_0.9.3]]

### 0.10 — Video, Help & Testing
- [[v0.10.1 — YouTube Video Mode|Version_0.10.1]]
- [[v0.10.2 — In-app Help / Manual|Version_0.10.2]]
- [[v0.10.3 — Testing & CI foundation|Version_0.10.3]]

### 1.0 — Production
- [[v1.0 — Stable production release|Version_1.0]]

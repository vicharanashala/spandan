## Uncommitted Changes Summary

This document outlines the differences between the local working directory and the committed state of the project on GitHub.

### 1. `backend/src/routes/dashboard.js`
*   **Teacher Ownership Check:** Uncommented the return statement in `GET /teacher/:roomCode` so that teachers are actively rejected (`403 Forbidden`) if they try to access a dashboard for a room they don't own.
*   **Locked Down Demo Endpoint:** Wrapped the `POST /demo-seed/:roomCode` endpoint with a `NODE_ENV === 'production'` check to return a `404`, completely disabling fake data injection in production environments.
*   **Secured Error Messages:** Replaced the generic `res.status(500).json({ error: error.message })` in all catch blocks to prevent leaking internal stack traces. They now log the full error server-side and return safe, context-specific error strings (e.g., `"Failed to load teacher dashboard"`).
*   **Constants Extraction:** Extracted the inline fallback structures for `stats` into top-level constants (`DEFAULT_ROOM_STATS` and `DEFAULT_QUESTION_STATS`) to remove code duplication.

### 2. `ai-service/src/services/llmService.js`
*   **Renamed Function:** Changed `getPersonalizedRecommendation` to `getAdaptiveQuestionCategory`.
*   **Updated JSDoc/Prompting:** Updated the comments and internal prompt string to explicitly state this AI tool determines the *optimal category of question to generate next* (recall/analysis/calculation) during a live session, explicitly clarifying it is not a post-session study recommendation.
*   **Secured Error Messages:** Updated the internal catch blocks to match the new adaptive terminology.

### 3. `ai-service/src/routes/aiRoutes.js`
*   **Updated Imports:** Replaced the `getPersonalizedRecommendation` import with `getAdaptiveQuestionCategory`.
*   **Renamed Route & Variables:** Changed the API endpoint path from `GET /personalized-recommendations/:studentId` to `GET /adaptive-question-category/:studentId`.
*   **Updated Response Shape:** Changed the JSON response key from `recommendation` to `recommendedCategory`.

### 4. `README.md`
*   **Clarified Terminology:** Replaced the bullet point for "Personalized Recommendations" under the AI microservice section with "**Adaptive Question Selection**" and explicitly noted it steers live question generation.
*   **Added Scope Section:** Added a new `## Scope` section near the top, explicitly defining that this PR strictly concerns *in-session, real-time functionality* (WebSockets, live scoring, AI generation) and does not touch out-of-scope features like post-session notes or revision workflows.

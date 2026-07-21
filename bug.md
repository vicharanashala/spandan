# Spandan - Open Bugs and Security Vulnerabilities Log

This document lists all active bugs, security vulnerabilities, and logic flaws identified in the Spandan repository.

---

## 🔴 BUG 1: SSO Authentication Bypass (Account Takeover)
*   **Vulnerability Type**: Authentication Bypass / Lack of Backend Token Validation
*   **Location**: [backend/src/routes/auth.js:L186-219](file:///c:/Users/ssaur/Desktop/span/spandan/backend/src/routes/auth.js#L186-219)

### 1. Bug Description
The Single Sign-On (SSO) route `/api/auth/samagama-auto-login` allows a client to log in as any user (including teachers, students, or administrators) by sending a simple HTTP POST request containing a raw email, name, and admin flags, without providing any verified credentials or signing tokens.

### 2. Root Cause
The backend server blindly trusts the profile payload sent by the frontend, assuming the frontend has already completed verification. Because client-side requests can be spoofed or bypassed using tools like curl or Postman, anyone can call the endpoint directly with an administrator's email and gain full access to their account.

### 3. Suggested Solution
Modify the route to accept the `samagamaToken` in the payload. The backend must then call the `samagama.in` user profile endpoint directly using this token to verify the user's identity before logging them in.
```javascript
router.post('/samagama-auto-login', async (req, res) => {
  const { samagamaToken } = req.body;
  if (!samagamaToken) return res.status(400).json({ error: 'Missing token' });

  // Call Samagama API directly from backend to verify token validity
  const verificationRes = await fetch('https://samagama.in/api/auth/me', {
    headers: { Authorization: `Bearer ${samagamaToken}` }
  });

  if (!verificationRes.ok) {
    return res.status(401).json({ error: 'Invalid SSO Token' });
  }

  const { user } = await verificationRes.json();
  const spandanUser = await findOrCreateSamagamaUser({
    email: user.email,
    name: user.name,
    isAdmin: user.isAdmin,
    isSuperAdmin: user.isSuperAdmin
  });

  const token = generateToken(spandanUser._id);
  res.json({ user: spandanUser.toJSON(), token });
});
```

---

## 🔴 BUG 2: Student Cheat Vulnerability (Answer Key Leak)
*   **Vulnerability Type**: Information Leakage / Insufficient Database Filtering
*   **Location**: [backend/src/routes/questions.js:L109-157](file:///c:/Users/ssaur/Desktop/span/spandan/backend/src/routes/questions.js#L109-157)

### 1. Bug Description
Students enrolled in a session can access the entire room's question bank (including unreleased/upcoming questions in `pending` status) along with the correct answers simply by calling `GET /api/questions?roomId=xxx`.

### 2. Root Cause
The route `/api/questions` permits access to both teachers and students who are members of the room. However, it performs a raw database query `Question.find({ roomId })` without filtering out unapproved questions or stripping the `isCorrect` property from the `options` array for student requests.

### 3. Suggested Solution
Add role-based filtering and data sanitization to the database query:
```javascript
const filter = { roomId };
if (currentUser.role === 'student') {
  filter.status = 'approved'; // Only show launched questions
}

const questions = await Question.find(filter).lean();

if (currentUser.role === 'student') {
  questions.forEach(q => {
    // Strip isCorrect markers to prevent cheating
    q.options = q.options.map(opt => ({ text: opt.text }));
  });
}
```

---

## 🔴 BUG 3: Server Crash on Student History Page (`TypeError`)
*   **Vulnerability Type**: Runtime Crash / Null Pointer Exception
*   **Location**: [backend/src/services/roomService.js:L113](file:///c:/Users/ssaur/Desktop/span/spandan/backend/src/services/roomService.js#L113)

### 1. Bug Description
When a student logs in and navigates to their dashboard/history page, the entire backend server crashes if any room they attended in the past has been deleted by a teacher.

### 2. Root Cause
The service `getRoomsByStudent` fetches response documents and populates their `roomId` field. If a room has been deleted, `r.roomId` is `null`. The code performs a `.map()` to extract room IDs: `responseRooms.map(r => r.roomId._id.toString())`. Because `r.roomId` is null, calling `._id` throws `TypeError: Cannot read properties of null (reading '_id')`.

### 3. Suggested Solution
Add a `.filter()` condition to remove null references prior to mapping the array:
```javascript
const uniqueResponseRoomIds = [...new Set(
  responseRooms
    .filter(r => r.roomId !== null)
    .map(r => r.roomId._id.toString())
)]
```

---

## 🔴 BUG 4: Database Leak (Orphaned Collections on Room Deletion)
*   **Vulnerability Type**: Data Leak / Missing Cascade Deletes
*   **Location**: [backend/src/services/roomService.js:L70-76](file:///c:/Users/ssaur/Desktop/span/spandan/backend/src/services/roomService.js#L70-76)

### 1. Bug Description
Deleting a room removes the room document from the database, but leaves all associated student responses, question banks, transcript segments, and room member lists orphaned in MongoDB. Over time, this leads to bloated storage and dangling references.

### 2. Root Cause
The `deleteRoom` service only calls `Room.findByIdAndDelete()` without executing delete commands for related collections.

### 3. Suggested Solution
Execute cascading deletes across related collections when a room is removed:
```javascript
export const deleteRoom = async (roomId) => {
  const room = await Room.findByIdAndDelete(roomId)
  if (!room) {
    throw new Error('Room not found')
  }

  // Cascading deletes
  await RoomMember.deleteMany({ roomId });
  await Question.deleteMany({ roomId });
  await Response.deleteMany({ roomId });
  await Transcript.deleteMany({ roomId });

  return room;
}
```

---

## 🔴 BUG 5: Response Leak (Access Control Bypass)
*   **Vulnerability Type**: Access Control Bypass / Information Disclosure
*   **Location**: [backend/src/routes/responses.js:L140-150](file:///c:/Users/ssaur/Desktop/span/spandan/backend/src/routes/responses.js#L140-150)

### 1. Bug Description
Students can fetch all other students' submitted options, points earned, and response times for a classroom session by making an HTTP request to `GET /api/responses?roomId=xxx` and omitting the `studentId` query parameter.

### 2. Root Cause
The route allows students who are members of the room to query responses. While it restricts querying a *different* student's responses if `studentId` is passed, it fails to enforce any constraint if `studentId` is left undefined in the query, returning all room responses.

### 3. Suggested Solution
Enforce a filter for students to only view their own responses:
```javascript
const filter = { roomId };
if (currentUser.role === 'student') {
  filter.studentId = currentUser._id; // Force self-view
} else if (studentId) {
  filter.studentId = studentId;
}
```

---

## 🔴 BUG 6: Audio Decoders Mismatch in `transcriptionServer.js`
*   **Vulnerability Type**: Functional Breakdown / WebSocket Server Crash
*   **Location**: [backend/src/transcriptionServer.js:L95 & L129](file:///c:/Users/ssaur/Desktop/span/spandan/backend/src/transcriptionServer.js#L95)

### 1. Bug Description
The standalone WebSockets-based transcription server fails to transcribe audio and output results, or crashes, when receiving streaming data from clients.

### 2. Root Cause
`transcriptionServer.js` receives base64-encoded WebM/WAV buffers via WebSockets, decodes them, and passes the raw buffer directly to the local Whisper pipeline: `transcriber(audioBuffer, ...)`. However, Whisper expects a normalized `Float32Array` of PCM audio samples rather than raw file bytes.

### 3. Suggested Solution
Port the WebM/WAV audio conversion code from the HTTP transcription router into the WebSockets handler to decode, sample, and parse the buffer into a standard `Float32Array` before feeding it to the transcriber pipeline.

---

## 🔴 BUG 7: Vite Dev Server Proxy Path Mismatch (Unexpected end of JSON input)
*   **Vulnerability Type**: Configuration Mismatch / Dev Server Proxy Failure
*   **Location**: [frontend/vite.config.js](file:///c:/Users/ssaur/Desktop/span/spandan/frontend/vite.config.js) & [frontend/.env](file:///c:/Users/ssaur/Desktop/span/spandan/frontend/.env)

### 1. Bug Description
When attempting to Register or Log In on the UI during local development, the frontend fails with the error message: `Failed to execute 'json' on 'Response': Unexpected end of JSON input` or redirects unexpectedly.

### 2. Root Cause
In local development, Vite is configured to proxy API requests from `/api` to the backend on `http://localhost:3001`. However, because `VITE_BASE_PATH` is copied as `/spandan` from `.env.example`, the frontend sets `API_URL` to `/spandan/api`. Since Vite's proxy rules do not match `/spandan/api`, the requests are not proxied. Instead, Vite's SPA fallback serves `index.html` (with a 200 OK status code), causing `response.json()` to fail when parsing the HTML as JSON.

### 3. Suggested Solution
1. Empty `VITE_BASE_PATH=` in `frontend/.env` for local development.
2. Update `frontend/vite.config.js` to dynamically prefix the proxy paths with the custom `VITE_BASE_PATH` and rewrite the paths appropriately before forwarding them to the backend:
```javascript
const basePath = process.env.VITE_BASE_PATH ? '/' + process.env.VITE_BASE_PATH.replace(/^\//, '').replace(/\/+$/, '') : ''

// In vite.config.js proxy config:
proxy: {
  [`${basePath || ''}/api`]: {
    target: 'http://localhost:3001',
    changeOrigin: true,
    rewrite: (path) => basePath ? path.replace(new RegExp(`^${basePath}`), '') : path
  },
  [`${basePath || ''}/socket.io`]: {
    target: 'http://localhost:3001',
    ws: true,
    rewrite: (path) => basePath ? path.replace(new RegExp(`^${basePath}`), '') : path
  }
}
```


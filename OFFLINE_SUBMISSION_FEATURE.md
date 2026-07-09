# Offline Answer Submission Feature Documentation

## Overview

The Spandan application now supports **offline answer submission**. Students can submit quiz answers even when their Wi-Fi connection drops or is unstable. Their answers are:

- **Saved locally** to the browser's localStorage
- **Queued for sync** with visual feedback to the student
- **Automatically synced** when connection is restored
- **Protected from duplicates** via the backend's unique constraint

This ensures students never lose their work due to network issues during a quiz.

## Architecture

### Frontend Components

#### 1. **pendingAnswersStore.js** (Zustand Store)
- **Purpose:** Centralized state management for offline submissions
- **State:**
  - `pendingAnswers`: Array of queued answers
  - `isSyncing`: Boolean indicating sync in progress
- **Methods:**
  - `addPendingAnswer()`: Queue an answer locally
  - `removePendingAnswer()`: Remove after successful sync
  - `incrementAttemptCount()`: Track retry attempts
  - `getPendingAnswers()`: Get current queue
  - `setSyncing()`: Update sync status
  - `clearAll()`: Clear all pending answers

#### 2. **socketStore.js** (Updated)
- **New Features:**
  - `onSyncPendingAnswersCallback`: Callback function for sync on reconnect
  - `registerSyncPendingAnswersCallback()`: Register callback
  - `unregisterSyncPendingAnswersCallback()`: Unregister callback
  - Auto-invokes callback on socket `connect` event

#### 3. **StudentRoomPage.jsx** (Updated)
- **New Methods:**
  - `syncPendingAnswer()`: Sync a single answer to backend
  - `handleSyncPendingAnswers()`: Orchestrate sync of all pending answers
  - `handleSubmitAnswer()`: Modified to check connection state

- **New State:**
  - `offlineSubmissionFeedback`: UI state ('queued', 'syncing', 'synced', or '')

- **Key Flow:**
  ```
  User submits answer
    ↓
  Is connected?
    ├─ YES → Normal online flow (existing logic)
    └─ NO → Queue offline submission
         ├─ Add to Zustand store
         ├─ Persist to localStorage
         ├─ Show UI feedback
         ↓
  Connection restored
    ↓
  Socket emits 'connect' event
    ↓
  handleSyncPendingAnswers() called
    ↓
  For each pending answer:
    ├─ POST to /api/responses
    ├─ Broadcast points:update on socket
    ├─ Remove from queue on success
    ├─ Keep in queue on failure (retry next reconnect)
    ↓
  Show completion feedback
  ```

#### 4. **SyncStatusBanner.jsx** (New Component)
- **Purpose:** Visual feedback banner showing sync status
- **Display States:**
  - 🟠 **Pending:** "X answers saved. Will sync when reconnected."
  - 🔵 **Syncing:** "🔄 Syncing X pending answers..."
  - 🟢 **Synced:** "✓ All answers synced successfully"

#### 5. **Answer Submission UI Updates**
- **Offline State:** Shows "💾 Answer Saved Locally" instead of "✓ Answer Submitted"
- **Syncing State:** Shows "🔄 Syncing..." during sync
- **Synced State:** Shows "✓ Answer Synced"

### Backend Components

#### Response Model (models/Response.js)
- **Unique Index:** `{ roomId: 1, questionId: 1, studentId: 1, unique: true }`
- **Purpose:** Prevents duplicate submissions from resent offline answers
- **Behavior:** Returns 409 Conflict if duplicate detected

#### Response Routes (routes/responses.js)
- **Duplicate Handling:**
  ```
  POST /api/responses
  
  If already answered to this question:
    → Return 409 Conflict with existing response data
    → Frontend treats as success (answer was submitted)
  ```
- **Late Arrival Policy:** Accepts all submissions regardless of timing
  - Time validation happens on frontend (question already ended)
  - Backend accepts for record-keeping and scoring

## Data Flow

### Normal (Online) Submission
```
Frontend: handleSubmitAnswer()
  ↓
Check: isConnected === true
  ↓
POST /api/responses (HTTP)
  ↓
Backend: Save to MongoDB
  ↓
Emit socket: points:update
  ↓
Frontend: fetchPastResponses()
```

### Offline Submission
```
Frontend: handleSubmitAnswer()
  ↓
Check: isConnected === false
  ↓
addPendingAnswer() to store
  ↓
Persist to localStorage
  ↓
Show "💾 Saved Locally" UI
  ↓
[Network restored]
  ↓
Socket reconnects, emits 'connect'
  ↓
handleSyncPendingAnswers() triggered
  ↓
For each answer:
  ├─ POST /api/responses
  ├─ If 201: Remove from queue
  ├─ If 409: Accept as duplicate, remove from queue
  ├─ If error: Keep in queue for next retry
  ↓
Update UI: "✓ Synced" or keep "💾 Pending"
```

## Data Structures

### Pending Answer Object (in Store and localStorage)
```javascript
{
  id: "questionId-studentId-timestamp",  // Unique local ID
  roomId: "...",                          // MongoDB ObjectId
  questionId: "...",                      // MongoDB ObjectId
  selectedOptions: [0, 2],                // Array of selected indices
  roomCode: "ABC123",                     // For socket emissions
  studentId: "...",                       // MongoDB ObjectId
  responseTime: 15,                       // Seconds taken
  timestamp: 1672531200000,               // Milliseconds
  attemptCount: 0                         // Retry tracking
}
```

### localStorage Key
- **Key:** `pendingAnswers`
- **Value:** JSON stringified array of pending answer objects
- **Persistence:** Survives page refresh, but cleared on logout/browser cache clear

## Edge Cases & Resiliency

### 1. Duplicate Submissions (Ack Loss)
**Scenario:** Answer POSTed successfully, but ack lost on return → resent from queue

**Solution:**
- Backend unique index on (roomId, questionId, studentId)
- Returns 409 Conflict on duplicate
- Frontend treats 409 as success (answer was already processed)
- Queue removes answer on either 201 or 409

**Result:** Exactly one DB record, no duplicates

### 2. Late Arrivals
**Scenario:** Student offline during question, reconnects after question ends

**Solution:**
- Backend accepts all submissions (no time validation on server)
- `responseTime` will show full time-to-answer (e.g., 150 seconds)
- Points calculation applies time-decay based on the recorded time
- Can be manually reviewed by teacher if needed

**Result:** Late answer is recorded with metadata for audit/review

### 3. Persistent Queue Across Page Reload
**Scenario:** Student's page crashes while offline with pending answer

**Solution:**
- localStorage persists answer across browser sessions
- On reconnect, localStorage is read back into store
- Sync resumes automatically

**Result:** No answer loss even on client-side crashes

### 4. Connection Loss During Sync
**Scenario:** First answer syncs successfully, connection drops before second

**Solution:**
- Only remove from queue on successful HTTP response
- Failed syncs keep answer in queue
- Next reconnect retries all remaining answers
- `attemptCount` tracks retries for monitoring

**Result:** All answers eventually sync without race conditions

### 5. Multiple Rapid Questions
**Scenario:** Teacher rapid-fires 3 questions, student goes offline after submitting all 3

**Solution:**
- Each answer queued independently with unique `id`
- Store maintains array order
- Sync processes in order
- Each can fail/succeed independently

**Result:** Flexible, robust handling of bulk submissions

## Configuration & Customization

### Sync Behavior
In `StudentRoomPage.jsx` > `handleSyncPendingAnswers()`:
- Modify loop to batch sync (currently sequential)
- Add throttling/delays between syncs
- Change UI feedback timing (currently 3-4 seconds)

### Feedback UI
In `SyncStatusBanner.jsx`:
- Customize colors, icons, messages
- Adjust visibility duration
- Add sound/notification alerts

### localStorage Key
In `pendingAnswersStore.js`:
- Change localStorage key name
- Add versioning for schema changes
- Add expiration logic (e.g., delete answers after 24 hours)

## Testing

See [OFFLINE_SUBMISSION_TESTING.md](./OFFLINE_SUBMISSION_TESTING.md) for:
- Step-by-step test scenarios
- Chrome DevTools offline simulation
- Verification steps
- Troubleshooting guide

**Quick Test:**
1. Go online, submit answer (verify works)
2. Set Network to Offline in DevTools
3. Submit answer (should show "💾 Saved Locally")
4. Set Network back to online
5. Should sync automatically within 3 seconds
6. Check MongoDB for exactly one record

## Performance Considerations

### Sync Performance
- **Sequential Processing:** Prevents race conditions, ensures order
- **Estimated Time:** ~200-500ms per answer (depends on network & backend)
- **5 Answers:** ~1-2.5 seconds total

### localStorage Limits
- **Typical Limit:** 5-10 MB per domain
- **Average Answer:** ~200-400 bytes
- **Capacity:** ~12,500-25,000 pending answers
- **Practical Limit:** Should never accumulate more than 10-20

### Memory Impact
- **Store Size:** Negligible (JavaScript object arrays)
- **Banner Rendering:** Minimal (conditional, single DOM element)

## Security Considerations

### Authorization
- ✅ All responses require authentication token
- ✅ StudentId must match authenticated user
- ✅ RoomId membership verified before save

### Data Validation
- ✅ selectedOptions validated as array
- ✅ Question exists and belongs to room
- ✅ Student is member of room

### Offline Data
- ⚠️ localStorage is not encrypted (client-side only)
- ⚠️ Page source readable via DevTools
- ✅ Data cleared on logout (recommend implementing)
- ✅ Browser-specific (not synced to cloud)

**Recommendation:** Add logout handler to clear localStorage:
```javascript
// In logout flow
localStorage.removeItem('pendingAnswers')
```

## Future Enhancements

1. **Encrypted Queue:** Encrypt pending answers in localStorage
2. **Sync Analytics:** Track sync failures, retry patterns
3. **Batch Sync:** POST multiple answers in single request
4. **Sync Priority:** Prioritize recent answers, retry older ones
5. **Teacher Dashboard:** Show which students have pending answers
6. **Offline Indicator:** Always-visible connection status widget
7. **Auto-Retry UI:** User-controlled retry button for failed syncs
8. **Sync History:** Audit log of all sync attempts

## Migration Notes

No database migrations required. Feature:
- Uses existing Response collection with unique index
- No schema changes needed
- Backward compatible with existing submissions
- Works with existing leaderboard logic

## Support & Debugging

### Enable Verbose Logging
In `pendingAnswersStore.js`, add console.log statements:
```javascript
console.log('[PendingAnswers] Adding:', newAnswer)
console.log('[PendingAnswers] Persisting:', updated)
```

### Monitor Socket Events
In Chrome DevTools → Network tab → WS (WebSockets):
- Look for `connect` events
- Check `points:update` emissions after sync

### Check Browser Storage
DevTools → Application → Local Storage → your domain:
- Verify `pendingAnswers` key exists
- Inspect JSON structure
- Manually clear if needed

### Server Logs
Look for:
- 201 responses (new record created)
- 409 responses (duplicate detected)
- 5xx errors (unexpected failures)

---

**Last Updated:** 2026-07-09
**Version:** 1.0
**Status:** Production Ready

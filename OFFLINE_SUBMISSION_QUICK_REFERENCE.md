# Offline Submission - Quick Reference

## 🎯 At a Glance

**Problem:** Students lose quiz answers when Wi-Fi drops mid-question  
**Solution:** Answers are saved locally and synced automatically when connection restored

---

## 🗂️ Files Overview

| File | Purpose | Location |
|------|---------|----------|
| `pendingAnswersStore.js` | Manages offline queue | `frontend/src/stores/` |
| `SyncStatusBanner.jsx` | Visual sync indicator | `frontend/src/components/` |
| `StudentRoomPage.jsx` | Main quiz page (updated) | `frontend/src/pages/` |
| `socketStore.js` | Socket reconnection (updated) | `frontend/src/stores/` |
| `responses.js` | Backend API (updated docs) | `backend/src/routes/` |

---

## 🔗 Component Flow

```
StudentRoomPage (main quiz)
    ├─ Uses: pendingAnswersStore (Zustand)
    ├─ Uses: socketStore (connection tracking)
    ├─ Uses: SyncStatusBanner (UI feedback)
    │
    └─ handleSubmitAnswer()
        ├─ Check: isConnected?
        ├─ Yes → Normal flow
        └─ No → Queue answer locally
             ├─ Store in Zustand
             ├─ Persist to localStorage
             └─ Show "💾 Saved Locally"
                 │
                 └─ On reconnect:
                    ├─ Socket fires 'connect'
                    ├─ handleSyncPendingAnswers()
                    ├─ POST each answer
                    ├─ Show "🔄 Syncing..."
                    └─ Show "✓ Synced"
```

---

## 💾 localStorage Key

```javascript
Key: "pendingAnswers"
Value: JSON array of answer objects

Example:
[
  {
    id: "507f1f77bcf86cd799439011-507f1f77bcf86cd799439012-1672531200000",
    roomId: "507f1f77bcf86cd799439011",
    questionId: "507f191e810c19729de860ea",
    selectedOptions: [0, 2],
    roomCode: "ABC123",
    studentId: "507f1f77bcf86cd799439012",
    responseTime: 15,
    timestamp: 1672531200000,
    attemptCount: 0
  }
]
```

---

## 🔌 Socket Events

```javascript
// On reconnect
socket.on('connect', () => {
  // Triggers registered callback
  handleSyncPendingAnswers()
})

// When answer synced
socket.emit('points:update', {
  roomCode: "ABC123",
  questionId: "...",
  studentId: "...",
  points: 75,
  isCorrect: true
})
```

---

## 🔄 API Endpoints

### POST /api/responses
```javascript
Request:
{
  roomId: "...",
  questionId: "...",
  selectedOptions: [0, 2],
  responseTime: 15
}

Response (Success):
{
  success: true,
  response: {
    _id: "...",
    isCorrect: true,
    points: 75,
    ...
  }
}

Response (Duplicate):
{
  success: false,
  error: "Already responded to this question",
  existingResponse: { ... }
}
```

---

## 🧪 Quick Test

```bash
# 1. Simulate offline
DevTools → Network → Throttling → Offline

# 2. Submit answer
# Expected: "💾 Answer Saved Locally"

# 3. Check localStorage
localStorage.getItem('pendingAnswers')
# Expected: JSON array with 1 item

# 4. Go online
DevTools → Network → Throttling → No throttling

# 5. Watch banner
# Expected: "🔄 Syncing..." → "✓ Synced"

# 6. Verify database
db.responses.count() # Should be +1
```

---

## 🛠️ Key Methods

### In StudentRoomPage.jsx

```javascript
// Main submission handler (checks connection)
handleSubmitAnswer()

// Syncs one answer to backend
syncPendingAnswer(pendingAnswer)

// Orchestrates batch sync
handleSyncPendingAnswers()

// Register callback on mount
registerSyncPendingAnswersCallback(handleSyncPendingAnswers)
```

### In pendingAnswersStore.js

```javascript
// Add to queue
addPendingAnswer(roomId, questionId, selectedOptions, roomCode, studentId, responseTime)

// Remove after sync
removePendingAnswer(answerId)

// Get current queue
getPendingAnswers()

// Update sync status
setSyncing(true/false)
```

---

## 🎨 UI States

| State | Message | Color | Icon |
|-------|---------|-------|------|
| Submitted (online) | ✓ Answer Submitted | - | - |
| Submitted (offline) | 💾 Answer Saved Locally | - | - |
| Syncing | 🔄 Syncing... | - | - |
| Synced | ✓ Answer Synced | - | - |
| Pending (banner) | X answers saved | 🟠 | 💾 |
| Syncing (banner) | Syncing X answers | 🔵 | 🔄 |
| Complete (banner) | All synced | 🟢 | ✓ |

---

## ⚠️ Edge Cases Handled

| Scenario | Solution |
|----------|----------|
| **Duplicate from lost ack** | Backend 409 returns existing record, treated as success |
| **Late arrival** | Backend accepts all timestamps, teacher can review |
| **Page refresh offline** | localStorage persists, auto-resumes on reconnect |
| **Connection loss during sync** | Failed answers stay in queue, retry next reconnect |
| **Multiple rapid questions** | Each queued independently, synced in order |

---

## 🔐 Security

✅ Implemented:
- Authentication required
- StudentId validation
- RoomId membership check

⚠️ To Implement:
```javascript
// Add to logout flow
localStorage.removeItem('pendingAnswers')
```

---

## 📊 Performance

- **Per answer:** 200-500ms
- **5 answers:** ~1-2.5 seconds
- **Storage:** ~200-400 bytes per answer
- **Capacity:** 12,500+ answers possible

---

## 🐛 Debugging

### Check pending answers
```javascript
JSON.parse(localStorage.getItem('pendingAnswers'))
```

### Clear for test reset
```javascript
localStorage.removeItem('pendingAnswers')
location.reload()
```

### Monitor sync in console
```
[StudentRoom] handleSubmitAnswer called: {...}
[StudentRoom] Currently offline, queueing answer
[StudentRoom] Starting sync of 1 pending answer(s)
[StudentRoom] Synced 1/1 pending answers
```

### Check database
```javascript
db.responses.find({studentId: "..."})
```

---

## 📖 Full Documentation

- **Feature Details:** `OFFLINE_SUBMISSION_FEATURE.md`
- **Testing Guide:** `OFFLINE_SUBMISSION_TESTING.md`
- **Implementation Summary:** `IMPLEMENTATION_SUMMARY.md`
- **This Quick Reference:** `OFFLINE_SUBMISSION_QUICK_REFERENCE.md`

---

## 🚀 Usage

No special configuration needed! Feature works automatically:

1. **Auto-detection:** Checks `socket.isConnected` state
2. **Auto-queue:** Offline submissions queued automatically
3. **Auto-sync:** Pending answers synced on reconnect
4. **Auto-cleanup:** Successful syncs removed from queue

**Students don't need to do anything—it just works!**

---

Last Updated: 2026-07-09

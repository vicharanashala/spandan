// In-memory Room State mapping roomCode to the active poll and connected students
const activeRooms = new Map();

export const getRoomState = (roomCode) => {
  if (!activeRooms.has(roomCode)) {
    activeRooms.set(roomCode, { activePoll: null, students: new Map() });
  }
  return activeRooms.get(roomCode);
};

export const clearRoomState = (roomCode) => {
  activeRooms.delete(roomCode);
};

export const getActivePoll = (roomCode) => {
  const roomState = getRoomState(roomCode);
  if (!roomState || !roomState.activePoll) return null;
  
  const remainingTimeMs = roomState.activePoll.duration - (Date.now() - roomState.activePoll.serverStartTime);
  if (remainingTimeMs <= 0) return null; // Poll ended
  
  return {
    activePoll: {
      questionId: roomState.activePoll.questionId,
      text: roomState.activePoll.text,
      type: roomState.activePoll.type,
      options: roomState.activePoll.options,
      category: roomState.activePoll.category,
      duration: roomState.activePoll.duration,
      serverStartTime: roomState.activePoll.serverStartTime
    },
    exactRemainingTimeMs: remainingTimeMs
  };
};

// Cleanup routine: remove disconnected students and stale rooms
export const startCleanupRoutine = () => {
  setInterval(() => {
    const now = Date.now();
    for (const [roomCode, roomState] of activeRooms.entries()) {
      let activeStudentsCount = 0;
      for (const [userId, student] of roomState.students.entries()) {
        if (now - student.lastSeen > 15000) { // 15 seconds timeout
          student.status = 'disconnected';
          student.disconnectTime = now;
        }
        if (student.status === 'connected') {
          activeStudentsCount++;
        }
      }
      
      // If poll has been inactive for a long time and no students are connected, could prune room
      if (activeStudentsCount === 0 && !roomState.activePoll) {
        // We'll leave it for now, but this is where you'd delete it to free memory
        // clearRoomState(roomCode)
      }
    }
  }, 10000); // Check every 10 seconds
};

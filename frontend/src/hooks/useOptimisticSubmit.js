import { useState, useCallback, useEffect } from 'react';
import { API_URL } from '../config.js';

// Offline queue stored at module level
const offlineQueue = [];

export function queueOfflineSubmission(payload) {
  offlineQueue.push(payload);
}

export function useOptimisticSubmit(socket, isConnected, token) {
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState(false);

  // Auto-flush queue when connection is restored
  useEffect(() => {
    if (isConnected && socket && offlineQueue.length > 0) {
      console.log(`[useOptimisticSubmit] Flushing offline queue of size ${offlineQueue.length}`);
      while (offlineQueue.length > 0) {
        const item = offlineQueue.shift();
        
        // Re-attempt HTTP POST for the queued item
        fetch(`${API_URL}/responses`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            roomId: item.roomId,
            questionId: item.questionId,
            studentId: item.studentId,
            selectedOptions: item.selectedOptions,
            responseTime: item.responseTime
          })
        }).then(res => res.json()).then(saveData => {
          if (saveData.success && saveData.response) {
            socket.emit('points:update', {
              roomCode: item.roomCode,
              questionId: item.questionId,
              studentId: item.studentId,
              points: saveData.response.points,
              isCorrect: saveData.response.isCorrect
            });
          }
        }).catch(err => {
          console.error('[useOptimisticSubmit] Failed to process queued offline item:', err);
        });

        // Also emit via socket
        socket.emit('response:submit', {
          roomCode: item.roomCode,
          questionId: item.questionId,
          studentId: item.studentId,
          selectedOptions: item.selectedOptions,
          responseTime: item.responseTime
        });
      }
    }
  }, [isConnected, socket, token]);

  const submit = useCallback(async ({ 
    roomId, 
    roomCode, 
    questionId, 
    studentId, 
    selectedOptions, 
    responseTime,
    onSuccess // callback to fetchPastResponses
  }) => {
    // Optimistic: Lock immediately, clear errors
    setLocked(true);
    setError(false);

    if (!isConnected || !socket) {
      // Offline: Queue it for later and assume success for now
      queueOfflineSubmission({
        roomId, roomCode, questionId, studentId, selectedOptions, responseTime
      });
      if (onSuccess) onSuccess();
      return;
    }

    // Emit via socket for real-time immediate feedback to teacher
    socket.emit('response:submit', {
      roomCode,
      questionId,
      studentId,
      selectedOptions,
      responseTime
    });

    try {
      // Async background save
      const saveResponse = await fetch(`${API_URL}/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          roomId,
          questionId,
          studentId,
          selectedOptions,
          responseTime
        })
      });

      if (!saveResponse.ok) {
        throw new Error('Server returned error status');
      }

      const saveData = await saveResponse.json();

      if (saveData.success && saveData.response) {
        socket.emit('points:update', {
          roomCode,
          questionId,
          studentId,
          points: saveData.response.points,
          isCorrect: saveData.response.isCorrect
        });
        if (onSuccess) onSuccess();
      } else {
        throw new Error('Save failed');
      }
    } catch (err) {
      console.error('[useOptimisticSubmit] Error submitting answer:', err);
      // Revert optimistic state
      setLocked(false);
      setError(true);
    }
  }, [isConnected, socket, token]);

  const reset = useCallback(() => {
    setLocked(false);
    setError(false);
  }, []);

  return { locked, error, submit, reset };
}

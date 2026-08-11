import useAuthStore from '../stores/authStore'

import { API_URL } from '../config.js'

// Save transcript to backend
export const saveTranscript = async (roomId, segmentIndex, text, duration = 0, source = 'audio') => {
  const token = useAuthStore.getState().token
  const response = await fetch(`${API_URL}/transcripts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      roomId,
      segmentIndex,
      text,
      duration,
      wordCount: text.split(/\s+/).length,
      source
    })
  })
  return response.json()
}

// Get all transcripts for a room
export const getTranscripts = async (roomId) => {
  const token = useAuthStore.getState().token
  const response = await fetch(`${API_URL}/transcripts/room/${roomId}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  return response.json()
}

// Get transcript for a specific segment
export const getSegmentTranscript = async (roomId, segmentIndex) => {
  const token = useAuthStore.getState().token
  const response = await fetch(`${API_URL}/transcripts/${roomId}/${segmentIndex}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  return response.json()
}
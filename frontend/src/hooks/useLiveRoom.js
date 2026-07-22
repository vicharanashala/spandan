import { useState, useEffect, useRef } from 'react'
import { API_URL } from '../config'

export function useLiveRoom(roomId, token, role) {
  const [roomCode, setRoomCode] = useState(null)
  const [activePoll, setActivePoll] = useState(null)
  const [remainingTime, setRemainingTime] = useState(null)
  const [hasAnswered, setHasAnswered] = useState(false)
  const [participants, setParticipants] = useState(0)
  
  const pollIntervalRef = useRef(null)
  const timerIntervalRef = useRef(null)

  // Join Room
  const joinRoom = async (code) => {
    try {
      const res = await fetch(`${API_URL}/live/${code || roomId}/join`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      if (res.ok) {
        const data = await res.json()
        setRoomCode(data.roomCode)
      }
    } catch (err) {
      console.error('Failed to join live room:', err)
    }
  }

  // Polling loop
  useEffect(() => {
    if (!roomCode || !token) return

    const syncRoom = async () => {
      try {
        const res = await fetch(`${API_URL}/live/${roomCode}/sync`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        if (res.ok) {
          const data = await res.json()
          
          if (data.pollData) {
            setActivePoll(data.pollData.activePoll)
            // Only update remainingTime from server if we don't have a local timer running,
            // or if it's way off, to prevent stuttering. We'll rely on local setInterval for UI tick.
            setRemainingTime(data.pollData.exactRemainingTimeMs)
          } else {
            setActivePoll(null)
            setRemainingTime(null)
          }

          if (role === 'student') {
            setHasAnswered(data.studentHasAnswered)
          } else if (role === 'teacher' && data.teacherData) {
            setParticipants(data.teacherData.connectedStudents)
          }
        }
      } catch (err) {
        // Silently ignore polling errors to avoid console spam on disconnect
      }
    }

    // Initial sync
    syncRoom()

    // Poll every 1.5 seconds
    pollIntervalRef.current = setInterval(syncRoom, 1500)

    return () => clearInterval(pollIntervalRef.current)
  }, [roomCode, token, role])

  // Local timer for smooth countdown
  useEffect(() => {
    if (activePoll) {
      timerIntervalRef.current = setInterval(() => {
        setRemainingTime(prev => {
          if (prev === null) return null
          const next = prev - 100
          if (next <= 0) {
            clearInterval(timerIntervalRef.current)
            return 0
          }
          return next
        })
      }, 100)
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    }

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    }
  }, [activePoll])

  const submitAnswer = async (questionId, answer, hasTabSwitched = false) => {
    if (!roomCode) return false
    try {
      const res = await fetch(`${API_URL}/live/${roomCode}/answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ questionId, answer, hasTabSwitched })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setHasAnswered(true)
        return true
      }
    } catch (err) {
      console.error('Submit answer failed:', err)
    }
    return false
  }

  const pushQuestion = async (questionData) => {
    if (!roomCode) return false
    try {
      const res = await fetch(`${API_URL}/live/${roomCode}/question`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(questionData)
      })
      const data = await res.json()
      return res.ok && data.success
    } catch (err) {
      console.error('Push question failed:', err)
      return false
    }
  }

  const recordTabSwitch = async () => {
    if (!roomCode || role !== 'student' || hasAnswered || !activePoll) return
    try {
      await fetch(`${API_URL}/live/${roomCode}/tab-switch`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
    } catch (err) {
      console.error('Record tab switch failed:', err)
    }
  }

  return {
    roomCode,
    joinRoom,
    activePoll,
    remainingTime,
    hasAnswered,
    participants,
    submitAnswer,
    pushQuestion,
    recordTabSwitch
  }
}

// Service for the post-session Question Intervention feature.
// Follows the same fetch/Authorization pattern as questionService.js and transcriptService.js.

import { API_URL } from '../config.js'

function authHeaders(token) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  }
}

export async function fetchInterventionConfig(token) {
  const res = await fetch(`${API_URL}/interventions/config`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to fetch intervention config')
  return data.config
}

export async function fetchFlaggedQuestions(token, roomId) {
  const res = await fetch(`${API_URL}/interventions/room/${roomId}/flagged`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to fetch flagged questions')
  return {
    threshold: data.threshold,
    thresholdPercent: data.thresholdPercent,
    thresholdIsCustom: !!data.thresholdIsCustom,
    flagged: data.flagged || [],
    questions: data.questions || []
  }
}

export async function setRoomInterventionThreshold(token, roomId, thresholdPercent) {
  const res = await fetch(`${API_URL}/interventions/room/${roomId}/threshold`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify({ thresholdPercent })
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to set threshold')
  return { threshold: data.threshold, thresholdPercent: data.thresholdPercent }
}

// Stage 1 — publish the ASK only. No content fields required. offeredTypes is optional — the
// backend defaults to the full enum (Need Notes / Need Question Explanation / Need Topic Again).
export async function publishIntervention(token, payload) {
  const res = await fetch(`${API_URL}/interventions`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to publish intervention')
  return data.intervention
}

// Stage 2 — send the actual notes / link content. text or url is required. type is optional
// (defaults to nothing on the record; the teacher typically picks the most-popular response).
export async function deliverIntervention(token, interventionId, payload) {
  const res = await fetch(`${API_URL}/interventions/${interventionId}/deliver`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to deliver intervention')
  return data.intervention
}

export async function fetchRoomInterventions(token, roomId) {
  const res = await fetch(`${API_URL}/interventions/room/${roomId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to fetch interventions')
  return data.interventions || []
}

export async function fetchQuestionIntervention(token, questionId) {
  const res = await fetch(`${API_URL}/interventions/question/${questionId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to fetch question intervention')
  return data.intervention
}

export async function submitInterventionResponse(token, interventionId, selectedType) {
  const res = await fetch(`${API_URL}/interventions/${interventionId}/respond`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ selectedType })
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to submit response')
  return data.response
}

export async function saveIntervention(token, interventionId) {
  const res = await fetch(`${API_URL}/interventions/${interventionId}/save`, {
    method: 'POST',
    headers: authHeaders(token)
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to save intervention')
  return data.response
}

export async function fetchInterventionAnalytics(token, interventionId) {
  const res = await fetch(`${API_URL}/interventions/${interventionId}/analytics`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to fetch analytics')
  return data.analytics
}

// Service for Teacher Evaluation Profiles. Mirrors the convention of the existing services
// (raw fetch + Authorization header from authStore), same as questionService.js for the
// non-aggregate paths. Uses /api/evaluation-profiles.

import { API_URL } from '../config.js'
import useAuthStore from '../stores/authStore.js'

function headers(hasBody = false) {
  const token = useAuthStore.getState().token
  return {
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  }
}

async function jsonFetch(url, opts = {}) {
  const res = await fetch(url, opts)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || data.message || 'Request failed')
  return data
}

export async function fetchCriteria() {
  return jsonFetch(`${API_URL}/evaluation-profiles/criteria`, { method: 'GET', headers: headers(false) })
}

export async function listProfiles() {
  const data = await jsonFetch(`${API_URL}/evaluation-profiles`, { method: 'GET', headers: headers(false) })
  return data.profiles || []
}

export async function createProfile(payload) {
  const data = await jsonFetch(`${API_URL}/evaluation-profiles`, {
    method: 'POST', headers: headers(true), body: JSON.stringify(payload)
  })
  return data.profile
}

export async function updateProfile(id, payload) {
  const data = await jsonFetch(`${API_URL}/evaluation-profiles/${id}`, {
    method: 'PUT', headers: headers(true), body: JSON.stringify(payload)
  })
  return data.profile
}

export async function deleteProfile(id) {
  return jsonFetch(`${API_URL}/evaluation-profiles/${id}`, { method: 'DELETE', headers: headers(false) })
}

export async function duplicateProfile(id) {
  const data = await jsonFetch(`${API_URL}/evaluation-profiles/${id}/duplicate`, {
    method: 'POST', headers: headers(true)
  })
  return data.profile
}

// One helper for both preview and apply — they're the same backend call.
export async function previewOrApplyProfile(id, roomId, mode = 'preview') {
  const action = mode === 'apply' ? 'apply' : 'preview'
  const data = await jsonFetch(`${API_URL}/evaluation-profiles/${id}/${action}/${roomId}`, {
    method: 'POST', headers: headers(true)
  })
  return data.result
}
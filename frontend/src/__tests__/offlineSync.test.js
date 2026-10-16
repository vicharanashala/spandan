jest.mock('../config.js', () => ({
  API_URL: '/api'
}))

import { syncPendingResponses } from '../lib/offlineSync.js'
import { enqueueResponse, getQueuedResponses, clearQueuedResponses } from '../lib/offlineQueue.js'

describe('lib/offlineSync', () => {
  const originalFetch = global.fetch

  beforeEach(async () => {
    localStorage.clear()
    await clearQueuedResponses()
    jest.clearAllMocks()
  })

  afterEach(async () => {
    global.fetch = originalFetch
    localStorage.clear()
    await clearQueuedResponses()
  })

  test('successfully syncs queued response and removes from vault', async () => {
    await enqueueResponse({
      roomId: 'room-1',
      questionId: 'q-101',
      studentId: 'student-202',
      selectedOptions: [0],
      responseTime: 10
    })

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ success: true, points: 80, isCorrect: true })
    })

    const onSyncSuccess = jest.fn()
    const result = await syncPendingResponses({
      token: 'mock-token',
      roomId: 'room-1',
      onSyncSuccess
    })

    expect(result.synced).toBe(1)
    expect(result.dropped).toBe(0)
    expect(result.failed).toBe(0)
    expect(onSyncSuccess).toHaveBeenCalledTimes(1)

    const remaining = await getQueuedResponses('room-1')
    expect(remaining.length).toBe(0)
  })

  test('drops queued response on 409 conflict/poll_closed to prevent loops', async () => {
    await enqueueResponse({
      roomId: 'room-1',
      questionId: 'q-101',
      studentId: 'student-202',
      selectedOptions: [0],
      responseTime: 10
    })

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: 'poll_closed' })
    })

    const result = await syncPendingResponses({
      token: 'mock-token',
      roomId: 'room-1'
    })

    expect(result.synced).toBe(0)
    expect(result.dropped).toBe(1)
    expect(result.failed).toBe(0)

    const remaining = await getQueuedResponses('room-1')
    expect(remaining.length).toBe(0)
  })

  test('preserves queue on network error and terminates sync gracefully', async () => {
    await enqueueResponse({
      roomId: 'room-1',
      questionId: 'q-101',
      studentId: 'student-202',
      selectedOptions: [0],
      responseTime: 10
    })

    global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'))

    const onSyncError = jest.fn()
    const result = await syncPendingResponses({
      token: 'mock-token',
      roomId: 'room-1',
      onSyncError
    })

    expect(result.synced).toBe(0)
    expect(result.failed).toBe(1)
    expect(onSyncError).toHaveBeenCalledTimes(1)

    const remaining = await getQueuedResponses('room-1')
    expect(remaining.length).toBe(1)
  })
})

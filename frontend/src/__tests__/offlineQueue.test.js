import {
  enqueueResponse,
  getQueuedResponses,
  removeQueuedResponse,
  clearQueuedResponses,
  getQueuedCount,
  generateResponseKey
} from '../lib/offlineQueue.js'

describe('lib/offlineQueue', () => {
  beforeEach(async () => {
    localStorage.clear()
    await clearQueuedResponses()
  })

  afterEach(async () => {
    localStorage.clear()
    await clearQueuedResponses()
  })

  test('generateResponseKey creates deterministic composite key', () => {
    const key = generateResponseKey('room123', 'q456', 'student789')
    expect(key).toBe('room123:q456:student789')
  })

  test('enqueues and retrieves responses', async () => {
    const response = {
      roomId: 'room-1',
      questionId: 'q-101',
      studentId: 'student-202',
      selectedOptions: [1],
      responseTime: 12
    }

    const enqueued = await enqueueResponse(response)
    expect(enqueued.id).toBe('room-1:q-101:student-202')
    expect(enqueued.responseTime).toBe(12)

    const list = await getQueuedResponses('room-1')
    expect(list.length).toBe(1)
    expect(list[0].id).toBe('room-1:q-101:student-202')
    expect(list[0].selectedOptions).toEqual([1])
  })

  test('filters queued responses by roomId', async () => {
    await enqueueResponse({
      roomId: 'room-A',
      questionId: 'q-1',
      studentId: 's-1',
      selectedOptions: [0],
      responseTime: 5
    })

    await enqueueResponse({
      roomId: 'room-B',
      questionId: 'q-2',
      studentId: 's-1',
      selectedOptions: [1],
      responseTime: 8
    })

    const roomAItems = await getQueuedResponses('room-A')
    expect(roomAItems.length).toBe(1)
    expect(roomAItems[0].roomId).toBe('room-A')

    const roomBItems = await getQueuedResponses('room-B')
    expect(roomBItems.length).toBe(1)
    expect(roomBItems[0].roomId).toBe('room-B')

    const totalCount = await getQueuedCount()
    expect(totalCount).toBe(2)
  })

  test('removes specific queued item', async () => {
    await enqueueResponse({
      roomId: 'room-A',
      questionId: 'q-1',
      studentId: 's-1',
      selectedOptions: [0],
      responseTime: 5
    })

    const items = await getQueuedResponses('room-A')
    expect(items.length).toBe(1)

    await removeQueuedResponse(items[0].id)
    const after = await getQueuedResponses('room-A')
    expect(after.length).toBe(0)
  })

  test('clears queued responses for a specific room', async () => {
    await enqueueResponse({
      roomId: 'room-X',
      questionId: 'q-1',
      studentId: 's-1',
      selectedOptions: [0],
      responseTime: 5
    })

    await enqueueResponse({
      roomId: 'room-Y',
      questionId: 'q-2',
      studentId: 's-1',
      selectedOptions: [1],
      responseTime: 8
    })

    await clearQueuedResponses('room-X')
    const roomX = await getQueuedResponses('room-X')
    expect(roomX.length).toBe(0)

    const roomY = await getQueuedResponses('room-Y')
    expect(roomY.length).toBe(1)
  })
})

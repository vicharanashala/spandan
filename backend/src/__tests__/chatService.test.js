import mongoose from 'mongoose'
import {
  getChatEnabled,
  setChatEnabled,
  checkAndApplyCooldown,
  bufferChatMessage,
  flushRoomMessages,
  flushAndCleanRoom,
  enqueueBroadcast,
  CHAT_FLUSH_MAX,
  CHAT_FLUSH_MS,
  MONGO_BATCH_CHUNK,
  COOLDOWN_SEC,
  setRedisOverridesForTest
} from '../services/chatService.js'
import ChatMessage from '../models/ChatMessage.js'

describe('chatService Live Chat Tests', () => {
  const testRoomId = new mongoose.Types.ObjectId().toString()
  const testStudentId = new mongoose.Types.ObjectId().toString()

  afterEach(() => {
    jest.restoreAllMocks()
    setRedisOverridesForTest(null)
  })

  describe('Enable / Disable Chat State', () => {
    it('defaults to true when unset', async () => {
      const enabled = await getChatEnabled('new_room_id_' + Date.now())
      expect(enabled).toBe(true)
    })

    it('toggles chat enabled to false and true correctly', async () => {
      await setChatEnabled(testRoomId, false)
      expect(await getChatEnabled(testRoomId)).toBe(false)

      await setChatEnabled(testRoomId, true)
      expect(await getChatEnabled(testRoomId)).toBe(true)
    })
  })

  describe('Student Cooldown Enforcement', () => {
    it('allows initial message and rejects subsequent message within cooldown period', async () => {
      const uniqueStudent = 'student_' + Date.now()
      const first = await checkAndApplyCooldown(testRoomId, uniqueStudent, 10)
      expect(first.allowed).toBe(true)

      const second = await checkAndApplyCooldown(testRoomId, uniqueStudent, 10)
      expect(second.allowed).toBe(false)
      expect(second.retryAfter).toBeGreaterThan(0)
      expect(second.retryAfter).toBeLessThanOrEqual(10)
    })

    it('allows different students in the same room independently', async () => {
      const s1 = 'student_a_' + Date.now()
      const s2 = 'student_b_' + Date.now()

      const res1 = await checkAndApplyCooldown(testRoomId, s1, 10)
      const res2 = await checkAndApplyCooldown(testRoomId, s2, 10)

      expect(res1.allowed).toBe(true)
      expect(res2.allowed).toBe(true)
    })

    it('allows same student in different rooms independently', async () => {
      const student = 'student_multi_' + Date.now()
      const roomA = 'room_a_' + Date.now()
      const roomB = 'room_b_' + Date.now()

      const resA = await checkAndApplyCooldown(roomA, student, 10)
      const resB = await checkAndApplyCooldown(roomB, student, 10)

      expect(resA.allowed).toBe(true)
      expect(resB.allowed).toBe(true)
    })
  })

  describe('In-Memory Broadcast Queue', () => {
    it('enqueues messages without throwing', () => {
      const msg = {
        roomId: testRoomId,
        senderId: testStudentId,
        senderRole: 'student',
        senderName: 'Alice',
        text: 'Hello class!',
        createdAt: new Date()
      }

      expect(() => enqueueBroadcast('ROOM123', msg)).not.toThrow()
    })
  })

  describe('Room End Cleanup', () => {
    it('cleans up in-memory room state and cooldowns on flushAndCleanRoom', async () => {
      const cleanRoomId = 'room_cleanup_' + Date.now()
      const student = 'student_clean_' + Date.now()

      await setChatEnabled(cleanRoomId, false)
      await checkAndApplyCooldown(cleanRoomId, student, 10)

      expect(await getChatEnabled(cleanRoomId)).toBe(false)

      await flushAndCleanRoom(cleanRoomId)

      // State is reset to default true
      expect(await getChatEnabled(cleanRoomId)).toBe(true)
      // Cooldown for room is cleared
      const res = await checkAndApplyCooldown(cleanRoomId, student, 10)
      expect(res.allowed).toBe(true)
    })
  })

  describe('Configuration Constants', () => {
    it('has expected default dual-trigger flush constants', () => {
      expect(CHAT_FLUSH_MAX).toBe(5000)
      expect(CHAT_FLUSH_MS).toBe(78000)
      expect(MONGO_BATCH_CHUNK).toBe(2000)
      expect(COOLDOWN_SEC).toBe(10)
    })
  })

  describe('Flush Trigger & Chunked MongoDB Persistence', () => {
    it('triggers flush automatically when RPUSH list length reaches CHAT_FLUSH_MAX', async () => {
      const flushRoomId = new mongoose.Types.ObjectId().toString()
      const mockInserted = []

      // Generate 5000 messages
      const mockMessages = Array.from({ length: 5000 }, (_, i) => ({
        _id: new mongoose.Types.ObjectId().toString(),
        roomId: flushRoomId,
        senderId: testStudentId,
        senderRole: 'student',
        senderName: `Student ${i}`,
        text: `Message ${i}`,
        createdAt: new Date().toISOString()
      }))

      const mockRedisClient = {
        rPush: jest.fn().mockResolvedValue(5000), // Exactly hits CHAT_FLUSH_MAX
        sAdd: jest.fn().mockResolvedValue(1),
        lPopCount: jest.fn().mockResolvedValue(mockMessages.map(m => JSON.stringify(m))),
        lLen: jest.fn().mockResolvedValue(0),
        sRem: jest.fn().mockResolvedValue(1)
      }

      setRedisOverridesForTest({
        isRedisEnabled: () => true,
        getRedisClient: () => mockRedisClient
      })

      const insertManySpy = jest.spyOn(ChatMessage, 'insertMany').mockImplementation(async (batch) => {
        mockInserted.push(...batch)
        return batch
      })

      const msg = {
        _id: new mongoose.Types.ObjectId(),
        roomId: flushRoomId,
        senderId: testStudentId,
        senderRole: 'student',
        senderName: 'Student 5000',
        text: 'Message 5000',
        createdAt: new Date()
      }

      // Calling bufferChatMessage when listLen returns 5000 should trigger flushRoomMessages
      await bufferChatMessage(flushRoomId, msg)

      expect(mockRedisClient.rPush).toHaveBeenCalled()
      expect(mockRedisClient.lPopCount).toHaveBeenCalledWith(`chat:room:${flushRoomId}:messages`, CHAT_FLUSH_MAX)
      expect(insertManySpy).toHaveBeenCalled()

      // 5000 docs split into chunks of 2000 -> 3 batches (2000, 2000, 1000)
      expect(insertManySpy).toHaveBeenCalledTimes(3)
      expect(insertManySpy.mock.calls[0][0].length).toBe(2000)
      expect(insertManySpy.mock.calls[1][0].length).toBe(2000)
      expect(insertManySpy.mock.calls[2][0].length).toBe(1000)
      expect(mockInserted.length).toBe(5000)
    })

    it('drains messages in chunks of 2000 and ignores E11000 duplicate key errors', async () => {
      const flushRoomId = new mongoose.Types.ObjectId().toString()
      const sampleMessages = Array.from({ length: 2500 }, (_, i) => ({
        _id: new mongoose.Types.ObjectId().toString(),
        roomId: flushRoomId,
        senderId: testStudentId,
        senderRole: 'student',
        senderName: `Student ${i}`,
        text: `Message ${i}`,
        createdAt: new Date().toISOString()
      }))

      const mockRedisClient = {
        lPopCount: jest.fn().mockResolvedValue(sampleMessages.map(m => JSON.stringify(m))),
        lLen: jest.fn().mockResolvedValue(0),
        sRem: jest.fn().mockResolvedValue(1)
      }

      setRedisOverridesForTest({
        isRedisEnabled: () => true,
        getRedisClient: () => mockRedisClient
      })

      // Simulate duplicate error on first chunk, success on second
      const dupError = new Error('E11000 duplicate key')
      dupError.writeErrors = [{ code: 11000, errmsg: 'duplicate' }]

      const insertManySpy = jest.spyOn(ChatMessage, 'insertMany')
        .mockRejectedValueOnce(dupError)
        .mockResolvedValueOnce([])

      const count = await flushRoomMessages(flushRoomId)
      expect(count).toBe(2500)
      expect(insertManySpy).toHaveBeenCalledTimes(2)
      expect(insertManySpy.mock.calls[0][0].length).toBe(2000)
      expect(insertManySpy.mock.calls[1][0].length).toBe(500)
    })
  })

  describe('Redis-Down Fallback Mode (Fail-Open / Degraded)', () => {
    beforeEach(() => {
      setRedisOverridesForTest({
        isRedisEnabled: () => false,
        getRedisClient: () => null
      })
    })

    it('falls back to direct MongoDB write when Redis is unavailable', async () => {
      const fallbackRoomId = new mongoose.Types.ObjectId().toString()
      const createSpy = jest.spyOn(ChatMessage, 'create').mockResolvedValue({})

      const msg = {
        _id: new mongoose.Types.ObjectId(),
        roomId: fallbackRoomId,
        senderId: testStudentId,
        senderRole: 'student',
        senderName: 'Bob',
        text: 'Direct Mongo Write Fallback Test',
        createdAt: new Date()
      }

      await bufferChatMessage(fallbackRoomId, msg)

      expect(createSpy).toHaveBeenCalledWith(msg)
    })

    it('maintains in-memory toggle state when Redis is unavailable', async () => {
      const offlineRoomId = 'offline_room_' + Date.now()

      expect(await getChatEnabled(offlineRoomId)).toBe(true)

      await setChatEnabled(offlineRoomId, false)
      expect(await getChatEnabled(offlineRoomId)).toBe(false)

      await setChatEnabled(offlineRoomId, true)
      expect(await getChatEnabled(offlineRoomId)).toBe(true)
    })

    it('enforces in-memory student cooldown when Redis is unavailable', async () => {
      const offlineRoomId = 'offline_cooldown_room_' + Date.now()
      const studentId = 'offline_student_' + Date.now()

      const first = await checkAndApplyCooldown(offlineRoomId, studentId, 10)
      expect(first.allowed).toBe(true)

      const second = await checkAndApplyCooldown(offlineRoomId, studentId, 10)
      expect(second.allowed).toBe(false)
      expect(second.retryAfter).toBeGreaterThan(0)
      expect(second.retryAfter).toBeLessThanOrEqual(10)
    })
  })
})

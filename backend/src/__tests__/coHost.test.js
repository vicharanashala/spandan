import { checkRoomOwnership, checkRoomEditor } from '../utils/roomOwnership.js'
import { canJoinRoom, addCoHostAtomic } from '../services/roomJoinAuthz.js'

describe('Co-Host Authorization & Logic Tests', () => {
  const ownerId = '507f1f77bcf86cd799439011'
  const coHostId = '507f1f77bcf86cd799439022'
  const otherId = '507f1f77bcf86cd799439099'

  describe('checkRoomEditor guard', () => {
    const mockRoom = {
      teacher: ownerId,
      coHosts: [
        { userId: coHostId, name: 'Co-Host Teacher', joinedAt: new Date() }
      ]
    }

    const populatedRoom = {
      teacher: { _id: ownerId, name: 'Owner Teacher' },
      coHosts: [
        { userId: { _id: coHostId }, name: 'Co-Host Teacher', joinedAt: new Date() }
      ]
    }

    it('returns 404 when room is null', () => {
      const res = checkRoomEditor(null, ownerId)
      expect(res.ok).toBe(false)
      expect(res.status).toBe(404)
    })

    it('allows room owner', () => {
      const res = checkRoomEditor(mockRoom, ownerId)
      expect(res.ok).toBe(true)
      expect(res.status).toBe(200)
    })

    it('allows room owner when teacher field is a populated object', () => {
      const res = checkRoomEditor(populatedRoom, ownerId)
      expect(res.ok).toBe(true)
      expect(res.status).toBe(200)
    })

    it('allows registered co-host for shared routes (question creation, response viewing, transcript saving)', () => {
      const res = checkRoomEditor(mockRoom, coHostId)
      expect(res.ok).toBe(true)
      expect(res.status).toBe(200)
    })

    it('allows registered co-host when userId is a populated object', () => {
      const res = checkRoomEditor(populatedRoom, coHostId)
      expect(res.ok).toBe(true)
      expect(res.status).toBe(200)
    })

    it('rejects an unauthorized teacher (neither host nor co-host) with 403 on shared routes', () => {
      const res = checkRoomEditor(mockRoom, otherId)
      expect(res.ok).toBe(false)
      expect(res.status).toBe(403)
      expect(res.error).toMatch(/authorized/i)
    })

    it('strictly restricts owner-only actions in checkRoomOwnership to owner', () => {
      expect(checkRoomOwnership(mockRoom, ownerId).ok).toBe(true)
      expect(checkRoomOwnership(populatedRoom, ownerId).ok).toBe(true)
      expect(checkRoomOwnership(mockRoom, coHostId).ok).toBe(false)
      expect(checkRoomOwnership(mockRoom, coHostId).status).toBe(403)
    })

    it('correctly enforces field-level authorization for PUT /:id room updates', () => {
      function authorizeRoomUpdate(room, userId, body) {
        const editorAuth = checkRoomEditor(room, userId)
        if (!editorAuth.ok) return editorAuth

        const isEndingRoom = body.isActive === false || body.endedAt !== undefined
        const isCoHostConfigChange = (
          body.maxCoHosts !== undefined ||
          body.coHostCode !== undefined ||
          body.coHostCodeExpiresAt !== undefined ||
          body.coHosts !== undefined
        )

        if (isEndingRoom || isCoHostConfigChange) {
          return checkRoomOwnership(room, userId)
        }
        return { ok: true, status: 200 }
      }

      // Co-host updating regular settings: SUCCEEDS
      expect(authorizeRoomUpdate(mockRoom, coHostId, { settings: { segmentTime: 3 } }).ok).toBe(true)

      // Co-host attempting to set maxCoHosts: REJECTED with 403
      expect(authorizeRoomUpdate(mockRoom, coHostId, { maxCoHosts: 5 }).ok).toBe(false)
      expect(authorizeRoomUpdate(mockRoom, coHostId, { maxCoHosts: 5 }).status).toBe(403)

      // Co-host attempting to end room (isActive: false): REJECTED with 403
      expect(authorizeRoomUpdate(mockRoom, coHostId, { isActive: false }).ok).toBe(false)

      // Co-host attempting to end room bundled with valid settings: REJECTED with 403
      expect(authorizeRoomUpdate(mockRoom, coHostId, { settings: { segmentTime: 3 }, isActive: false }).ok).toBe(false)

      // Host updating owner-only fields: SUCCEEDS
      expect(authorizeRoomUpdate(mockRoom, ownerId, { maxCoHosts: 5 }).ok).toBe(true)
      expect(authorizeRoomUpdate(mockRoom, ownerId, { isActive: false }).ok).toBe(true)
    })
  })

  describe('canJoinRoom co-host authorization', () => {
    const validFuture = new Date(Date.now() + 15 * 60 * 1000)
    const expiredPast = new Date(Date.now() - 60 * 1000)

    const roomWithCode = {
      teacher: ownerId,
      maxCoHosts: 2,
      coHostCode: 'CH123456',
      coHostCodeExpiresAt: validFuture,
      coHosts: [
        { userId: coHostId, name: 'CoHost 1' }
      ]
    }

    it('allows owner to join without code', () => {
      const res = canJoinRoom({ role: 'teacher', userId: ownerId, room: roomWithCode })
      expect(res.ok).toBe(true)
      expect(res.isOwner).toBe(true)
    })

    it('allows existing co-host to rejoin without code (reconnect)', () => {
      const res = canJoinRoom({ role: 'teacher', userId: coHostId, room: roomWithCode })
      expect(res.ok).toBe(true)
      expect(res.isCoHost).toBe(true)
    })

    it('allows new approved teacher with valid code', () => {
      const res = canJoinRoom({
        role: 'teacher',
        userId: otherId,
        room: roomWithCode,
        coHostCode: 'CH123456',
        teacherApprovalStatus: 'approved'
      })
      expect(res.ok).toBe(true)
      expect(res.canAddCoHost).toBe(true)
    })

    it('rejects teacher with unapproved status', () => {
      const res = canJoinRoom({
        role: 'teacher',
        userId: otherId,
        room: roomWithCode,
        coHostCode: 'CH123456',
        teacherApprovalStatus: 'pending'
      })
      expect(res.ok).toBe(false)
      expect(res.error).toMatch(/approval/i)
    })

    it('rejects invalid code', () => {
      const res = canJoinRoom({
        role: 'teacher',
        userId: otherId,
        room: roomWithCode,
        coHostCode: 'WRONGCODE',
        teacherApprovalStatus: 'approved'
      })
      expect(res.ok).toBe(false)
      expect(res.error).toMatch(/invalid/i)
    })

    it('rejects expired code', () => {
      const expiredRoom = {
        ...roomWithCode,
        coHostCodeExpiresAt: expiredPast
      }
      const res = canJoinRoom({
        role: 'teacher',
        userId: otherId,
        room: expiredRoom,
        coHostCode: 'CH123456',
        teacherApprovalStatus: 'approved'
      })
      expect(res.ok).toBe(false)
      expect(res.error).toMatch(/expired/i)
    })

    it('rejects when co-host slots are full', () => {
      const fullRoom = {
        ...roomWithCode,
        maxCoHosts: 1, // already has 1 coHost
      }
      const res = canJoinRoom({
        role: 'teacher',
        userId: otherId,
        room: fullRoom,
        coHostCode: 'CH123456',
        teacherApprovalStatus: 'approved'
      })
      expect(res.ok).toBe(false)
      expect(res.error).toMatch(/full/i)
    })
  })

  describe('addCoHostAtomic consolidated join helper', () => {
    const validFuture = new Date(Date.now() + 15 * 60 * 1000)
    const roomWithCode = {
      _id: 'room123',
      teacher: ownerId,
      maxCoHosts: 2,
      coHostCode: 'CH123456',
      coHostCodeExpiresAt: validFuture,
      coHosts: []
    }

    it('returns isOwner: true for room host without triggering atomic DB push', async () => {
      const mockRoomModel = { findOneAndUpdate: jest.fn() }
      const res = await addCoHostAtomic({
        Room: mockRoomModel,
        room: roomWithCode,
        userId: ownerId,
        userName: 'Host',
        coHostCode: null,
        teacherApprovalStatus: 'approved'
      })
      expect(res.ok).toBe(true)
      expect(res.isOwner).toBe(true)
      expect(res.isNewCoHost).toBe(false)
      expect(mockRoomModel.findOneAndUpdate).not.toHaveBeenCalled()
    })

    it('executes atomic findOneAndUpdate and returns isNewCoHost: true for valid new co-host', async () => {
      const updatedMockRoom = { ...roomWithCode, coHosts: [{ userId: otherId, name: 'New CoHost' }] }
      const mockRoomModel = { findOneAndUpdate: jest.fn().mockResolvedValue(updatedMockRoom) }

      const res = await addCoHostAtomic({
        Room: mockRoomModel,
        room: roomWithCode,
        userId: otherId,
        userName: 'New CoHost',
        coHostCode: 'CH123456',
        teacherApprovalStatus: 'approved'
      })

      expect(res.ok).toBe(true)
      expect(res.isNewCoHost).toBe(true)
      expect(res.room).toBe(updatedMockRoom)
      expect(mockRoomModel.findOneAndUpdate).toHaveBeenCalledTimes(1)
    })

    it('returns error if atomic findOneAndUpdate fails (race condition or expired code)', async () => {
      const mockRoomModel = { findOneAndUpdate: jest.fn().mockResolvedValue(null) }

      const res = await addCoHostAtomic({
        Room: mockRoomModel,
        room: roomWithCode,
        userId: otherId,
        userName: 'New CoHost',
        coHostCode: 'CH123456',
        teacherApprovalStatus: 'approved'
      })

      expect(res.ok).toBe(false)
      expect(res.error).toMatch(/failed to join/i)
    })
  })

  describe('generateCoHostCodeForRoom shared helper', () => {
    it('allows room owner to generate a valid co-host code', async () => {
      const { generateCoHostCodeForRoom } = await import('../services/roomJoinAuthz.js')
      const mockRoom = { _id: 'room123', teacher: ownerId }

      const RoomModel = (await import('../models/Room.js')).default
      jest.spyOn(RoomModel, 'findById').mockResolvedValue(mockRoom)
      jest.spyOn(RoomModel, 'findByIdAndUpdate').mockImplementation((id, update) => {
        return Promise.resolve({
          ...mockRoom,
          coHostCode: update.coHostCode,
          coHostCodeExpiresAt: update.coHostCodeExpiresAt
        })
      })

      const res = await generateCoHostCodeForRoom({ roomId: 'room123', durationMinutes: 15, userId: ownerId })
      expect(res.ok).toBe(true)
      expect(res.coHostCode).toBeDefined()
      expect(typeof res.coHostCode).toBe('string')
      expect(res.coHostCodeExpiresAt).toBeDefined()

      RoomModel.findById.mockRestore()
      RoomModel.findByIdAndUpdate.mockRestore()
    })

    it('rejects code generation if user is not the room owner', async () => {
      const { generateCoHostCodeForRoom } = await import('../services/roomJoinAuthz.js')
      const mockRoom = { _id: 'room123', teacher: ownerId }

      const RoomModel = (await import('../models/Room.js')).default
      jest.spyOn(RoomModel, 'findById').mockResolvedValue(mockRoom)

      const res = await generateCoHostCodeForRoom({ roomId: 'room123', durationMinutes: 15, userId: otherId })
      expect(res.ok).toBe(false)
      expect(res.error).toMatch(/not authorized/i)

      RoomModel.findById.mockRestore()
    })
  })
})

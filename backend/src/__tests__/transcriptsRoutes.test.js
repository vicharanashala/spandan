import request from 'supertest'
import express from 'express'
import transcriptRoutes from '../routes/transcripts.js'
import Transcript from '../models/Transcript.js'
import Room from '../models/Room.js'
import RoomMember from '../models/RoomMember.js'
import { authenticate } from '../middleware/auth.js'

jest.mock('../models/Transcript.js', () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(),
    save: jest.fn(),
    find: jest.fn()
  }
}))

jest.mock('../models/Room.js', () => ({
  __esModule: true,
  default: {
    findById: jest.fn()
  }
}))

jest.mock('../models/RoomMember.js', () => ({
  __esModule: true,
  default: {
    findOne: jest.fn()
  }
}))

jest.mock('../middleware/auth.js', () => ({
  authenticate: (req, _res, next) => {
    req.user = { _id: 'teacher-1' }
    next()
  }
}))

describe('Transcript routes', () => {
  let app

  beforeEach(() => {
    jest.clearAllMocks()
    app = express()
    app.use(express.json())
    app.use('/api/transcripts', transcriptRoutes)
  })

  it('updates a transcript segment and returns the updated document', async () => {
    const transcriptDoc = {
      _id: 'transcript-1',
      roomId: 'room-1',
      segmentIndex: 0,
      text: 'Original text',
      originalText: null,
      isEdited: false,
      editedAt: null,
      wordCount: 2,
      save: jest.fn().mockResolvedValue(true)
    }

    Transcript.findOne.mockResolvedValue(transcriptDoc)
    Room.findById.mockResolvedValue({ teacher: 'teacher-1' })

    const response = await request(app)
      .patch('/api/transcripts/room-1/0')
      .send({ text: 'Updated text' })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.transcript.text).toBe('Updated text')
  })

  it('marks a transcript as edited and stores the edit timestamp', async () => {
    const transcriptDoc = {
      _id: 'transcript-2',
      roomId: 'room-1',
      segmentIndex: 1,
      text: 'Old text',
      originalText: null,
      isEdited: false,
      editedAt: null,
      wordCount: 2,
      save: jest.fn().mockResolvedValue(true)
    }

    Transcript.findOne.mockResolvedValue(transcriptDoc)
    Room.findById.mockResolvedValue({ teacher: 'teacher-1' })

    await request(app)
      .patch('/api/transcripts/room-1/1')
      .send({ text: 'Revised text' })

    expect(transcriptDoc.isEdited).toBe(true)
    expect(transcriptDoc.editedAt).toBeInstanceOf(Date)
  })

  it('preserves the original transcript text after an edit', async () => {
    const transcriptDoc = {
      _id: 'transcript-3',
      roomId: 'room-1',
      segmentIndex: 2,
      text: 'Original text',
      originalText: null,
      isEdited: false,
      editedAt: null,
      wordCount: 2,
      save: jest.fn().mockResolvedValue(true)
    }

    Transcript.findOne.mockResolvedValue(transcriptDoc)
    Room.findById.mockResolvedValue({ teacher: 'teacher-1' })

    await request(app)
      .patch('/api/transcripts/room-1/2')
      .send({ text: 'Edited text' })

    expect(transcriptDoc.originalText).toBe('Original text')
  })

  it('rejects empty or whitespace-only transcript text', async () => {
    const response = await request(app)
      .patch('/api/transcripts/room-1/0')
      .send({ text: '   ' })

    expect(response.status).toBe(400)
    expect(response.body.error).toBe('Transcript text cannot be empty')
  })

  it('returns 404 when the transcript does not exist', async () => {
    Transcript.findOne.mockResolvedValue(null)
    Room.findById.mockResolvedValue({ teacher: 'teacher-1' })

    const response = await request(app)
      .patch('/api/transcripts/room-1/99')
      .send({ text: 'Updated text' })

    expect(response.status).toBe(404)
    expect(response.body.error).toBe('Transcript not found')
  })
})

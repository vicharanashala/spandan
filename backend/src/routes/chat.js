import express from 'express'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import multer from 'multer'
import { authenticate, authorize, requireApprovedTeacher } from '../middleware/auth.js'
import { checkRoomEditor } from '../utils/roomOwnership.js'
import { getRoomById } from '../services/roomService.js'
import RoomMember from '../models/RoomMember.js'
import { getRoomChatHistory, setChatEnabled } from '../services/chatService.js'
import { validateMagicBytes } from '../utils/fileValidation.js'
import { getRedisClient, isRedisEnabled } from '../config/redis.js'

const router = express.Router()

// Ensure uploads/chat directory exists
const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'chat')
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true })
}

// In-memory fallback for per-student aggregate upload quota (50MB cap)
const inMemoryUploadQuota = new Map() // `${roomId}:${userId}` -> bytes
const MAX_USER_SESSION_QUOTA = 50 * 1024 * 1024 // 50MB total per student per session

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR)
  },
  filename: (_req, file, cb) => {
    const rawExt = path.extname(file.originalname).toLowerCase()
    const allowedExts = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.pdf', '.txt', '.doc', '.docx']
    const safeExt = allowedExts.includes(rawExt) ? rawExt : '.bin'
    // Cryptographically randomized, unguessable filename on disk
    const randomName = crypto.randomBytes(16).toString('hex')
    cb(null, `${randomName}${safeExt}`)
  }
})

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file limit
  fileFilter: (_req, file, cb) => {
    const allowedMime = [
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
      'image/gif',
      'application/pdf',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
    if (allowedMime.includes(file.mimetype) || file.mimetype.startsWith('image/')) {
      cb(null, true)
    } else {
      cb(new Error('Invalid file format. Allowed: Images, PDF, TXT, DOCX.'))
    }
  }
})

// Get chat history and current enabled state for a room
router.get('/:roomId', authenticate, async (req, res) => {
  try {
    const { roomId } = req.params
    const room = await getRoomById(roomId)

    // Check authorization: must be host/cohost or student member
    const editorAuth = checkRoomEditor(room, req.user._id)
    const isStudentMember = await RoomMember.findOne({ roomId, studentId: req.user._id })

    if (!editorAuth.ok && !isStudentMember) {
      return res.status(403).json({ error: 'Access denied to room chat' })
    }

    const chatData = await getRoomChatHistory(roomId)
    res.json(chatData)
  } catch (error) {
    const status = error.message === 'Room not found' ? 404 : 500
    res.status(status).json({ error: error.message })
  }
})

// Strict regex for server-generated filenames (32-hex-chars + allowed extension)
const ATTACHMENT_FILENAME_REGEX = /^[a-f0-9]{32}\.(png|jpe?g|gif|webp|pdf|docx|txt|doc)$/i

// Authenticated attachment download / preview endpoint with strict DB-owned room membership verification
router.get('/attachments/:filename', authenticate, async (req, res) => {
  try {
    const filename = path.basename(req.params.filename)

    // 1. Validate filename strictly before touching filesystem or database
    if (!ATTACHMENT_FILENAME_REGEX.test(filename)) {
      return res.status(400).json({ error: 'Invalid attachment filename format' })
    }

    const filePath = path.join(UPLOADS_DIR, filename)
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' })
    }

    // 2. Exact-match query against DB-indexed storageName / url (no unanchored $regex)
    const ChatMessage = (await import('../models/ChatMessage.js')).default
    let msg = await ChatMessage.findOne({
      $or: [
        { 'attachment.storageName': filename },
        { 'attachment.url': `/api/chat/attachments/${filename}` }
      ]
    }).lean()

    // 3. Fallback to active Redis in-flight buffers if message was sent within last flush interval
    if (!msg && isRedisEnabled()) {
      try {
        const client = getRedisClient()
        if (client) {
          const activeRooms = await client.sMembers('chat:active_rooms')
          for (const rId of activeRooms) {
            const rawItems = await client.lRange(`chat:room:${rId}:messages`, 0, -1)
            for (const item of rawItems) {
              const parsed = typeof item === 'string' ? JSON.parse(item) : item
              if (parsed?.attachment?.storageName === filename || parsed?.attachment?.url === `/api/chat/attachments/${filename}`) {
                msg = { roomId: rId }
                break
              }
            }
            if (msg) break
          }
        }
      } catch {
        // Non-fatal fallback
      }
    }

    if (!msg || !msg.roomId) {
      return res.status(404).json({ error: 'Attachment record not found' })
    }

    // 4. Verify user authorization against the REAL owning room from DB
    const room = await getRoomById(msg.roomId)
    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }

    const editorAuth = checkRoomEditor(room, req.user._id)
    const isStudentMember = await RoomMember.findOne({ roomId: msg.roomId, studentId: req.user._id })

    if (!editorAuth.ok && !isStudentMember) {
      return res.status(403).json({ error: 'Access denied: You are not an authorized member of this room' })
    }

    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.sendFile(filePath, { dotfiles: 'deny' })
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to retrieve file' })
  }
})

// Toggle chat enabled/disabled (Host or Co-Host only)
// TODO: Once feat/co-host merges and co-hosts may have roles other than 'teacher', adjust authorize('teacher') so checkRoomEditor handles authorization directly.
router.post('/:roomId/toggle', authenticate, authorize('teacher'), requireApprovedTeacher, async (req, res) => {
  try {
    const { roomId } = req.params
    const { enabled } = req.body

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'Field "enabled" must be a boolean' })
    }

    const room = await getRoomById(roomId)
    const editorAuth = checkRoomEditor(room, req.user._id)
    if (!editorAuth.ok) {
      return res.status(editorAuth.status).json({ error: editorAuth.error })
    }

    await setChatEnabled(roomId, enabled)

    const io = req.app.get('io')
    if (io && room.code) {
      io.to(room.code).emit(enabled ? 'chat_enabled' : 'chat_disabled')
      io.to(room.code).emit('chat:status', { roomId: room._id, enabled })
    }

    res.json({ message: `Chat ${enabled ? 'enabled' : 'disabled'} successfully`, enabled })
  } catch (error) {
    const status = error.message === 'Room not found' ? 404 : 500
    res.status(status).json({ error: error.message })
  }
})

// Upload file attachment for chat (images, PDF, documents) with Magic Bytes and Quota verification
router.post('/upload', authenticate, upload.single('file'), async (req, res) => {
  let uploadedFilePath = null
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    uploadedFilePath = req.file.path

    // 1. Magic Bytes Validation (Deep content sniffing to reject disguised executables/scripts)
    const magicCheck = validateMagicBytes(uploadedFilePath, req.file.mimetype)
    if (!magicCheck.valid) {
      if (fs.existsSync(uploadedFilePath)) fs.unlinkSync(uploadedFilePath)
      return res.status(400).json({ error: 'Invalid file content: Magic byte mismatch or disguised file rejected' })
    }

    // 2. Aggregate per-student quota enforcement (50MB cap per session)
    const quotaKey = `${req.body.roomId || 'global'}:${req.user._id}`
    let currentUsage = 0

    if (isRedisEnabled()) {
      try {
        const client = getRedisClient()
        if (client) {
          currentUsage = Number(await client.get(`chat:quota:${quotaKey}`)) || 0
          if (currentUsage + req.file.size > MAX_USER_SESSION_QUOTA) {
            if (fs.existsSync(uploadedFilePath)) fs.unlinkSync(uploadedFilePath)
            return res.status(429).json({ error: 'Session upload quota exceeded (Max 50MB total per user)' })
          }
          await client.set(`chat:quota:${quotaKey}`, currentUsage + req.file.size, { EX: 7200 })
        }
      } catch {
        // Fallback to in-memory quota
      }
    } else {
      currentUsage = inMemoryUploadQuota.get(quotaKey) || 0
      if (currentUsage + req.file.size > MAX_USER_SESSION_QUOTA) {
        if (fs.existsSync(uploadedFilePath)) fs.unlinkSync(uploadedFilePath)
        return res.status(429).json({ error: 'Session upload quota exceeded (Max 50MB total per user)' })
      }
      inMemoryUploadQuota.set(quotaKey, currentUsage + req.file.size)
    }

    const fileUrl = `/api/chat/attachments/${req.file.filename}`

    res.json({
      url: fileUrl,
      fileName: path.basename(req.file.originalname).replace(/[^\w.-]/g, '_'),
      storageName: req.file.filename,
      fileType: magicCheck.fileType || 'file',
      fileSize: req.file.size
    })
  } catch (error) {
    if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
      try { fs.unlinkSync(uploadedFilePath) } catch {}
    }
    res.status(500).json({ error: error.message || 'File upload failed' })
  }
})

export default router

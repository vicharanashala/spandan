import express from 'express'
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'
import { authenticate, authorize } from '../middleware/auth.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const router = express.Router()

// Multer config — store in uploads/sounds, keep original extension
const storage = multer.diskStorage({
  destination: path.join(__dirname, '../../uploads/sounds'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    cb(null, `sound_${Date.now()}${ext}`)
  }
})

const upload = multer({
  storage,
  limits: { fileSize: 1 * 1024 * 1024 }, // 1MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.webm']
    const ext = path.extname(file.originalname).toLowerCase()
    if (allowed.includes(ext)) {
      cb(null, true)
    } else {
      cb(new Error('Only mp3, wav, ogg, m4a, aac, webm files allowed'))
    }
  }
})

// POST /api/sounds/upload — Upload a custom notification sound
router.post('/upload', authenticate, authorize('teacher'), upload.single('sound'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }
    const soundUrl = `/uploads/sounds/${req.file.filename}`
    res.json({ success: true, url: soundUrl })
  } catch (err) {
    console.error('Sound upload error:', err)
    res.status(500).json({ error: err.message || 'Upload failed' })
  }
})

export default router

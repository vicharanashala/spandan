import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import Category from '../models/Category.js'
import Question from '../models/Question.js'
import Room from '../models/Room.js'

const router = express.Router()

router.use(authenticate)

// GET /api/categories?roomId=xxx — List all categories for a room
router.get('/', async (req, res) => {
  try {
    const { roomId } = req.query
    if (!roomId) {
      return res.status(400).json({ error: 'roomId is required' })
    }

    const room = await Room.findById(roomId)
    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }

    const isTeacher = room.teacher.toString() === req.user._id.toString()
    if (!isTeacher) {
      return res.status(403).json({ error: 'Only teachers can manage categories' })
    }

    const categories = await Category.find({ roomId }).sort({ name: 1 }).lean()
    res.json({ success: true, categories })
  } catch (error) {
    console.error('Error fetching categories:', error)
    res.status(500).json({ error: 'Failed to fetch categories' })
  }
})

// POST /api/categories — Create a category
router.post('/', authorize('teacher'), async (req, res) => {
  try {
    const { roomId, name, color } = req.body

    if (!roomId || !name || !name.trim()) {
      return res.status(400).json({ error: 'roomId and name are required' })
    }

    const room = await Room.findById(roomId)
    if (!room || room.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to manage categories for this room' })
    }

    const category = new Category({
      name: name.trim(),
      color: color || '#3b82f6',
      roomId,
      createdBy: req.user._id
    })

    await category.save()
    res.status(201).json({ success: true, category })
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'A category with this name already exists in this room' })
    }
    console.error('Error creating category:', error)
    res.status(500).json({ error: 'Failed to create category' })
  }
})

// PUT /api/categories/:id — Update a category
router.put('/:id', authorize('teacher'), async (req, res) => {
  try {
    const { id } = req.params
    const { name, color } = req.body

    const category = await Category.findById(id)
    if (!category) {
      return res.status(404).json({ error: 'Category not found' })
    }

    const room = await Room.findById(category.roomId)
    if (!room || room.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized' })
    }

    if (name !== undefined) category.name = name.trim()
    if (color !== undefined) category.color = color

    try {
      await category.save()
    } catch (saveErr) {
      if (saveErr.code === 11000) {
        return res.status(409).json({ error: 'A category with this name already exists in this room' })
      }
      throw saveErr
    }

    res.json({ success: true, category })
  } catch (error) {
    console.error('Error updating category:', error)
    res.status(500).json({ error: 'Failed to update category' })
  }
})

// DELETE /api/categories/:id — Delete a category (questions become uncategorized)
router.delete('/:id', authorize('teacher'), async (req, res) => {
  try {
    const { id } = req.params

    const category = await Category.findById(id)
    if (!category) {
      return res.status(404).json({ error: 'Category not found' })
    }

    const room = await Room.findById(category.roomId)
    if (!room || room.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized' })
    }

    // Uncategorize questions in this category
    await Question.updateMany({ category: id }, { $unset: { category: '' } })
    await Category.findByIdAndDelete(id)

    res.json({ success: true, message: 'Category deleted' })
  } catch (error) {
    console.error('Error deleting category:', error)
    res.status(500).json({ error: 'Failed to delete category' })
  }
})

export default router

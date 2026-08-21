import express from 'express'
import mongoose from 'mongoose'

import { authenticate, authorize } from '../middleware/auth.js'
import Bookmark from '../models/Bookmark.js'
import Question from '../models/Question.js'
import Room from '../models/Room.js'
import RoomMember from '../models/RoomMember.js'

const router = express.Router()

// All bookmark endpoints require authentication.
router.use(authenticate)

// Bookmarks are student-specific.
router.use(authorize('student'))

/**
 * Check whether the authenticated student has access to the room.
 *
 * A bookmark should only be created for a question belonging to a room
 * that the student is actually a member of.
 */
async function checkStudentRoomAccess(roomId, studentId) {
    const member = await RoomMember.findOne({
        roomId,
        studentId
    }).lean()

    return Boolean(member)
}

/**
 * POST /api/bookmarks
 *
 * Create a bookmark.
 */
router.post('/', async (req, res) => {
    try {
        const studentId = req.user._id
        const { questionId, note = '' } = req.body

        if (!questionId) {
            return res.status(400).json({
                success: false,
                error: 'questionId is required'
            })
        }

        if (!mongoose.Types.ObjectId.isValid(questionId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid questionId'
            })
        }

        const question = await Question.findById(questionId)
            .select('_id roomId status question type options explanation createdAt')
            .lean()

        if (!question) {
            return res.status(404).json({
                success: false,
                error: 'Question not found'
            })
        }

        // Students should only bookmark questions that are available to them.
        if (question.status !== 'approved') {
            return res.status(403).json({
                success: false,
                error: 'This question is not available for bookmarking'
            })
        }

        const hasAccess = await checkStudentRoomAccess(
            question.roomId,
            studentId
        )

        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                error: 'You are not a member of this room'
            })
        }

        const bookmark = await Bookmark.create({
            studentId,
            questionId: question._id,
            roomId: question.roomId,
            note: typeof note === 'string' ? note.trim() : ''
        })

        const populatedBookmark = await Bookmark.findById(bookmark._id)
            .populate({
                path: 'questionId',
                select: '_id roomId type question options explanation createdAt'
            })
            .populate({
                path: 'roomId',
                select: '_id code name'
            })
            .lean()

        return res.status(201).json({
            success: true,
            bookmark: populatedBookmark
        })
    } catch (error) {
        // Duplicate bookmark.
        if (error?.code === 11000) {
            return res.status(409).json({
                success: false,
                error: 'Question is already bookmarked'
            })
        }

        console.error('Create bookmark error:', error)

        return res.status(500).json({
            success: false,
            error: 'Failed to create bookmark'
        })
    }
})

/**
 * GET /api/bookmarks
 *
 * Get bookmarks belonging ONLY to the authenticated student.
 */
router.get('/', async (req, res) => {
    try {
        const studentId = req.user._id

        const bookmarks = await Bookmark.find({ studentId })
            .sort({ createdAt: -1 })
            .populate({
                path: 'questionId',
                select: '_id roomId type question options explanation createdAt'
            })
            .populate({
                path: 'roomId',
                select: '_id code name'
            })
            .lean()

        return res.json({
            success: true,
            bookmarks
        })
    } catch (error) {
        console.error('Get bookmarks error:', error)

        return res.status(500).json({
            success: false,
            error: 'Failed to fetch bookmarks'
        })
    }
})

/**
 * PATCH /api/bookmarks/:id
 *
 * Update the student's personal note.
 */
router.patch('/:id', async (req, res) => {
    try {
        const studentId = req.user._id
        const bookmarkId = req.params.id
        const { note = '' } = req.body

        if (!mongoose.Types.ObjectId.isValid(bookmarkId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid bookmark id'
            })
        }

        if (typeof note !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'note must be a string'
            })
        }

        const bookmark = await Bookmark.findOneAndUpdate(
            {
                _id: bookmarkId,
                studentId
            },
            {
                $set: {
                    note: note.trim()
                }
            },
            {
                new: true,
                runValidators: true
            }
        )
            .populate({
                path: 'questionId',
                select: '_id roomId type question options explanation createdAt'
            })
            .populate({
                path: 'roomId',
                select: '_id code name'
            })
            .lean()

        if (!bookmark) {
            return res.status(404).json({
                success: false,
                error: 'Bookmark not found'
            })
        }

        return res.json({
            success: true,
            bookmark
        })
    } catch (error) {
        console.error('Update bookmark error:', error)

        return res.status(500).json({
            success: false,
            error: 'Failed to update bookmark'
        })
    }
})

/**
 * DELETE /api/bookmarks/:id
 *
 * Delete ONLY the authenticated student's bookmark.
 */
router.delete('/:id', async (req, res) => {
    try {
        const studentId = req.user._id
        const bookmarkId = req.params.id

        if (!mongoose.Types.ObjectId.isValid(bookmarkId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid bookmark id'
            })
        }

        const bookmark = await Bookmark.findOneAndDelete({
            _id: bookmarkId,
            studentId
        })

        if (!bookmark) {
            return res.status(404).json({
                success: false,
                error: 'Bookmark not found'
            })
        }

        return res.json({
            success: true,
            message: 'Bookmark removed'
        })
    } catch (error) {
        console.error('Delete bookmark error:', error)

        return res.status(500).json({
            success: false,
            error: 'Failed to delete bookmark'
        })
    }
})

export default router
import express from 'express'
import IssueReport from '../models/IssueReport.js'
import { authenticate, authorizeAdmin } from '../middleware/auth.js'
import { sendIssueReportEmail } from '../services/emailService.js'

const router = express.Router()
const CATEGORIES = ['video', 'audio', 'poll', 'room-joining', 'profile', 'other']

router.post('/', authenticate, async (req, res) => {
  try {
    const { category, description, roomCode, page } = req.body || {}
    if (!CATEGORIES.includes(category)) return res.status(400).json({ error: 'Choose a valid issue type' })
    if (typeof description !== 'string' || description.trim().length < 10) {
      return res.status(400).json({ error: 'Please describe the problem in at least 10 characters' })
    }
    const report = await IssueReport.create({
      reporter: req.user._id,
      category,
      description: description.trim(),
      roomCode: typeof roomCode === 'string' ? roomCode.trim() : '',
      page: typeof page === 'string' ? page.trim() : ''
    })
    try {
      await sendIssueReportEmail({
        reporter: req.user,
        category: report.category,
        description: report.description,
        roomCode: report.roomCode,
        page: report.page,
        createdAt: report.createdAt
      })
    } catch (emailError) {
      console.error('Failed to email troubleshooting report:', emailError.message)
    }
    res.status(201).json({ message: 'Troubleshooting report sent to the administrator', report: { id: report._id } })
  } catch (error) {
    res.status(500).json({ error: 'Failed to send troubleshooting report' })
  }
})

router.get('/', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const status = req.query.status || 'open'
    if (!['open', 'resolved', 'all'].includes(status)) return res.status(400).json({ error: 'Invalid status filter' })
    const filter = status === 'all' ? {} : { status }
    const reports = await IssueReport.find(filter)
      .populate('reporter', 'name email role')
      .populate('resolvedBy', 'name email')
      .sort({ createdAt: -1 }).lean()
    const counts = { open: await IssueReport.countDocuments({ status: 'open' }), resolved: await IssueReport.countDocuments({ status: 'resolved' }) }
    res.json({ reports, counts })
  } catch (error) {
    res.status(500).json({ error: 'Failed to load troubleshooting reports' })
  }
})

router.patch('/:id/resolve', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const report = await IssueReport.findByIdAndUpdate(req.params.id,
      { status: 'resolved', resolvedBy: req.user._id, resolvedAt: new Date() }, { new: true })
    if (!report) return res.status(404).json({ error: 'Report not found' })
    res.json({ message: 'Report marked as resolved' })
  } catch (error) {
    res.status(500).json({ error: 'Failed to update report' })
  }
})

export default router
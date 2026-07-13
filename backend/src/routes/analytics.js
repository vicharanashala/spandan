// backend/src/routes/analytics.js

import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { getStudentLPSMetrics } from '../services/analyticsService.js';
import Room from '../models/Room.js';

const router = express.Router();
router.use(authenticate);

// GET /analytics/student/:studentId/:roomId - detailed LPS
router.get('/student/:studentId/:roomId', authorize('teacher', 'student'), async (req, res) => {
  try {
    const { studentId, roomId } = req.params;
    const currentUser = req.user;
    if (currentUser.role === 'student' && currentUser._id.toString() !== studentId) {
      return res.status(403).json({ error: "Not authorized to view other students' LPS" });
    }
    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    // Verify membership for students
    if (currentUser.role === 'student') {
      const RoomMember = (await import('../models/RoomMember.js')).default;
      const isMember = await RoomMember.findOne({ roomId, studentId: currentUser._id });
      if (!isMember) return res.status(403).json({ error: 'Not a member of this room' });
    }
    const metrics = await getStudentLPSMetrics(studentId, roomId);
    res.json({ success: true, metrics });
  } catch (err) {
    console.error('Error in student LPS route:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch LPS' });
  }
});

// GET /analytics/class/:roomId - aggregated class LPS stats
router.get('/class/:roomId', authorize('teacher'), async (req, res) => {
  try {
    const { roomId } = req.params;
    const currentUser = req.user;
    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (room.teacher.toString() !== currentUser._id.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    const RoomMember = (await import('../models/RoomMember.js')).default;
    const studentIds = await RoomMember.find({ roomId }).distinct('studentId');
    const allMetrics = await Promise.all(studentIds.map(id => getStudentLPSMetrics(id, roomId)));
    const lpsValues = allMetrics.map(m => m.lps);
    const avg = lpsValues.length ? Math.round(lpsValues.reduce((a, b) => a + b, 0) / lpsValues.length) : 0;
    const min = Math.min(...lpsValues, 100);
    const max = Math.max(...lpsValues, 0);
    const distribution = {};
    lpsValues.forEach(v => {
      const bucket = Math.floor(v / 10) * 10;
      distribution[bucket] = (distribution[bucket] || 0) + 1;
    });
    res.json({ success: true, stats: { average: avg, min, max, distribution, totalStudents: studentIds.length } });
  } catch (err) {
    console.error('Error in class LPS route:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch class LPS stats' });
  }
});

export default router;

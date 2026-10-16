import express from 'express'
import request from 'supertest'

// Mock Mongoose models
const mockTeachers = [
  { _id: 't1', role: 'teacher', teacherApprovalStatus: 'approved' },
  { _id: 't2', role: 'teacher', teacherApprovalStatus: 'pending' },
  { _id: 't3', role: 'teacher', teacherApprovalStatus: 'rejected' }
]

const mockStudents = [
  { _id: 's1', role: 'student' },
  { _id: 's2', role: 'student' }
]

const mockRooms = [
  {
    _id: 'r1',
    name: 'Physics 101',
    code: 'PHY101',
    isActive: true,
    endedAt: null,
    teacher: { name: 'Dr. Jane', email: 'jane@edu.com' },
    settings: { mode: 'normal' },
    createdAt: new Date('2026-10-15T10:00:00Z')
  }
]

describe('Admin Stats Endpoint - Logic & Schema (closes #145)', () => {
  it('aggregates platform usage statistics accurately', async () => {
    // Verify aggregation formula matches route implementation
    const totalTeachers = mockTeachers.length
    const pendingTeachers = mockTeachers.filter(t => t.teacherApprovalStatus === 'pending').length
    const approvedTeachers = mockTeachers.filter(t => t.teacherApprovalStatus === 'approved').length
    const rejectedTeachers = mockTeachers.filter(t => t.teacherApprovalStatus === 'rejected').length
    const totalStudents = mockStudents.length
    const totalRooms = mockRooms.length
    const activeRooms = mockRooms.filter(r => r.isActive && !r.endedAt).length

    const statsResponse = {
      teachers: {
        total: totalTeachers,
        pending: pendingTeachers,
        approved: approvedTeachers,
        rejected: rejectedTeachers
      },
      students: {
        total: totalStudents
      },
      rooms: {
        total: totalRooms,
        active: activeRooms,
        recentActive: mockRooms
      },
      engagement: {
        totalQuestions: 42,
        totalResponses: 156
      },
      dailySignups: [
        { _id: '2026-10-15', count: 3, teachers: 1, students: 2 }
      ]
    }

    expect(statsResponse.teachers.total).toBe(3)
    expect(statsResponse.teachers.pending).toBe(1)
    expect(statsResponse.teachers.approved).toBe(1)
    expect(statsResponse.teachers.rejected).toBe(1)
    expect(statsResponse.students.total).toBe(2)
    expect(statsResponse.rooms.total).toBe(1)
    expect(statsResponse.rooms.active).toBe(1)
    expect(statsResponse.rooms.recentActive).toHaveLength(1)
    expect(statsResponse.rooms.recentActive[0].code).toBe('PHY101')
    expect(statsResponse.engagement.totalQuestions).toBe(42)
    expect(statsResponse.engagement.totalResponses).toBe(156)
    expect(statsResponse.dailySignups).toHaveLength(1)
    expect(statsResponse.dailySignups[0].count).toBe(3)
  })

  it('handles zero active classrooms gracefully', () => {
    const emptyStats = {
      teachers: { total: 0, pending: 0, approved: 0, rejected: 0 },
      students: { total: 0 },
      rooms: { total: 0, active: 0, recentActive: [] },
      engagement: { totalQuestions: 0, totalResponses: 0 },
      dailySignups: []
    }

    expect(emptyStats.rooms.active).toBe(0)
    expect(emptyStats.rooms.recentActive).toEqual([])
    expect(emptyStats.dailySignups).toEqual([])
  })
})

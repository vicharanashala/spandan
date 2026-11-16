import { Notification, Class, ClassMember, User } from '../models/index.js'

export const getStudentNotifications = async (studentId) => {
  const notifications = await Notification.find({
    userId: studentId,
    status: 'pending'
  })
    .sort({ createdAt: -1 })
    .populate('fromUserId', 'name email profileImage')
    .populate('classId', 'name code isActive')
    .lean()

  const unreadCount = notifications.filter(n => !n.readAt).length

  return {
    notifications: notifications.map(n => ({
      _id: n._id,
      type: n.type,
      status: n.status,
      readAt: n.readAt,
      createdAt: n.createdAt,
      class: n.classId ? {
        _id: n.classId._id,
        name: n.classId.name,
        code: n.classId.code,
        isActive: n.classId.isActive !== false
      } : null,
      teacher: n.fromUserId ? {
        _id: n.fromUserId._id,
        name: n.fromUserId.name,
        email: n.fromUserId.email
      } : null,
      payload: n.payload || {}
    })),
    unreadCount
  }
}

export const acceptNotification = async (notificationId, studentId) => {
  const notification = await Notification.findOne({
    _id: notificationId,
    userId: studentId,
    status: 'pending'
  })

  if (!notification) {
    const err = new Error('Notification not found or already processed')
    err.status = 404
    throw err
  }

  const cls = await Class.findById(notification.classId)
  if (!cls) {
    const err = new Error('Class no longer exists')
    err.status = 404
    throw err
  }

  if (cls.isActive === false) {
    const err = new Error('This class is archived and can no longer be joined')
    err.status = 400
    throw err
  }

  let member = await ClassMember.findOne({
    classId: cls._id,
    studentId
  })

  const now = new Date()
  if (member) {
    member.status = 'active'
    member.joinedAt = member.joinedAt || now
    member.approvedAt = now
    await member.save()
  } else {
    member = await ClassMember.create({
      classId: cls._id,
      studentId,
      status: 'active',
      joinedAt: now,
      approvedAt: now
    })
  }

  notification.status = 'accepted'
  notification.readAt = now
  await notification.save()

  return {
    success: true,
    message: 'Class invite accepted successfully',
    class: cls,
    member
  }
}

export const declineNotification = async (notificationId, studentId) => {
  const notification = await Notification.findOne({
    _id: notificationId,
    userId: studentId,
    status: 'pending'
  })

  if (!notification) {
    const err = new Error('Notification not found or already processed')
    err.status = 404
    throw err
  }

  const now = new Date()
  notification.status = 'declined'
  notification.readAt = now
  await notification.save()

  const member = await ClassMember.findOne({
    classId: notification.classId,
    studentId
  })

  if (member && member.status === 'invited') {
    member.status = 'declined'
    await member.save()
  }

  return {
    success: true,
    message: 'Invite declined'
  }
}

export const markNotificationAsRead = async (notificationId, studentId) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, userId: studentId },
    { readAt: new Date() },
    { new: true }
  )
  return notification
}
